package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
)

type ProjectHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
	storage *storage.Client
}

func NewProjectHandler(queries *db.Queries) *ProjectHandler {
	return &ProjectHandler{queries: queries}
}

func (h *ProjectHandler) SetPool(p *pgxpool.Pool) {
	h.pool = p
}

func (h *ProjectHandler) SetStorage(s *storage.Client) {
	h.storage = s
}

type AssignPersonInput struct {
	Email       string `json:"email"`
	Level       string `json:"level"` // viewer, commenter, uploader, full
	CanDownload *bool  `json:"can_download"`
}

type CreateProjectRequest struct {
	Name     string              `json:"name"`
	ClientID string              `json:"client_id"`
	Template string              `json:"template"` // blank or video_project
	People   []AssignPersonInput `json:"people"`
}

func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	person := middleware.GetPerson(r.Context())
	// Editors never create projects (Rule 13)
	if person.IsEditor() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Editors cannot create projects"})
		return
	}

	// Roles with projects.create permission can create projects
	if !person.HasPermission(authz.PermProjectsCreate) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only members with projects.create can create projects"})
		return
	}

	var req CreateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required", "message": "Project name is required"})
		return
	}

	var clientID pgtype.UUID
	if strings.TrimSpace(req.ClientID) != "" {
		_ = clientID.Scan(req.ClientID)
	}

	// Auto-resolve client for clients if not specified (Rule 13: inside their own client only, automatically)
	if !clientID.Valid && person.IsClient() {
		contacts, cErr := h.queries.GetClientContactsByEmail(r.Context(), person.Email)
		if cErr == nil && len(contacts) > 0 {
			clientID = contacts[0].ClientID
		}
	}

	// Auto-fallback to internal client "Idyll Productions" for staff (Rule 3)
	if !clientID.Valid && !person.IsClient() {
		idyllClient, iErr := h.queries.GetClientByName(r.Context(), db.GetClientByNameParams{
			CompanyID: companyID,
			Name:      "Idyll Productions",
		})
		if iErr == nil {
			clientID = idyllClient.ID
		}
	}

	if !clientID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id", "message": "Valid client is required"})
		return
	}

	// Verify client belongs to company
	_, err := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
		CompanyID: companyID,
		ID:        clientID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "client_not_found"})
		return
	}

	// Clients can only create projects inside their own client (Rule 13)
	if person.IsClient() {
		_, err := h.queries.GetClientContactByClientAndEmail(r.Context(), db.GetClientContactByClientAndEmailParams{
			ClientID: clientID,
			Email:    strings.ToLower(strings.TrimSpace(person.Email)),
		})
		if err != nil {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "forbidden",
				"message": "Clients can only create projects inside their own client",
			})
			return
		}
	}

	project, err := h.queries.CreateProject(r.Context(), db.CreateProjectParams{
		CompanyID: companyID,
		ClientID:  clientID,
		Name:      name,
		CreatedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create project"})
		return
	}

	// Template handling & Default folders (Addition 1)
	defaultFolders := []string{"Raw files", "Edited files"}
	template := strings.ToLower(strings.TrimSpace(req.Template))
	if template == "video_project" {
		defaultFolders = []string{"Raw files", "Edited files", "Briefs", "Deliverables"}
	}
	for i, folderName := range defaultFolders {
		var pos pgtype.Numeric
		_ = pos.Scan(fmt.Sprintf("%d", i+1))
		_, _ = h.queries.CreateItem(r.Context(), db.CreateItemParams{
			CompanyID: companyID,
			ProjectID: project.ID,
			ParentID:  pgtype.UUID{Valid: false},
			Kind:      "folder",
			Name:      folderName,
			Position:  pos,
			CreatedBy: user.ID,
		})
	}
	_ = h.queries.UpdateProjectFolderCount(r.Context(), db.UpdateProjectFolderCountParams{
		ID:          project.ID,
		FolderCount: int32(len(defaultFolders)),
	})
	project.FolderCount = int32(len(defaultFolders))



	// Assign initial people
	for _, p := range req.People {
		personEmail := authz.NormalizeEmail(p.Email)
		if personEmail == "" || !strings.Contains(personEmail, "@") {
			continue
		}
		level := strings.ToLower(strings.TrimSpace(p.Level))
		if level == "" {
			level = authz.LevelCommenter
		}
		canDownload := true
		if p.CanDownload != nil {
			canDownload = *p.CanDownload
		}

		// Look up user if already registered
		var targetUserID pgtype.UUID
		if u, err := h.queries.GetUserByEmail(r.Context(), personEmail); err == nil {
			targetUserID = u.ID
		}

		_, _ = h.queries.CreateGrant(r.Context(), db.CreateGrantParams{
			CompanyID:   companyID,
			TargetType:  "project",
			TargetID:    project.ID,
			Email:       personEmail,
			UserID:      targetUserID,
			Level:       level,
			CanDownload: canDownload,
			GrantedBy:   user.ID,
		})
	}

	respondJSON(w, http.StatusCreated, project)
}

