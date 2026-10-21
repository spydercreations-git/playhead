package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/db"
)

type HomeHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewHomeHandler(pool *pgxpool.Pool, queries *db.Queries) *HomeHandler {
	return &HomeHandler{
		pool:    pool,
		queries: queries,
	}
}

// GetHomeDashboard handles GET /api/v1/home
func (h *HomeHandler) GetHomeDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyUUID := pgtype.UUID{Bytes: person.CompanyID, Valid: true}
	userUUID := pgtype.UUID{Bytes: person.UserID, Valid: true}
	clientUUID := pgtype.UUID{Bytes: person.ClientID, Valid: person.ClientID != uuid.Nil}

	isStaff := person.IsStaff()
	isEditor := person.IsEditor()
	isClient := person.IsClient()

	// 1. Waiting for review count & items
	waitingCount, err := h.queries.CountWaitingForReviewItems(ctx, db.CountWaitingForReviewItemsParams{
		CompanyID:    companyUUID,
		IsStaff:      isStaff,
		IsClient:     isClient,
		UserClientID: clientUUID,
		IsEditor:     isEditor,
		UserID:       userUUID,
	})
	if err != nil {
		waitingCount = 0
	}

	waitingItems, err := h.queries.GetWaitingForReviewItems(ctx, db.GetWaitingForReviewItemsParams{
		CompanyID:    companyUUID,
		IsStaff:      isStaff,
		IsClient:     isClient,
		UserClientID: clientUUID,
		IsEditor:     isEditor,
		UserID:       userUUID,
		QueryLimit:   10,
	})
	if err != nil {
		waitingItems = []db.GetWaitingForReviewItemsRow{}
	}

	// 2. Recent projects (up to 4)
	recentProjects, err := h.queries.GetRecentProjectsForHome(ctx, db.GetRecentProjectsForHomeParams{
		CompanyID:    companyUUID,
		IsStaff:      isStaff,
		IsClient:     isClient,
		UserClientID: clientUUID,
		IsEditor:     isEditor,
		UserID:       userUUID,
	})
	if err != nil {
		recentProjects = []db.GetRecentProjectsForHomeRow{}
	}

	// 3. User upload destination
	uploadDest, err := h.queries.GetUserUploadDestination(ctx, userUUID)
	var lastUploadProjectID, lastUploadFolderID *string
	if err == nil {
		if uploadDest.LastUploadProjectID.Valid {
			s := uuid.UUID(uploadDest.LastUploadProjectID.Bytes).String()
			lastUploadProjectID = &s
		}
		if uploadDest.LastUploadFolderID.Valid {
			s := uuid.UUID(uploadDest.LastUploadFolderID.Bytes).String()
			lastUploadFolderID = &s
		}
	}

	// 4. Recent activity (initial 15)
	activities, err := h.queries.ListActivityEventsForUser(ctx, db.ListActivityEventsForUserParams{
		CompanyID:    companyUUID,
		IsStaff:      isStaff,
		IsClient:     isClient,
		UserClientID: clientUUID,
		IsEditor:     isEditor,
		UserID:       userUUID,
		QueryLimit:   15,
		QueryOffset:  0,
	})
	if err != nil {
		activities = []db.ListActivityEventsForUserRow{}
	}

	resp := map[string]interface{}{
		"waiting_count":          waitingCount,
		"waiting_files":          waitingItems,
		"recent_projects":        recentProjects,
		"last_upload_project_id": lastUploadProjectID,
		"last_upload_folder_id":  lastUploadFolderID,
		"activity":               activities,
	}

	renderJSON(w, http.StatusOK, resp)
}

// ListActivity handles GET /api/v1/home/activity (paginated "See all activity")
func (h *HomeHandler) ListActivity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyUUID := pgtype.UUID{Bytes: person.CompanyID, Valid: true}
	userUUID := pgtype.UUID{Bytes: person.UserID, Valid: true}
	clientUUID := pgtype.UUID{Bytes: person.ClientID, Valid: person.ClientID != uuid.Nil}

	limit := 30
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 && val <= 100 {
			limit = val
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil && val >= 0 {
			offset = val
		}
	}

	activities, err := h.queries.ListActivityEventsForUser(ctx, db.ListActivityEventsForUserParams{
		CompanyID:    companyUUID,
		IsStaff:      person.IsStaff(),
		IsClient:     person.IsClient(),
		UserClientID: clientUUID,
		IsEditor:     person.IsEditor(),
		UserID:       userUUID,
		QueryLimit:   int32(limit),
		QueryOffset:  int32(offset),
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list activity"})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"activity": activities,
		"limit":    limit,
		"offset":   offset,
	})
}

// UpdateUploadDestination handles PUT /api/v1/users/me/upload-destination
func (h *HomeHandler) UpdateUploadDestination(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req struct {
		ProjectID *string `json:"project_id"`
		FolderID  *string `json:"folder_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	var projectUUID, folderUUID pgtype.UUID
	if req.ProjectID != nil && *req.ProjectID != "" {
		parsed, err := uuid.Parse(*req.ProjectID)
		if err == nil {
			projectUUID = pgtype.UUID{Bytes: parsed, Valid: true}
		}
	}
	if req.FolderID != nil && *req.FolderID != "" {
		parsed, err := uuid.Parse(*req.FolderID)
		if err == nil {
			folderUUID = pgtype.UUID{Bytes: parsed, Valid: true}
		}
	}

	err := h.queries.UpdateUserUploadDestination(ctx, db.UpdateUserUploadDestinationParams{
		ID:                  pgtype.UUID{Bytes: person.UserID, Valid: true},
		LastUploadProjectID: projectUUID,
		LastUploadFolderID:  folderUUID,
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update destination"})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}
