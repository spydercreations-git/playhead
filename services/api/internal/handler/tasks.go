package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/redis/go-redis/v9"
)

// TasksHandler handles all Task operations (Phase 3)
type TasksHandler struct {
	queries     *db.Queries
	pool        *pgxpool.Pool
	storage     *storage.Client
	mailer      *mailer.Mailer
	cfg         *config.Config
	rdb         *redis.Client
	sseClients  map[string][]chan string
	sseMu       sync.RWMutex
}

func NewTasksHandler(queries *db.Queries, storage *storage.Client, mailer *mailer.Mailer, cfg *config.Config) *TasksHandler {
	var rdb *redis.Client
	if cfg != nil && cfg.RedisURL != "" {
		if opt, err := redis.ParseURL(cfg.RedisURL); err == nil {
			rdb = redis.NewClient(opt)
		}
	}
	return &TasksHandler{
		queries:    queries,
		storage:    storage,
		mailer:     mailer,
		cfg:        cfg,
		rdb:        rdb,
		sseClients: make(map[string][]chan string),
	}
}

func (h *TasksHandler) SetPool(p *pgxpool.Pool) {
	h.pool = p
}

func (h *TasksHandler) SetRedis(r *redis.Client) {
	h.rdb = r
}

// -------------------------------------------------------------------------
// Helper utilities
// -------------------------------------------------------------------------

func toPgUUID(u uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: u, Valid: u != uuid.Nil}
}

func sanitizeHTML(input string) string {
	// Escape dangerous script tags while keeping clean structure
	cleaned := strings.ReplaceAll(input, "<script", "&lt;script")
	cleaned = strings.ReplaceAll(cleaned, "</script>", "&lt;/script&gt;")
	cleaned = strings.ReplaceAll(cleaned, "javascript:", "blocked:")
	cleaned = strings.ReplaceAll(cleaned, "onerror=", "blocked_event=")
	cleaned = strings.ReplaceAll(cleaned, "onload=", "blocked_event=")
	cleaned = strings.ReplaceAll(cleaned, "onclick=", "blocked_event=")
	return cleaned
}

func isValidWebURL(u string) bool {
	parsed, err := url.ParseRequestURI(u)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return scheme == "http" || scheme == "https"
}

func computeIsOverdue(status string, deadline pgtype.Timestamptz) bool {
	if !deadline.Valid {
		return false
	}
	if status == "completed" || status == "not_needed" {
		return false
	}
	return deadline.Time.Before(time.Now())
}

func formatDeadlineDisplay(deadline pgtype.Timestamptz) (label string, fullFormatted string) {
	if !deadline.Valid {
		return "", ""
	}
	t := deadline.Time.Local()
	now := time.Now().Local()

	year, month, day := t.Date()
	nowYear, nowMonth, nowDay := now.Date()

	fullFormatted = t.Format("Jan 02, 3:04 pm")

	if year == nowYear && month == nowMonth && day == nowDay {
		return "Today", fullFormatted
	}
	tomorrow := now.AddDate(0, 0, 1)
	if year == tomorrow.Year() && month == tomorrow.Month() && day == tomorrow.Day() {
		return "Tomorrow", fullFormatted
	}
	return t.Format("Jan 02"), fullFormatted
}

// -------------------------------------------------------------------------
// Task CRUD
// -------------------------------------------------------------------------

