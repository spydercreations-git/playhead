package handler

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

type ClientHandler struct {
	queries *db.Queries
	mailer  *mailer.Mailer
	dbPool  *pgxpool.Pool
}

func NewClientHandler(queries *db.Queries, mailer *mailer.Mailer) *ClientHandler {
	return &ClientHandler{
		queries: queries,
		mailer:  mailer,
	}
}

func (h *ClientHandler) SetPool(pool *pgxpool.Pool) {
	h.dbPool = pool
}

type CreateClientPersonInput struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type CreateClientContactInput struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	DefaultLevel string `json:"default_level"` // none, viewer, commenter, uploader, full
	CanDownload  *bool  `json:"can_download"`
}

type CreateClientRequest struct {
	Name                string                     `json:"name"`
	Website             string                     `json:"website"`
	Notes               string                     `json:"notes"`
	LogoKey             string                     `json:"logo_key"`
	Contacts            []CreateClientContactInput `json:"contacts"`
	People              []CreateClientPersonInput  `json:"people"`
	SendInviteEmailsNow *bool                      `json:"send_invite_emails_now"`
	EmailOnboarding     bool                       `json:"email_onboarding"`
}

var clientEmailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

func isValidClientEmail(email string) bool {
	if len(email) < 5 || len(email) > 254 {
		return false
	}
	return clientEmailRegex.MatchString(email)
}

func generateSecureTempPassword() string {
	const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$"
	b := make([]byte, 14)
	for i := range b {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		b[i] = chars[num.Int64()]
	}
	return string(b)
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

	// Extract and validate people
	var rawPeople []CreateClientPersonInput
	if len(req.People) > 0 {
		rawPeople = req.People
	} else if len(req.Contacts) > 0 {
		for _, c := range req.Contacts {
			rawPeople = append(rawPeople, CreateClientPersonInput{
				Name:  c.Name,
				Email: c.Email,
			})
		}
	}

	seenEmails := make(map[string]bool)
	type personToSave struct {
		Name  string
		Email string
	}
	var peopleToSave []personToSave

	for _, p := range rawPeople {
		trimmedName := strings.TrimSpace(p.Name)
		trimmedEmail := strings.TrimSpace(p.Email)
		// Empty row allowed if both fields are blank
		if trimmedName == "" && trimmedEmail == "" {
			continue
		}

		normalizedEmail := authz.NormalizeEmail(trimmedEmail)
		if !isValidClientEmail(normalizedEmail) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "invalid_email",
				"message": "Enter a full email address: " + trimmedEmail,
			})
			return
		}

		if seenEmails[normalizedEmail] {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "duplicate_email",
				"message": "Duplicate email address: " + normalizedEmail,
			})
			return
		}
		seenEmails[normalizedEmail] = true

		if trimmedName == "" {
			trimmedName = strings.Split(normalizedEmail, "@")[0]
		}

		peopleToSave = append(peopleToSave, personToSave{
			Name:  trimmedName,
			Email: normalizedEmail,
		})
	}

	sendInviteEmails := true
	if req.SendInviteEmailsNow != nil {
		sendInviteEmails = *req.SendInviteEmailsNow
	}

	var tx pgx.Tx
	qtx := h.queries
	if h.dbPool != nil {
		var txErr error
		tx, txErr = h.dbPool.Begin(r.Context())
		if txErr != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to begin transaction"})
			return
		}
		defer tx.Rollback(r.Context())
		qtx = h.queries.WithTx(tx)
	}

	client, err := qtx.CreateClient(r.Context(), db.CreateClientParams{
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

	if strings.TrimSpace(req.LogoKey) != "" {
		updatedClient, uErr := qtx.UpdateClient(r.Context(), db.UpdateClientParams{
			ID:      client.ID,
			LogoKey: pgtype.Text{String: strings.TrimSpace(req.LogoKey), Valid: true},
		})
		if uErr == nil {
			client = updatedClient
		}
	}

	companyName := "Workspace"
	comp, cErr := qtx.GetCompanyByID(r.Context(), companyID)
	if cErr == nil && comp.Name != "" {
		companyName = comp.Name
	}

	type emailItem struct {
		to           string
		name         string
		clientName   string
		companyName  string
		tempPassword string
	}
	var emailsToSend []emailItem

	for _, p := range peopleToSave {
		// Look up or create user for this person
		var targetUserID pgtype.UUID
		u, uErr := qtx.GetUserByEmail(r.Context(), p.Email)
		if uErr == nil && u.ID.Valid {
			targetUserID = u.ID
		} else {
			newUser, createErr := qtx.CreateUser(r.Context(), db.CreateUserParams{
				Email:        p.Email,
				Name:         p.Name,
				PasswordHash: pgtype.Text{Valid: false},
				GoogleID:     pgtype.Text{Valid: false},
			})
			if createErr != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create user for client person"})
				return
			}
			_ = qtx.VerifyUserEmail(r.Context(), newUser.ID)
			targetUserID = newUser.ID
		}

		// Save contact: default_level = "none", can_download = true
		_, err = qtx.CreateClientContact(r.Context(), db.CreateClientContactParams{
			CompanyID:    companyID,
			ClientID:     client.ID,
			Name:         p.Name,
			Email:        p.Email,
			DefaultLevel: authz.LevelNone,
			CanDownload:  true,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create client contact"})
			return
		}
		_ = qtx.LinkClientContactsToUser(r.Context(), db.LinkClientContactsToUserParams{
			UserID: targetUserID,
			Email:  p.Email,
		})

		if sendInviteEmails {
			tempPassword := generateSecureTempPassword()
			tempHash, hErr := authz.HashPassword(tempPassword)
			if hErr == nil {
				_ = qtx.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
					ID:                    targetUserID,
					TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
					TempPasswordExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
				})
			}
			emailsToSend = append(emailsToSend, emailItem{
				to:           p.Email,
				name:         p.Name,
				clientName:   client.Name,
				companyName:  companyName,
				tempPassword: tempPassword,
			})
		}
	}

	if tx != nil {
		if err := tx.Commit(r.Context()); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to commit client creation"})
			return
		}
	}

	// Dispatch queued emails only after successful database commit
	if h.mailer != nil && len(emailsToSend) > 0 {
		for _, item := range emailsToSend {
			_ = h.mailer.SendClientPersonInviteEmail(item.to, item.name, item.clientName, item.companyName, item.tempPassword, "")
		}
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

	// Addition 5: client delete needs a full-access role (CEO, COO, CFO, CSO, Design Head). Others get 403.
	if !person.IsFullAccess() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only full-access roles can delete a client"})
		return
	}

	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	// Verify client exists
	_, err := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
		CompanyID: companyID,
		ID:        clientID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "client_not_found"})
		return
	}

	// Addition 4: Cascading trash with delete_batch_id
	batchID := uuid.New()
	batchPgUUID := pgtype.UUID{Bytes: batchID, Valid: true}

	// 1. Soft delete client with batch
	_ = h.queries.SoftDeleteClientWithBatch(r.Context(), db.SoftDeleteClientWithBatchParams{
		CompanyID:     companyID,
		ID:            clientID,
		DeleteBatchID: batchPgUUID,
	})

	// 2. Soft delete active projects under client with batch
	deletedProjectIDs, _ := h.queries.SoftDeleteProjectsByClientWithBatch(r.Context(), db.SoftDeleteProjectsByClientWithBatchParams{
		CompanyID:     companyID,
		ClientID:      clientID,
		DeleteBatchID: batchPgUUID,
	})

	// 3. Soft delete active items under those projects with batch
	for _, pid := range deletedProjectIDs {
		_ = h.queries.SoftDeleteItemsByProjectWithBatch(r.Context(), db.SoftDeleteItemsByProjectWithBatchParams{
			CompanyID:     companyID,
			ProjectID:     pid,
			DeleteBatchID: batchPgUUID,
		})
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Restore restores a client and its batched projects/items from Trash (Addition 4 & 5)
func (h *ClientHandler) Restore(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	// Addition 5: client restore needs a full-access role
	if !person.IsFullAccess() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only full-access roles can restore a client"})
		return
	}

	var clientID pgtype.UUID
	if err := clientID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_id"})
		return
	}

	client, err := h.queries.GetClientByIDAnyStatus(r.Context(), db.GetClientByIDAnyStatusParams{
		CompanyID: companyID,
		ID:        clientID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "client_not_found"})
		return
	}
	if !client.DeletedAt.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "client_not_in_trash"})
		return
	}

	// Restore client
	_ = h.queries.RestoreClientWithBatch(r.Context(), db.RestoreClientWithBatchParams{
		CompanyID: companyID,
		ID:        clientID,
	})

	// Addition 4: restoring anything restores only items with the same delete_batch_id.
	// Projects deleted separately before the client keep their own batch and stay in Trash.
	if client.DeleteBatchID.Valid {
		_ = h.queries.RestoreProjectsByBatch(r.Context(), db.RestoreProjectsByBatchParams{
			CompanyID:     companyID,
			DeleteBatchID: client.DeleteBatchID,
		})
		_ = h.queries.RestoreItemsByBatch(r.Context(), db.RestoreItemsByBatchParams{
			CompanyID:     companyID,
			DeleteBatchID: client.DeleteBatchID,
		})
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "restored"})
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

