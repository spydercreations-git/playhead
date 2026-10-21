package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

type AdminHandler struct {
	queries *db.Queries
	mailer  *mailer.Mailer
}

func NewAdminHandler(queries *db.Queries, mailer *mailer.Mailer) *AdminHandler {
	return &AdminHandler{queries: queries, mailer: mailer}
}

// MemberResponse represents a staff or editor for the Admin page.
type MemberResponse struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	Name        string          `json:"name"`
	Username    string          `json:"username"`
	Email       string          `json:"email"`
	AvatarURL   string          `json:"avatar_url"`
	Role        string          `json:"role"`
	Title       string          `json:"title"`
	Status      string          `json:"status"`
	Permissions map[string]bool `json:"permissions"`
	CreatedAt   time.Time       `json:"created_at"`
}

// ListMembers returns all staff and editors for the company.
func (h *AdminHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	members, err := h.queries.GetMembershipsForCompany(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to list members"})
		return
	}

	tab := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tab")))

	var resp []MemberResponse
	for _, m := range members {
		// Filter clients out of Staff/Editors views if requested
		mRole := m.Role
		if strings.EqualFold(mRole, "client") && tab != "all" && tab != "clients" {
			continue
		}
		if tab == "staff" && !strings.EqualFold(mRole, "staff") && !authz.IsFullAccess(mRole) {
			continue
		}
		if tab == "editors" && !strings.EqualFold(mRole, "editor") {
			continue
		}

		permMap := make(map[string]bool)
		if len(m.Permissions) > 0 {
			_ = json.Unmarshal(m.Permissions, &permMap)
		}
		if len(permMap) == 0 {
			permMap = authz.DefaultPermissions(m.Role)
		}

		titleStr := ""
		if m.Title.Valid {
			titleStr = m.Title.String
		}

		resp = append(resp, MemberResponse{
			ID:          uuid.UUID(m.ID.Bytes),
			UserID:      uuid.UUID(m.UserID.Bytes),
			Name:        m.UserName,
			Username:    m.UserUsername.String,
			Email:       m.UserEmail,
			AvatarURL:   m.UserAvatarUrl.String,
			Role:        m.Role,
			Title:       titleStr,
			Status:      m.Status,
			Permissions: permMap,
			CreatedAt:   m.CreatedAt.Time,
		})
	}

	if resp == nil {
		resp = []MemberResponse{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"members": resp,
	})
}

type AddMemberRequest struct {
	Name        string          `json:"name"`
	Email       string          `json:"email"`
	Role        string          `json:"role"` // "Staff" or "Editor"
	Title       string          `json:"title"`
	Permissions map[string]bool `json:"permissions"`
}