// ListTasks returns tasks accessible to current user based on roles & filters
func (h *TasksHandler) ListTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	statusFilter := r.URL.Query().Get("status")
	clientFilterStr := r.URL.Query().Get("client_id")
	monthFilter := r.URL.Query().Get("month") // e.g. "2026-10"
	searchQuery := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))

	var clientFilter pgtype.UUID
	if clientFilterStr != "" && clientFilterStr != "null" && clientFilterStr != "undefined" {
		_ = clientFilter.Scan(clientFilterStr)
	}

	var statusParam pgtype.Text
	if statusFilter != "" {
		statusParam = pgtype.Text{String: statusFilter, Valid: true}
	}

	type TaskRespItem struct {
		ID                    pgtype.UUID        `json:"id"`
		CompanyID             pgtype.UUID        `json:"company_id"`
		ClientID              pgtype.UUID        `json:"client_id"`
		ProjectID             pgtype.UUID        `json:"project_id"`
		Name                  string             `json:"name"`
		Status                string             `json:"status"`
		Deadline              pgtype.Timestamptz `json:"deadline"`
		DeadlineLabel         string             `json:"deadline_label"`
		DeadlineFormatted     string             `json:"deadline_formatted"`
		IsOverdue             bool               `json:"is_overdue"`
		DescriptionTitle      string             `json:"description_title"`
		DescriptionJSON       json.RawMessage    `json:"description_json"`
		DescriptionHTML       string             `json:"description_html"`
		Position              pgtype.Numeric     `json:"position"`
		CreatedBy             pgtype.UUID        `json:"created_by"`
		CreatedAt             pgtype.Timestamptz `json:"created_at"`
		UpdatedAt             pgtype.Timestamptz `json:"updated_at"`
		ClientName            string             `json:"client_name"`
		ProjectName           pgtype.Text        `json:"project_name"`
		CommentsCount         int64              `json:"comments_count"`
		ClientCommentsCount   int64              `json:"client_comments_count"`
		InternalCommentsCount int64              `json:"internal_comments_count"`
	}

	var results []TaskRespItem

	if person.IsStaff() {
		rows, err := h.queries.ListTasksForStaff(ctx, db.ListTasksForStaffParams{
			CompanyID: companyID,
			ClientID:  clientFilter,
			Status:    statusParam,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_tasks"})
			return
		}
		for _, row := range rows {
			dLabel, dFull := formatDeadlineDisplay(row.Deadline)
			results = append(results, TaskRespItem{
				ID:                    row.ID,
				CompanyID:             row.CompanyID,
				ClientID:              row.ClientID,
				ProjectID:             row.ProjectID,
				Name:                  row.Name,
				Status:                row.Status,
				Deadline:              row.Deadline,
				DeadlineLabel:         dLabel,
				DeadlineFormatted:     dFull,
				IsOverdue:             computeIsOverdue(row.Status, row.Deadline),
				DescriptionTitle:      row.DescriptionTitle,
				DescriptionJSON:       row.DescriptionJson,
				DescriptionHTML:       row.DescriptionHtml,
				Position:              row.Position,
				CreatedBy:             row.CreatedBy,
				CreatedAt:             row.CreatedAt,
				UpdatedAt:             row.UpdatedAt,
				ClientName:            row.ClientName,
				ProjectName:           row.ProjectName,
				CommentsCount:         row.TotalCommentsCount,
				ClientCommentsCount:   row.ClientCommentsCount,
				InternalCommentsCount: row.InternalCommentsCount,
			})
		}
	} else if person.IsEditor() {
		rows, err := h.queries.ListTasksForEditor(ctx, db.ListTasksForEditorParams{
			CompanyID: companyID,
			UserID:    toPgUUID(person.UserID),
			ClientID:  clientFilter,
			Status:    statusParam,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_tasks"})
			return
		}
		for _, row := range rows {
			dLabel, dFull := formatDeadlineDisplay(row.Deadline)
			results = append(results, TaskRespItem{
				ID:                    row.ID,
				CompanyID:             row.CompanyID,
				ClientID:              row.ClientID,
				ProjectID:             row.ProjectID,
				Name:                  row.Name,
				Status:                row.Status,
				Deadline:              row.Deadline,
				DeadlineLabel:         dLabel,
				DeadlineFormatted:     dFull,
				IsOverdue:             computeIsOverdue(row.Status, row.Deadline),
				DescriptionTitle:      row.DescriptionTitle,
				DescriptionJSON:       row.DescriptionJson,
				DescriptionHTML:       row.DescriptionHtml,
				Position:              row.Position,
				CreatedBy:             row.CreatedBy,
				CreatedAt:             row.CreatedAt,
				UpdatedAt:             row.UpdatedAt,
				ClientName:            row.ClientName,
				ProjectName:           row.ProjectName,
				CommentsCount:         row.TotalCommentsCount,
				ClientCommentsCount:   row.ClientCommentsCount,
				InternalCommentsCount: row.InternalCommentsCount,
			})
		}
	} else {
		// Client role: only sees own client's tasks
		rows, err := h.queries.ListTasksForClient(ctx, db.ListTasksForClientParams{
			CompanyID: companyID,
			ClientID:  pgtype.UUID{Bytes: person.ClientID, Valid: true},
			Status:    statusParam,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_tasks"})
			return
		}
		for _, row := range rows {
			dLabel, dFull := formatDeadlineDisplay(row.Deadline)
			results = append(results, TaskRespItem{
				ID:                    row.ID,
				CompanyID:             row.CompanyID,
				ClientID:              row.ClientID,
				ProjectID:             row.ProjectID,
				Name:                  row.Name,
				Status:                row.Status,
				Deadline:              row.Deadline,
				DeadlineLabel:         dLabel,
				DeadlineFormatted:     dFull,
				IsOverdue:             computeIsOverdue(row.Status, row.Deadline),
				DescriptionTitle:      row.DescriptionTitle,
				DescriptionJSON:       row.DescriptionJson,
				DescriptionHTML:       row.DescriptionHtml,
				Position:              row.Position,
				CreatedBy:             row.CreatedBy,
				CreatedAt:             row.CreatedAt,
				UpdatedAt:             row.UpdatedAt,
				ClientName:            row.ClientName,
				ProjectName:           row.ProjectName,
				CommentsCount:         row.TotalCommentsCount,
				ClientCommentsCount:   row.ClientCommentsCount,
				InternalCommentsCount: 0, // Strictly zero for clients!
			})
		}
	}

	// Apply month and search filter in-memory if requested
	filtered := make([]TaskRespItem, 0, len(results))
	for _, item := range results {
		if searchQuery != "" {
			matches := strings.Contains(strings.ToLower(item.Name), searchQuery) ||
				strings.Contains(strings.ToLower(item.ClientName), searchQuery)
			if !matches {
				continue
			}
		}
		if monthFilter != "" && item.Deadline.Valid {
			// monthFilter in format YYYY-MM
			itemMonth := item.Deadline.Time.Format("2006-01")
			if itemMonth != monthFilter {
				continue
			}
		}
		filtered = append(filtered, item)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"tasks": filtered,
	})
}

type createTaskReq struct {
	Name             string          `json:"name"`
	ClientID         string          `json:"client_id"`
	ProjectID        *string         `json:"project_id"`
	Deadline         *string         `json:"deadline"`
	DescriptionTitle *string         `json:"description_title"`
	DescriptionJSON  json.RawMessage `json:"description_json"`
	DescriptionHTML  string          `json:"description_html"`
	Links            []struct {
		Title         string  `json:"title"`
		URL           *string `json:"url"`
		LibraryItemID *string `json:"library_item_id"`
	} `json:"links"`
}

// CreateTask creates a new task (Rule 1 & 13)
func (h *TasksHandler) CreateTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !authz.CanCreateTask(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have permission to create tasks",
		})
		return
	}

	var req createTaskReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "task_name_required"})
		return
	}

	var targetClientID pgtype.UUID
	if person.IsClient() {
		// Rule 13: Clients create tasks only for their own client (client field fixed for them)
		targetClientID = pgtype.UUID{Bytes: person.ClientID, Valid: true}
	} else {
		// Staff can choose any client
		if err := targetClientID.Scan(req.ClientID); err != nil || !targetClientID.Valid {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "valid_client_id_required"})
			return
		}
	}

	var targetProjectID pgtype.UUID
	if req.ProjectID != nil && strings.TrimSpace(*req.ProjectID) != "" && *req.ProjectID != "null" {
		_ = targetProjectID.Scan(*req.ProjectID)
	}

	var deadline pgtype.Timestamptz
	if req.Deadline != nil && strings.TrimSpace(*req.Deadline) != "" {
		if t, err := time.Parse(time.RFC3339, *req.Deadline); err == nil {
			deadline = pgtype.Timestamptz{Time: t, Valid: true}
		} else if t, err := time.Parse("2006-01-02", *req.Deadline); err == nil {
			deadline = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	descTitle := "Brief"
	if req.DescriptionTitle != nil && strings.TrimSpace(*req.DescriptionTitle) != "" {
		descTitle = strings.TrimSpace(*req.DescriptionTitle)
	}

	descJSON := []byte("{}")
	if len(req.DescriptionJSON) > 0 {
		descJSON = req.DescriptionJSON
	}

	descHTML := sanitizeHTML(req.DescriptionHTML)

	// Determine next position
	var maxPos float64 = 0
	if h.pool != nil {
		var p *float64
		_ = h.pool.QueryRow(ctx, "SELECT MAX(position) FROM tasks WHERE company_id = $1 AND deleted_at IS NULL", companyID).Scan(&p)
		if p != nil {
			maxPos = *p + 1000
		} else {
			maxPos = 1000
		}
	}

	posBig := big.NewInt(int64(maxPos))
	positionNumeric := pgtype.Numeric{Int: posBig, Valid: true}

	task, err := h.queries.CreateTask(ctx, db.CreateTaskParams{
		CompanyID:        companyID,
		ClientID:         targetClientID,
		ProjectID:        targetProjectID,
		Name:             strings.TrimSpace(req.Name),
		Status:           "not_started",
		Deadline:         deadline,
		DescriptionTitle: descTitle,
		DescriptionJson:  descJSON,
		DescriptionHtml:  descHTML,
		Position:         positionNumeric,
		CreatedBy:        user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "failed_to_create_task",
			"message": err.Error(),
		})
		return
	}

	// Add initial links if provided (max 15 links rule 5)
	if len(req.Links) > 0 {
		count := 0
		for _, l := range req.Links {
			if count >= 15 {
				break
			}
			linkTitle := strings.TrimSpace(l.Title)
			if linkTitle == "" {
				linkTitle = "Link"
			}
			var lURL pgtype.Text
			if l.URL != nil && strings.TrimSpace(*l.URL) != "" {
				trimmedURL := strings.TrimSpace(*l.URL)
				if isValidWebURL(trimmedURL) {
					lURL = pgtype.Text{String: trimmedURL, Valid: true}
				}
			}
			var lItemID pgtype.UUID
			if l.LibraryItemID != nil && strings.TrimSpace(*l.LibraryItemID) != "" {
				_ = lItemID.Scan(*l.LibraryItemID)
			}
			_, _ = h.queries.CreateTaskLink(ctx, db.CreateTaskLinkParams{
				TaskID:        task.ID,
				Title:         linkTitle,
				Url:           lURL,
				LibraryItemID: lItemID,
				Position:      int32(count),
			})
			count++
		}
	}

	// Create initial history line in Client Chat: "Sarah created this task"
	authorName := user.Name
	if authorName == "" {
		authorName = "User"
	}
	historyMsg := fmt.Sprintf("%s created this task", authorName)
	_, _ = h.queries.CreateTaskComment(ctx, db.CreateTaskCommentParams{
		CompanyID: companyID,
		TaskID:    task.ID,
		Tab:       "client",
		UserID:    user.ID,
		Body:      historyMsg,
		IsHistory: true,
	})

	// Rule 13: Creating notifies staff
	go h.notifyStaffOfNewTask(companyID, task.ID, task.Name, authorName)

	respondJSON(w, http.StatusCreated, task)
}