func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var clientIDFilter pgtype.UUID
	if cidStr := r.URL.Query().Get("client_id"); cidStr != "" {
		_ = clientIDFilter.Scan(cidStr)
	}

	var statusFilter pgtype.Text
	if status := r.URL.Query().Get("status"); status != "" {
		statusFilter = pgtype.Text{String: status, Valid: true}
	}

	// Leadership and roles with projects.view_all see all projects (with filters)
	person := middleware.GetPerson(r.Context())
	if person.HasPermission(authz.PermProjectsViewAll) {
		projects, err := h.queries.ListProjectsForAdminOrManager(r.Context(), db.ListProjectsForAdminOrManagerParams{
			CompanyID: companyID,
			ClientID:  clientIDFilter,
			Status:    statusFilter,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
		out := make([]map[string]interface{}, 0, len(projects))
		for _, p := range projects {
			cidStr := ""
			if p.ClientID.Valid {
				cidStr = uuid.UUID(p.ClientID.Bytes).String()
			}
			out = append(out, map[string]interface{}{
				"id":            uuid.UUID(p.ID.Bytes).String(),
				"company_id":    uuid.UUID(p.CompanyID.Bytes).String(),
				"client_id":     cidStr,
				"client_name":   p.ClientName,
				"name":          p.Name,
				"status":        p.Status,
				"file_count":    p.FileCount,
				"folder_count":  p.FolderCount,
				"video_count":   p.VideoCount,
				"total_bytes":   p.TotalBytes,
				"to_review_count": p.ToReviewCount,
				"thumbnails":    h.fetchProjectThumbnails(r.Context(), companyID, p.ID),
				"created_at":    p.CreatedAt.Time.Format(time.RFC3339),
				"updated_at":    p.UpdatedAt.Time.Format(time.RFC3339),
			})
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{"projects": out})
		return
	}

	// Editors and client users: see ONLY projects where they have a grant OR are a contact of that project's client with default_level != 'none'
	projects, err := h.queries.ListProjectsForUserWithAccess(r.Context(), db.ListProjectsForUserWithAccessParams{
		CompanyID: companyID,
		Email:     user.Email,
		ClientID:  clientIDFilter,
		Status:    statusFilter,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	out := make([]map[string]interface{}, 0, len(projects))
	for _, p := range projects {
		cidStr := ""
		if p.ClientID.Valid {
			cidStr = uuid.UUID(p.ClientID.Bytes).String()
		}
		out = append(out, map[string]interface{}{
			"id":            uuid.UUID(p.ID.Bytes).String(),
			"company_id":    uuid.UUID(p.CompanyID.Bytes).String(),
			"client_id":     cidStr,
			"client_name":   p.ClientName,
			"name":          p.Name,
			"status":        p.Status,
			"file_count":    p.FileCount,
			"folder_count":  p.FolderCount,
			"video_count":   p.VideoCount,
			"total_bytes":   p.TotalBytes,
			"to_review_count": p.ToReviewCount,
			"thumbnails":    h.fetchProjectThumbnails(r.Context(), companyID, p.ID),
			"created_at":    p.CreatedAt.Time.Format(time.RFC3339),
			"updated_at":    p.UpdatedAt.Time.Format(time.RFC3339),
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"projects": out})
}

func (h *ProjectHandler) fetchProjectThumbnails(ctx context.Context, companyID, projectID pgtype.UUID) []string {
	thumbs := make([]string, 0, 3)
	if h.pool == nil {
		return thumbs
	}
	tRows, err := h.pool.Query(ctx, `
		SELECT fv.storage_key, fv.mime, fv.preview_keys
		FROM items i
		JOIN file_versions fv ON fv.item_id = i.id
		WHERE i.company_id = $1 AND i.project_id = $2 AND i.deleted_at IS NULL AND i.kind = 'file'
		ORDER BY i.created_at DESC
		LIMIT 3
	`, companyID, projectID)
	if err != nil {
		return thumbs
	}
	defer tRows.Close()

	for tRows.Next() {
		var sKey, mime string
		var pKeys []byte
		if err := tRows.Scan(&sKey, &mime, &pKeys); err == nil {
			targetKey := sKey
			if len(pKeys) > 0 {
				var m map[string]interface{}
				if json.Unmarshal(pKeys, &m) == nil {
					if p, ok := m["poster"].(string); ok && p != "" {
						targetKey = p
					}
				}
			}
			var u string
			if h.storage != nil {
				u, _ = h.storage.PresignGetObjectInline(ctx, targetKey, mime, 2*time.Hour)
			}
			if u == "" && targetKey != "" {
				u = fmt.Sprintf("http://localhost:9000/playhead-dev/%s", targetKey)
			}
			if u != "" {
				thumbs = append(thumbs, u)
			}
		}
	}
	return thumbs
}

func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		// Return 404 when project not found or deleted
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	// Check access via central authz.Access
	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	// Spec Section 4.5: Return 404 (not 403) when person should not know the item exists
	if !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	folders, _ := h.queries.ListItemsByProjectAndParent(r.Context(), db.ListItemsByProjectAndParentParams{
		CompanyID: companyID,
		ProjectID: project.ID,
		ParentID:  pgtype.UUID{Valid: false},
	})

	var visibleFolders []db.Item
	for _, f := range folders {
		fAccess, fErr := authz.AccessFolder(r.Context(), h.queries, person, target, uuid.UUID(f.ID.Bytes))
		if fErr == nil && fAccess.CanView() {
			visibleFolders = append(visibleFolders, f)
		}
	}
	if visibleFolders == nil {
		visibleFolders = []db.Item{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"project":      project,
		"access_level": access.Level,
		"can_download": access.CanDownload,
		"can_manage":   authz.CanManagePeople(person, access),
		"folders":      visibleFolders,
	})
}

type UpdateProjectRequest struct {
	Name     *string `json:"name"`
	ClientID *string `json:"client_id"`
	Status   *string `json:"status"`
}

func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	var req UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if (req.Name == nil || strings.TrimSpace(*req.Name) == "") && req.ClientID == nil && req.Status == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_changes_provided"})
		return
	}

	if req.ClientID != nil && !access.CanManage() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full access required to move project"})
		return
	}

	if req.Name != nil && strings.TrimSpace(*req.Name) != "" && !access.CanRenameProject(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full or Editor access required to rename project"})
		return
	}

	if req.Status != nil && strings.TrimSpace(*req.Status) != "" && !access.CanRenameProject(person) && !access.CanManage() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Permission required to change project status"})
		return
	}

	if req.ClientID != nil {
		var targetClientID pgtype.UUID
		if err := targetClientID.Scan(*req.ClientID); err != nil || !targetClientID.Valid {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
			return
		}

		// Verify client belongs to company
		_, err := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
			CompanyID: companyID,
			ID:        targetClientID,
		})
		if err != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "client_not_found"})
			return
		}

		if _, err := h.queries.MoveProjectToClient(r.Context(), db.MoveProjectToClientParams{
			CompanyID: companyID,
			ID:        projectID,
			ClientID:  targetClientID,
		}); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to move project"})
			return
		}
	}

	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		if _, err := h.queries.UpdateProject(r.Context(), db.UpdateProjectParams{
			CompanyID: companyID,
			ID:        projectID,
			Name:      pgtype.Text{String: strings.TrimSpace(*req.Name), Valid: true},
		}); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to rename project"})
			return
		}
	}

	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		statusVal := strings.ToLower(strings.TrimSpace(*req.Status))
		if statusVal == "active" || statusVal == "inactive" || statusVal == "archived" {
			if _, err := h.queries.SetProjectStatus(r.Context(), db.SetProjectStatusParams{
				CompanyID: companyID,
				ID:        projectID,
				Status:    statusVal,
			}); err != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to update project status"})
				return
			}
		}
	}


	updated, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}


