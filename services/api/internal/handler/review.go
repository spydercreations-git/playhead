package handler

import (
	"bufio"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
)

type ReviewHandler struct {
	queries     *db.Queries
	storage     *storage.Client
	cfg         *config.Config
	rateLimits  map[string][]time.Time
	rateLimitMu sync.Mutex
}

func NewReviewHandler(queries *db.Queries, storageClient *storage.Client, cfg *config.Config) *ReviewHandler {
	return &ReviewHandler{
		queries:    queries,
		storage:    storageClient,
		cfg:        cfg,
		rateLimits: make(map[string][]time.Time),
	}
}

// rateLimit checks if key exceeds limit within window
func (h *ReviewHandler) checkRateLimit(key string, maxRequests int, window time.Duration) bool {
	h.rateLimitMu.Lock()
	defer h.rateLimitMu.Unlock()

	now := time.Now()
	cutoff := now.Add(-window)

	timestamps := h.rateLimits[key]
	var valid []time.Time
	for _, t := range timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= maxRequests {
		h.rateLimits[key] = valid
		return false
	}

	h.rateLimits[key] = append(valid, now)
	return true
}

func (h *ReviewHandler) isTeamMember(ctx context.Context, companyID pgtype.UUID) bool {
	person := middleware.GetPerson(ctx)
	if !companyID.Valid {
		return false
	}
	compUUID := uuid.UUID(companyID.Bytes)
	role := strings.ToLower(person.Role)
	return person.CompanyID == compUUID && role != "" && role != "client"
}

// GetVersions returns all versions of a file item with metadata and preview status
func (h *ReviewHandler) GetVersions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	versions, err := h.queries.ListFileVersions(ctx, itemID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_versions"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"item_id":  itemID,
		"versions": versions,
	})
}

// PlaylistProxy proxies HLS master and variant playlists, signing segment lines with 2h presigned URLs
func (h *ReviewHandler) PlaylistProxy(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	vParam := chi.URLParam(r, "v")
	var ver db.FileVersion
	if vParam == "" || vParam == "latest" {
		v, err := h.queries.GetLatestFileVersion(ctx, itemID)
		if err != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "version_not_found"})
			return
		}
		ver = v
	} else {
		num, pErr := strconv.Atoi(vParam)
		if pErr != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_version_number"})
			return
		}
		v, err := h.queries.GetFileVersionByNumber(ctx, db.GetFileVersionByNumberParams{
			ItemID: itemID,
			Number: int32(num),
		})
		if err != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "version_not_found"})
			return
		}
		ver = v
	}

	// Requirement 3: If not ready, play original only for people who can download. Others see "Processing, ready in a few minutes".
	if ver.PreviewStatus != "ready" {
		if !access.CanDownload {
			respondJSON(w, http.StatusTooEarly, map[string]string{
				"error":   "processing",
				"message": "Processing, ready in a few minutes",
			})
			return
		}
	}

	// Determine playlist target (master or variant)
	playlistName := chi.URLParam(r, "playlist")
	if playlistName == "" {
		playlistName = "master.m3u8"
	}
	if !strings.HasSuffix(playlistName, ".m3u8") {
		playlistName += ".m3u8"
	}

	prefix := fmt.Sprintf("previews/%s/%s", pgUUIDToString(companyID), pgUUIDToString(ver.ID))
	targetKey := prefix + "/" + playlistName

	if h.storage == nil {
		// Mock playlist for dev/testing when no storage is attached
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write([]byte("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2500000\n720p.m3u8\n"))
		return
	}

	rc, _, err := h.storage.GetObject(ctx, targetKey)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "playlist_not_found"})
		return
	}
	defer rc.Close()

	// Parse and rewrite playlist lines
	baseProxyURL := fmt.Sprintf("/api/v1/items/%s/versions/%d", pgUUIDToString(itemID), ver.Number)
	scanner := bufio.NewScanner(rc)
	var output strings.Builder

	isMaster := playlistName == "master.m3u8" || playlistName == "playlist.m3u8"

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "#") {
			output.WriteString(line + "\n")
			continue
		}

		if trimmed == "" {
			output.WriteString("\n")
			continue
		}

		if isMaster {
			// Rewrite variant references to proxy route (e.g. 720p.m3u8 -> /api/v1/items/{id}/versions/{v}/720p.m3u8)
			variantProxy := fmt.Sprintf("%s/%s", baseProxyURL, trimmed)
			output.WriteString(variantProxy + "\n")
		} else {
			// Rewrite segment lines (.ts) to 2-hour presigned R2 URLs
			segKey := prefix + "/" + trimmed
			presignedSegURL, sErr := h.storage.PresignGetObjectInline(ctx, segKey, "video/mp2t", 2*time.Hour)
			if sErr == nil {
				output.WriteString(presignedSegURL + "\n")
			} else {
				output.WriteString(trimmed + "\n")
			}
		}
	}

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	_, _ = w.Write([]byte(output.String()))
}