// GetTask returns details of a single task
func (h *TasksHandler) GetTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	// Check if editor is assigned
	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	target := authz.TaskTarget{
		ID:        uuid.UUID(task.ID.Bytes),
		CompanyID: uuid.UUID(task.CompanyID.Bytes),
		ClientID:  uuid.UUID(task.ClientID.Bytes),
	}

	if !authz.CanViewTask(person, target, isAssignee) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	links, _ := h.queries.ListTaskLinks(ctx, task.ID)

	// Rule 3: Clients never see who is assigned, internal tab, or Manage access
	var assignees []interface{}
	canManageAccess := false
	if !person.IsClient() {
		rawAssignees, _ := h.queries.ListTaskAssignees(ctx, db.ListTaskAssigneesParams{
			TaskID:    task.ID,
			CompanyID: companyID,
		})
		for _, a := range rawAssignees {
			assignees = append(assignees, map[string]interface{}{
				"id":         a.ID,
				"name":       a.Name,
				"email":      a.Email,
				"avatar_url": a.AvatarUrl,
				"role":       a.Role,
			})
		}
		canManageAccess = authz.CanManageTaskAccess(person)
	}

	dLabel, dFull := formatDeadlineDisplay(task.Deadline)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"task": map[string]interface{}{
			"id":                 task.ID,
			"company_id":         task.CompanyID,
			"client_id":          task.ClientID,
			"client_name":        task.ClientName,
			"project_id":         task.ProjectID,
			"project_name":       task.ProjectName,
			"name":               task.Name,
			"status":             task.Status,
			"deadline":           task.Deadline,
			"deadline_label":     dLabel,
			"deadline_formatted": dFull,
			"is_overdue":         computeIsOverdue(task.Status, task.Deadline),
			"description_title":  task.DescriptionTitle,
			"description_json":   task.DescriptionJson,
			"description_html":   task.DescriptionHtml,
			"position":           task.Position,
			"created_by":         task.CreatedBy,
			"created_at":         task.CreatedAt,
			"updated_at":         task.UpdatedAt,
		},
		"links":             links,
		"assignees":         assignees,
		"can_manage_access": canManageAccess,
		"can_change_status": authz.CanChangeTaskStatus(person, isAssignee),
		"can_delete":        authz.CanDeleteTask(person),
	})
}

type updateTaskReq struct {
	Name             *string         `json:"name"`
	Deadline         *string         `json:"deadline"`
	DescriptionTitle *string         `json:"description_title"`
	DescriptionJSON  json.RawMessage `json:"description_json"`
	DescriptionHTML  *string         `json:"description_html"`
	ProjectID        *string         `json:"project_id"`
}

