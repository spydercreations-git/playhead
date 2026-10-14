package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

type ClientHandler struct {
	queries *db.Queries
	mailer  *mailer.Mailer
}

func NewClientHandler(queries *db.Queries, mailer *mailer.Mailer) *ClientHandler {
	return &ClientHandler{
		queries: queries,
		mailer:  mailer,
	}
}

type CreateClientContactInput struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	DefaultLevel string `json:"default_level"` // none, viewer, commenter, uploader, full
	CanDownload  *bool  `json:"can_download"`
}

type CreateClientRequest struct {
	Name             string                     `json:"name"`
	Website          string                     `json:"website"`
	Notes            string                     `json:"notes"`
	LogoKey          string                     `json:"logo_key"`
	Contacts         []CreateClientContactInput `json:"contacts"`
	EmailOnboarding  bool                       `json:"email_onboarding"`
}

func (h *ClientHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetAuthenticatedUser(r.Context())
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Check permission clients.create
	if !person.HasPermission(authz.PermClientsCreate) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only members with clients.create can create clients"})
		return
	}

	var req CreateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required", "message": "Client name is required"})
		return
	}

	client, err := h.queries.CreateClient(r.Context(), db.CreateClientParams{
		CompanyID: companyID,
		Name:      name,
		Website:   pgtype.Text{String: strings.TrimSpace(req.Website), Valid: strings.TrimSpace(req.Website) != ""},
		Notes:     pgtype.Text{String: strings.TrimSpace(req.Notes), Valid: strings.TrimSpace(req.Notes) != ""},
		CreatedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create client"})
		return
	}

	// Create initial contacts if provided
	for _, c := range req.Contacts {
		contactEmail := authz.NormalizeEmail(c.Email)
		if contactEmail == "" || !strings.Contains(contactEmail, "@") {
			continue
		}
		contactName := strings.TrimSpace(c.Name)
		if contactName == "" {
			contactName = strings.Split(contactEmail, "@")[0]
		}
		level := strings.ToLower(strings.TrimSpace(c.DefaultLevel))
		if level == "" {
			level = authz.LevelNone
		}
		canDownload := true
		if c.CanDownload != nil {
			canDownload = *c.CanDownload
		}

		_, _ = h.queries.CreateClientContact(r.Context(), db.CreateClientContactParams{
			CompanyID:    companyID,
			ClientID:     client.ID,
			Name:         contactName,
			Email:        contactEmail,
			DefaultLevel: level,
			CanDownload:  canDownload,
		})
	}

	respondJSON(w, http.StatusCreated, client)
}

func (h *ClientHandler) List(w http.ResponseWriter, r *http.Request) {
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Only Admin and Manager can see clients list
	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Editors and clients cannot view clients list"})
		return
	}

	clients, err := h.queries.ListClients(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"clients": clients,
	})
}

func (h *ClientHandler) Get(w http.ResponseWriter, r *http.Request) {
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Only Admin and Manager can view client details
	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	client, err := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
		CompanyID: companyID,
		ID:        clientID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "client_not_found"})
		return
	}

	contacts, _ := h.queries.ListClientContacts(r.Context(), client.ID)
	projects, _ := h.queries.ListProjectsForAdminOrManager(r.Context(), db.ListProjectsForAdminOrManagerParams{
		CompanyID: companyID,
		ClientID:  client.ID,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"client":   client,
		"contacts": contacts,
		"projects": projects,
	})
}

type UpdateClientRequest struct {
	Name    *string `json:"name"`
	Website *string `json:"website"`
	Notes   *string `json:"notes"`
	LogoKey *string `json:"logo_key"`
}