// AddMember adds a staff or editor to the company and sends an invite email.
func (h *AdminHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can add team members"})
		return
	}

	var req AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email", "message": "Valid email address is required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	role := strings.TrimSpace(req.Role)
	if strings.EqualFold(role, "staff") {
		role = authz.RoleStaff
	} else if strings.EqualFold(role, "editor") {
		role = authz.RoleEditor
	} else {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_role", "message": "Role must be Staff or Editor"})
		return
	}

	// Validate permission switches
	defaults := authz.DefaultPermissions(role)
	finalPerms := make(map[string]bool)
	for k, v := range defaults {
		finalPerms[k] = v
	}

	if req.Permissions != nil {
		for k, v := range req.Permissions {
			if !authz.IsValidPermissionSwitch(k) {
				respondJSON(w, http.StatusBadRequest, map[string]string{
					"error":   "unknown_permission",
					"message": fmt.Sprintf("Unknown permission switch: %s", k),
				})
				return
			}
			// Only admins can grant admin switch
			if k == authz.PermAdmin && v && !person.IsAdmin() {
				respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can grant the admin switch"})
				return
			}
			finalPerms[k] = v
		}
	}

	// Fetch or create role record in roles table
	roleObj, err := h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
		CompanyID: companyID,
		Name:      role,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Role record not found"})
		return
	}

	// Provision or fetch user
	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		user, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email: email,
			Name:  name,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create user"})
			return
		}
	}

	// Check if already member
	existingM, err := h.queries.GetMembership(r.Context(), db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    user.ID,
	})
	if err == nil && existingM.Status != "deactivated" {
		respondJSON(w, http.StatusConflict, map[string]string{"error": "already_member", "message": "User is already an active member of this company"})
		return
	}

	// Temporary password generation
	tempPassword := generateSecureTempPassword()
	tempHash, err := authz.HashPassword(tempPassword)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}
	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    user.ID,
		TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	permsJSON, _ := json.Marshal(finalPerms)

	titleText := pgtype.Text{Valid: false}
	if strings.EqualFold(role, authz.RoleStaff) && strings.TrimSpace(req.Title) != "" {
		titleText = pgtype.Text{String: strings.TrimSpace(req.Title), Valid: true}
	}

	// If deactivated membership already existed, update it
	if err == nil && existingM.Status == "deactivated" {
		_ = h.queries.UpdateMembershipDetails(r.Context(), db.UpdateMembershipDetailsParams{
			CompanyID:   companyID,
			UserID:      user.ID,
			Role:        role,
			RoleID:      roleObj.ID,
			Title:       titleText,
			Permissions: permsJSON,
			Status:      "invited",
		})
	} else {
		_, err = h.queries.CreateMembershipWithDetails(r.Context(), db.CreateMembershipWithDetailsParams{
			CompanyID:   companyID,
			UserID:      user.ID,
			Role:        role,
			RoleID:      roleObj.ID,
			Title:       titleText,
			Permissions: permsJSON,
			Status:      "invited",
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create membership"})
			return
		}
	}

	// Create invite token
	rawToken, _ := authz.GenerateSecureToken(32)
	tokenHash := authz.HashToken(rawToken)
	inviteExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, _ = h.queries.CreateInvite(r.Context(), db.CreateInviteParams{
		CompanyID: companyID,
		Email:     email,
		Role:      role,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: inviteExpiresAt, Valid: true},
	})

	// Send invite email
	company, _ := h.queries.GetCompanyByID(r.Context(), companyID)
	companyName := "Playhead"
	if company.Name != "" {
		companyName = company.Name
	}
	_ = h.mailer.SendTeamInvite(email, companyName, actor.Name, rawToken, tempPassword)

	// Log audit action
	auditDetails, _ := json.Marshal(map[string]interface{}{
		"role":        role,
		"title":       req.Title,
		"permissions": finalPerms,
	})
	_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
		CompanyID:    companyID,
		ActorID:      actor.ID,
		TargetUserID: user.ID,
		Action:       "added",
		Details:      auditDetails,
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"status":        "created",
		"email":         email,
		"role":          role,
		"temp_password": tempPassword,
		"token":         rawToken,
	})
}

type UpdateMemberRequest struct {
	Role        *string         `json:"role"`
	Title       *string         `json:"title"`
	Permissions map[string]bool `json:"permissions"`
	Status      *string         `json:"status"` // "active" or "deactivated"
}