// UpdateTask updates task details (staff only)
func (h *TasksHandler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !person.IsStaff() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can update task properties"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	existing, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	var req updateTaskReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	name := existing.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}

	deadline := existing.Deadline
	if req.Deadline != nil {
		if strings.TrimSpace(*req.Deadline) == "" || *req.Deadline == "null" {
			deadline = pgtype.Timestamptz{Valid: false}
		} else if t, err := time.Parse(time.RFC3339, *req.Deadline); err == nil {
			deadline = pgtype.Timestamptz{Time: t, Valid: true}
		} else if t, err := time.Parse("2006-01-02", *req.Deadline); err == nil {
			deadline = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	descTitle := existing.DescriptionTitle
	if req.DescriptionTitle != nil && strings.TrimSpace(*req.DescriptionTitle) != "" {
		descTitle = strings.TrimSpace(*req.DescriptionTitle)
	}

	descJSON := existing.DescriptionJson
	if len(req.DescriptionJSON) > 0 {
		descJSON = req.DescriptionJSON
	}

	descHTML := existing.DescriptionHtml
	if req.DescriptionHTML != nil {
		descHTML = sanitizeHTML(*req.DescriptionHTML)
	}

	projectID := existing.ProjectID
	if req.ProjectID != nil {
		if strings.TrimSpace(*req.ProjectID) == "" || *req.ProjectID == "null" {
			projectID = pgtype.UUID{Valid: false}
		} else {
			_ = projectID.Scan(*req.ProjectID)
		}
	}

	updated, err := h.queries.UpdateTaskDetails(ctx, db.UpdateTaskDetailsParams{
		ID:               taskID,
		CompanyID:        companyID,
		Name:             name,
		Deadline:         deadline,
		DescriptionTitle: descTitle,
		DescriptionJson:  descJSON,
		DescriptionHtml:  descHTML,
		ProjectID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_update_task"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

type updateStatusReq struct {
	Status string `json:"status"`
}

// UpdateTaskStatus updates status and records a history entry
func (h *TasksHandler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	// Rule 4: Only staff and assigned editors change status (server checked). Clients NEVER.
	if !authz.CanChangeTaskStatus(person, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only staff and assigned editors can change task status",
		})
		return
	}

	var req updateStatusReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	validStatuses := map[string]string{
		"not_started": "Not started",
		"in_progress": "In progress",
		"completed":   "Completed",
		"not_needed":  "Not needed",
	}

	statusKey := strings.ToLower(strings.TrimSpace(req.Status))
	statusName, ok := validStatuses[statusKey]
	if !ok {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_status"})
		return
	}

	updated, err := h.queries.UpdateTaskStatus(ctx, db.UpdateTaskStatusParams{
		ID:        taskID,
		CompanyID: companyID,
		Status:    statusKey,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_update_status"})
		return
	}

	// Record history comment line in Client chat: e.g. "Harsh completed this task"
	actorName := user.Name
	if actorName == "" {
		actorName = "User"
	}
	historyMsg := fmt.Sprintf("%s changed status to %s", actorName, statusName)
	if statusKey == "completed" {
		historyMsg = fmt.Sprintf("%s completed this task", actorName)
	}
	histComment, _ := h.queries.CreateTaskComment(ctx, db.CreateTaskCommentParams{
		CompanyID: companyID,
		TaskID:    taskID,
		Tab:       "client",
		UserID:    user.ID,
		Body:      historyMsg,
		IsHistory: true,
	})

	// Broadcast status update & history line over SSE
	h.broadcastComment(uuid.UUID(companyID.Bytes).String(), uuid.UUID(taskID.Bytes).String(), "client", map[string]interface{}{
		"type":        "status_changed",
		"status":      statusKey,
		"history_msg": historyMsg,
		"comment":     histComment,
	})

	respondJSON(w, http.StatusOK, updated)
}

type reorderTasksReq struct {
	TaskIDs []string `json:"task_ids"`
	Items   []struct {
		ID       string  `json:"id"`
		Position float64 `json:"position"`
	} `json:"items"`
}

// ReorderTasks updates task priority order (Rule 10: saved on server, same for everyone)
func (h *TasksHandler) ReorderTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !person.IsStaff() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can reorder tasks"})
		return
	}

	var req reorderTasksReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	if len(req.TaskIDs) > 0 {
		for idx, idStr := range req.TaskIDs {
			var tID pgtype.UUID
			if err := tID.Scan(idStr); err == nil {
				posBig := big.NewInt(int64((idx + 1) * 1000))
				_ = h.queries.UpdateTaskPosition(ctx, db.UpdateTaskPositionParams{
					ID:        tID,
					CompanyID: companyID,
					Position:  pgtype.Numeric{Int: posBig, Valid: true},
				})
			}
		}
	} else {
		for _, item := range req.Items {
			var tID pgtype.UUID
			if err := tID.Scan(item.ID); err == nil {
				posBig := big.NewInt(int64(item.Position))
				_ = h.queries.UpdateTaskPosition(ctx, db.UpdateTaskPositionParams{
					ID:        tID,
					CompanyID: companyID,
					Position:  pgtype.Numeric{Int: posBig, Valid: true},
				})
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// DeleteTask soft deletes a task to Trash (Rule 11: staff only)
func (h *TasksHandler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !authz.CanDeleteTask(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can delete tasks"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	err := h.queries.SoftDeleteTask(ctx, db.SoftDeleteTaskParams{
		ID:        taskID,
		CompanyID: companyID,
		DeletedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_delete_task"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// RestoreTask restores a soft-deleted task from Trash (Rule 11: staff only)
func (h *TasksHandler) RestoreTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !authz.CanDeleteTask(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can restore tasks"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	err := h.queries.RestoreTask(ctx, db.RestoreTaskParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_restore_task"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ListTrashTasks lists all tasks in Trash (Rule 11: staff only)
func (h *TasksHandler) ListTrashTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !authz.CanDeleteTask(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can view trash tasks"})
		return
	}

	tasks, err := h.queries.ListTrashTasks(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_trash_tasks"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"tasks": tasks,
	})
}

// -------------------------------------------------------------------------
// Assignees (Rule 4 & 12)
// -------------------------------------------------------------------------

type addAssigneeReq struct {
	UserID string `json:"user_id"`
}

// AddAssignee assigns a staff or editor to a task (Staff only)
func (h *TasksHandler) AddAssignee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !authz.CanManageTaskAccess(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can manage task access"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	var req addAssigneeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	var targetUserID pgtype.UUID
	if err := targetUserID.Scan(req.UserID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_user_id"})
		return
	}

	// Verify target user is staff or editor of this company (clients can NEVER be assigned!)
	membership, mErr := h.queries.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    targetUserID,
	})
	if mErr != nil || strings.EqualFold(membership.Role, "client") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot_assign_client_or_external_user"})
		return
	}

	err = h.queries.AddTaskAssignee(ctx, db.AddTaskAssigneeParams{
		TaskID:     taskID,
		UserID:     targetUserID,
		AssignedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_add_assignee"})
		return
	}

	// Rule 12: Notification for task assigned to you
	go h.notifyTaskAssigned(companyID, targetUserID, task.Name, user.Name)

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// RemoveAssignee removes an assignee from a task
func (h *TasksHandler) RemoveAssignee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !authz.CanManageTaskAccess(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can manage task access"})
		return
	}

	var taskID, targetUserID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}
	if err := targetUserID.Scan(chi.URLParam(r, "userId")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_user_id"})
		return
	}

	_ = h.queries.RemoveTaskAssignee(ctx, db.RemoveTaskAssigneeParams{
		TaskID: taskID,
		UserID: targetUserID,
	})

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// -------------------------------------------------------------------------
// Links (Rule 5: Max 15 per task)
// -------------------------------------------------------------------------

type createLinkReq struct {
	Title         string  `json:"title"`
	URL           *string `json:"url"`
	LibraryItemID *string `json:"library_item_id"`
}

// AddTaskLink adds a link or Library file to a task (max 15 enforced)
func (h *TasksHandler) AddTaskLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	if !authz.CanViewTask(person, authz.TaskTarget{
		ID: uuid.UUID(task.ID.Bytes), CompanyID: uuid.UUID(task.CompanyID.Bytes), ClientID: uuid.UUID(task.ClientID.Bytes),
	}, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	// Check max 15 links (Rule 5)
	currentCount, _ := h.queries.CountTaskLinks(ctx, task.ID)
	if currentCount >= 15 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "max_links_exceeded",
			"message": "A maximum of 15 links is allowed per task",
		})
		return
	}

	var req createLinkReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	linkTitle := strings.TrimSpace(req.Title)
	if linkTitle == "" {
		linkTitle = "Link"
	}

	var lURL pgtype.Text
	if req.URL != nil && strings.TrimSpace(*req.URL) != "" {
		trimmed := strings.TrimSpace(*req.URL)
		// Rule 5: Only http/https URLs are accepted (block javascript: and data: links)
		if !isValidWebURL(trimmed) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "invalid_url",
				"message": "Only HTTP and HTTPS URLs are accepted",
			})
			return
		}
		lURL = pgtype.Text{String: trimmed, Valid: true}
	}

	var lItemID pgtype.UUID
	if req.LibraryItemID != nil && strings.TrimSpace(*req.LibraryItemID) != "" {
		if err := lItemID.Scan(*req.LibraryItemID); err == nil && lItemID.Valid {
			// Verify file exists and user can open it
			libItem, itErr := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
				ID:        lItemID,
				CompanyID: companyID,
			})
			if itErr != nil || libItem.DeletedAt.Valid {
				respondJSON(w, http.StatusBadRequest, map[string]string{"error": "library_item_not_found"})
				return
			}
			if linkTitle == "Link" || linkTitle == "" {
				linkTitle = libItem.Name
			}
		}
	}

	link, err := h.queries.CreateTaskLink(ctx, db.CreateTaskLinkParams{
		TaskID:        task.ID,
		Title:         linkTitle,
		Url:           lURL,
		LibraryItemID: lItemID,
		Position:      int32(currentCount),
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_link"})
		return
	}

	respondJSON(w, http.StatusCreated, link)
}

