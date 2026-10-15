package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

type ProjectHandler struct {
	queries *db.Queries
}

func NewProjectHandler(queries *db.Queries) *ProjectHandler {
	return &ProjectHandler{queries: queries}
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
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Only Admin and Manager can create projects
	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only admins and managers can create projects"})
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
	if err := clientID.Scan(req.ClientID); err != nil || !clientID.Valid {
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

	// Template handling
	template := strings.ToLower(strings.TrimSpace(req.Template))
	if template == "video_project" {
		defaultFolders := []string{"Briefs", "Raw footage", "Edits", "Deliverables"}
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
	}

	// Auto-create Tracker spreadsheet for the project
	var trackerPos pgtype.Numeric
	_ = trackerPos.Scan("0")
	trackerItem, tErr := h.queries.CreateItem(r.Context(), db.CreateItemParams{
		CompanyID: companyID,
		ProjectID: project.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "spreadsheet",
		Name:      "Tracker",
		Position:  trackerPos,
		CreatedBy: user.ID,
	})
	if tErr == nil {
		trackerData := GetSpreadsheetTemplate("tracker", nil)
		tJSON, _ := json.Marshal(trackerData)
		_, _ = h.queries.CreateSpreadsheet(r.Context(), db.CreateSpreadsheetParams{
			ID:              trackerItem.ID,
			CompanyID:       companyID,
			ContentState:    nil,
			ContentJson:     tJSON,
			PlainText:       "Tracker Video File Editor Status Due date Revisions Notes",
			PublicPlainText: "Tracker Video File Editor Status Due date Revisions Notes",
			RowCount:        30,
			ColCount:        7,
			CellCount:       7,
		})
		_ = h.queries.SetProjectTrackerItemID(r.Context(), db.SetProjectTrackerItemIDParams{
			ID:            project.ID,
			TrackerItemID: trackerItem.ID,
			CompanyID:     companyID,
		})
		project.TrackerItemID = trackerItem.ID
	}

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
	role, _ := middleware.GetUserRole(r.Context())
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

	// Admins and Managers see all projects (with filters)
	if role == authz.RoleAdmin || role == authz.RoleManager || role == authz.RoleOwner {
		projects, err := h.queries.ListProjectsForAdminOrManager(r.Context(), db.ListProjectsForAdminOrManagerParams{
			CompanyID: companyID,
			ClientID:  clientIDFilter,
			Status:    statusFilter,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{"projects": projects})
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

	respondJSON(w, http.StatusOK, map[string]interface{}{"projects": projects})
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
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

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"project":      project,
		"access_level": access.Level,
		"can_download": access.CanDownload,
		"can_manage":   authz.CanManagePeople(person, access),
		"folders":      folders,
	})
}

type UpdateProjectRequest struct {
	Name         *string `json:"name"`
	ClientID     *string `json:"client_id"`
	IsRestricted *bool   `json:"is_restricted"`
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanManage() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full access required to edit project"})
		return
	}

	var req UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if (req.Name == nil || strings.TrimSpace(*req.Name) == "") && req.ClientID == nil && req.IsRestricted == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_changes_provided"})
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

	if req.IsRestricted != nil {
		if _, err := h.queries.UpdateProject(r.Context(), db.UpdateProjectParams{
			CompanyID:    companyID,
			ID:           projectID,
			IsRestricted: pgtype.Bool{Bool: *req.IsRestricted, Valid: true},
		}); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to update project restriction"})
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
	}

	access, err := authz.Access(r.Context(), h.queries, person, target)
	if err != nil || !access.CanManage() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Full access required to archive project"})
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
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Deleting project moves to Trash for 30 days (Admins and Managers)
	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only admins and managers can delete a project"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	if err := h.queries.SoftDeleteProject(r.Context(), db.SoftDeleteProjectParams{
		CompanyID: companyID,
		ID:        projectID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
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
		ID:           uuid.UUID(project.ID.Bytes),
		CompanyID:    uuid.UUID(companyID.Bytes),
		ClientID:     uuid.UUID(project.ClientID.Bytes),
		IsRestricted: project.IsRestricted,
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