func (h *ClientHandler) Update(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if !person.HasPermission(authz.PermClientsEdit) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only members with clients.edit can update clients"})
		return
	}

	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	var req UpdateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var nameText pgtype.Text
	if req.Name != nil {
		nameText = pgtype.Text{String: strings.TrimSpace(*req.Name), Valid: true}
	}
	var websiteText pgtype.Text
	if req.Website != nil {
		websiteText = pgtype.Text{String: strings.TrimSpace(*req.Website), Valid: true}
	}
	var notesText pgtype.Text
	if req.Notes != nil {
		notesText = pgtype.Text{String: strings.TrimSpace(*req.Notes), Valid: true}
	}
	var logoText pgtype.Text
	if req.LogoKey != nil {
		logoText = pgtype.Text{String: strings.TrimSpace(*req.LogoKey), Valid: true}
	}

	updated, err := h.queries.UpdateClient(r.Context(), db.UpdateClientParams{
		CompanyID: companyID,
		ID:        clientID,
		Name:      nameText,
		Website:   websiteText,
		Notes:     notesText,
		LogoKey:   logoText,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

func (h *ClientHandler) Delete(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Deleting client requires clients.delete permission
	if !person.HasPermission(authz.PermClientsDelete) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only members with clients.delete can delete a client"})
		return
	}

	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	// Soft-delete client and soft-delete all its projects
	_ = h.queries.SoftDeleteProjectsByClient(r.Context(), db.SoftDeleteProjectsByClientParams{
		CompanyID: companyID,
		ClientID:  clientID,
	})
	_ = h.queries.SoftDeleteClient(r.Context(), db.SoftDeleteClientParams{
		CompanyID: companyID,
		ID:        clientID,
	})

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Contacts handlers
func (h *ClientHandler) ListContacts(w http.ResponseWriter, r *http.Request) {
	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	contacts, err := h.queries.ListClientContacts(r.Context(), clientID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"contacts": contacts,
	})
}

func (h *ClientHandler) AddContact(w http.ResponseWriter, r *http.Request) {
	role, _ := middleware.GetUserRole(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	var req CreateClientContactInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email", "message": "Valid email is required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	level := strings.ToLower(strings.TrimSpace(req.DefaultLevel))
	if level == "" {
		level = authz.LevelNone
	}

	canDownload := true
	if req.CanDownload != nil {
		canDownload = *req.CanDownload
	}

	contact, err := h.queries.CreateClientContact(r.Context(), db.CreateClientContactParams{
		CompanyID:    companyID,
		ClientID:     clientID,
		Name:         name,
		Email:        email,
		DefaultLevel: level,
		CanDownload:  canDownload,
	})
	if err != nil {
		respondJSON(w, http.StatusConflict, map[string]string{"error": "contact_exists", "message": "Contact with this email already exists for this client"})
		return
	}

	respondJSON(w, http.StatusCreated, contact)
}

type UpdateContactRequest struct {
	Name         *string `json:"name"`
	DefaultLevel *string `json:"default_level"`
	CanDownload  *bool   `json:"can_download"`
}

func (h *ClientHandler) UpdateContact(w http.ResponseWriter, r *http.Request) {
	role, _ := middleware.GetUserRole(r.Context())
	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var contactID pgtype.UUID
	if err := contactID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_contact_id"})
		return
	}

	var req UpdateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var nameText pgtype.Text
	if req.Name != nil {
		nameText = pgtype.Text{String: strings.TrimSpace(*req.Name), Valid: true}
	}
	var levelText pgtype.Text
	if req.DefaultLevel != nil {
		levelText = pgtype.Text{String: strings.ToLower(strings.TrimSpace(*req.DefaultLevel)), Valid: true}
	}
	var canDownloadBool pgtype.Bool
	if req.CanDownload != nil {
		canDownloadBool = pgtype.Bool{Bool: *req.CanDownload, Valid: true}
	}

	contact, err := h.queries.UpdateClientContact(r.Context(), db.UpdateClientContactParams{
		ID:           contactID,
		Name:         nameText,
		DefaultLevel: levelText,
		CanDownload:  canDownloadBool,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, contact)
}

func (h *ClientHandler) DeleteContact(w http.ResponseWriter, r *http.Request) {
	role, _ := middleware.GetUserRole(r.Context())
	if role != authz.RoleAdmin && role != authz.RoleManager && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var contactID pgtype.UUID
	if err := contactID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_contact_id"})
		return
	}

	if err := h.queries.DeleteClientContact(r.Context(), contactID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
