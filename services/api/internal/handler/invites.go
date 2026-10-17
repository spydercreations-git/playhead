package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
)

type InviteHandler struct {
	queries *db.Queries
	mailer  *mailer.Mailer
}

func NewInviteHandler(queries *db.Queries, mailer *mailer.Mailer) *InviteHandler {
	return &InviteHandler{queries: queries, mailer: mailer}
}

type CreateInviteRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func (h *InviteHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyIDStr := chi.URLParam(r, "company_id")
	var companyID pgtype.UUID
	if err := companyID.Scan(companyIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_company_id"})
		return
	}

	activeCompID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !activeCompID.Valid || activeCompID != companyID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cannot manage invitations of another company",
		})
		return
	}

	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamInvite) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have permission to invite members (team.invite)",
		})
		return
	}

	var req CreateInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email", "message": "Valid email address is required"})
		return
	}

	rawRole := strings.TrimSpace(req.Role)
	if rawRole == "" {
		rawRole = "Editor"
	}
	lowerRole := strings.ToLower(rawRole)
	if authz.IsDeprecatedRole(lowerRole) {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_role",
			"message": "Invite role cannot be a deprecated role name",
		})
		return
	}

	// Reject any role name that does not exist in the roles table (no free text roles)
	roleObj, err := h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
		CompanyID: companyID,
		Name:      rawRole,
	})
	if err != nil {
		// try title-case / capitalized
		roleCapitalized := strings.ToUpper(rawRole[:1]) + strings.ToLower(rawRole[1:])
		roleObj, err = h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
			CompanyID: companyID,
			Name:      roleCapitalized,
		})
	}
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_role",
			"message": "Role does not exist in the roles table",
		})
		return
	}

	// Role escalation: only executive roles (CEO/COO) can invite someone to an executive role
	if (strings.EqualFold(roleObj.Name, "admin") || authz.IsFullAccess(roleObj.Name)) &&
		(!strings.EqualFold(person.Role, "admin") && !authz.CanChangeRoles(person.Role)) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only CEO or COO can invite someone to an executive role",
		})
		return
	}

	role := roleObj.Name

	company, err := h.queries.GetCompanyByID(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "company_not_found"})
		return
	}

	// Trial Seat Limit Enforcement: max 5 seats during 14-day trial
	if company.Plan == plans.PlanTrial {
		memberCount, err := h.queries.CountCompanyMembers(r.Context(), companyID)
		if err == nil {
			activeInvites, _ := h.queries.GetInvitesForCompany(r.Context(), companyID)
			totalSeatsCommitted := int(memberCount) + len(activeInvites)
			if totalSeatsCommitted >= plans.TrialMaxSeats {
				respondJSON(w, http.StatusBadRequest, map[string]string{
					"error":   "trial_seat_limit",
					"message": "Your 14-day trial includes up to 5 team seats. Please upgrade to invite more members.",
				})
				return
			}
		}
	}

	// Provision or fetch user record to assign temporary password
	invitedUser, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		invitedUser, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email: email,
			Name:  strings.Split(email, "@")[0],
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to provision user for invite"})
			return
		}
	}

	// Generate secure temporary password (at least 12 characters, expires in 7 days)
	tempPassword := generateSecureTempPassword()
	tempPasswordHash, err := authz.HashPassword(tempPassword)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    invitedUser.ID,
		TempPasswordHash:      pgtype.Text{String: tempPasswordHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	// Generate 7-day token
	rawToken, err := authz.GenerateSecureToken(32)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	tokenHash := authz.HashToken(rawToken)
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // 7-day expiration per spec requirement

	invite, err := h.queries.CreateInvite(r.Context(), db.CreateInviteParams{
		CompanyID: companyID,
		Email:     email,
		Role:      role,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create invitation"})
		return
	}

	// Send transactional invite email with temporary password & Google sign-in
	_ = h.mailer.SendTeamInvite(email, company.Name, user.Name, rawToken, tempPassword)

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"status":        "created",
		"invite":        invite,
		"token":         rawToken, // Provided in response for easy testing / copy link
		"temp_password": tempPassword,
	})
}