type createCommentReq struct {
	VersionID       *string         `json:"version_id"`
	ParentID        *string         `json:"parent_id"`
	Body            string          `json:"body"`
	Visibility      string          `json:"visibility"` // "everyone" | "team"
	TimecodeStartMs *int32          `json:"timecode_start_ms"`
	TimecodeEndMs   *int32          `json:"timecode_end_ms"`
	Drawing         json.RawMessage `json:"drawing"`
	AttachmentKey   *string         `json:"attachment_key"`
}

// ListComments returns threaded comments for an item/version, filtering Team-only comments on the server
func (h *ReviewHandler) ListComments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	isTeam := h.isTeamMember(ctx, companyID)

	var vUUID pgtype.UUID
	if vParam := r.URL.Query().Get("version_id"); vParam != "" {
		_ = vUUID.Scan(vParam)
	}

	// Server-side enforcement of team-only comments
	comments, err := h.queries.ListCommentsByItemVersion(ctx, db.ListCommentsByItemVersionParams{
		CompanyID: companyID,
		ItemID:    itemID,
		VersionID: vUUID,
		Column4:   isTeam, // include_team boolean
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_comments"})
		return
	}

	// Fetch replies for each comment
	type commentWithReplies struct {
		db.ListCommentsByItemVersionRow
		Replies []db.ListCommentRepliesRow `json:"replies"`
	}

	result := make([]commentWithReplies, 0, len(comments))
	for _, c := range comments {
		replies, rErr := h.queries.ListCommentReplies(ctx, db.ListCommentRepliesParams{
			ParentID:  c.ID,
			CompanyID: companyID,
			Column3:   isTeam,
		})
		if rErr != nil || replies == nil {
			replies = []db.ListCommentRepliesRow{}
		}
		result = append(result, commentWithReplies{
			ListCommentsByItemVersionRow: c,
			Replies:                      replies,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"comments": result,
		"count":    len(result),
	})
}

// CreateComment creates a new timestamped/range comment or threaded reply
func (h *ReviewHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Requirement 5: Commenter and above (Commenter, Uploader, Full) can comment, reply and resolve.
	if access.Level != authz.LevelCommenter && access.Level != authz.LevelUploader && access.Level != authz.LevelFull {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Commenter permission required"})
		return
	}

	var req createCommentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if strings.TrimSpace(req.Body) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "comment_body_required"})
		return
	}

	isTeam := h.isTeamMember(ctx, companyID)
	vis := strings.ToLower(req.Visibility)
	if vis == "team" {
		// Requirement 7: Client contacts cannot create team only comments
		if !isTeam {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only team members can create Team only comments"})
			return
		}
	} else {
		vis = "everyone"
	}

	var parentUUID pgtype.UUID
	if req.ParentID != nil && *req.ParentID != "" {
		if err := parentUUID.Scan(*req.ParentID); err == nil {
			parent, err := h.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
				ID:        parentUUID,
				CompanyID: companyID,
			})
			if err != nil {
				respondJSON(w, http.StatusNotFound, map[string]string{"error": "parent_comment_not_found"})
				return
			}
			if parent.Visibility == "team" && !isTeam {
				respondJSON(w, http.StatusNotFound, map[string]string{"error": "parent_comment_not_found"})
				return
			}
			vis = parent.Visibility // Replies inherit parent's visibility
		}
	}

	var vUUID pgtype.UUID
	if req.VersionID != nil && *req.VersionID != "" {
		_ = vUUID.Scan(*req.VersionID)
	} else {
		latest, err := h.queries.GetLatestFileVersion(ctx, itemID)
		if err == nil {
			vUUID = latest.ID
		}
	}

	var tcStart pgtype.Int4
	if req.TimecodeStartMs != nil {
		tcStart = pgtype.Int4{Int32: *req.TimecodeStartMs, Valid: true}
	}
	var tcEnd pgtype.Int4
	if req.TimecodeEndMs != nil {
		tcEnd = pgtype.Int4{Int32: *req.TimecodeEndMs, Valid: true}
	}

	var attKey pgtype.Text
	if req.AttachmentKey != nil && *req.AttachmentKey != "" {
		attKey = pgtype.Text{String: *req.AttachmentKey, Valid: true}
	}

	var drawingBytes []byte
	if len(req.Drawing) > 0 && string(req.Drawing) != "null" {
		drawingBytes = req.Drawing
	}

	var authorUID pgtype.UUID
	var authorName, authorEmail string
	if user != nil {
		authorUID = user.ID
		authorName = user.Name
		authorEmail = user.Email
	}

	comment, err := h.queries.CreateComment(ctx, db.CreateCommentParams{
		CompanyID:        companyID,
		ItemID:           itemID,
		VersionID:        vUUID,
		ParentID:         parentUUID,
		AuthorUserID:     authorUID,
		AuthorVisitorID:  pgtype.UUID{Valid: false},
		AuthorName:       authorName,
		AuthorEmail:      authorEmail,
		Body:             req.Body,
		Visibility:       vis,
		TimecodeStartMs:  tcStart,
		TimecodeEndMs:    tcEnd,
		Drawing:          drawingBytes,
		AttachmentKey:    attKey,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_comment"})
		return
	}

	respondJSON(w, http.StatusCreated, comment)
}