func (h *ProjectHandler) Archive(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanDeleteProject(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full or Admin access required to archive project"})
		return
	}

	newStatus := "archived"
	if project.Status == "archived" {
		newStatus = "active"
	}

	updated, err := h.queries.SetProjectStatus(r.Context(), db.SetProjectStatusParams{
		CompanyID: companyID,
		ID:        projectID,
		Status:    newStatus,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	// Addition 5: project delete needs project Full access or a full-access role
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}
	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || (!person.IsFullAccess() && !access.CanDeleteProject(person)) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full access or delete_project permission required to delete project"})
		return
	}

	// Addition 4: Cascading trash with delete_batch_id
	batchID := uuid.New()
	batchPgUUID := pgtype.UUID{Bytes: batchID, Valid: true}

	if err := h.queries.SoftDeleteProjectWithBatch(r.Context(), db.SoftDeleteProjectWithBatchParams{
		CompanyID:     companyID,
		ID:            projectID,
		DeleteBatchID: batchPgUUID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	// Soft-delete all active items in the project with the same batch ID
	_ = h.queries.SoftDeleteItemsByProjectWithBatch(r.Context(), db.SoftDeleteItemsByProjectWithBatchParams{
		CompanyID:     companyID,
		ProjectID:     projectID,
		DeleteBatchID: batchPgUUID,
	})

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Restore restores a project from Trash (Addition 4 & 5)
func (h *ProjectHandler) Restore(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByIDAnyStatus(r.Context(), db.GetProjectByIDAnyStatusParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}
	if !project.DeletedAt.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "project_not_in_trash"})
		return
	}

	// Addition 4: Cannot restore project while its client is in Trash
	if project.ClientDeletedAt.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "client_in_trash",
			"message": "Cannot restore project while its client is in Trash",
		})
		return
	}

	// Addition 5: project restore needs project Full access or a full-access role
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}
	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || (!person.IsFullAccess() && access.Level != authz.LevelFull) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full access or full-access role required to restore project"})
		return
	}

	if err := h.queries.RestoreProjectWithBatch(r.Context(), db.RestoreProjectWithBatchParams{
		CompanyID: companyID,
		ID:        projectID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	// Addition 4: Restoring project restores items with the same delete_batch_id
	if project.DeleteBatchID.Valid {
		_ = h.queries.RestoreItemsByBatch(r.Context(), db.RestoreItemsByBatchParams{
			CompanyID:     companyID,
			DeleteBatchID: project.DeleteBatchID,
		})
	}

	_ = h.queries.RecalculateProjectAndFolderCounts(r.Context(), projectID)

	respondJSON(w, http.StatusOK, map[string]string{"status": "restored"})
}

// People and Access handlers
func (h *ProjectHandler) GetPeople(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	grants, _ := h.queries.ListGrantsByTarget(r.Context(), db.ListGrantsByTargetParams{
		CompanyID:  companyID,
		TargetType: "project",
		TargetID:   projectID,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"people": grants,
	})
}

func (h *ProjectHandler) AddPerson(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !authz.CanManagePeople(person, access) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only admins, managers, or people with Full access on this project can add people"})
		return
	}

	var req AssignPersonInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email"})
		return
	}

	level := strings.ToLower(strings.TrimSpace(req.Level))
	if level == "" {
		level = authz.LevelViewer
	}

	canDownload := true
	if req.CanDownload != nil {
		canDownload = *req.CanDownload
	}

	var targetUserID pgtype.UUID
	if u, err := h.queries.GetUserByEmail(r.Context(), email); err == nil {
		targetUserID = u.ID
	}

	grant, err := h.queries.CreateGrant(r.Context(), db.CreateGrantParams{
		CompanyID:   companyID,
		TargetType:  "project",
		TargetID:    projectID,
		Email:       email,
		UserID:      targetUserID,
		Level:       level,
		CanDownload: canDownload,
		GrantedBy:   user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusCreated, grant)
}

