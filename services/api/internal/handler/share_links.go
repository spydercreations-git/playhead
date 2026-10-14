package handler

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
	"golang.org/x/crypto/bcrypt"
)

type ShareLinksHandler struct {
	queries       *db.Queries
	storage       *storage.Client
	sessionSecret string
	environment   string
}

func NewShareLinksHandler(queries *db.Queries, st *storage.Client, sessionSecret, environment string) *ShareLinksHandler {
	if sessionSecret == "" {
		sessionSecret = "default-dev-secret-at-least-32-characters-long"
	}
	return &ShareLinksHandler{
		queries:       queries,
		storage:       st,
		sessionSecret: sessionSecret,
		environment:   environment,
	}
}

type ShareLinkItemResponse struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id"`
	ProjectID   string `json:"project_id"`
	ParentID    string `json:"parent_id,omitempty"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	FileCount   int    `json:"file_count"`
	FolderCount int    `json:"folder_count"`
	VideoCount  int    `json:"video_count"`
	TotalBytes  int64  `json:"total_bytes"`
	ReviewStatus string `json:"review_status"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type ShareLinkResponse struct {
	ID               string                  `json:"id"`
	CompanyID        string                  `json:"company_id"`
	ProjectID        string                  `json:"project_id"`
	Name             string                  `json:"name"`
	Token            string                  `json:"token,omitempty"` // only returned on creation
	Access           string                  `json:"access"`
	AllowDownload    bool                    `json:"allow_download"`
	LatestOnly       bool                    `json:"latest_only"`
	HasPassword      bool                    `json:"has_password"`
	ExpiresAt        string                  `json:"expires_at,omitempty"`
	AskIdentity      bool                    `json:"ask_identity"`
	UploadLimitBytes *int64                  `json:"upload_limit_bytes,omitempty"`
	UploadedBytes    int64                   `json:"uploaded_bytes"`
	ViewCount        int                     `json:"view_count"`
	LastOpenedAt     string                  `json:"last_opened_at,omitempty"`
	DisabledAt       string                  `json:"disabled_at,omitempty"`
	ItemCount        int                     `json:"item_count"`
	Items            []ShareLinkItemResponse `json:"items,omitempty"`
	CreatedAt        string                  `json:"created_at"`
}