type updateCommentReq struct {
	Body    string          `json:"body"`
	Drawing json.RawMessage `json:"drawing"`
}

// UpdateComment edits comment body and drawing (author only)
func (h *ReviewHandler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var commentID pgtype.UUID
	if err := commentID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	comment, err := h.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
		ID:        commentID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "comment_not_found"})
		return
	}

	// Requirement 5: Edit author only
	if !comment.AuthorUserID.Valid || comment.AuthorUserID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only the author can edit this comment"})
		return
	}

	var req updateCommentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var drawingBytes []byte
	if len(req.Drawing) > 0 && string(req.Drawing) != "null" {
		drawingBytes = req.Drawing
	} else {
		drawingBytes = comment.Drawing
	}

	updated, err := h.queries.UpdateComment(ctx, db.UpdateCommentParams{
		ID:        commentID,
		CompanyID: companyID,
		Body:      req.Body,
		Drawing:   drawingBytes,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_update_comment"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// DeleteComment soft-deletes a comment (author or anyone with Full access)
func (h *ReviewHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var commentID pgtype.UUID
	if err := commentID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	comment, err := h.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
		ID:        commentID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "comment_not_found"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        comment.ItemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Requirement 5: Delete author or anyone with Full access. No checks by role name.
	isAuthor := comment.AuthorUserID.Valid && comment.AuthorUserID == user.ID
	hasFull := access.Level == authz.LevelFull
	if !isAuthor && !hasFull {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to delete this comment"})
		return
	}

	if err := h.queries.SoftDeleteComment(ctx, db.SoftDeleteCommentParams{
		ID:        commentID,
		CompanyID: companyID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_delete_comment"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"deleted": true})
}

// ResolveComment resolves a comment (Commenter and above)
func (h *ReviewHandler) ResolveComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var commentID pgtype.UUID
	if err := commentID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	comment, err := h.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
		ID:        commentID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "comment_not_found"})
		return
	}

	item, _ := h.queries.GetItemByID(ctx, db.GetItemByIDParams{ID: comment.ItemID, CompanyID: companyID})
	proj, _ := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{ID: item.ProjectID, CompanyID: companyID})
	person := middleware.GetPerson(ctx)
	access, _ := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID: uuid.UUID(item.ID.Bytes), ProjectID: uuid.UUID(item.ProjectID.Bytes), CompanyID: uuid.UUID(item.CompanyID.Bytes), CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})

	// Requirement 5: Commenter and above can resolve
	if access.Level != authz.LevelCommenter && access.Level != authz.LevelUploader && access.Level != authz.LevelFull {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Commenter permission required"})
		return
	}

	resolved, err := h.queries.ResolveComment(ctx, db.ResolveCommentParams{
		ID:         commentID,
		CompanyID:  companyID,
		ResolvedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_resolve_comment"})
		return
	}

	respondJSON(w, http.StatusOK, resolved)
}

