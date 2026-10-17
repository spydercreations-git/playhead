package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9.]{3,30}$`)

type OnboardingHandler struct {
	queries *db.Queries
	storage *storage.Client
	dbPool  *pgxpool.Pool
}

func NewOnboardingHandler(queries *db.Queries, storage *storage.Client) *OnboardingHandler {
	return &OnboardingHandler{
		queries: queries,
		storage: storage,
	}
}

func (h *OnboardingHandler) SetPool(pool *pgxpool.Pool) {
	h.dbPool = pool
}

// CheckUsername checks if a username is valid and available.
func (h *OnboardingHandler) CheckUsername(w http.ResponseWriter, r *http.Request) {
	username := strings.TrimSpace(r.URL.Query().Get("username"))
	username = strings.TrimPrefix(username, "@")

	if username == "" || !usernameRegex.MatchString(username) {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"available": false,
			"username":  username,
			"message":   "Usernames must be 3-30 characters long and contain only letters, numbers, and dots.",
		})
		return
	}

	var currentUserID pgtype.UUID
	if user, ok := middleware.GetAuthenticatedUser(r.Context()); ok {
		currentUserID = user.ID
	}

	available, err := h.queries.CheckUsernameAvailable(r.Context(), db.CheckUsernameAvailableParams{
		Username:      username,
		ExcludeUserID: currentUserID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"available": available,
		"username":  username,
	})
}

type CompleteOnboardingRequest struct {
	Name        string `json:"name"`
	Username    string `json:"username"`
	AvatarURL   string `json:"avatar_url"`
	NewPassword string `json:"new_password"`
}

// CompleteOnboarding saves profile details and marks onboarding as done.
func (h *OnboardingHandler) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req CompleteOnboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "missing_name",
			"message": "Full name is required",
		})
		return
	}

	username := strings.TrimSpace(req.Username)
	username = strings.TrimPrefix(username, "@")
	if !usernameRegex.MatchString(username) {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_username",
			"message": "Usernames must be 3-30 characters long and contain only letters, numbers, and dots.",
		})
		return
	}

	// Check availability
	avail, err := h.queries.CheckUsernameAvailable(r.Context(), db.CheckUsernameAvailableParams{
		Username:      username,
		ExcludeUserID: user.ID,
	})
	if err != nil || !avail {
		respondJSON(w, http.StatusConflict, map[string]string{
			"error":   "username_taken",
			"message": "This username is already taken. Please choose another one.",
		})
		return
	}

	// Fetch current user record to verify temp password requirements
	fullUser, err := h.queries.GetUserByID(r.Context(), user.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	var newPasswordHash pgtype.Text
	newPass := strings.TrimSpace(req.NewPassword)
	if fullUser.TempPasswordHash.Valid && (!fullUser.PasswordHash.Valid || fullUser.PasswordHash.String == "") {
		if len(newPass) < 8 {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "password_too_short",
				"message": "Password must be at least 8 characters long.",
			})
			return
		}
		hash, err := authz.HashPassword(newPass)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
		newPasswordHash = pgtype.Text{String: hash, Valid: true}
	} else if newPass != "" {
		if len(newPass) < 8 {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "password_too_short",
				"message": "Password must be at least 8 characters long.",
			})
			return
		}
		hash, err := authz.HashPassword(newPass)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
		newPasswordHash = pgtype.Text{String: hash, Valid: true}
	}

	var avatarURL pgtype.Text
	if strings.TrimSpace(req.AvatarURL) != "" {
		avatarURL = pgtype.Text{String: strings.TrimSpace(req.AvatarURL), Valid: true}
	}

	var updatedUser db.User
	if h.dbPool != nil {
		tx, err := h.dbPool.Begin(r.Context())
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
		defer tx.Rollback(r.Context())
		qtx := h.queries.WithTx(tx)
		updatedUser, err = qtx.CompleteUserOnboarding(r.Context(), db.CompleteUserOnboardingParams{
			ID:           user.ID,
			Name:         name,
			Username:     pgtype.Text{String: username, Valid: true},
			AvatarUrl:    avatarURL,
			PasswordHash: newPasswordHash,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
	} else {
		var err error
		updatedUser, err = h.queries.CompleteUserOnboarding(r.Context(), db.CompleteUserOnboardingParams{
			ID:           user.ID,
			Name:         name,
			Username:     pgtype.Text{String: username, Valid: true},
			AvatarUrl:    avatarURL,
			PasswordHash: newPasswordHash,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"user": map[string]interface{}{
			"id":           updatedUser.ID,
			"name":         updatedUser.Name,
			"email":        updatedUser.Email,
			"username":     updatedUser.Username.String,
			"avatar_url":   updatedUser.AvatarUrl.String,
			"is_onboarded": updatedUser.IsOnboarded,
		},
	})
}

// UploadAvatar decodes, validates, crops/resizes, and stores user avatar in 4 sizes.
func (h *OnboardingHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	fileReader, err := extractImageReader(r)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_file", "message": err.Error()})
		return
	}

	img, err := DecodeAndValidateImage(fileReader)
	if err != nil {
		if errors.Is(err, ErrSVGNotAllowed) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "svg_not_allowed",
				"message": "SVG files are not supported for profile pictures. Please use PNG, JPG, or WebP.",
			})
			return
		}
		if errors.Is(err, ErrFileTooLarge) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "file_too_large",
				"message": "Image exceeds 20 MB limit. Please choose a smaller image.",
			})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_image",
			"message": "Invalid image format. Supported formats are PNG, JPG, and WebP.",
		})
		return
	}

	userIDStr := pgUUIDToString(user.ID)
	keyPrefix := "avatars/" + userIDStr
	_, err = GenerateAndStoreImageVariants(r.Context(), h.storage, keyPrefix, img)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage_error", "message": err.Error()})
		return
	}

	avatarURL := "/api/v1/users/avatar/" + userIDStr + "/512.webp"
	_ = h.queries.UpdateUserAvatar(r.Context(), db.UpdateUserAvatarParams{
		ID:        user.ID,
		AvatarUrl: pgtype.Text{String: avatarURL, Valid: true},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "ok",
		"avatar_url": avatarURL,
		"variants": map[string]string{
			"512": "/api/v1/users/avatar/" + userIDStr + "/512.webp",
			"256": "/api/v1/users/avatar/" + userIDStr + "/256.webp",
			"128": "/api/v1/users/avatar/" + userIDStr + "/128.webp",
			"64":  "/api/v1/users/avatar/" + userIDStr + "/64.webp",
		},
	})
}

// GetAvatar serves the stored avatar variant directly.
func (h *OnboardingHandler) GetAvatar(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sizeStr := chi.URLParam(r, "size")
	sizeStr = strings.TrimSuffix(sizeStr, ".webp")

	size, err := strconv.Atoi(sizeStr)
	if err != nil || (size != 512 && size != 256 && size != 128 && size != 64) {
		size = 512
	}

	storageKey := "avatars/" + id + "/" + strconv.Itoa(size) + ".webp"
	if h.storage == nil {
		http.Error(w, "storage not configured", http.StatusNotFound)
		return
	}

	rc, contentLength, err := h.storage.GetObject(r.Context(), storageKey)
	if err != nil {
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	if contentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
	}
	_, _ = io.Copy(w, rc)
}

// UploadClientPicture decodes, validates, crops/resizes, and stores client picture in 4 sizes.
func (h *OnboardingHandler) UploadClientPicture(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermClientsEdit) && !person.HasPermission(authz.PermClientsCreate) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only members with client management permissions can upload client pictures"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	clientIDStr := chi.URLParam(r, "id")
	var clientID pgtype.UUID
	if err := clientID.Scan(clientIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	// BEFORE decoding or saving any image, load the client with GetClientByID(id, active company).
	// If not found, return 404 and save nothing.
	_, err := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
		CompanyID: companyID,
		ID:        clientID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "client_not_found",
			"message": "Client not found in active company",
		})
		return
	}

	fileReader, err := extractImageReader(r)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_file", "message": err.Error()})
		return
	}

	img, err := DecodeAndValidateImage(fileReader)
	if err != nil {
		if errors.Is(err, ErrSVGNotAllowed) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "svg_not_allowed",
				"message": "SVG files are not supported for client pictures. Please use PNG, JPG, or WebP.",
			})
			return
		}
		if errors.Is(err, ErrFileTooLarge) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "file_too_large",
				"message": "Image exceeds 20 MB limit. Please choose a smaller image.",
			})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_image",
			"message": "Invalid image format. Supported formats are PNG, JPG, and WebP.",
		})
		return
	}

	keyPrefix := "clients/" + clientIDStr
	_, err = GenerateAndStoreImageVariants(r.Context(), h.storage, keyPrefix, img)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage_error", "message": err.Error()})
		return
	}

	pictureURL := "/api/v1/clients/" + clientIDStr + "/picture/512.webp"
	_ = h.queries.UpdateClientLogoKey(r.Context(), db.UpdateClientLogoKeyParams{
		ID:        clientID,
		LogoKey:   pgtype.Text{String: pictureURL, Valid: true},
		CompanyID: companyID,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "ok",
		"picture_url": pictureURL,
		"variants": map[string]string{
			"512": "/api/v1/clients/" + clientIDStr + "/picture/512.webp",
			"256": "/api/v1/clients/" + clientIDStr + "/picture/256.webp",
			"128": "/api/v1/clients/" + clientIDStr + "/picture/128.webp",
			"64":  "/api/v1/clients/" + clientIDStr + "/picture/64.webp",
		},
	})
}

// GetClientPicture serves the stored client picture variant directly.
func (h *OnboardingHandler) GetClientPicture(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sizeStr := chi.URLParam(r, "size")
	sizeStr = strings.TrimSuffix(sizeStr, ".webp")

	size, err := strconv.Atoi(sizeStr)
	if err != nil || (size != 512 && size != 256 && size != 128 && size != 64) {
		size = 512
	}

	storageKey := "clients/" + id + "/" + strconv.Itoa(size) + ".webp"
	if h.storage == nil {
		http.Error(w, "storage not configured", http.StatusNotFound)
		return
	}

	rc, contentLength, err := h.storage.GetObject(r.Context(), storageKey)
	if err != nil {
		http.Error(w, "picture not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	if contentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
	}
	_, _ = io.Copy(w, rc)
}

func extractImageReader(r *http.Request) (io.Reader, error) {
	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		err := r.ParseMultipartForm(MaxImageSizeBytes)
		if err != nil {
			return nil, err
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			// Try "image"
			file, _, err = r.FormFile("image")
			if err != nil {
				return nil, errors.New("missing file field in multipart request")
			}
		}
		return file, nil
	}
	return r.Body, nil
}