func (h *ShareLinksHandler) ListProjectLinks(w http.ResponseWriter, r *http.Request) {
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

	links, err := h.queries.ListProjectShareLinks(r.Context(), db.ListProjectShareLinksParams{
		CompanyID: companyID,
		ProjectID: pgtype.UUID{Bytes: projectUUID, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_links"})
		return
	}

	var res []ShareLinkResponse
	for _, l := range links {
		expStr := ""
		if l.ExpiresAt.Valid {
			expStr = l.ExpiresAt.Time.Format(time.RFC3339)
		}
		openedStr := ""
		if l.LastOpenedAt.Valid {
			openedStr = l.LastOpenedAt.Time.Format(time.RFC3339)
		}
		disStr := ""
		if l.DisabledAt.Valid {
			disStr = l.DisabledAt.Time.Format(time.RFC3339)
		}

		var upLimit *int64
		if l.UploadLimitBytes.Valid {
			val := l.UploadLimitBytes.Int64
			upLimit = &val
		}

		res = append(res, ShareLinkResponse{
			ID:               pgUUIDToString(l.ID),
			CompanyID:        pgUUIDToString(l.CompanyID),
			ProjectID:        pgUUIDToString(l.ProjectID),
			Name:             l.Name,
			Access:           l.Access,
			AllowDownload:    l.AllowDownload,
			LatestOnly:       l.LatestOnly,
			HasPassword:      l.HasPassword.Bool,
			ExpiresAt:        expStr,
			AskIdentity:      l.AskIdentity,
			UploadLimitBytes: upLimit,
			UploadedBytes:    l.UploadedBytes,
			ViewCount:        int(l.ViewCount),
			LastOpenedAt:     openedStr,
			DisabledAt:       disStr,
			ItemCount:        int(l.ItemCount),
			CreatedAt:        l.CreatedAt.Time.Format(time.RFC3339),
		})
	}

	if res == nil {
		res = []ShareLinkResponse{}
	}
	respondJSON(w, http.StatusOK, res)
}

type CreateShareLinkRequest struct {
	Name             string   `json:"name"`
	ItemIDs          []string `json:"item_ids"`
	Access           string   `json:"access"` // view, comment, upload, comment_upload
	AllowDownload    *bool    `json:"allow_download"`
	LatestOnly       *bool    `json:"latest_only"`
	Password         string   `json:"password,omitempty"`
	ExpiresAt        string   `json:"expires_at,omitempty"`
	AskIdentity      *bool    `json:"ask_identity"`
	UploadLimitBytes *int64   `json:"upload_limit_bytes,omitempty"`
}

func (h *ShareLinksHandler) Create(w http.ResponseWriter, r *http.Request) {
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

	// Permission rule 2: Creating a public share link needs Full access on the items AND sharing.create_public_links permission
	if !person.HasPermission(authz.PermSharingCreatePublicLinks) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have permission to create public share links (sharing.create_public_links)",
		})
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

	var req CreateShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if len(req.ItemIDs) == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "items_required", "message": "At least one item must be attached to the share link"})
		return
	}

	// Verify Full access on each attached item
	for _, idStr := range req.ItemIDs {
		itemUUID, pErr := uuid.Parse(idStr)
		if pErr != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
			return
		}
		itemTarget := authz.ItemTarget{
			ID:        itemUUID,
			ProjectID: projectUUID,
			CompanyID: uuid.UUID(companyID.Bytes),
		}
		projTarget := authz.ProjectTarget{
			ID:        projectUUID,
			CompanyID: uuid.UUID(companyID.Bytes),
			ClientID:  uuid.UUID(project.ClientID.Bytes),
		}
		access, aErr := authz.AccessItem(r.Context(), h.queries, person, projTarget, itemTarget)
		if aErr != nil || access.Level != authz.LevelFull {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "forbidden",
				"message": "Full access on all attached items is required to create a share link",
			})
			return
		}
	}

	// Generate long random token
	tokenBytes := make([]byte, 24)
	_, _ = rand.Read(tokenBytes)
	rawToken := hex.EncodeToString(tokenBytes)
	tokenHash := authz.HashToken(rawToken)

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("Share Link - %s", time.Now().Format("Jan 02"))
	}

	accessMode := strings.TrimSpace(req.Access)
	if accessMode == "" {
		accessMode = "view"
	}

	allowDownload := true
	if req.AllowDownload != nil {
		allowDownload = *req.AllowDownload
	}

	latestOnly := true
	if req.LatestOnly != nil {
		latestOnly = *req.LatestOnly
	}

	askIdentity := true
	if req.AskIdentity != nil {
		askIdentity = *req.AskIdentity
	}

	var passHash pgtype.Text
	if strings.TrimSpace(req.Password) != "" {
		hashed, hErr := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if hErr == nil {
			passHash = pgtype.Text{String: string(hashed), Valid: true}
		}
	}

	var expiresAt pgtype.Timestamptz
	if strings.TrimSpace(req.ExpiresAt) != "" {
		if t, tErr := time.Parse(time.RFC3339, req.ExpiresAt); tErr == nil {
			expiresAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	var upLimit pgtype.Int8
	if req.UploadLimitBytes != nil && *req.UploadLimitBytes > 0 {
		upLimit = pgtype.Int8{Int64: *req.UploadLimitBytes, Valid: true}
	}

	user, _ := middleware.GetAuthenticatedUser(r.Context())

	link, err := h.queries.CreateShareLink(r.Context(), db.CreateShareLinkParams{
		CompanyID:        companyID,
		ProjectID:        pgtype.UUID{Bytes: projectUUID, Valid: true},
		Name:             name,
		TokenHash:        tokenHash,
		Access:           accessMode,
		AllowDownload:    allowDownload,
		LatestOnly:       latestOnly,
		PasswordHash:     passHash,
		ExpiresAt:        expiresAt,
		AskIdentity:      askIdentity,
		UploadLimitBytes: upLimit,
		CreatedBy:        user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_link_failed"})
		return
	}

	// Attach items
	for _, idStr := range req.ItemIDs {
		itemUUID, _ := uuid.Parse(idStr)
		_ = h.queries.AttachShareLinkItem(r.Context(), db.AttachShareLinkItemParams{
			ShareLinkID: link.ID,
			ItemID:      pgtype.UUID{Bytes: itemUUID, Valid: true},
		})
	}

	respondJSON(w, http.StatusCreated, ShareLinkResponse{
		ID:               pgUUIDToString(link.ID),
		CompanyID:        pgUUIDToString(link.CompanyID),
		ProjectID:        pgUUIDToString(link.ProjectID),
		Name:             link.Name,
		Token:            rawToken,
		Access:           link.Access,
		AllowDownload:    link.AllowDownload,
		LatestOnly:       link.LatestOnly,
		HasPassword:      passHash.Valid,
		AskIdentity:      link.AskIdentity,
		UploadLimitBytes: req.UploadLimitBytes,
		UploadedBytes:    0,
		ViewCount:        0,
		ItemCount:        len(req.ItemIDs),
		CreatedAt:        link.CreatedAt.Time.Format(time.RFC3339),
	})
}

type UpdateShareLinkRequest struct {
	Name             string `json:"name"`
	Access           string `json:"access"`
	AllowDownload    *bool  `json:"allow_download"`
	LatestOnly       *bool  `json:"latest_only"`
	Password         *string `json:"password"`
	ExpiresAt        *string `json:"expires_at"`
	AskIdentity      *bool  `json:"ask_identity"`
	UploadLimitBytes *int64 `json:"upload_limit_bytes"`
	Disabled         *bool  `json:"disabled"`
}

func (h *ShareLinksHandler) Update(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	linkIDStr := chi.URLParam(r, "id")
	linkUUID, err := uuid.Parse(linkIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_link_id"})
		return
	}

	existing, err := h.queries.GetShareLinkByID(r.Context(), db.GetShareLinkByIDParams{
		ID:        pgtype.UUID{Bytes: linkUUID, Valid: true},
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_not_found"})
		return
	}

	var req UpdateShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := existing.Name
	if strings.TrimSpace(req.Name) != "" {
		name = req.Name
	}

	access := existing.Access
	if strings.TrimSpace(req.Access) != "" {
		access = req.Access
	}

	allowDownload := existing.AllowDownload
	if req.AllowDownload != nil {
		allowDownload = *req.AllowDownload
	}

	latestOnly := existing.LatestOnly
	if req.LatestOnly != nil {
		latestOnly = *req.LatestOnly
	}

	askIdentity := existing.AskIdentity
	if req.AskIdentity != nil {
		askIdentity = *req.AskIdentity
	}

	var passHash pgtype.Text
	if req.Password != nil {
		if *req.Password == "" {
			passHash = pgtype.Text{Valid: false}
		} else {
			hashed, _ := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
			passHash = pgtype.Text{String: string(hashed), Valid: true}
		}
	} else if existing.HasPassword.Bool {
		// Retain existing password hash
		rawLink, _ := h.queries.GetShareLinkByTokenHash(r.Context(), existing.TokenHash)
		passHash = rawLink.PasswordHash
	}

	var expiresAt pgtype.Timestamptz
	if req.ExpiresAt != nil {
		if *req.ExpiresAt == "" {
			expiresAt = pgtype.Timestamptz{Valid: false}
		} else if t, tErr := time.Parse(time.RFC3339, *req.ExpiresAt); tErr == nil {
			expiresAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	} else {
		expiresAt = existing.ExpiresAt
	}

	var upLimit pgtype.Int8
	if req.UploadLimitBytes != nil {
		if *req.UploadLimitBytes <= 0 {
			upLimit = pgtype.Int8{Valid: false}
		} else {
			upLimit = pgtype.Int8{Int64: *req.UploadLimitBytes, Valid: true}
		}
	} else {
		upLimit = existing.UploadLimitBytes
	}

	var disabledAt pgtype.Timestamptz
	if req.Disabled != nil {
		if *req.Disabled {
			disabledAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
		} else {
			disabledAt = pgtype.Timestamptz{Valid: false}
		}
	} else {
		disabledAt = existing.DisabledAt
	}

	updated, err := h.queries.UpdateShareLink(r.Context(), db.UpdateShareLinkParams{
		ID:               pgtype.UUID{Bytes: linkUUID, Valid: true},
		CompanyID:        companyID,
		Name:             name,
		Access:           access,
		AllowDownload:    allowDownload,
		LatestOnly:       latestOnly,
		PasswordHash:     passHash,
		ExpiresAt:        expiresAt,
		AskIdentity:      askIdentity,
		UploadLimitBytes: upLimit,
		DisabledAt:       disabledAt,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_update_link", "message": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"id":             pgUUIDToString(updated.ID),
		"name":           updated.Name,
		"access":         updated.Access,
		"allow_download": updated.AllowDownload,
		"disabled_at":    updated.DisabledAt,
	})
}

func (h *ShareLinksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	linkIDStr := chi.URLParam(r, "id")
	linkUUID, err := uuid.Parse(linkIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_link_id"})
		return
	}

	if err := h.queries.DeleteShareLink(r.Context(), db.DeleteShareLinkParams{
		ID:        pgtype.UUID{Bytes: linkUUID, Valid: true},
		CompanyID: companyID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_delete_link"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------- PUBLIC VISITOR ENDPOINTS (/s/{token}) ----------------

func (h *ShareLinksHandler) resolvePublicLink(w http.ResponseWriter, r *http.Request) (*db.GetShareLinkByTokenHashRow, bool) {
	token := chi.URLParam(r, "token")
	if token == "" {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_not_found"})
		return nil, false
	}

	tokenHash := authz.HashToken(token)
	link, err := h.queries.GetShareLinkByTokenHash(r.Context(), tokenHash)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_not_found"})
		return nil, false
	}

	// User rule 1 & 7: Disabled links return 404
	if link.DisabledAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_disabled", "message": "This share link has been disabled"})
		return nil, false
	}

	// User rule 7: Expired links return 410 Gone
	if link.ExpiresAt.Valid && link.ExpiresAt.Time.Before(time.Now()) {
		respondJSON(w, http.StatusGone, map[string]string{"error": "link_expired", "message": "This share link has expired"})
		return nil, false
	}

	return &link, true
}

func (h *ShareLinksHandler) isProduction() bool {
	return strings.ToLower(h.environment) == "production"
}

func (h *ShareLinksHandler) signUnlockCookie(linkID string, passwordVersion int32, expiryUnix int64) string {
	payload := fmt.Sprintf("%s:%d:%d", linkID, passwordVersion, expiryUnix)
	mac := hmac.New(sha256.New, []byte(h.sessionSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%d.%s", expiryUnix, sig)
}

func (h *ShareLinksHandler) isPasswordUnlocked(r *http.Request, link *db.GetShareLinkByTokenHashRow) bool {
	if link == nil {
		return false
	}
	linkIDStr := pgUUIDToString(link.ID)
	cookieName := fmt.Sprintf("ph_share_unlock_%s", linkIDStr)
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return false
	}

	parts := strings.Split(c.Value, ".")
	if len(parts) != 2 {
		return false
	}

	var expiryUnix int64
	if _, err := fmt.Sscanf(parts[0], "%d", &expiryUnix); err != nil {
		return false
	}

	if time.Now().Unix() > expiryUnix {
		return false
	}

	expectedVal := h.signUnlockCookie(linkIDStr, link.PasswordVersion, expiryUnix)
	return hmac.Equal([]byte(c.Value), []byte(expectedVal))
}

func (h *ShareLinksHandler) PublicGet(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	hasPassword := link.PasswordHash.Valid && link.PasswordHash.String != ""
	unlocked := true
	if hasPassword {
		unlocked = h.isPasswordUnlocked(r, link)
	}

	// If password required and not unlocked, return gate
	if hasPassword && !unlocked {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"id":                pgUUIDToString(link.ID),
			"name":              link.Name,
			"password_required": true,
		})
		return
	}

	// Increment view count on unlock
	_ = h.queries.IncrementShareLinkViewCount(r.Context(), link.ID)

	items, _ := h.queries.ListShareLinkItems(r.Context(), link.ID)
	var itemRes []ShareLinkItemResponse
	for _, it := range items {
		itemRes = append(itemRes, ShareLinkItemResponse{
			ID:          pgUUIDToString(it.ID),
			CompanyID:   pgUUIDToString(it.CompanyID),
			ProjectID:   pgUUIDToString(it.ProjectID),
			ParentID:    pgUUIDToString(it.ParentID),
			Kind:        it.Kind,
			Name:        it.Name,
			FileCount:   int(it.FileCount),
			FolderCount: int(it.FolderCount),
			VideoCount:  int(it.VideoCount),
			TotalBytes:  it.TotalBytes,
			ReviewStatus: it.ReviewStatus,
			CreatedAt:   it.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:   it.UpdatedAt.Time.Format(time.RFC3339),
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"id":                pgUUIDToString(link.ID),
		"name":              link.Name,
		"access":            link.Access,
		"allow_download":    link.AllowDownload,
		"latest_only":       link.LatestOnly,
		"ask_identity":      link.AskIdentity,
		"upload_limit_bytes": link.UploadLimitBytes,
		"uploaded_bytes":    link.UploadedBytes,
		"items":             itemRes,
	})
}

type UnlockRequest struct {
	Password string `json:"password"`
}

func (h *ShareLinksHandler) PublicUnlock(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	var req UnlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if !link.PasswordHash.Valid || link.PasswordHash.String == "" {
		respondJSON(w, http.StatusOK, map[string]string{"status": "unlocked"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(link.PasswordHash.String), []byte(req.Password)); err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "incorrect_password",
			"message": "Incorrect password for this share link",
		})
		return
	}

	expiry := time.Now().Add(12 * time.Hour).Unix()
	linkIDStr := pgUUIDToString(link.ID)
	cookieVal := h.signUnlockCookie(linkIDStr, link.PasswordVersion, expiry)
	cookieName := fmt.Sprintf("ph_share_unlock_%s", linkIDStr)
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    cookieVal,
		Path:     "/",
		MaxAge:   3600 * 12, // 12 hours short-lived
		HttpOnly: true,
		Secure:   h.isProduction(),
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusOK, map[string]string{"status": "unlocked"})
}

type IdentifyRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (h *ShareLinksHandler) PublicIdentify(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	if link.PasswordHash.Valid && link.PasswordHash.String != "" && !h.isPasswordUnlocked(r, link) {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "password_required"})
		return
	}

	var req IdentifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := strings.TrimSpace(req.Name)
	email := authz.NormalizeEmail(req.Email)
	if name == "" || email == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_and_email_required"})
		return
	}

	visitor, err := h.queries.UpsertShareVisitor(r.Context(), db.UpsertShareVisitorParams{
		ShareLinkID: link.ID,
		Name:        name,
		Email:       email,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_save_visitor"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"visitor_id": pgUUIDToString(visitor.ID),
		"name":       visitor.Name,
		"email":      visitor.Email,
	})
}

