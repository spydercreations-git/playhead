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
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
)

type CompanyHandler struct {
	queries *db.Queries
}

func NewCompanyHandler(queries *db.Queries) *CompanyHandler {
	return &CompanyHandler{queries: queries}
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

	// Create owner membership
	_, err = h.queries.CreateMembership(r.Context(), db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    user.ID,
		Role:      authz.RoleOwner,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to establish company ownership"})
		return
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
		if rErr == nil {
			newRoleID = roleObj.ID
			newRoleName = roleObj.Name
		} else {
			newRoleName = strings.ToLower(req.Role)
		}
	}

	if newRoleName == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_role", "message": "Unknown role"})
		return
	}

	// Last Admin guard: if demoting an Admin, company must have >1 Admin
	isTargetAdmin := strings.ToLower(targetMembership.Role) == "admin" || (targetMembership.RoleName.Valid && strings.ToLower(targetMembership.RoleName.String) == "admin")
	isNewAdmin := strings.ToLower(newRoleName) == "admin"

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

	targetMembership, err := h.queries.GetMembership(r.Context(), db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    targetUserID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	// Last Admin guard: if removing an Admin, company must have >1 Admin
	isTargetAdmin := strings.ToLower(targetMembership.Role) == "admin" || (targetMembership.RoleName.Valid && strings.ToLower(targetMembership.RoleName.String) == "admin")
	if isTargetAdmin {
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

	respondJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

var nonAlphanumericRegex = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonAlphanumericRegex.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