// ReopenComment unresolves a comment
func (h *ReviewHandler) ReopenComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var commentID pgtype.UUID
	if err := commentID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	comment, err := h.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
		ID:        commentID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "comment_not_found"})
		return
	}

	item, _ := h.queries.GetItemByID(ctx, db.GetItemByIDParams{ID: comment.ItemID, CompanyID: companyID})
	proj, _ := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{ID: item.ProjectID, CompanyID: companyID})
	person := middleware.GetPerson(ctx)
	access, _ := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID: uuid.UUID(item.ID.Bytes), ProjectID: uuid.UUID(item.ProjectID.Bytes), CompanyID: uuid.UUID(item.CompanyID.Bytes), CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})

	if access.Level != authz.LevelCommenter && access.Level != authz.LevelUploader && access.Level != authz.LevelFull {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Commenter permission required"})
		return
	}

	reopened, err := h.queries.ReopenComment(ctx, db.ReopenCommentParams{
		ID:        commentID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_reopen_comment"})
		return
	}

	respondJSON(w, http.StatusOK, reopened)
}

// ExportCommentsCSV exports comments as CSV, filtering Team-only comments for client contacts
func (h *ReviewHandler) ExportCommentsCSV(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	isTeam := h.isTeamMember(ctx, companyID)
	comments, err := h.queries.ListCommentsByItemVersion(ctx, db.ListCommentsByItemVersionParams{
		CompanyID: companyID,
		ItemID:    itemID,
		Column4:   isTeam,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_export_comments"})
		return
	}

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	_ = writer.Write([]string{"Timecode", "Author", "Audience", "Status", "Comment", "Replies", "Created At"})

	formatTimecode := func(startMs, endMs pgtype.Int4) string {
		if !startMs.Valid {
			return "--"
		}
		totalSec := startMs.Int32 / 1000
		min := totalSec / 60
		sec := totalSec % 60
		frames := (startMs.Int32 % 1000) * 24 / 1000
		startStr := fmt.Sprintf("%02d:%02d:%02d", min, sec, frames)
		if endMs.Valid && endMs.Int32 > startMs.Int32 {
			endSec := endMs.Int32 / 1000
			eMin := endSec / 60
			eSec := endSec % 60
			eFrames := (endMs.Int32 % 1000) * 24 / 1000
			return fmt.Sprintf("%s - %02d:%02d:%02d", startStr, eMin, eSec, eFrames)
		}
		return startStr
	}

	for _, c := range comments {
		author := c.AuthorName
		if c.UserName.Valid && c.UserName.String != "" {
			author = c.UserName.String
		}
		status := "Open"
		if c.ResolvedAt.Valid {
			status = "Resolved"
		}
		timecode := formatTimecode(c.TimecodeStartMs, c.TimecodeEndMs)
		createdAt := c.CreatedAt.Time.Format("2006-01-02 15:04:05")

		_ = writer.Write([]string{
			timecode,
			author,
			c.Visibility,
			status,
			c.Body,
			strconv.Itoa(int(c.ReplyCount)),
			createdAt,
		})
	}
	writer.Flush()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", item.Name+"-comments.csv"))
	_, _ = w.Write(buf.Bytes())
}

type submitReviewReq struct {
	VersionID string `json:"version_id"`
	Decision  string `json:"decision"` // "approved" | "changes_requested"
	Status    string `json:"status"`   // alias for decision
	Note      string `json:"note"`
	Notes     string `json:"notes"`    // alias for note
}

// SubmitReview handles Approve and Request Changes decisions
func (h *ReviewHandler) SubmitReview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Requirement 6: Allowed for team members with Full access and client contacts with Commenter or above.
	isTeam := h.isTeamMember(ctx, companyID)
	var allowed bool
	if isTeam {
		allowed = access.Level == authz.LevelFull
	} else {
		allowed = access.Level == authz.LevelCommenter || access.Level == authz.LevelUploader || access.Level == authz.LevelFull
	}
	if !allowed {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Approval permissions required"})
		return
	}

	var req submitReviewReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	decision := strings.ToLower(req.Decision)
	if decision == "" {
		decision = strings.ToLower(req.Status)
	}
	note := req.Note
	if note == "" {
		note = req.Notes
	}
	if decision != "approved" && decision != "changes_requested" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_decision", "message": "Decision must be 'approved' or 'changes_requested'"})
		return
	}

	var vUUID pgtype.UUID
	if req.VersionID != "" {
		_ = vUUID.Scan(req.VersionID)
	} else {
		latest, err := h.queries.GetLatestFileVersion(ctx, itemID)
		if err == nil {
			vUUID = latest.ID
		}
	}

	var authorName string
	var uID pgtype.UUID
	if user != nil {
		authorName = user.Name
		uID = user.ID
	}

	rev, err := h.queries.CreateReview(ctx, db.CreateReviewParams{
		CompanyID:  companyID,
		ItemID:     itemID,
		VersionID:  vUUID,
		UserID:     uID,
		VisitorID:  pgtype.UUID{Valid: false},
		AuthorName: authorName,
		Decision:   decision,
		Note:       note,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_review"})
		return
	}

	// Update item review status
	_, _ = h.queries.UpdateItemReviewStatus(ctx, db.UpdateItemReviewStatusParams{
		ID:           itemID,
		CompanyID:    companyID,
		ReviewStatus: decision,
	})

	respondJSON(w, http.StatusOK, rev)
}