// UpdateMember updates title, role, permissions, or deactivation status of a member.
func (h *AdminHandler) UpdateMember(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can edit team members"})
		return
	}

	memberIDStr := chi.URLParam(r, "id")
	var memberID pgtype.UUID
	if err := memberID.Scan(memberIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	targetM, err := h.queries.GetMembershipByID(r.Context(), db.GetMembershipByIDParams{
		ID:        memberID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	var req UpdateMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	targetUserID := targetM.UserID
	targetIsActor := targetUserID == actor.ID

	// Parse current permissions
	currentPerms := make(map[string]bool)
	if len(targetM.Permissions) > 0 {
		_ = json.Unmarshal(targetM.Permissions, &currentPerms)
	}
	if len(currentPerms) == 0 {
		currentPerms = authz.DefaultPermissions(targetM.Role)
	}
	targetHadAdmin := currentPerms[authz.PermAdmin] || authz.IsLegacyAdmin(targetM.Role)

	// SAFETY RULE: Nobody can deactivate themselves
	if req.Status != nil && strings.EqualFold(*req.Status, "deactivated") && targetIsActor {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_deactivate_self",
			"message": "Nobody can deactivate themselves.",
		})
		return
	}

	// SAFETY RULE: Nobody can remove their own admin switch
	if req.Permissions != nil {
		if willHaveAdmin, specified := req.Permissions[authz.PermAdmin]; specified && !willHaveAdmin && targetIsActor {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "cannot_remove_own_admin",
				"message": "Nobody can remove their own administrator switch.",
			})
			return
		}
	}

	// Validate unknown permission switches
	if req.Permissions != nil {
		for k := range req.Permissions {
			if !authz.IsValidPermissionSwitch(k) {
				respondJSON(w, http.StatusBadRequest, map[string]string{
					"error":   "unknown_permission",
					"message": fmt.Sprintf("Unknown permission switch: %s", k),
				})
				return
			}
		}
	}

	// SAFETY RULE: Clients can never be given admin, manage_access or invite_people
	newRole := targetM.Role
	if req.Role != nil && strings.TrimSpace(*req.Role) != "" {
		newRole = strings.TrimSpace(*req.Role)
	}
	if strings.EqualFold(newRole, "client") {
		if req.Permissions != nil {
			if req.Permissions[authz.PermAdmin] || req.Permissions[authz.PermManageAccess] || req.Permissions[authz.PermInvitePeople] {
				respondJSON(w, http.StatusBadRequest, map[string]string{
					"error":   "client_permission_denied",
					"message": "Clients can never be given admin, manage_access, or invite_people.",
				})
				return
			}
		}
	}

	// Check if this action would remove or deactivate the last active admin
	willDeactivate := req.Status != nil && strings.EqualFold(*req.Status, "deactivated")
	willLoseAdmin := false
	if req.Permissions != nil {
		if val, ok := req.Permissions[authz.PermAdmin]; ok && !val && targetHadAdmin {
			willLoseAdmin = true
		}
	}
	if req.Role != nil && !strings.EqualFold(*req.Role, targetM.Role) && targetHadAdmin {
		if req.Permissions == nil || !req.Permissions[authz.PermAdmin] {
			willLoseAdmin = true
		}
	}

	if (willDeactivate || willLoseAdmin) && targetHadAdmin {
		activeAdminsCount, err := h.queries.CountActiveAdmins(r.Context(), companyID)
		if err == nil && activeAdminsCount <= 1 {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "last_admin_protection",
				"message": "The last active admin can never be deactivated or lose admin privileges.",
			})
			return
		}
	}

	// Update role if requested
	newRoleID := targetM.RoleID
	roleChanged := false
	if req.Role != nil && !strings.EqualFold(*req.Role, targetM.Role) {
		roleChanged = true
		candidateRole := strings.TrimSpace(*req.Role)
		if strings.EqualFold(candidateRole, "staff") {
			candidateRole = authz.RoleStaff
		} else if strings.EqualFold(candidateRole, "editor") {
			candidateRole = authz.RoleEditor
		} else if strings.EqualFold(candidateRole, "client") {
			candidateRole = authz.RoleClient
		}

		roleObj, err := h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
			CompanyID: companyID,
			Name:      candidateRole,
		})
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_role", "message": "Role not found"})
			return
		}
		newRole = candidateRole
		newRoleID = roleObj.ID

		// RULE: Changing someone's role (Staff <-> Editor) resets their switches to that role's defaults.
		currentPerms = authz.DefaultPermissions(newRole)
	}

	// Update permissions if provided
	if req.Permissions != nil {
		for k, v := range req.Permissions {
			currentPerms[k] = v
		}
	}

	// Update title
	newTitle := targetM.Title
	if req.Title != nil {
		if strings.TrimSpace(*req.Title) == "" {
			newTitle = pgtype.Text{Valid: false}
		} else {
			newTitle = pgtype.Text{String: strings.TrimSpace(*req.Title), Valid: true}
		}
	}

	// Update status
	newStatus := targetM.Status
	statusChanged := false
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		st := strings.ToLower(strings.TrimSpace(*req.Status))
		if st == "active" || st == "deactivated" {
			if newStatus != st {
				statusChanged = true
			}
			newStatus = st
		}
	}

	permsBytes, _ := json.Marshal(currentPerms)

	err = h.queries.UpdateMembershipDetails(r.Context(), db.UpdateMembershipDetailsParams{
		CompanyID:   companyID,
		UserID:      targetUserID,
		Role:        newRole,
		RoleID:      newRoleID,
		Title:       newTitle,
		Permissions: permsBytes,
		Status:      newStatus,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to update member"})
		return
	}

	// If deactivated, revoke sessions immediately and cancel login codes
	if newStatus == "deactivated" {
		_ = h.queries.DeleteAllSessionsForUser(r.Context(), targetUserID)
		_ = h.queries.DeleteLoginCodesForEmail(r.Context(), targetM.UserEmail)
	}

	// Record audit actions
	if roleChanged {
		det, _ := json.Marshal(map[string]string{"old_role": targetM.Role, "new_role": newRole})
		_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
			CompanyID:    companyID,
			ActorID:      actor.ID,
			TargetUserID: targetUserID,
			Action:       "role_changed",
			Details:      det,
		})
	}
	if req.Title != nil && (*req.Title != targetM.Title.String) {
		det, _ := json.Marshal(map[string]string{"title": *req.Title})
		_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
			CompanyID:    companyID,
			ActorID:      actor.ID,
			TargetUserID: targetUserID,
			Action:       "title_changed",
			Details:      det,
		})
	}
	if req.Permissions != nil {
		det, _ := json.Marshal(map[string]interface{}{"permissions": currentPerms})
		_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
			CompanyID:    companyID,
			ActorID:      actor.ID,
			TargetUserID: targetUserID,
			Action:       "permissions_changed",
			Details:      det,
		})
	}
	if statusChanged {
		action := "reactivated"
		if newStatus == "deactivated" {
			action = "deactivated"
		}
		det, _ := json.Marshal(map[string]string{"status": newStatus})
		_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
			CompanyID:    companyID,
			ActorID:      actor.ID,
			TargetUserID: targetUserID,
			Action:       action,
			Details:      det,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "ok",
		"role":        newRole,
		"title":       newTitle.String,
		"status_name": newStatus,
		"permissions": currentPerms,
	})
}