// ResendContactInvite re-generates a temporary password and re-sends the invite email to a client contact.
func (h *ClientHandler) ResendContactInvite(w http.ResponseWriter, r *http.Request) {
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

	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermClientsEdit) && !authz.IsAtLeast(person.Role, authz.RoleManager) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only leaders and managers can resend client contact invitations",
		})
		return
	}

	contactIDStr := chi.URLParam(r, "id")
	var contactID pgtype.UUID
	if err := contactID.Scan(contactIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_contact_id"})
		return
	}

	contact, err := h.queries.GetClientContactByID(r.Context(), contactID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "contact_not_found",
			"message": "Contact not found",
		})
		return
	}

	if contact.CompanyID != companyID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Contact does not belong to active company",
		})
		return
	}

	client, err := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
		CompanyID: companyID,
		ID:        contact.ClientID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "client_not_found"})
		return
	}

	company, err := h.queries.GetCompanyByID(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "company_not_found"})
		return
	}

	// 1. Generate NEW temporary password (at least 12 characters, expires in 7 days)
	newTempPassword := generateSecureTempPassword()
	newTempHash, err := authz.HashPassword(newTempPassword)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	// 2. Fetch or provision user record
	contactEmail := authz.NormalizeEmail(contact.Email)
	targetUser, err := h.queries.GetUserByEmail(r.Context(), contactEmail)
	if err != nil {
		targetUser, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email: contactEmail,
			Name:  contact.Name,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
	}

	// 3. Set temporary password (old one stops working immediately)
	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    targetUser.ID,
		TempPasswordHash:      pgtype.Text{String: newTempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	// 4. Send email again
	_ = h.mailer.SendClientPersonInviteEmail(contact.Email, contact.Name, client.Name, company.Name, newTempPassword, "")

	_ = user
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "ok",
		"message":       "Invitation resent successfully",
		"temp_password": newTempPassword,
	})
}