func (h *ShareLinksHandler) PublicDownload(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	if link.PasswordHash.Valid && link.PasswordHash.String != "" && !h.isPasswordUnlocked(r, link) {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "password_required"})
		return
	}

	if !link.AllowDownload {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "downloads_forbidden", "message": "Downloads are disabled for this link"})
		return
	}

	itemIDStr := chi.URLParam(r, "itemId")
	itemUUID, err := uuid.Parse(itemIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	// User rule 1 & 7: Check if requested item is in the share link items scope! Otherwise 404!
	inScope, err := h.queries.IsItemInShareLinkScope(r.Context(), db.IsItemInShareLinkScopeParams{
		ShareLinkID: link.ID,
		ID:          pgtype.UUID{Bytes: itemUUID, Valid: true},
	})
	if err != nil || !inScope {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "item_not_found_in_link",
			"message": "The requested item is not part of this share link",
		})
		return
	}

	item, err := h.queries.GetItemByID(r.Context(), db.GetItemByIDParams{
		CompanyID: link.CompanyID,
		ID:        pgtype.UUID{Bytes: itemUUID, Valid: true},
	})
	if err != nil || item.DeletedAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Single file download: return presigned URL
	version, err := h.queries.GetLatestFileVersion(r.Context(), item.ID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "file_version_not_found"})
		return
	}

	url, err := h.storage.PresignGetObject(r.Context(), version.StorageKey, item.Name, 15*time.Minute)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_presign_download"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"item_id":      pgUUIDToString(item.ID),
		"filename":     item.Name,
		"download_url": url,
		"size_bytes":   version.SizeBytes,
	})
}