// DeactivateMember deactivates a team member (never hard deletes).
func (h *AdminHandler) DeactivateMember(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can deactivate team members"})
		return
	}

	memberIDStr := chi.URLParam(r, "id")
	var memberID pgtype.UUID
	if err := memberID.Scan(memberIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	targetM, err := h.queries.GetMembershipByID(r.Context(), db.GetMembershipByIDParams{
		ID:        memberID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	// SAFETY RULE: Nobody can deactivate themselves
	if targetM.UserID == actor.ID {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_deactivate_self",
			"message": "Nobody can deactivate themselves.",
		})
		return
	}

	// SAFETY RULE: The last active admin can never be deactivated
	permMap := make(map[string]bool)
	if len(targetM.Permissions) > 0 {
		_ = json.Unmarshal(targetM.Permissions, &permMap)
	}
	if permMap[authz.PermAdmin] || authz.IsLegacyAdmin(targetM.Role) {
		activeAdminsCount, err := h.queries.CountActiveAdmins(r.Context(), companyID)
		if err == nil && activeAdminsCount <= 1 {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "last_admin_protection",
				"message": "The last active admin can never be deactivated.",
			})
			return
		}
	}

	// Update status to deactivated
	_ = h.queries.UpdateMembershipDetails(r.Context(), db.UpdateMembershipDetailsParams{
		CompanyID:   companyID,
		UserID:      targetM.UserID,
		Role:        targetM.Role,
		RoleID:      targetM.RoleID,
		Title:       targetM.Title,
		Permissions: targetM.Permissions,
		Status:      "deactivated",
	})

	// Revoke sessions immediately
	_ = h.queries.DeleteAllSessionsForUser(r.Context(), targetM.UserID)
	_ = h.queries.DeleteLoginCodesForEmail(r.Context(), targetM.UserEmail)

	// Log audit action
	det, _ := json.Marshal(map[string]string{"reason": "admin_deactivated"})
	_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
		CompanyID:    companyID,
		ActorID:      actor.ID,
		TargetUserID: targetM.UserID,
		Action:       "deactivated",
		Details:      det,
	})

	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Member deactivated successfully",
	})
}

