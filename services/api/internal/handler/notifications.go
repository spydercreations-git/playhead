package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/db"
)

type NotificationSettingsHandler struct {
	queries *db.Queries
}

func NewNotificationSettingsHandler(queries *db.Queries) *NotificationSettingsHandler {
	return &NotificationSettingsHandler{queries: queries}
}

type EventPrefItem struct {
	EventType string `json:"event_type"`
	InApp     bool   `json:"in_app"`
	Email     bool   `json:"email"`
}

type UserNotificationSettingsResponse struct {
	Preferences    []EventPrefItem `json:"preferences"`
	EmailFrequency string          `json:"email_frequency"` // instant, daily_summary
}

var defaultEvents = []string{
	"shared_with_me",
	"added_to_project",
	"mentioned",
	"new_comment_upload",
	"reply_to_comment",
	"new_version_uploaded",
	"review_decision",
	"client_uploaded_link",
	"storage_alert",
}

func (h *NotificationSettingsHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	prefs, err := h.queries.ListUserNotificationPrefs(r.Context(), user.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_fetch_prefs"})
		return
	}

	prefMap := make(map[string]EventPrefItem)
	for _, p := range prefs {
		prefMap[p.EventType] = EventPrefItem{
			EventType: p.EventType,
			InApp:     p.InApp,
			Email:     p.Email,
		}
	}

	var result []EventPrefItem
	for _, evt := range defaultEvents {
		if p, found := prefMap[evt]; found {
			result = append(result, p)
		} else {
			// Spec defaults: all ON, except Email for "new_version_uploaded" is OFF
			emailDefault := true
			if evt == "new_version_uploaded" {
				emailDefault = false
			}
			result = append(result, EventPrefItem{
				EventType: evt,
				InApp:     true,
				Email:     emailDefault,
			})
		}
	}

	frequency := "instant"
	settings, err := h.queries.GetUserSettings(r.Context(), user.ID)
	if err == nil && settings.EmailFrequency != "" {
		frequency = settings.EmailFrequency
	}

	respondJSON(w, http.StatusOK, UserNotificationSettingsResponse{
		Preferences:    result,
		EmailFrequency: frequency,
	})
}

type UpdateNotificationSettingsRequest struct {
	Preferences    []EventPrefItem `json:"preferences"`
	EmailFrequency string          `json:"email_frequency"`
}

func (h *NotificationSettingsHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req UpdateNotificationSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	for _, p := range req.Preferences {
		evt := strings.TrimSpace(p.EventType)
		if evt != "" {
			_, _ = h.queries.UpsertNotificationPref(r.Context(), db.UpsertNotificationPrefParams{
				UserID:    user.ID,
				EventType: evt,
				InApp:     p.InApp,
				Email:     p.Email,
			})
		}
	}

	freq := strings.TrimSpace(req.EmailFrequency)
	if freq != "instant" && freq != "daily_summary" {
		freq = "instant"
	}
	_, _ = h.queries.UpsertUserSettings(r.Context(), db.UpsertUserSettingsParams{
		UserID:         user.ID,
		EmailFrequency: freq,
	})

	h.GetSettings(w, r)
}

type ProjectBellResponse struct {
	ProjectID string `json:"project_id"`
	Level     string `json:"level"` // all, mentions_and_mine, off
}

func (h *NotificationSettingsHandler) GetProjectBell(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectIDStr := chi.URLParam(r, "id")
	projectUUID, err := uuid.Parse(projectIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	pref, err := h.queries.GetProjectNotificationPref(r.Context(), db.GetProjectNotificationPrefParams{
		UserID:    user.ID,
		ProjectID: pgtype.UUID{Bytes: projectUUID, Valid: true},
	})
	level := "mentions_and_mine" // spec default
	if err == nil && pref.Level != "" {
		level = pref.Level
	}

	respondJSON(w, http.StatusOK, ProjectBellResponse{
		ProjectID: projectIDStr,
		Level:     level,
	})
}

type UpdateProjectBellRequest struct {
	Level string `json:"level"` // all, mentions_and_mine, off
}

func (h *NotificationSettingsHandler) UpdateProjectBell(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectIDStr := chi.URLParam(r, "id")
	projectUUID, err := uuid.Parse(projectIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	var req UpdateProjectBellRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	level := strings.TrimSpace(req.Level)
	if level != "all" && level != "mentions_and_mine" && level != "off" {
		level = "mentions_and_mine"
	}

	pref, err := h.queries.UpsertProjectNotificationPref(r.Context(), db.UpsertProjectNotificationPrefParams{
		UserID:    user.ID,
		ProjectID: pgtype.UUID{Bytes: projectUUID, Valid: true},
		Level:     level,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_save_pref"})
		return
	}

	respondJSON(w, http.StatusOK, ProjectBellResponse{
		ProjectID: projectIDStr,
		Level:     pref.Level,
	})
}