// DeleteTaskLink deletes a link from a task
func (h *TasksHandler) DeleteTaskLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	if !authz.CanViewTask(person, authz.TaskTarget{
		ID: uuid.UUID(task.ID.Bytes), CompanyID: uuid.UUID(task.CompanyID.Bytes), ClientID: uuid.UUID(task.ClientID.Bytes),
	}, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var linkID pgtype.UUID
	if err := linkID.Scan(chi.URLParam(r, "linkId")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_link_id"})
		return
	}

	_ = h.queries.DeleteTaskLink(ctx, db.DeleteTaskLinkParams{
		ID:     linkID,
		TaskID: taskID,
	})

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// -------------------------------------------------------------------------
// Comments & Server-Side Tab Isolation (Rule 2)
// -------------------------------------------------------------------------

// ListTaskComments returns comments for a task strictly filtered by tab
func (h *TasksHandler) ListTaskComments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	tab := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tab")))
	if tab == "" {
		tab = "client"
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	target := authz.TaskTarget{
		ID:        uuid.UUID(task.ID.Bytes),
		CompanyID: uuid.UUID(task.CompanyID.Bytes),
		ClientID:  uuid.UUID(task.ClientID.Bytes),
	}

	// Rule 2: Strictly enforce tab access on server!
	// Clients can NEVER read or access internal comments.
	if !authz.CanAccessTaskTab(person, target, tab, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have access to this comment channel",
		})
		return
	}

	comments, err := h.queries.ListTaskCommentsByTab(ctx, db.ListTaskCommentsByTabParams{
		TaskID: task.ID,
		Tab:    tab,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_comments"})
		return
	}

	// Fetch attachments for all comments in this task/tab
	rawAttachments, _ := h.queries.ListAttachmentsForTaskComments(ctx, db.ListAttachmentsForTaskCommentsParams{
		TaskID: task.ID,
		Tab:    tab,
	})

	attachmentsByComment := make(map[string][]map[string]interface{})
	for _, att := range rawAttachments {
		cIDStr := uuid.UUID(att.CommentID.Bytes).String()
		downloadURL := fmt.Sprintf("/api/v1/tasks/comments/attachments/%s/download", uuid.UUID(att.ID.Bytes).String())
		attachmentsByComment[cIDStr] = append(attachmentsByComment[cIDStr], map[string]interface{}{
			"id":           att.ID,
			"comment_id":   att.CommentID,
			"filename":     att.Filename,
			"mime":         att.Mime,
			"size_bytes":   att.SizeBytes,
			"download_url": downloadURL,
			"created_at":   att.CreatedAt,
		})
	}

	type CommentRespItem struct {
		ID                pgtype.UUID              `json:"id"`
		TaskID            pgtype.UUID              `json:"task_id"`
		Tab               string                   `json:"tab"`
		UserID            pgtype.UUID              `json:"user_id"`
		UserName          string                   `json:"user_name"`
		UserEmail         string                   `json:"user_email"`
		UserAvatarURL     pgtype.Text              `json:"user_avatar_url"`
		UserRole          pgtype.Text              `json:"user_role"`
		Body              string                   `json:"body"`
		ReplyToCommentID  pgtype.UUID              `json:"reply_to_comment_id"`
		ReplyBody         pgtype.Text              `json:"reply_body"`
		ReplyUserName     pgtype.Text              `json:"reply_user_name"`
		IsHistory         bool                     `json:"is_history"`
		DeletedAt         pgtype.Timestamptz       `json:"deleted_at"`
		IsDeleted         bool                     `json:"is_deleted"`
		Attachments       []map[string]interface{} `json:"attachments"`
		CreatedAt         pgtype.Timestamptz       `json:"created_at"`
		FormattedCreated  string                   `json:"formatted_created"`
		CanEdit           bool                     `json:"can_edit"`
		CanDelete         bool                     `json:"can_delete"`
	}

	formattedComments := make([]CommentRespItem, 0, len(comments))
	for _, c := range comments {
		cIDStr := uuid.UUID(c.ID.Bytes).String()
		atts := attachmentsByComment[cIDStr]
		if atts == nil {
			atts = []map[string]interface{}{}
		}

		timeStr := c.CreatedAt.Time.Format("Jan 02, 3:04 pm")
		timeDiff := time.Since(c.CreatedAt.Time)
		if timeDiff < 1*time.Minute {
			timeStr = "Just now"
		} else if timeDiff < 1*time.Hour {
			timeStr = fmt.Sprintf("%d minutes ago", int(timeDiff.Minutes()))
		} else if timeDiff < 24*time.Hour {
			timeStr = fmt.Sprintf("%d hours ago", int(timeDiff.Hours()))
		} else if timeDiff < 7*24*time.Hour {
			timeStr = fmt.Sprintf("%d days ago", int(timeDiff.Hours()/24))
		}

		isDeleted := c.DeletedAt.Valid
		bodyText := c.Body
		if isDeleted {
			bodyText = "Message deleted"
		}

		isAuthor := c.UserID.Bytes == person.UserID
		canEdit := isAuthor && !isDeleted && !c.IsHistory
		canDelete := (isAuthor || person.IsStaff()) && !isDeleted && !c.IsHistory

		formattedComments = append(formattedComments, CommentRespItem{
			ID:                c.ID,
			TaskID:            c.TaskID,
			Tab:               c.Tab,
			UserID:            c.UserID,
			UserName:          c.UserName,
			UserEmail:         c.UserEmail,
			UserAvatarURL:     c.UserAvatarUrl,
			UserRole:          c.UserRole,
			Body:              bodyText,
			ReplyToCommentID:  c.ReplyToCommentID,
			ReplyBody:         c.ReplyBody,
			ReplyUserName:     c.ReplyUserName,
			IsHistory:         c.IsHistory,
			DeletedAt:         c.DeletedAt,
			IsDeleted:         isDeleted,
			Attachments:       atts,
			CreatedAt:         c.CreatedAt,
			FormattedCreated:  timeStr,
			CanEdit:           canEdit,
			CanDelete:         canDelete,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"comments": formattedComments,
	})
}

type createTaskCommentReq struct {
	Tab              string  `json:"tab"` // "client" or "internal"
	Body             string  `json:"body"`
	ReplyToCommentID *string `json:"reply_to_comment_id"`
	Attachments      []struct {
		StorageKey string `json:"storage_key"`
		Filename   string `json:"filename"`
		Mime       string `json:"mime"`
		SizeBytes  int64  `json:"size_bytes"`
	} `json:"attachments"`
}

// CreateTaskComment adds a new comment to a task (Rule 2: Server-side channel isolation)
func (h *TasksHandler) CreateTaskComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	var req createTaskCommentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	tab := strings.ToLower(strings.TrimSpace(req.Tab))
	if tab == "" {
		tab = "client"
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	target := authz.TaskTarget{
		ID:        uuid.UUID(task.ID.Bytes),
		CompanyID: uuid.UUID(task.CompanyID.Bytes),
		ClientID:  uuid.UUID(task.ClientID.Bytes),
	}

	// Rule 2: Strictly block client from internal comments!
	if !authz.CanAccessTaskTab(person, target, tab, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have access to post in this comment channel",
		})
		return
	}

	bodyText := strings.TrimSpace(req.Body)
	if bodyText == "" && len(req.Attachments) == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "comment_body_or_attachment_required"})
		return
	}

	var replyID pgtype.UUID
	if req.ReplyToCommentID != nil && strings.TrimSpace(*req.ReplyToCommentID) != "" {
		_ = replyID.Scan(*req.ReplyToCommentID)
	}

	comment, err := h.queries.CreateTaskComment(ctx, db.CreateTaskCommentParams{
		CompanyID:           companyID,
		TaskID:              task.ID,
		Tab:                 tab,
		UserID:              user.ID,
		Body:                bodyText,
		ReplyToCommentID:    replyID,
		IsHistory:           false,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_comment"})
		return
	}

	// Insert attachments if provided (Rule 7: checked on server, max 30 MB)
	createdAttachments := make([]map[string]interface{}, 0, len(req.Attachments))
	for _, att := range req.Attachments {
		if att.SizeBytes > 30*1024*1024 {
			continue // skip or reject oversized
		}
		cAtt, attErr := h.queries.CreateTaskCommentAttachment(ctx, db.CreateTaskCommentAttachmentParams{
			CommentID:  comment.ID,
			StorageKey: att.StorageKey,
			Filename:   att.Filename,
			Mime:       att.Mime,
			SizeBytes:  att.SizeBytes,
		})
		if attErr == nil {
			downloadURL := fmt.Sprintf("/api/v1/tasks/comments/attachments/%s/download", uuid.UUID(cAtt.ID.Bytes).String())
			createdAttachments = append(createdAttachments, map[string]interface{}{
				"id":           cAtt.ID,
				"comment_id":   cAtt.CommentID,
				"filename":     cAtt.Filename,
				"mime":         cAtt.Mime,
				"size_bytes":   cAtt.SizeBytes,
				"download_url": downloadURL,
			})
		}
	}

	// Real-time broadcast over Redis / SSE for this specific task and tab
	h.broadcastComment(uuid.UUID(companyID.Bytes).String(), uuid.UUID(task.ID.Bytes).String(), tab, map[string]interface{}{
		"type":        "new_comment",
		"comment":     comment,
		"author_name": user.Name,
		"attachments": createdAttachments,
	})

	// Rule 12: Notification for new comment or @mention (only in a tab you can see)
	go h.notifyTaskComment(companyID, task.ID, task.Name, tab, user.ID, user.Name, bodyText)

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"comment":     comment,
		"attachments": createdAttachments,
	})
}