type PublicUploadInitiateRequest struct {
	Filename  string `json:"filename"`
	SizeBytes int64  `json:"size_bytes"`
	Mime      string `json:"mime"`
	FolderID  string `json:"folder_id,omitempty"`
}

func (h *ShareLinksHandler) PublicUpload(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	if link.PasswordHash.Valid && link.PasswordHash.String != "" && !h.isPasswordUnlocked(r, link) {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "password_required"})
		return
	}

	if link.Access != "upload" && link.Access != "comment_upload" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "upload_forbidden", "message": "Uploads are not permitted on this share link"})
		return
	}

	var req PublicUploadInitiateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if req.SizeBytes <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_size", "message": "File size must be greater than 0"})
		return
	}

	// 2. Upload link limit: enforce total uploaded_bytes + reserved bytes + new file size <= upload_limit_bytes in 1 transaction
	_, err := h.queries.ReserveShareLinkUpload(r.Context(), db.ReserveShareLinkUploadParams{
		ID:                  link.ID,
		UploadReservedBytes: req.SizeBytes,
	})
	if err != nil {
		respondJSON(w, http.StatusRequestEntityTooLarge, map[string]string{
			"error":   "upload_limit_exceeded",
			"message": "File size exceeds the upload limit for this share link",
		})
		return
	}

	// Resolve target folder inside link
	items, err := h.queries.ListShareLinkItems(r.Context(), link.ID)
	if err != nil || len(items) == 0 {
		_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: req.SizeBytes,
		})
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_upload_target_in_link"})
		return
	}

	targetFolderID := items[0].ID
	if req.FolderID != "" {
		folderUUID, pErr := uuid.Parse(req.FolderID)
		if pErr == nil {
			inScope, _ := h.queries.IsItemInShareLinkScope(r.Context(), db.IsItemInShareLinkScopeParams{
				ShareLinkID: link.ID,
				ID:          pgtype.UUID{Bytes: folderUUID, Valid: true},
			})
			if inScope {
				targetFolderID = pgtype.UUID{Bytes: folderUUID, Valid: true}
			}
		}
	}

	// Check company storage quota
	company, err := h.queries.GetCompanyByID(r.Context(), link.CompanyID)
	if err != nil {
		_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: req.SizeBytes,
		})
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "company_lookup_failed"})
		return
	}

	if company.Plan != "internal" && company.StorageLimitBytes > 0 {
		if company.StorageUsedBytes+company.StorageReservedBytes+req.SizeBytes > company.StorageLimitBytes {
			_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
				ID:                  link.ID,
				UploadReservedBytes: req.SizeBytes,
			})
			respondJSON(w, http.StatusPaymentRequired, map[string]string{
				"error":   "storage_quota_exceeded",
				"message": "Company storage quota reached",
			})
			return
		}
	}

	// Reserve company storage
	_ = h.queries.ReserveCompanyStorage(r.Context(), db.ReserveCompanyStorageParams{
		ID:    link.CompanyID,
		Bytes: req.SizeBytes,
	})

	// Create item placeholder and presigned upload
	newItem, err := h.queries.CreateItem(r.Context(), db.CreateItemParams{
		CompanyID: link.CompanyID,
		ProjectID: link.ProjectID,
		ParentID:  targetFolderID,
		Kind:      "file",
		Name:      strings.TrimSpace(req.Filename),
		Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
		CreatedBy: link.CreatedBy,
	})
	if err != nil {
		_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: req.SizeBytes,
		})
		_ = h.queries.ReleaseCompanyReservedStorage(r.Context(), db.ReleaseCompanyReservedStorageParams{
			ID:    link.CompanyID,
			Bytes: req.SizeBytes,
		})
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "item_creation_failed", "message": err.Error()})
		return
	}

	mimeType := req.Mime
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	storageKey := fmt.Sprintf("companies/%s/projects/%s/items/%s/%s",
		pgUUIDToString(link.CompanyID), pgUUIDToString(link.ProjectID), pgUUIDToString(newItem.ID), req.Filename)

	uploadRecord, err := h.queries.CreateUpload(r.Context(), db.CreateUploadParams{
		CompanyID:     link.CompanyID,
		UserID:        pgtype.UUID{Valid: false},
		ProjectID:     link.ProjectID,
		ParentID:      targetFolderID,
		TargetItemID:  newItem.ID,
		ShareLinkID:   link.ID,
		Filename:      req.Filename,
		SizeBytes:     req.SizeBytes,
		Mime:          mimeType,
		StorageKey:    storageKey,
		UploadID:      "single-put-" + uuid.NewString(),
		PartSizeBytes: req.SizeBytes,
		TotalParts:    1,
		ExpiresAt:     pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: req.SizeBytes,
		})
		_ = h.queries.ReleaseCompanyReservedStorage(r.Context(), db.ReleaseCompanyReservedStorageParams{
			ID:    link.CompanyID,
			Bytes: req.SizeBytes,
		})
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "upload_record_failed"})
		return
	}

	uploadURL, err := h.storage.PresignPutObject(r.Context(), storageKey, mimeType, 30*time.Minute)
	if err != nil {
		_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: req.SizeBytes,
		})
		_ = h.queries.ReleaseCompanyReservedStorage(r.Context(), db.ReleaseCompanyReservedStorageParams{
			ID:    link.CompanyID,
			Bytes: req.SizeBytes,
		})
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "presign_failed"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id":   pgUUIDToString(uploadRecord.ID),
		"item_id":     pgUUIDToString(newItem.ID),
		"storage_key": storageKey,
		"upload_url":  uploadURL,
	})
}