// ResendMemberInvite resends the onboarding invite email with a fresh temporary password.
func (h *AdminHandler) ResendMemberInvite(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can resend invitations"})
		return
	}

	memberIDStr := chi.URLParam(r, "id")
	var memberID pgtype.UUID
	if err := memberID.Scan(memberIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	targetM, err := h.queries.GetMembershipByID(r.Context(), db.GetMembershipByIDParams{
		ID:        memberID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	// Generate fresh temporary password
	tempPassword := generateSecureTempPassword()
	tempHash, err := authz.HashPassword(tempPassword)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}
	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    targetM.UserID,
		TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	// Generate fresh token
	rawToken, _ := authz.GenerateSecureToken(32)
	tokenHash := authz.HashToken(rawToken)
	inviteExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, _ = h.queries.CreateInvite(r.Context(), db.CreateInviteParams{
		CompanyID: companyID,
		Email:     targetM.UserEmail,
		Role:      targetM.Role,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: inviteExpiresAt, Valid: true},
	})

	company, _ := h.queries.GetCompanyByID(r.Context(), companyID)
	companyName := "Playhead"
	if company.Name != "" {
		companyName = company.Name
	}
	_ = h.mailer.SendTeamInvite(targetM.UserEmail, companyName, actor.Name, rawToken, tempPassword)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "resent",
		"email":         targetM.UserEmail,
		"temp_password": tempPassword,
		"token":         rawToken,
	})
}

// GetMemberAuditLogs returns the admin action history for a specific member.
func (h *AdminHandler) GetMemberAuditLogs(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}
	person := middleware.GetPerson(r.Context())
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can view audit logs"})
		return
	}

	memberIDStr := chi.URLParam(r, "id")
	var memberID pgtype.UUID
	if err := memberID.Scan(memberIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	targetM, err := h.queries.GetMembershipByID(r.Context(), db.GetMembershipByIDParams{
		ID:        memberID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "member_not_found"})
		return
	}

	logs, err := h.queries.GetAdminAuditLogsForUser(r.Context(), db.GetAdminAuditLogsForUserParams{
		CompanyID:    companyID,
		TargetUserID: targetM.UserID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error"})
		return
	}

	type AuditItem struct {
		ID        uuid.UUID              `json:"id"`
		ActorName string                 `json:"actor_name"`
		Action    string                 `json:"action"`
		Details   map[string]interface{} `json:"details"`
		CreatedAt time.Time              `json:"created_at"`
	}

	var items []AuditItem
	for _, l := range logs {
		detMap := make(map[string]interface{})
		if len(l.Details) > 0 {
			_ = json.Unmarshal(l.Details, &detMap)
		}
		items = append(items, AuditItem{
			ID:        uuid.UUID(l.ID.Bytes),
			ActorName: l.ActorName,
			Action:    l.Action,
			Details:   detMap,
			CreatedAt: l.CreatedAt.Time,
		})
	}
	if items == nil {
		items = []AuditItem{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"history": items,
	})
}

// ClientWithPeople represents a client organization with its linked contacts.
type ClientWithPeople struct {
	ID        uuid.UUID            `json:"id"`
	Name      string               `json:"name"`
	Website   string               `json:"website"`
	LogoKey   string               `json:"logo_key"`
	Status    string               `json:"status"`
	Contacts  []ClientContactItem  `json:"contacts"`
	CreatedAt time.Time            `json:"created_at"`
}

type ClientContactItem struct {
	ID             uuid.UUID `json:"id"`
	UserID         *uuid.UUID `json:"user_id"`
	Name           string    `json:"name"`
	Email          string    `json:"email"`
	DefaultLevel   string    `json:"default_level"`
	CanDownload    bool      `json:"can_download"`
	LastSignedInAt *time.Time `json:"last_signed_in_at"`
	CreatedAt      time.Time `json:"created_at"`
}