// UpdateTaskComment edits user's own comment (Rule 8)
func (h *TasksHandler) UpdateTaskComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)

	var commentID pgtype.UUID
	if err := commentID.Scan(chi.URLParam(r, "commentId")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Body) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "comment_body_required"})
		return
	}

	updated, err := h.queries.UpdateTaskComment(ctx, db.UpdateTaskCommentParams{
		ID:     commentID,
		UserID: user.ID,
		Body:   strings.TrimSpace(req.Body),
	})
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "cannot_edit_comment"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// DeleteTaskComment deletes user's own comment (or staff) -> shows "Message deleted" (Rule 8)
func (h *TasksHandler) DeleteTaskComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)

	var commentID pgtype.UUID
	if err := commentID.Scan(chi.URLParam(r, "commentId")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	err := h.queries.SoftDeleteTaskComment(ctx, db.SoftDeleteTaskCommentParams{
		ID:     commentID,
		UserID: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "cannot_delete_comment"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// -------------------------------------------------------------------------
// Attachments (Rule 7: Up to 30 MB, signed download URLs only for authorized tab)
// -------------------------------------------------------------------------

type presignAttachmentReq struct {
	Filename  string `json:"filename"`
	Mime      string `json:"mime"`
	SizeBytes int64  `json:"size_bytes"`
}

// PresignCommentAttachment generates a direct presigned PUT URL for upload (max 30 MB)
func (h *TasksHandler) PresignCommentAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	var req presignAttachmentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	// Rule 7: Enforce 30 MB limit on server
	const maxAttachmentBytes = 30 * 1024 * 1024 // 30 MB = 31,457,280 bytes
	if req.SizeBytes > maxAttachmentBytes {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "attachment_too_large",
			"message": "Files must be 30 MB or smaller",
		})
		return
	}

	attUUID := uuid.New().String()
	sanitizedName := strings.ReplaceAll(req.Filename, "/", "_")
	storageKey := fmt.Sprintf("companies/%s/tasks/%s/attachments/%s/%s",
		uuid.UUID(companyID.Bytes).String(),
		uuid.UUID(taskID.Bytes).String(),
		attUUID,
		sanitizedName,
	)

	mime := req.Mime
	if mime == "" {
		mime = "application/octet-stream"
	}

	var uploadURL string
	if h.storage != nil {
		u, err := h.storage.PresignPutObject(ctx, storageKey, mime, 30*time.Minute)
		if err == nil {
			uploadURL = u
		}
	}
	if uploadURL == "" {
		uploadURL = fmt.Sprintf("http://localhost:9000/playhead-dev/%s", storageKey)
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"upload_url":  uploadURL,
		"storage_key": storageKey,
	})
}