type UpdateGrantRequest struct {
	Level       *string `json:"level"`
	CanDownload *bool   `json:"can_download"`
}

func (h *ProjectHandler) UpdatePerson(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !authz.CanManagePeople(person, access) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only admins, managers, or people with Full access can update members"})
		return
	}

	var grantID pgtype.UUID
	if err := grantID.Scan(chi.URLParam(r, "person_id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant_id"})
		return
	}

	var req UpdateGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var levelText pgtype.Text
	if req.Level != nil {
		levelText = pgtype.Text{String: strings.ToLower(strings.TrimSpace(*req.Level)), Valid: true}
	}
	var canDownloadBool pgtype.Bool
	if req.CanDownload != nil {
		canDownloadBool = pgtype.Bool{Bool: *req.CanDownload, Valid: true}
	}

	updated, err := h.queries.UpdateGrant(r.Context(), db.UpdateGrantParams{
		ID:          grantID,
		Level:       levelText,
		CanDownload: canDownloadBool,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

func (h *ProjectHandler) RemovePerson(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(project.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !authz.CanManagePeople(person, access) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only admins, managers, or people with Full access can remove members"})
		return
	}

	var grantID pgtype.UUID
	if err := grantID.Scan(chi.URLParam(r, "person_id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant_id"})
		return
	}

	if err := h.queries.DeleteGrant(r.Context(), grantID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *ProjectHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}

	if !authz.CanCreateProjects(person) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Permission create_project required to duplicate project",
		})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	srcProj, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	target := authz.ProjectTarget{
		ID:        uuid.UUID(srcProj.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(srcProj.ClientID.Bytes),
	}
	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	newName := fmt.Sprintf("%s copy", srcProj.Name)
	newProj, err := h.queries.CreateProject(r.Context(), db.CreateProjectParams{
		CompanyID: companyID,
		ClientID:  srcProj.ClientID,
		Name:      newName,
		CreatedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_project"})
		return
	}

	if h.pool != nil {
		tx, err := h.pool.Begin(r.Context())
		if err == nil {
			defer tx.Rollback(r.Context())

			// Copy grants
			_, _ = tx.Exec(r.Context(), `
				INSERT INTO grants (company_id, target_type, target_id, email, user_id, level, can_download, granted_by)
				SELECT company_id, target_type, $1, email, user_id, level, can_download, $2
				FROM grants
				WHERE target_type = 'project' AND target_id = $3
				ON CONFLICT DO NOTHING
			`, newProj.ID, user.ID, srcProj.ID)

			// Fetch items in tree order
			rows, err := tx.Query(r.Context(), `
				WITH RECURSIVE item_tree AS (
					SELECT id, parent_id, kind, name, position, file_count, folder_count, total_bytes, 0 as depth
					FROM items
					WHERE project_id = $1 AND parent_id IS NULL AND deleted_at IS NULL
					UNION ALL
					SELECT i.id, i.parent_id, i.kind, i.name, i.position, i.file_count, i.folder_count, i.total_bytes, t.depth + 1
					FROM items i
					JOIN item_tree t ON i.parent_id = t.id
					WHERE i.project_id = $1 AND i.deleted_at IS NULL
				)
				SELECT id, parent_id, kind, name, position, file_count, folder_count, total_bytes
				FROM item_tree
				ORDER BY depth ASC, position ASC, id ASC
			`, srcProj.ID)

			if err == nil {
				type srcItem struct {
					id          pgtype.UUID
					parentID    pgtype.UUID
					kind        string
					name        string
					position    pgtype.Numeric
					fileCount   int32
					folderCount int32
					totalBytes  int64
				}
				var items []srcItem
				for rows.Next() {
					var item srcItem
					if scanErr := rows.Scan(&item.id, &item.parentID, &item.kind, &item.name, &item.position, &item.fileCount, &item.folderCount, &item.totalBytes); scanErr == nil {
						items = append(items, item)
					}
				}
				rows.Close()

				oldToNew := make(map[string]pgtype.UUID)
				for _, itm := range items {
					var newParentID pgtype.UUID
					if itm.parentID.Valid {
						if parentNew, ok := oldToNew[uuid.UUID(itm.parentID.Bytes).String()]; ok {
							newParentID = parentNew
						}
					}

					var newItemID pgtype.UUID
					err = tx.QueryRow(r.Context(), `
						INSERT INTO items (company_id, project_id, parent_id, kind, name, position, created_by, file_count, folder_count, total_bytes)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
						RETURNING id
					`, companyID, newProj.ID, newParentID, itm.kind, itm.name, itm.position, user.ID, itm.fileCount, itm.folderCount, itm.totalBytes).Scan(&newItemID)
					if err != nil {
						break
					}
					oldToNew[uuid.UUID(itm.id.Bytes).String()] = newItemID

					if itm.kind == "file" {
						_, _ = tx.Exec(r.Context(), `
							INSERT INTO file_versions (company_id, item_id, number, storage_key, size_bytes, mime, duration_ms, width, height, fps, preview_status, preview_keys, uploaded_by)
							SELECT $1, $2, number, storage_key, size_bytes, mime, duration_ms, width, height, fps, preview_status, preview_keys, $3
							FROM file_versions
							WHERE item_id = $4
						`, companyID, newItemID, user.ID, itm.id)
					}
				}

				// Update folder and file counts on new project
				_, _ = tx.Exec(r.Context(), `
					UPDATE projects
					SET folder_count = (SELECT count(*) FROM items WHERE project_id = $1 AND kind = 'folder' AND deleted_at IS NULL),
						file_count = (SELECT count(*) FROM items WHERE project_id = $1 AND kind = 'file' AND deleted_at IS NULL),
						total_bytes = (SELECT coalesce(sum(size_bytes), 0) FROM file_versions fv JOIN items i ON fv.item_id = i.id WHERE i.project_id = $1 AND i.deleted_at IS NULL)
					WHERE id = $1
				`, newProj.ID)

				_ = tx.Commit(r.Context())
			}
		}
	}

	freshProj, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        newProj.ID,
	})
	if err == nil {
		respondJSON(w, http.StatusCreated, freshProj)
		return
	}

	respondJSON(w, http.StatusCreated, newProj)
}

