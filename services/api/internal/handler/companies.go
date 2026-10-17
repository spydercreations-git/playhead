package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
)

type CompanyHandler struct {
	queries *db.Queries
	rdb     *redis.Client
}

func NewCompanyHandler(queries *db.Queries) *CompanyHandler {
	return &CompanyHandler{queries: queries}
}

func (h *CompanyHandler) SetRedisClient(r *redis.Client) {
	h.rdb = r
}

type CreateCompanyRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

func (h *CompanyHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Spec requirement: email verification required before creating a company
	if !user.EmailVerifiedAt.Valid {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "email_unverified",
			"message": "Please verify your email address before creating a company.",
		})
		return
	}

	var req CreateCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_name", "message": "Company name is required"})
		return
	}

	slug := slugify(req.Slug)
	if slug == "" {
		slug = slugify(name)
	}

	// Ensure unique slug
	if _, err := h.queries.GetCompanyBySlug(r.Context(), slug); err == nil {
		slug = slug + "-" + time.Now().Format("0215")
	}

	// 14-day free trial defaults
	trialEndsAt := time.Now().Add(14 * 24 * time.Hour)
	storageLimit := plans.CalculateStorageLimit(plans.PlanTrial, 1, 0)

	company, err := h.queries.CreateCompany(r.Context(), db.CreateCompanyParams{
		Name:              name,
		Slug:              slug,
		Plan:              plans.PlanTrial,
		Status:            "trialing",
		TrialEndsAt:       pgtype.Timestamptz{Time: trialEndsAt, Valid: true},
		StorageLimitBytes: storageLimit,
		Seats:             1,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create company"})
		return
	}

	adminRole, _ := SeedDefaultCompanyRoles(r.Context(), h.queries, company.ID)

	// Create admin membership for the founding user
	_, err = h.queries.CreateMembership(r.Context(), db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    user.ID,
		Role:      "admin",
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to establish company ownership"})
		return
	}
	if adminRole.ID.Valid {
		_ = h.queries.UpdateMembershipRole(r.Context(), db.UpdateMembershipRoleParams{
			CompanyID: company.ID,
			UserID:    user.ID,
			Role:      "admin",
			RoleID:    adminRole.ID,
		})
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"status":  "created",
		"company": company,
	})
}

func (h *CompanyHandler) GetMembers(w http.ResponseWriter, r *http.Request) {
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
			"message": "Access to different company is forbidden",
		})
		return
	}

	userRole, okRole := middleware.GetUserRole(r.Context())
	if !okRole || userRole == "" {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Team membership required to view members",
		})
		return
	}

	members, err := h.queries.GetMembershipsForCompany(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to load members"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"members": members,
	})
}

type UpdateMemberRoleRequest struct {
	Role   string `json:"role"`
	RoleID string `json:"role_id"`
}