// ListClients returns all clients and their contacts for the Admin Clients tab.
func (h *AdminHandler) ListClients(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	clients, err := h.queries.ListClients(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to list clients"})
		return
	}

	var result []ClientWithPeople
	for _, c := range clients {
		contacts, _ := h.queries.ListClientContacts(r.Context(), c.ID)
		var cList []ClientContactItem
		for _, ct := range contacts {
			var uID *uuid.UUID
			if ct.UserID.Valid {
				parsed := uuid.UUID(ct.UserID.Bytes)
				uID = &parsed
			}
			var lastSign *time.Time
			if ct.LastSignedInAt.Valid {
				lastSign = &ct.LastSignedInAt.Time
			}
			cList = append(cList, ClientContactItem{
				ID:             uuid.UUID(ct.ID.Bytes),
				UserID:         uID,
				Name:           ct.Name,
				Email:          ct.Email,
				DefaultLevel:   ct.DefaultLevel,
				CanDownload:    ct.CanDownload,
				LastSignedInAt: lastSign,
				CreatedAt:      ct.CreatedAt.Time,
			})
		}
		if cList == nil {
			cList = []ClientContactItem{}
		}

		result = append(result, ClientWithPeople{
			ID:        uuid.UUID(c.ID.Bytes),
			Name:      c.Name,
			Website:   c.Website.String,
			LogoKey:   c.LogoKey.String,
			Status:    c.Status,
			Contacts:  cList,
			CreatedAt: c.CreatedAt.Time,
		})
	}

	if result == nil {
		result = []ClientWithPeople{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"clients": result,
	})
}

type AddClientPersonRequest struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	DefaultLevel string `json:"default_level"`
	CanDownload  *bool  `json:"can_download"`
}

// AddClientPerson adds a contact to a client organization and sends an invite email.
func (h *AdminHandler) AddClientPerson(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can add client people"})
		return
	}

	clientIDStr := chi.URLParam(r, "id")
	var clientID pgtype.UUID
	if err := clientID.Scan(clientIDStr); err != nil {
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

	var req AddClientPersonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email", "message": "Valid email address is required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	level := strings.ToLower(strings.TrimSpace(req.DefaultLevel))
	if level == "" {
		level = authz.LevelCommenter
	}
	canDownload := true
	if req.CanDownload != nil {
		canDownload = *req.CanDownload
	}

	// Provision user if not existing
	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		user, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email: email,
			Name:  name,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to provision user"})
			return
		}
	}

	// Add client contact
	contact, err := h.queries.CreateClientContact(r.Context(), db.CreateClientContactParams{
		CompanyID:    companyID,
		ClientID:     clientID,
		Name:         name,
		Email:        email,
		DefaultLevel: level,
		CanDownload:  canDownload,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create client contact"})
		return
	}

	_ = h.queries.LinkClientContactsToUser(r.Context(), db.LinkClientContactsToUserParams{
		Email:  email,
		UserID: user.ID,
	})

	// Temporary password generation
	tempPassword := generateSecureTempPassword()
	tempHash, _ := authz.HashPassword(tempPassword)
	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    user.ID,
		TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	// Create invite token
	rawToken, _ := authz.GenerateSecureToken(32)
	tokenHash := authz.HashToken(rawToken)
	inviteExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, _ = h.queries.CreateInvite(r.Context(), db.CreateInviteParams{
		CompanyID: companyID,
		Email:     email,
		Role:      authz.RoleClient,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: inviteExpiresAt, Valid: true},
	})

	company, _ := h.queries.GetCompanyByID(r.Context(), companyID)
	companyName := "Playhead"
	if company.Name != "" {
		companyName = company.Name
	}
	_ = h.mailer.SendTeamInvite(email, companyName, actor.Name, rawToken, tempPassword)

	// Log audit action
	auditDet, _ := json.Marshal(map[string]interface{}{
		"client_name": client.Name,
		"client_id":   client.ID,
		"email":       email,
	})
	_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
		CompanyID:    companyID,
		ActorID:      actor.ID,
		TargetUserID: user.ID,
		Action:       "client_person_added",
		Details:      auditDet,
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"contact":       contact,
		"temp_password": tempPassword,
		"token":         rawToken,
	})
}