// DownloadCommentAttachment returns a presigned GET URL only if caller has access to that comment's tab (Rule 7)
func (h *TasksHandler) DownloadCommentAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)

	var attID pgtype.UUID
	if err := attID.Scan(chi.URLParam(r, "attachmentId")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_attachment_id"})
		return
	}

	att, err := h.queries.GetTaskCommentAttachmentByID(ctx, attID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "attachment_not_found"})
		return
	}

	task, tErr := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        att.TaskID,
		CompanyID: att.CompanyID,
	})
	if tErr != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	target := authz.TaskTarget{
		ID:        uuid.UUID(task.ID.Bytes),
		CompanyID: uuid.UUID(task.CompanyID.Bytes),
		ClientID:  uuid.UUID(task.ClientID.Bytes),
	}

	// Rule 2 & 7: Clients can NEVER download attachments from internal comments!
	if !authz.CanAccessTaskTab(person, target, att.Tab, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have permission to download this attachment",
		})
		return
	}

	var downloadURL string
	if h.storage != nil {
		u, err := h.storage.PresignGetObject(ctx, att.StorageKey, att.Filename, 1*time.Hour)
		if err == nil {
			downloadURL = u
		}
	}
	if downloadURL == "" {
		downloadURL = fmt.Sprintf("http://localhost:9000/playhead-dev/%s", att.StorageKey)
	}

	// Redirect to presigned URL or respond with json
	if r.URL.Query().Get("redirect") == "true" {
		http.Redirect(w, r, downloadURL, http.StatusTemporaryRedirect)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"download_url": downloadURL,
		"filename":     att.Filename,
	})
}

// -------------------------------------------------------------------------
// Real-Time SSE Stream (Rule 2 & 9)
// -------------------------------------------------------------------------