func (h *InviteHandler) GetInvite(w http.ResponseWriter, r *http.Request) {
	rawToken := chi.URLParam(r, "token")
	tokenHash := authz.HashToken(strings.TrimSpace(rawToken))

	invite, err := h.queries.GetInviteByTokenHash(r.Context(), tokenHash)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "invite_not_found",
			"message": "This invitation does not exist, has expired, or has already been accepted.",
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"company_name": invite.CompanyName,
		"email":        invite.Email,
		"role":         invite.Role,
		"expires_at":   invite.ExpiresAt.Time,
	})
}

func (h *InviteHandler) Accept(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	rawToken := chi.URLParam(r, "token")
	tokenHash := authz.HashToken(strings.TrimSpace(rawToken))

	invite, err := h.queries.GetInviteByTokenHash(r.Context(), tokenHash)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_or_expired_invite",
			"message": "This invitation link is invalid or has expired.",
		})
		return
	}

	// Spec requirement: the invite can only be accepted by an account with the same email it was sent to
	if !strings.EqualFold(strings.TrimSpace(user.Email), strings.TrimSpace(invite.Email)) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "email_mismatch",
			"message": "This invitation was sent to " + invite.Email + ". Please sign in with that account to accept.",
		})
		return
	}

	// Add membership
	_, err = h.queries.CreateMembership(r.Context(), db.CreateMembershipParams{
		CompanyID: invite.CompanyID,
		UserID:    user.ID,
		Role:      invite.Role,
	})
	if err != nil && !strings.Contains(err.Error(), "duplicate key") {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "server_error",
			"message": "Failed to add user to workspace",
		})
		return
	}

	// Mark invite accepted
	_ = h.queries.MarkInviteAccepted(r.Context(), invite.ID)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "accepted",
		"company_id": invite.CompanyID,
	})
}

func (h *InviteHandler) ListForCompany(w http.ResponseWriter, r *http.Request) {
	companyIDStr := chi.URLParam(r, "company_id")
	var companyID pgtype.UUID
	if err := companyID.Scan(companyIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_company_id"})
		return
	}

	activeCompID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !activeCompID.Valid || activeCompID != companyID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cannot list invitations of another company",
		})
		return
	}

	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamInvite) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "You do not have permission to list invitations (team.invite)",
		})
		return
	}

	invites, err := h.queries.GetInvitesForCompany(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"invites": invites,
	})
}

// Resend re-issues an invitation with a fresh temporary password and sends the email again.
func (h *InviteHandler) Resend(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyIDStr := chi.URLParam(r, "company_id")
	var companyID pgtype.UUID
	if err := companyID.Scan(companyIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_company_id"})
		return
	}

	activeCompID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !activeCompID.Valid || activeCompID != companyID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cannot manage invitations of another company",
		})
		return
	}

	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamInvite) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only leaders and managers can resend invitations",
		})
		return
	}

	inviteIDStr := chi.URLParam(r, "id")
	var inviteID pgtype.UUID
	if err := inviteID.Scan(inviteIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_invite_id"})
		return
	}

	invite, err := h.queries.GetInviteByID(r.Context(), db.GetInviteByIDParams{
		ID:        inviteID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "invite_not_found",
			"message": "Invitation not found",
		})
		return
	}

	company, err := h.queries.GetCompanyByID(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "company_not_found"})
		return
	}

	// 1. Generate NEW temporary password (invalidates old temp password immediately)
	newTempPassword := generateSecureTempPassword()
	newTempHash, err := authz.HashPassword(newTempPassword)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	// 2. Look up or provision user
	invitedUser, err := h.queries.GetUserByEmail(r.Context(), invite.Email)
	if err != nil {
		invitedUser, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email: invite.Email,
			Name:  strings.Split(invite.Email, "@")[0],
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
			return
		}
	}

	// Update user's temporary password in DB (old temp password immediately stops working)
	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    invitedUser.ID,
		TempPasswordHash:      pgtype.Text{String: newTempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	// 3. Generate new 7-day invite token and update invite record
	rawToken, err := authz.GenerateSecureToken(32)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}
	tokenHash := authz.HashToken(rawToken)

	_, err = h.queries.UpdateInviteToken(r.Context(), db.UpdateInviteTokenParams{
		ID:        invite.ID,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to update invitation"})
		return
	}

	// 4. Send email again with the new temporary password
	_ = h.mailer.SendTeamInvite(invite.Email, company.Name, user.Name, rawToken, newTempPassword)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "ok",
		"message":       "Invitation resent successfully",
		"token":         rawToken,
		"temp_password": newTempPassword,
	})
}