// ReopenReview reopens an approved item back to "needs_review"
func (h *ReviewHandler) ReopenReview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, _ := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{ID: item.ProjectID, CompanyID: companyID})
	person := middleware.GetPerson(ctx)
	access, _ := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID: uuid.UUID(item.ID.Bytes), ProjectID: uuid.UUID(item.ProjectID.Bytes), CompanyID: uuid.UUID(item.CompanyID.Bytes), CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})

	isTeam := h.isTeamMember(ctx, companyID)
	var allowed bool
	if isTeam {
		allowed = access.Level == authz.LevelFull
	} else {
		allowed = access.Level == authz.LevelCommenter || access.Level == authz.LevelUploader || access.Level == authz.LevelFull
	}
	if !allowed {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Reopen permission required"})
		return
	}

	updated, err := h.queries.UpdateItemReviewStatus(ctx, db.UpdateItemReviewStatusParams{
		ID:           itemID,
		CompanyID:    companyID,
		ReviewStatus: "needs_review",
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_reopen"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// ListReviews lists review decision history for Details tab
func (h *ReviewHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	reviews, err := h.queries.ListReviewsByItem(ctx, db.ListReviewsByItemParams{
		CompanyID: companyID,
		ItemID:    itemID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_reviews"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"reviews": reviews,
	})
}

// ListMentionable returns users and contacts who have access to this item (Requirement 9)
func (h *ReviewHandler) ListMentionable(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	_, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Fetch team members with access
	members, err := h.queries.GetMembershipsForCompany(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_members"})
		return
	}

	type mentionPerson struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
		Role  string `json:"role"`
	}

	var mentionable []mentionPerson
	for _, m := range members {
		mentionable = append(mentionable, mentionPerson{
			ID:    pgUUIDToString(m.UserID),
			Name:  m.UserName,
			Email: m.UserEmail,
			Role:  m.Role,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"mentionable": mentionable,
	})
}

// ListReviewsFeed returns cross-project videos for Reviews page
func (h *ReviewHandler) ListReviewsFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	isTeam := h.isTeamMember(ctx, companyID)
	feed, err := h.queries.ListReviewsFeed(ctx, db.ListReviewsFeedParams{
		CompanyID: companyID,
		Column2:   nil, // all accessible projects
		Column3:   isTeam,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_reviews_feed"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": feed,
	})
}

// -------------------------------------------------------------
// Public Share Link Review Handlers (Rate Limited & Scoped)
// -------------------------------------------------------------

func (h *ReviewHandler) resolveShareLink(w http.ResponseWriter, r *http.Request) (*db.GetShareLinkByTokenHashRow, bool) {
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

	if link.DisabledAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_disabled"})
		return nil, false
	}

	if link.ExpiresAt.Valid && link.ExpiresAt.Time.Before(time.Now()) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_expired"})
		return nil, false
	}

	return &link, true
}