// StreamTaskComments establishes an SSE connection strictly scoped to the authorized tab
func (h *TasksHandler) StreamTaskComments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		http.Error(w, "no_company_context", http.StatusBadRequest)
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		http.Error(w, "invalid_task_id", http.StatusBadRequest)
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		http.Error(w, "task_not_found", http.StatusNotFound)
		return
	}

	tab := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tab")))
	if tab == "" {
		tab = "client"
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	target := authz.TaskTarget{
		ID:        uuid.UUID(task.ID.Bytes),
		CompanyID: uuid.UUID(task.CompanyID.Bytes),
		ClientID:  uuid.UUID(task.ClientID.Bytes),
	}

	// Rule 2: Strictly enforce tab access! Clients can NEVER subscribe to internal SSE stream.
	if !authz.CanAccessTaskTab(person, target, tab, isAssignee) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming_unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	channelKey := fmt.Sprintf("%s:%s:%s", uuid.UUID(companyID.Bytes).String(), uuid.UUID(taskID.Bytes).String(), tab)

	// In-memory channel for this connection
	msgChan := make(chan string, 32)

	h.sseMu.Lock()
	h.sseClients[channelKey] = append(h.sseClients[channelKey], msgChan)
	h.sseMu.Unlock()

	defer func() {
		h.sseMu.Lock()
		clients := h.sseClients[channelKey]
		for i, c := range clients {
			if c == msgChan {
				h.sseClients[channelKey] = append(clients[:i], clients[i+1:]...)
				break
			}
		}
		h.sseMu.Unlock()
	}()

	// Send initial connected ping
	_, _ = fmt.Fprintf(w, "event: connected\ndata: {\"task_id\":%q,\"tab\":%q}\n\n", uuid.UUID(taskID.Bytes).String(), tab)
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Heartbeat
			_, err := fmt.Fprintf(w, ": heartbeat\n\n")
			if err != nil {
				return
			}
			flusher.Flush()
		case msg := <-msgChan:
			_, err := fmt.Fprintf(w, "data: %s\n\n", msg)
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (h *TasksHandler) broadcastComment(companyID, taskID, tab string, payload interface{}) {
	dataBytes, _ := json.Marshal(payload)
	dataStr := string(dataBytes)

	channelKey := fmt.Sprintf("%s:%s:%s", companyID, taskID, tab)

	// 1. Broadcast to in-memory SSE clients
	h.sseMu.RLock()
	clients := h.sseClients[channelKey]
	for _, c := range clients {
		select {
		case c <- dataStr:
		default:
		}
	}
	h.sseMu.RUnlock()

	// 2. Broadcast to Redis pub/sub if connected
	if h.rdb != nil {
		_ = h.rdb.Publish(context.Background(), "playhead:tasks:"+channelKey, dataStr).Err()
	}
}

// ListMentionable returns users that can be @mentioned in this task and tab (Rule 2)
func (h *TasksHandler) ListMentionable(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var taskID pgtype.UUID
	if err := taskID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_task_id"})
		return
	}

	task, err := h.queries.GetTaskByID(ctx, db.GetTaskByIDParams{
		ID:        taskID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}

	tab := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tab")))
	if tab == "" {
		tab = "client"
	}

	isAssignee := false
	if person.IsEditor() {
		isAssignee, _ = h.queries.IsUserAssignedToTask(ctx, db.IsUserAssignedToTaskParams{
			TaskID: task.ID,
			UserID: toPgUUID(person.UserID),
		})
	}

	target := authz.TaskTarget{
		ID:        uuid.UUID(task.ID.Bytes),
		CompanyID: uuid.UUID(task.CompanyID.Bytes),
		ClientID:  uuid.UUID(task.ClientID.Bytes),
	}

	if !authz.CanAccessTaskTab(person, target, tab, isAssignee) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	type MentionableUser struct {
		ID        pgtype.UUID `json:"id"`
		Name      string      `json:"name"`
		Email     string      `json:"email"`
		Role      string      `json:"role"`
		AvatarURL pgtype.Text `json:"avatar_url"`
	}

	var mentionables []MentionableUser

	if tab == "client" {
		// Client Chat: client contacts and staff members
		contacts, _ := h.queries.ListClientContacts(ctx, task.ClientID)
		for _, c := range contacts {
			mentionables = append(mentionables, MentionableUser{
				ID:    c.UserID,
				Name:  c.Name,
				Email: c.Email,
				Role:  "Client",
			})
		}
		staffMembers, _ := h.queries.GetMembershipsForCompany(ctx, companyID)
		for _, m := range staffMembers {
			if strings.EqualFold(m.Role, authz.RoleStaff) {
				mentionables = append(mentionables, MentionableUser{
					ID:        m.UserID,
					Name:      m.UserName,
					Email:     m.UserEmail,
					Role:      m.Role,
					AvatarURL: m.UserAvatarUrl,
				})
			}
		}
	} else {
		// Internal tab: staff and assigned editors ONLY (never clients)
		staffMembers, _ := h.queries.GetMembershipsForCompany(ctx, companyID)
		for _, m := range staffMembers {
			if strings.EqualFold(m.Role, authz.RoleStaff) {
				mentionables = append(mentionables, MentionableUser{
					ID:        m.UserID,
					Name:      m.UserName,
					Email:     m.UserEmail,
					Role:      m.Role,
					AvatarURL: m.UserAvatarUrl,
				})
			}
		}
		rawAssignees, _ := h.queries.ListTaskAssignees(ctx, db.ListTaskAssigneesParams{
			TaskID:    task.ID,
			CompanyID: companyID,
		})
		for _, a := range rawAssignees {
			if strings.EqualFold(a.Role.String, authz.RoleEditor) {
				mentionables = append(mentionables, MentionableUser{
					ID:        a.ID,
					Name:      a.Name,
					Email:     a.Email,
					Role:      "Editor",
					AvatarURL: a.AvatarUrl,
				})
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"users": mentionables,
	})
}

// -------------------------------------------------------------------------
// Notifications (Rule 12 & 13)
// -------------------------------------------------------------------------

func (h *TasksHandler) notifyStaffOfNewTask(companyID, taskID pgtype.UUID, taskName, creatorName string) {
	if h.pool == nil {
		return
	}
	// Fetch staff emails
	rows, err := h.pool.Query(context.Background(), `
		SELECT u.email, u.name
		FROM memberships m
		JOIN users u ON u.id = m.user_id
		WHERE m.company_id = $1 AND LOWER(m.role) = 'staff' AND m.status = 'active'
	`, companyID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var email, name string
		if err := rows.Scan(&email, &name); err == nil && h.mailer != nil {
			taskURL := fmt.Sprintf("%s/tasks?open=%s", strings.TrimRight(h.mailer.FrontendURL, "/"), uuid.UUID(taskID.Bytes).String())
			_ = h.mailer.SendNotificationEmail(email, "New task assigned: "+taskName,
				fmt.Sprintf("Hi %s,\n\n%s assigned a new task: %s.\nView task: %s", name, creatorName, taskName, taskURL))
		}
	}
}

func (h *TasksHandler) notifyTaskAssigned(companyID, userID pgtype.UUID, taskName, assignerName string) {
	if h.pool == nil {
		return
	}
	var email, name string
	err := h.pool.QueryRow(context.Background(), `
		SELECT email, name FROM users WHERE id = $1
	`, userID).Scan(&email, &name)
	if err == nil && h.mailer != nil {
		_ = h.mailer.SendNotificationEmail(email, "You were assigned to task: "+taskName,
			fmt.Sprintf("Hi %s,\n\n%s added you to task %q.\nOpen Playhead to view details.", name, assignerName, taskName))
	}
}

func (h *TasksHandler) notifyTaskComment(companyID, taskID pgtype.UUID, taskName, tab string, authorID pgtype.UUID, authorName, commentBody string) {
	if h.pool == nil {
		return
	}
	// Parse @mentions
	words := strings.Fields(commentBody)
	for _, w := range words {
		if strings.HasPrefix(w, "@") && len(w) > 1 {
			targetName := strings.Trim(w[1:], ",.:;!?")
			var email, name, role string
			var uID pgtype.UUID
			err := h.pool.QueryRow(context.Background(), `
				SELECT u.id, u.email, u.name, m.role
				FROM users u
				JOIN memberships m ON m.user_id = u.id AND m.company_id = $1
				WHERE (LOWER(u.name) LIKE LOWER($2) OR LOWER(u.email) LIKE LOWER($2)) AND m.status = 'active'
				LIMIT 1
			`, companyID, "%"+targetName+"%").Scan(&uID, &email, &name, &role)
			if err == nil && uID != authorID {
				// Rule 2: Ensure mentioned user is allowed to receive notification in this tab!
				if tab == "internal" && strings.EqualFold(role, "client") {
					continue // Clients NEVER receive notifications about internal comments!
				}
				if h.mailer != nil {
					_ = h.mailer.SendNotificationEmail(email, fmt.Sprintf("%s mentioned you in %q", authorName, taskName),
						fmt.Sprintf("Hi %s,\n\n%s mentioned you in task %q:\n\n%q", name, authorName, taskName, commentBody))
				}
			}
		}
	}
}
