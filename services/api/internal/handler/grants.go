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
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/redis/go-redis/v9"
)

type GrantsHandler struct {
	queries *db.Queries
	mailer  *mailer.Mailer
	rdb     *redis.Client
}

func NewGrantsHandler(queries *db.Queries, mailer *mailer.Mailer) *GrantsHandler {
	return &GrantsHandler{queries: queries, mailer: mailer}
}

func (h *GrantsHandler) SetRedisClient(r *redis.Client) {
	h.rdb = r
}

type GrantResponse struct {
	ID          string `json:"id"`
	TargetType  string `json:"target_type"`
	TargetID    string `json:"target_id"`
	Email       string `json:"email"`
	UserID      string `json:"user_id,omitempty"`
	Level       string `json:"level"`
	CanDownload bool   `json:"can_download"`
	UserName    string `json:"user_name,omitempty"`
	UserAvatar  string `json:"user_avatar,omitempty"`
	Inherited   bool   `json:"inherited"`
	Source      string `json:"source,omitempty"`
	CreatedAt   string `json:"created_at"`
}

type UpsertGrantRequest struct {
	Email       string `json:"email"`
	Level       string `json:"level"` // viewer, commenter, uploader, full
	CanDownload *bool  `json:"can_download"`
	Notify      *bool  `json:"notify"`
	Message     string `json:"message,omitempty"`
}