// RemoveClientPerson removes a client contact, revokes project access, signs them out, and keeps comments and uploads.
func (h *AdminHandler) RemoveClientPerson(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can remove client people"})
		return
	}

	personIDStr := chi.URLParam(r, "person_id")
	var contactID pgtype.UUID
	if err := contactID.Scan(personIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_contact_id"})
		return
	}

	contact, err := h.queries.GetClientContactByID(r.Context(), contactID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "contact_not_found"})
		return
	}

	// 1. Delete client contact row
	_ = h.queries.DeleteClientContact(r.Context(), contactID)

	// 2. Remove all project and item grants for this email and user in company
	_ = h.queries.DeleteGrantsForUserOrEmail(r.Context(), db.DeleteGrantsForUserOrEmailParams{
		CompanyID: companyID,
		Email:     contact.Email,
		UserID:    contact.UserID,
	})

	// 3. If linked to user account: sign out immediately and deactivate
	if contact.UserID.Valid {
		_ = h.queries.DeleteAllSessionsForUser(r.Context(), contact.UserID)
		_ = h.queries.DeleteLoginCodesForEmail(r.Context(), contact.Email)

		// Set membership status to deactivated if they had a company membership
		m, mErr := h.queries.GetMembership(r.Context(), db.GetMembershipParams{
			CompanyID: companyID,
			UserID:    contact.UserID,
		})
		if mErr == nil {
			_ = h.queries.UpdateMembershipDetails(r.Context(), db.UpdateMembershipDetailsParams{
				CompanyID:   companyID,
				UserID:      contact.UserID,
				Role:        m.Role,
				RoleID:      m.RoleID,
				Title:       m.Title,
				Permissions: m.Permissions,
				Status:      "deactivated",
			})
		}

		auditDet, _ := json.Marshal(map[string]interface{}{
			"client_id": contact.ClientID,
			"email":     contact.Email,
		})
		_, _ = h.queries.CreateAdminAuditLog(r.Context(), db.CreateAdminAuditLogParams{
			CompanyID:    companyID,
			ActorID:      actor.ID,
			TargetUserID: contact.UserID,
			Action:       "client_person_removed",
			Details:      auditDet,
		})
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Client person removed and access revoked",
	})
}

// ResendClientPersonInvite resends the invite email to a client person.
func (h *AdminHandler) ResendClientPersonInvite(w http.ResponseWriter, r *http.Request) {
	actor, ok := middleware.GetAuthenticatedUser(r.Context())
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
	if !person.IsAdmin() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can resend client invites"})
		return
	}

	personIDStr := chi.URLParam(r, "person_id")
	var contactID pgtype.UUID
	if err := contactID.Scan(personIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_contact_id"})
		return
	}

	contact, err := h.queries.GetClientContactByID(r.Context(), contactID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "contact_not_found"})
		return
	}

	user, err := h.queries.GetUserByEmail(r.Context(), contact.Email)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "user_not_found"})
		return
	}

	tempPassword := generateSecureTempPassword()
	tempHash, _ := authz.HashPassword(tempPassword)
	tempExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_ = h.queries.SetUserTempPassword(r.Context(), db.SetUserTempPasswordParams{
		ID:                    user.ID,
		TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: tempExpiresAt, Valid: true},
	})

	rawToken, _ := authz.GenerateSecureToken(32)
	tokenHash := authz.HashToken(rawToken)
	inviteExpiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, _ = h.queries.CreateInvite(r.Context(), db.CreateInviteParams{
		CompanyID: companyID,
		Email:     contact.Email,
		Role:      authz.RoleClient,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: inviteExpiresAt, Valid: true},
	})

	company, _ := h.queries.GetCompanyByID(r.Context(), companyID)
	companyName := "Playhead"
	if company.Name != "" {
		companyName = company.Name
	}
	_ = h.mailer.SendTeamInvite(contact.Email, companyName, actor.Name, rawToken, tempPassword)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "resent",
		"email":         contact.Email,
		"temp_password": tempPassword,
		"token":         rawToken,
	})
}
