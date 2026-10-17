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
	if lowerRole == "owner" || lowerRole == "member" || lowerRole == "guest" {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_role",
			"message": "Invite role cannot be owner, member, or guest",
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

	// Send transactional invite email
	_ = h.mailer.SendTeamInvite(email, company.Name, user.Name, rawToken)

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"status":  "created",
		"invite":  invite,
		"token":   rawToken, // Provided in response for easy testing / copy link
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