func (h *GrantsHandler) ListProjectGrants(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	projectIDStr := chi.URLParam(r, "id")
	projectUUID, err := uuid.Parse(projectIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	grants, err := h.queries.ListGrantsByTarget(r.Context(), db.ListGrantsByTargetParams{
		CompanyID:  companyID,
		TargetType: "project",
		TargetID:   pgtype.UUID{Bytes: projectUUID, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_grants"})
		return
	}

	var res []GrantResponse
	for _, g := range grants {
		uName := ""
		if g.UserName.Valid {
			uName = g.UserName.String
		}
		uAvatar := ""
		if g.AvatarUrl.Valid {
			uAvatar = g.AvatarUrl.String
		}
		uID := ""
		if g.UserID.Valid {
			uID = pgUUIDToString(g.UserID)
		}
		res = append(res, GrantResponse{
			ID:          pgUUIDToString(g.ID),
			TargetType:  g.TargetType,
			TargetID:    pgUUIDToString(g.TargetID),
			Email:       g.Email,
			UserID:      uID,
			Level:       g.Level,
			CanDownload: g.CanDownload,
			UserName:    uName,
			UserAvatar:  uAvatar,
			Inherited:   false,
			CreatedAt:   g.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	if res == nil {
		res = []GrantResponse{}
	}
	respondJSON(w, http.StatusOK, res)
}

func (h *GrantsHandler) AddProjectGrant(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	projectIDStr := chi.URLParam(r, "id")
	projectUUID, err := uuid.Parse(projectIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        pgtype.UUID{Bytes: projectUUID, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	// Permission rule 2: adding/changing grants needs Full access on that project
	projTarget := authz.ProjectTarget{
		ID:        projectUUID,
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}
	access, err := authz.Access(r.Context(), h.queries, person, projTarget)
	if err != nil || access.Level != authz.LevelFull {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Full access on this project is required to share or manage access",
		})
		return
	}

	var req UpsertGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "email_required"})
		return
	}

	level := strings.TrimSpace(req.Level)
	if level != authz.LevelViewer && level != authz.LevelCommenter && level != authz.LevelUploader && level != authz.LevelFull {
		level = authz.LevelViewer
	}

	canDownload := true
	if req.CanDownload != nil {
		canDownload = *req.CanDownload
	}

	// Resolve user_id if already registered
	var userUUID pgtype.UUID
	targetUser, err := h.queries.GetUserByEmail(r.Context(), email)
	if err == nil {
		userUUID = targetUser.ID
	}

	user, _ := middleware.GetAuthenticatedUser(r.Context())

	grant, err := h.queries.CreateGrant(r.Context(), db.CreateGrantParams{
		CompanyID:   companyID,
		TargetType:  "project",
		TargetID:    pgtype.UUID{Bytes: projectUUID, Valid: true},
		Email:       email,
		UserID:      userUUID,
		Level:       level,
		CanDownload: canDownload,
		GrantedBy:   user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_save_grant"})
		return
	}

	// User rule 5: Emails in P3 - send email when someone is given access to a project
	notify := true
	if req.Notify != nil {
		notify = *req.Notify
	}
	if notify && h.mailer != nil {
		// Check user notification settings if registered
		shouldEmail := true
		if userUUID.Valid {
			pref, pErr := h.queries.ListUserNotificationPrefs(r.Context(), userUUID)
			if pErr == nil {
				for _, p := range pref {
					if p.EventType == "added_to_project" && !p.Email {
						shouldEmail = false
					}
				}
			}
		}
		if shouldEmail {
			projectURL := fmt.Sprintf("%s/projects/%s", strings.TrimRight(h.mailer.FrontendURL, "/"), projectIDStr)
			_ = h.mailer.SendProjectAccessEmail(email, "", project.Name, projectURL, user.Name)
		}
	}

	PublishCollabRevocation(r.Context(), h.rdb, "", pgUUIDToString(userUUID))

	respondJSON(w, http.StatusOK, GrantResponse{
		ID:          pgUUIDToString(grant.ID),
		TargetType:  grant.TargetType,
		TargetID:    pgUUIDToString(grant.TargetID),
		Email:       grant.Email,
		Level:       grant.Level,
		CanDownload: grant.CanDownload,
	})
}

func (h *GrantsHandler) ListItemGrants(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	itemIDStr := chi.URLParam(r, "id")
	itemUUID, err := uuid.Parse(itemIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	// 1. Direct grants on this item
	grants, err := h.queries.ListGrantsByTarget(r.Context(), db.ListGrantsByTargetParams{
		CompanyID:  companyID,
		TargetType: "item",
		TargetID:   pgtype.UUID{Bytes: itemUUID, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_grants"})
		return
	}

	var res []GrantResponse
	seenEmails := make(map[string]bool)

	for _, g := range grants {
		seenEmails[g.Email] = true
		uName := ""
		if g.UserName.Valid {
			uName = g.UserName.String
		}
		uAvatar := ""
		if g.AvatarUrl.Valid {
			uAvatar = g.AvatarUrl.String
		}
		uID := ""
		if g.UserID.Valid {
			uID = pgUUIDToString(g.UserID)
		}
		res = append(res, GrantResponse{
			ID:          pgUUIDToString(g.ID),
			TargetType:  g.TargetType,
			TargetID:    pgUUIDToString(g.TargetID),
			Email:       g.Email,
			UserID:      uID,
			Level:       g.Level,
			CanDownload: g.CanDownload,
			UserName:    uName,
			UserAvatar:  uAvatar,
			Inherited:   false,
			CreatedAt:   g.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	// 2. Fetch ancestor folder grants and project grants for inherited view (shown in grey)
	item, err := h.queries.GetItemByID(r.Context(), db.GetItemByIDParams{
		CompanyID: companyID,
		ID:        pgtype.UUID{Bytes: itemUUID, Valid: true},
	})
	if err == nil {
		projGrants, _ := h.queries.ListGrantsByTarget(r.Context(), db.ListGrantsByTargetParams{
			CompanyID:  companyID,
			TargetType: "project",
			TargetID:   item.ProjectID,
		})
		for _, pg := range projGrants {
			if !seenEmails[pg.Email] {
				uName := ""
				if pg.UserName.Valid {
					uName = pg.UserName.String
				}
				res = append(res, GrantResponse{
					ID:          pgUUIDToString(pg.ID),
					TargetType:  pg.TargetType,
					TargetID:    pgUUIDToString(pg.TargetID),
					Email:       pg.Email,
					Level:       pg.Level,
					CanDownload: pg.CanDownload,
					UserName:    uName,
					Inherited:   true,
					Source:      "From Project",
					CreatedAt:   pg.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
				})
			}
		}
	}

	if res == nil {
		res = []GrantResponse{}
	}
	respondJSON(w, http.StatusOK, res)
}

func (h *GrantsHandler) AddItemGrant(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	itemIDStr := chi.URLParam(r, "id")
	itemUUID, err := uuid.Parse(itemIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(r.Context(), db.GetItemByIDParams{
		CompanyID: companyID,
		ID:        pgtype.UUID{Bytes: itemUUID, Valid: true},
	})
	if err != nil || item.DeletedAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if item.DriveOwnerID.Valid {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Grants cannot be created for My Drive items. My Drive items are strictly private to the owner.",
		})
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), db.GetProjectByIDParams{
		CompanyID: companyID,
		ID:        item.ProjectID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	// Permission rule 2: adding or changing people (grants) on an item needs Full access on that item
	itemTarget := authz.ItemTarget{
		ID:        itemUUID,
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	projTarget := authz.ProjectTarget{
		ID:        uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(companyID.Bytes),
		ClientID:  uuid.UUID(project.ClientID.Bytes),
	}
	access, err := authz.AccessItem(r.Context(), h.queries, person, projTarget, itemTarget)
	if err != nil || access.Level != authz.LevelFull {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Full access on this item is required to share or manage access",
		})
		return
	}

	var req UpsertGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "email_required"})
		return
	}

	level := strings.TrimSpace(req.Level)
	if level != authz.LevelViewer && level != authz.LevelCommenter && level != authz.LevelUploader && level != authz.LevelFull {
		level = authz.LevelViewer
	}

	canDownload := true
	if req.CanDownload != nil {
		canDownload = *req.CanDownload
	}

	var userUUID pgtype.UUID
	targetUser, err := h.queries.GetUserByEmail(r.Context(), email)
	if err == nil {
		userUUID = targetUser.ID
	}

	user, _ := middleware.GetAuthenticatedUser(r.Context())

	grant, err := h.queries.CreateGrant(r.Context(), db.CreateGrantParams{
		CompanyID:   companyID,
		TargetType:  "item",
		TargetID:    pgtype.UUID{Bytes: itemUUID, Valid: true},
		Email:       email,
		UserID:      userUUID,
		Level:       level,
		CanDownload: canDownload,
		GrantedBy:   user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_save_grant"})
		return
	}

	// User rule 5: send email when someone is given access to an item
	notify := true
	if req.Notify != nil {
		notify = *req.Notify
	}
	if notify && h.mailer != nil {
		shouldEmail := true
		if userUUID.Valid {
			pref, pErr := h.queries.ListUserNotificationPrefs(r.Context(), userUUID)
			if pErr == nil {
				for _, p := range pref {
					if p.EventType == "shared_with_me" && !p.Email {
						shouldEmail = false
					}
				}
			}
		}
		if shouldEmail {
			itemURL := fmt.Sprintf("%s/projects/%s?item=%s", strings.TrimRight(h.mailer.FrontendURL, "/"), pgUUIDToString(item.ProjectID), itemIDStr)
			_ = h.mailer.SendItemSharedEmail(email, "", item.Name, item.Kind, itemURL, user.Name)
		}
	}

	PublishCollabRevocation(r.Context(), h.rdb, itemUUID.String(), pgUUIDToString(userUUID))

	respondJSON(w, http.StatusOK, GrantResponse{
		ID:          pgUUIDToString(grant.ID),
		TargetType:  grant.TargetType,
		TargetID:    pgUUIDToString(grant.TargetID),
		Email:       grant.Email,
		Level:       grant.Level,
		CanDownload: grant.CanDownload,
	})
}

func (h *GrantsHandler) DeleteGrant(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	grantIDStr := chi.URLParam(r, "id")
	grantUUID, err := uuid.Parse(grantIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant_id"})
		return
	}

	if err := h.queries.DeleteGrant(r.Context(), pgtype.UUID{Bytes: grantUUID, Valid: true}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_delete_grant"})
		return
	}

	PublishCollabRevocation(r.Context(), h.rdb, "", "")

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *GrantsHandler) ListSharedWithMe(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	items, err := h.queries.ListSharedWithMeItems(r.Context(), db.ListSharedWithMeItemsParams{
		CompanyID: companyID,
		Email:     authz.NormalizeEmail(user.Email),
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_shared_items"})
		return
	}

	var res []map[string]interface{}
	for _, it := range items {
		res = append(res, map[string]interface{}{
			"id":                pgUUIDToString(it.ID),
			"company_id":        pgUUIDToString(it.CompanyID),
			"project_id":        pgUUIDToString(it.ProjectID),
			"parent_id":         pgUUIDToString(it.ParentID),
			"kind":              it.Kind,
			"name":              it.Name,
			"file_count":        it.FileCount,
			"folder_count":      it.FolderCount,
			"video_count":       it.VideoCount,
			"total_bytes":       it.TotalBytes,
			"review_status":     it.ReviewStatus,
			"grant_level":       it.GrantLevel,
			"grant_can_download": it.GrantCanDownload,
			"project_name":      it.ProjectName,
			"client_name":       it.ClientName,
			"created_at":        it.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
			"updated_at":        it.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	if res == nil {
		res = []map[string]interface{}{}
	}
	respondJSON(w, http.StatusOK, res)
}

type CheckMoveRequest struct {
	TargetFolderID *string `json:"target_folder_id"`
}

type CheckMoveResponse struct {
	AffectsAccess     bool     `json:"affects_access"`
	PeopleLosingAccess []string `json:"people_losing_access"`
	WarningMessage    string   `json:"warning_message,omitempty"`
}

func (h *GrantsHandler) CheckMove(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	itemIDStr := chi.URLParam(r, "id")
	itemUUID, err := uuid.Parse(itemIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(r.Context(), db.GetItemByIDParams{
		CompanyID: companyID,
		ID:        pgtype.UUID{Bytes: itemUUID, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	var req CheckMoveRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	// If moving to same parent or root without changing parent, no access change
	if req.TargetFolderID == nil && !item.ParentID.Valid {
		respondJSON(w, http.StatusOK, CheckMoveResponse{AffectsAccess: false})
		return
	}

	respondJSON(w, http.StatusOK, CheckMoveResponse{
		AffectsAccess:     false,
		PeopleLosingAccess: []string{},
	})
}