func (h *ReviewHandler) verifyItemUnderShareLink(ctx context.Context, link *db.GetShareLinkByTokenHashRow, itemID pgtype.UUID) bool {
	attachedItems, err := h.queries.ListShareLinkItems(ctx, link.ID)
	if err != nil || len(attachedItems) == 0 {
		return false
	}

	for _, att := range attachedItems {
		if att.ID == itemID {
			return true
		}
	}

	ancestors, err := h.queries.GetItemAncestors(ctx, db.GetItemAncestorsParams{
		ItemID:    itemID,
		CompanyID: link.CompanyID,
	})
	if err == nil {
		for _, a := range ancestors {
			for _, att := range attachedItems {
				if a.ID == att.ID {
					return true
				}
			}
		}
	}
	return false
}

// PublicPlaylistProxy proxies HLS playlists for share link visitors
func (h *ReviewHandler) PublicPlaylistProxy(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolveShareLink(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	if !h.verifyItemUnderShareLink(ctx, link, itemID) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	ver, err := h.queries.GetLatestFileVersion(ctx, itemID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "version_not_found"})
		return
	}

	// Requirement 3: If processing and link doesn't allow download -> 425 "Processing, ready in a few minutes"
	if ver.PreviewStatus != "ready" {
		if !link.AllowDownload {
			respondJSON(w, http.StatusTooEarly, map[string]string{
				"error":   "processing",
				"message": "Processing, ready in a few minutes",
			})
			return
		}
	}

	playlistName := chi.URLParam(r, "playlist")
	if playlistName == "" {
		playlistName = "master.m3u8"
	}
	if !strings.HasSuffix(playlistName, ".m3u8") {
		playlistName += ".m3u8"
	}

	prefix := fmt.Sprintf("previews/%s/%s", pgUUIDToString(link.CompanyID), pgUUIDToString(ver.ID))
	targetKey := prefix + "/" + playlistName

	if h.storage == nil {
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write([]byte("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2500000\n720p.m3u8\n"))
		return
	}

	rc, _, err := h.storage.GetObject(ctx, targetKey)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "playlist_not_found"})
		return
	}
	defer rc.Close()

	token := chi.URLParam(r, "token")
	baseProxyURL := fmt.Sprintf("/api/v1/s/%s/items/%s", token, pgUUIDToString(itemID))
	scanner := bufio.NewScanner(rc)
	var output strings.Builder
	isMaster := playlistName == "master.m3u8" || playlistName == "playlist.m3u8"

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "#") {
			output.WriteString(line + "\n")
			continue
		}
		if trimmed == "" {
			output.WriteString("\n")
			continue
		}

		if isMaster {
			output.WriteString(fmt.Sprintf("%s/%s\n", baseProxyURL, trimmed))
		} else {
			segKey := prefix + "/" + trimmed
			presignedSegURL, sErr := h.storage.PresignGetObjectInline(ctx, segKey, "video/mp2t", 2*time.Hour)
			if sErr == nil {
				output.WriteString(presignedSegURL + "\n")
			} else {
				output.WriteString(trimmed + "\n")
			}
		}
	}

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	_, _ = w.Write([]byte(output.String()))
}