type PublicUploadActionRequest struct {
	UploadID string `json:"upload_id"`
}

func (h *ShareLinksHandler) PublicUploadComplete(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	var req PublicUploadActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	uploadUUID, err := uuid.Parse(req.UploadID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_upload_id"})
		return
	}

	upload, err := h.queries.GetUploadByIDSimple(r.Context(), pgtype.UUID{Bytes: uploadUUID, Valid: true})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "upload_not_found"})
		return
	}

	if !upload.ShareLinkID.Valid || upload.ShareLinkID != link.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	if upload.Status == "pending" {
		// Commit share link bytes: decrement reserved, increment uploaded
		_ = h.queries.CommitShareLinkUpload(r.Context(), db.CommitShareLinkUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: upload.SizeBytes,
		})

		// Commit company storage
		_ = h.queries.CommitCompanyStorage(r.Context(), db.CommitCompanyStorageParams{
			ID:    link.CompanyID,
			Bytes: upload.SizeBytes,
		})

		previewStatus := "none"
		isVideoOrAudio := strings.HasPrefix(upload.Mime, "video/") ||
			strings.HasPrefix(upload.Mime, "audio/") ||
			strings.HasSuffix(strings.ToLower(upload.Filename), ".mp4") ||
			strings.HasSuffix(strings.ToLower(upload.Filename), ".mov") ||
			strings.HasSuffix(strings.ToLower(upload.Filename), ".m4v") ||
			strings.HasSuffix(strings.ToLower(upload.Filename), ".webm") ||
			strings.HasSuffix(strings.ToLower(upload.Filename), ".mp3") ||
			strings.HasSuffix(strings.ToLower(upload.Filename), ".wav")
		if isVideoOrAudio {
			previewStatus = "pending"
		}

		// Create file version
		_, _ = h.queries.CreateFileVersion(r.Context(), db.CreateFileVersionParams{
			CompanyID:     link.CompanyID,
			ItemID:        upload.TargetItemID,
			Number:        1,
			StorageKey:    upload.StorageKey,
			SizeBytes:     upload.SizeBytes,
			Mime:          upload.Mime,
			PreviewStatus: previewStatus,
			PreviewKeys:   []byte("{}"),
			UploadedBy:    pgtype.UUID{Valid: false},
		})

		_, _ = h.queries.UpdateItemReviewStatus(r.Context(), db.UpdateItemReviewStatusParams{
			ID:           upload.TargetItemID,
			CompanyID:    link.CompanyID,
			ReviewStatus: "needs_review",
		})

		_, _ = h.queries.CompleteUpload(r.Context(), upload.ID)

		_ = h.queries.RecalculateProjectAndFolderCounts(r.Context(), upload.ProjectID)
		if upload.ParentID.Valid {
			_ = h.queries.RecalculateFolderCounts(r.Context(), upload.ParentID)
		}
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "completed"})
}

func (h *ShareLinksHandler) PublicUploadAbort(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolvePublicLink(w, r)
	if !ok {
		return
	}

	var req PublicUploadActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	uploadUUID, err := uuid.Parse(req.UploadID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_upload_id"})
		return
	}

	upload, err := h.queries.GetUploadByIDSimple(r.Context(), pgtype.UUID{Bytes: uploadUUID, Valid: true})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "upload_not_found"})
		return
	}

	if !upload.ShareLinkID.Valid || upload.ShareLinkID != link.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	if upload.Status == "pending" {
		// Release share link reserved bytes
		_ = h.queries.ReleaseShareLinkReservedUpload(r.Context(), db.ReleaseShareLinkReservedUploadParams{
			ID:                  link.ID,
			UploadReservedBytes: upload.SizeBytes,
		})

		// Release company reserved storage
		_ = h.queries.ReleaseCompanyReservedStorage(r.Context(), db.ReleaseCompanyReservedStorageParams{
			ID:    link.CompanyID,
			Bytes: upload.SizeBytes,
		})

		_, _ = h.queries.AbortUpload(r.Context(), upload.ID)
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "aborted"})
}