func (h *ProjectHandler) Download(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	proj, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	target := authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	if !access.CanDownload {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Download permission not granted for this project"})
		return
	}

	files, err := h.queries.GetProjectFilesRecursive(r.Context(), proj.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to list project files"})
		return
	}

	manifestFiles := make([]downloadManifestItem, 0, len(files))
	var totalSizeBytes int64

	for _, f := range files {
		if f.StorageKey == "" {
			continue
		}
		var url string
		if h.storage != nil {
			var signErr error
			url, signErr = h.storage.PresignGetObject(r.Context(), f.StorageKey, f.Name, 24*time.Hour)
			if signErr != nil {
				continue
			}
		}
		manifestFiles = append(manifestFiles, downloadManifestItem{
			ID:          uuid.UUID(f.ID.Bytes).String(),
			Name:        f.Name,
			Path:        f.RelativePath,
			SizeBytes:   f.SizeBytes,
			Mime:        f.Mime,
			DownloadURL: url,
		})
		totalSizeBytes += f.SizeBytes
	}

	safeName := strings.ReplaceAll(proj.Name, "/", "-")
	suggestedZipName := fmt.Sprintf("%s.zip", safeName)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"files":              manifestFiles,
		"total_bytes":        totalSizeBytes,
		"file_count":         len(manifestFiles),
		"suggested_zip_name": suggestedZipName,
	})
}

