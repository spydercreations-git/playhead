package handler

import (
	"encoding/json"
	"math/big"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/db"
)

type QuickLinksHandler struct {
	queries *db.Queries
}

func NewQuickLinksHandler(queries *db.Queries) *QuickLinksHandler {
	return &QuickLinksHandler{
		queries: queries,
	}
}

// List handles GET /api/v1/quick-links
func (h *QuickLinksHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	links, err := h.queries.ListQuickLinks(ctx, db.ListQuickLinksParams{
		CompanyID: pgtype.UUID{Bytes: person.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: person.UserID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list quick links"})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{"quick_links": links})
}

// Create handles POST /api/v1/quick-links
func (h *QuickLinksHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req struct {
		Title string `json:"title"`
		Name  string `json:"name"`
		URL   string `json:"url"`
		Link  string `json:"link"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = strings.TrimSpace(req.Name)
	}
	rawURL := strings.TrimSpace(req.URL)
	if rawURL == "" {
		rawURL = strings.TrimSpace(req.Link)
	}

	if title == "" {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
		return
	}
	if len(title) > 255 {
		title = title[:255]
	}

	if rawURL == "" {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "url is required"})
		return
	}

	parsedURL, err := url.ParseRequestURI(rawURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		renderJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_url",
			"message": "Link must start with http:// or https://",
		})
		return
	}

	linkID := uuid.New()
	link, err := h.queries.CreateQuickLink(ctx, db.CreateQuickLinkParams{
		ID:        pgtype.UUID{Bytes: linkID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: person.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: person.UserID, Valid: true},
		Title:     title,
		Url:       rawURL,
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create quick link"})
		return
	}

	renderJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         linkID.String(),
		"quick_link": link,
	})
}

// Delete handles DELETE /api/v1/quick-links/{id}
func (h *QuickLinksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	parsedID, err := uuid.Parse(idStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid link id"})
		return
	}

	err = h.queries.DeleteQuickLink(ctx, db.DeleteQuickLinkParams{
		ID:        pgtype.UUID{Bytes: parsedID, Valid: true},
		UserID:    pgtype.UUID{Bytes: person.UserID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: person.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete quick link"})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}