func (h *CompanyHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamChangeRoles) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only members with team.change_roles can change roles",
		})
		return
	}

	companyIDStr := chi.URLParam(r, "company_id")
	targetUserIDStr := chi.URLParam(r, "user_id")

	var companyID, targetUserID pgtype.UUID
	if err := companyID.Scan(companyIDStr); err != nil || targetUserID.Scan(targetUserIDStr) != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	activeCompID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !activeCompID.Valid || activeCompID != companyID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cannot manage members of another company",
		})
		return
	}

	user, okUser := middleware.GetAuthenticatedUser(r.Context())
	if !okUser {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Nobody can change their own role
	if targetUserID == user.ID {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_change_own_role",
			"message": "You cannot change your own role",
		})
		return
	}

	targetMembership, err := h.queries.GetMembership(r.Context(), db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    targetUserID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	var req UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	rawRole := strings.ToLower(strings.TrimSpace(req.Role))
	if authz.IsDeprecatedRole(rawRole) {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_role",
			"message": "Role cannot be a deprecated role name",
		})
		return
	}

	// Resolve new role
	var newRoleID pgtype.UUID
	var newRoleName string
	if req.RoleID != "" {
		if rUUID, pErr := uuid.Parse(req.RoleID); pErr == nil {
			roleObj, rErr := h.queries.GetRoleByID(r.Context(), db.GetRoleByIDParams{
				ID:        pgtype.UUID{Bytes: rUUID, Valid: true},
				CompanyID: companyID,
			})
			if rErr == nil {
				newRoleID = roleObj.ID
				newRoleName = roleObj.Name
			}
		}
	}
	if !newRoleID.Valid && req.Role != "" {
		roleObj, rErr := h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
			CompanyID: companyID,
			Name:      req.Role,
		})
		if rErr != nil {
			roleCapitalized := strings.ToUpper(req.Role[:1]) + strings.ToLower(req.Role[1:])
			roleObj, rErr = h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
				CompanyID: companyID,
				Name:      roleCapitalized,
			})
		}
		if rErr == nil {
			newRoleID = roleObj.ID
			newRoleName = roleObj.Name
		}
	}

	// Reject any role name or id that does not exist in the roles table (no free text roles)
	if !newRoleID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_role",
			"message": "Role does not exist in the company's roles table",
		})
		return
	}

	lowerNewName := strings.ToLower(newRoleName)
	if lowerNewName == "" || lowerNewName == "owner" || lowerNewName == "member" || lowerNewName == "guest" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_role", "message": "Role cannot be owner, member, or guest"})
		return
	}

	isTargetAdmin := strings.EqualFold(targetMembership.Role, "admin") ||
		(targetMembership.RoleName.Valid && strings.EqualFold(targetMembership.RoleName.String, "admin")) ||
		authz.IsFullAccess(targetMembership.Role) ||
		(targetMembership.RoleName.Valid && authz.IsFullAccess(targetMembership.RoleName.String))
	isNewAdmin := strings.EqualFold(newRoleName, "admin") || authz.IsFullAccess(newRoleName)
	isCallerAdmin := strings.EqualFold(person.Role, "admin") || authz.CanChangeRoles(person.Role)

	// Role escalation: only Admins / CEO / COO can give or remove executive roles
	if !isCallerAdmin {
		if isTargetAdmin {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "forbidden",
				"message": "Only CEO or COO can remove an executive role",
			})
			return
		}
		if isNewAdmin {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "forbidden",
				"message": "Only CEO or COO can assign an executive role",
			})
			return
		}
	}

	// Last Admin guard: if demoting an Admin, company must have >1 Admin
	if isTargetAdmin && !isNewAdmin {
		adminCount, _ := h.queries.CountCompanyAdmins(r.Context(), companyID)
		if adminCount <= 1 {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "last_admin_protected",
				"message": "Cannot demote or change the last Admin in the company",
			})
			return
		}
	}

	err = h.queries.UpdateMembershipRole(r.Context(), db.UpdateMembershipRoleParams{
		CompanyID: companyID,
		UserID:    targetUserID,
		Role:      strings.ToLower(newRoleName),
		RoleID:    newRoleID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	PublishCollabRevocation(r.Context(), h.rdb, "", pgUUIDToString(targetUserID))

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *CompanyHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamChangeRoles) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only members with team.change_roles can remove members",
		})
		return
	}

	companyIDStr := chi.URLParam(r, "company_id")
	targetUserIDStr := chi.URLParam(r, "user_id")

	var companyID, targetUserID pgtype.UUID
	if err := companyID.Scan(companyIDStr); err != nil || targetUserID.Scan(targetUserIDStr) != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	activeCompID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !activeCompID.Valid || activeCompID != companyID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cannot manage members of another company",
		})
		return
	}

	user, okUser := middleware.GetAuthenticatedUser(r.Context())
	if !okUser {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Nobody can remove themselves
	if targetUserID == user.ID {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_remove_self",
			"message": "You cannot remove yourself from the company",
		})
		return
	}

	targetMembership, err := h.queries.GetMembership(r.Context(), db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    targetUserID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	// Last Admin guard and Admin-only removal: only Admins can remove an Admin
	isTargetAdmin := strings.EqualFold(targetMembership.Role, "admin") ||
		(targetMembership.RoleName.Valid && strings.EqualFold(targetMembership.RoleName.String, "admin")) ||
		authz.IsFullAccess(targetMembership.Role) ||
		(targetMembership.RoleName.Valid && authz.IsFullAccess(targetMembership.RoleName.String))

	if isTargetAdmin {
		isCallerAdmin := strings.EqualFold(person.Role, "admin") || authz.CanChangeRoles(person.Role) || person.IsFullAccess()
		if !isCallerAdmin {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "forbidden",
				"message": "Only Admins can remove an Admin",
			})
			return
		}

		adminCount, _ := h.queries.CountCompanyAdmins(r.Context(), companyID)
		if adminCount <= 1 {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "last_admin_protected",
				"message": "Cannot remove the last Admin in the company",
			})
			return
		}
	}

	err = h.queries.DeleteMembership(r.Context(), db.DeleteMembershipParams{
		CompanyID: companyID,
		UserID:    targetUserID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	PublishCollabRevocation(r.Context(), h.rdb, "", pgUUIDToString(targetUserID))

	respondJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

var nonAlphanumericRegex = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonAlphanumericRegex.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