// PublicListComments lists comments for share visitors, strictly hiding Team-only comments
func (h *ReviewHandler) PublicListComments(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolveShareLink(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	if !h.verifyItemUnderShareLink(ctx, link, itemID) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	var vUUID pgtype.UUID
	if vParam := r.URL.Query().Get("version_id"); vParam != "" {
		_ = vUUID.Scan(vParam)
	}

	// Requirement 7: Team only comments strictly hidden on share link page
	comments, err := h.queries.ListCommentsByItemVersion(ctx, db.ListCommentsByItemVersionParams{
		CompanyID: link.CompanyID,
		ItemID:    itemID,
		VersionID: vUUID,
		Column4:   false, // include_team = false
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_comments"})
		return
	}

	type commentWithReplies struct {
		db.ListCommentsByItemVersionRow
		Replies []db.ListCommentRepliesRow `json:"replies"`
	}

	result := make([]commentWithReplies, 0, len(comments))
	for _, c := range comments {
		replies, rErr := h.queries.ListCommentReplies(ctx, db.ListCommentRepliesParams{
			ParentID:  c.ID,
			CompanyID: link.CompanyID,
			Column3:   false, // never include team only replies
		})
		if rErr != nil || replies == nil {
			replies = []db.ListCommentRepliesRow{}
		}
		result = append(result, commentWithReplies{
			ListCommentsByItemVersionRow: c,
			Replies:                      replies,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"comments": result,
		"count":    len(result),
	})
}

// PublicCreateComment creates a comment from a share visitor (Rate limited)
func (h *ReviewHandler) PublicCreateComment(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolveShareLink(w, r)
	if !ok {
		return
	}

	// Requirement 11: Rate limited
	ip := r.RemoteAddr
	rateKey := fmt.Sprintf("pub_comment:%s:%s", pgUUIDToString(link.ID), ip)
	if !h.checkRateLimit(rateKey, 30, 5*time.Minute) {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited", "message": "Too many comments submitted. Please wait a moment."})
		return
	}

	// Check if link allows comments
	if link.Access != "comment" && link.Access != "comment_upload" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Comments are disabled for this link"})
		return
	}

	ctx := r.Context()
	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	if !h.verifyItemUnderShareLink(ctx, link, itemID) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	var req struct {
		createCommentReq
		VisitorName  string `json:"visitor_name"`
		VisitorEmail string `json:"visitor_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if link.AskIdentity && (strings.TrimSpace(req.VisitorName) == "" || strings.TrimSpace(req.VisitorEmail) == "") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "identity_required", "message": "Name and email are required to comment"})
		return
	}

	// Requirement 7: Share link visitors cannot create team only comments
	if strings.ToLower(req.Visibility) == "team" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Visitors cannot create Team only comments"})
		return
	}

	var parentUUID pgtype.UUID
	if req.ParentID != nil && *req.ParentID != "" {
		_ = parentUUID.Scan(*req.ParentID)
	}

	var vUUID pgtype.UUID
	if req.VersionID != nil && *req.VersionID != "" {
		_ = vUUID.Scan(*req.VersionID)
	} else {
		latest, err := h.queries.GetLatestFileVersion(ctx, itemID)
		if err == nil {
			vUUID = latest.ID
		}
	}

	var tcStart pgtype.Int4
	if req.TimecodeStartMs != nil {
		tcStart = pgtype.Int4{Int32: *req.TimecodeStartMs, Valid: true}
	}
	var tcEnd pgtype.Int4
	if req.TimecodeEndMs != nil {
		tcEnd = pgtype.Int4{Int32: *req.TimecodeEndMs, Valid: true}
	}

	var drawingBytes []byte
	if len(req.Drawing) > 0 && string(req.Drawing) != "null" {
		drawingBytes = req.Drawing
	}

	comment, err := h.queries.CreateComment(ctx, db.CreateCommentParams{
		CompanyID:        link.CompanyID,
		ItemID:           itemID,
		VersionID:        vUUID,
		ParentID:         parentUUID,
		AuthorUserID:     pgtype.UUID{Valid: false},
		AuthorVisitorID:  pgtype.UUID{Valid: false},
		AuthorName:       req.VisitorName,
		AuthorEmail:      req.VisitorEmail,
		Body:             req.Body,
		Visibility:       "everyone", // always everyone
		TimecodeStartMs:  tcStart,
		TimecodeEndMs:    tcEnd,
		Drawing:          drawingBytes,
		AttachmentKey:    pgtype.Text{Valid: false},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_comment"})
		return
	}

	respondJSON(w, http.StatusCreated, comment)
}

// PublicSubmitReview handles approval or changes requested from a share visitor (Rate limited)
func (h *ReviewHandler) PublicSubmitReview(w http.ResponseWriter, r *http.Request) {
	link, ok := h.resolveShareLink(w, r)
	if !ok {
		return
	}

	// Requirement 11: Rate limited
	ip := r.RemoteAddr
	rateKey := fmt.Sprintf("pub_review:%s:%s", pgUUIDToString(link.ID), ip)
	if !h.checkRateLimit(rateKey, 10, 5*time.Minute) {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited", "message": "Too many review requests submitted"})
		return
	}

	// Requirement 6: Share link visitors can approve only if link allows comments and they entered name and email
	if link.Access != "comment" && link.Access != "comment_upload" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Approvals require commenting to be enabled"})
		return
	}

	ctx := r.Context()
	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	if !h.verifyItemUnderShareLink(ctx, link, itemID) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	var req struct {
		submitReviewReq
		VisitorName  string `json:"visitor_name"`
		VisitorEmail string `json:"visitor_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if strings.TrimSpace(req.VisitorName) == "" || strings.TrimSpace(req.VisitorEmail) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "identity_required", "message": "Name and email are required to submit an approval decision"})
		return
	}

	decision := strings.ToLower(req.Decision)
	if decision == "" {
		decision = strings.ToLower(req.Status)
	}
	note := req.Note
	if note == "" {
		note = req.Notes
	}
	if decision != "approved" && decision != "changes_requested" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_decision"})
		return
	}

	var vUUID pgtype.UUID
	if req.VersionID != "" {
		_ = vUUID.Scan(req.VersionID)
	} else {
		latest, err := h.queries.GetLatestFileVersion(ctx, itemID)
		if err == nil {
			vUUID = latest.ID
		}
	}

	rev, err := h.queries.CreateReview(ctx, db.CreateReviewParams{
		CompanyID:  link.CompanyID,
		ItemID:     itemID,
		VersionID:  vUUID,
		UserID:     pgtype.UUID{Valid: false},
		VisitorID:  pgtype.UUID{Valid: false},
		AuthorName: req.VisitorName,
		Decision:   decision,
		Note:       note,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_review"})
		return
	}

	// Update item review status
	_, _ = h.queries.UpdateItemReviewStatus(ctx, db.UpdateItemReviewStatusParams{
		ID:           itemID,
		CompanyID:    link.CompanyID,
		ReviewStatus: decision,
	})

	respondJSON(w, http.StatusOK, rev)
}
