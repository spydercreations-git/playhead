package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

type RolesHandler struct {
	queries *db.Queries
}

func NewRolesHandler(queries *db.Queries) *RolesHandler {
	return &RolesHandler{queries: queries}
}

type RoleResponse struct {
	ID          string   `json:"id"`
	CompanyID   string   `json:"company_id"`
	Name        string   `json:"name"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`
	IsSystem    bool     `json:"is_system"`
	MemberCount int      `json:"member_count"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

func (h *RolesHandler) List(w http.ResponseWriter, r *http.Request) {
	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	roles, err := h.queries.ListCompanyRoles(r.Context(), companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_roles"})
		return
	}

	var res []RoleResponse
	for _, r := range roles {
		var perms []string
		if len(r.Permissions) > 0 {
			_ = json.Unmarshal(r.Permissions, &perms)
		}
		if perms == nil {
			perms = []string{}
		}
		res = append(res, RoleResponse{
			ID:          pgUUIDToString(r.ID),
			CompanyID:   pgUUIDToString(r.CompanyID),
			Name:        r.Name,
			Color:       r.Color,
			Permissions: perms,
			IsSystem:    r.IsSystem,
			MemberCount: int(r.MemberCount),
			CreatedAt:   r.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   r.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	if res == nil {
		res = []RoleResponse{}
	}
	respondJSON(w, http.StatusOK, res)
}

type CreateRoleRequest struct {
	Name        string   `json:"name"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`
}

func (h *RolesHandler) Create(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamManageRoles) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only members with team.manage_roles can create roles",
		})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req CreateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required", "message": "Role name is required"})
		return
	}

	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "#0066FF"
	}

	// When creating a role, a person can only grant permissions they have themselves
	for _, p := range req.Permissions {
		if !person.HasPermission(p) {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "permission_escalation",
				"message": "Cannot grant permission you do not have: " + p,
			})
			return
		}
	}

	validPermMap := make(map[string]bool)
	for _, p := range authz.AllPermissions {
		validPermMap[p] = true
	}
	var sanitizedPerms []string
	for _, p := range req.Permissions {
		if validPermMap[p] {
			sanitizedPerms = append(sanitizedPerms, p)
		}
	}
	if sanitizedPerms == nil {
		sanitizedPerms = []string{}
	}

	permsBytes, _ := json.Marshal(sanitizedPerms)

	role, err := h.queries.CreateRole(r.Context(), db.CreateRoleParams{
		CompanyID:   companyID,
		Name:        name,
		Color:       color,
		Permissions: permsBytes,
		IsSystem:    false,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "create_failed",
			"message": "Failed to create role (name may already exist)",
		})
		return
	}

	respondJSON(w, http.StatusCreated, RoleResponse{
		ID:          pgUUIDToString(role.ID),
		CompanyID:   pgUUIDToString(role.CompanyID),
		Name:        role.Name,
		Color:       role.Color,
		Permissions: sanitizedPerms,
		IsSystem:    role.IsSystem,
		MemberCount: 0,
		CreatedAt:   role.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   role.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	})
}

type UpdateRoleRequest struct {
	Name        string   `json:"name"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`
}

func (h *RolesHandler) Update(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamManageRoles) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only members with team.manage_roles can edit roles",
		})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	roleIDStr := chi.URLParam(r, "id")
	roleUUID, err := uuid.Parse(roleIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_role_id"})
		return
	}

	existingRole, err := h.queries.GetRoleByID(r.Context(), db.GetRoleByIDParams{
		ID:        pgtype.UUID{Bytes: roleUUID, Valid: true},
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "role_not_found"})
		return
	}

	// Nobody can edit the role they themselves have
	if strings.EqualFold(existingRole.Name, person.Role) || (person.RoleID != uuid.Nil && existingRole.ID.Bytes == person.RoleID) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "cannot_edit_own_role",
			"message": "Nobody can edit the role they themselves have",
		})
		return
	}

	if existingRole.IsSystem {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "system_role_immutable",
			"message": "System roles like Admin cannot be edited or modified",
		})
		return
	}

	var req UpdateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	// When editing a role, a person can only grant permissions they have themselves
	for _, p := range req.Permissions {
		if !person.HasPermission(p) {
			respondJSON(w, http.StatusForbidden, map[string]string{
				"error":   "permission_escalation",
				"message": "Cannot grant permission you do not have: " + p,
			})
			return
		}
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = existingRole.Name
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = existingRole.Color
	}

	validPermMap := make(map[string]bool)
	for _, p := range authz.AllPermissions {
		validPermMap[p] = true
	}
	var sanitizedPerms []string
	for _, p := range req.Permissions {
		if validPermMap[p] {
			sanitizedPerms = append(sanitizedPerms, p)
		}
	}
	if sanitizedPerms == nil {
		sanitizedPerms = []string{}
	}

	permsBytes, _ := json.Marshal(sanitizedPerms)

	updatedRole, err := h.queries.UpdateRole(r.Context(), db.UpdateRoleParams{
		ID:          pgtype.UUID{Bytes: roleUUID, Valid: true},
		CompanyID:   companyID,
		Name:        name,
		Color:       color,
		Permissions: permsBytes,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "update_failed"})
		return
	}

	respondJSON(w, http.StatusOK, RoleResponse{
		ID:          pgUUIDToString(updatedRole.ID),
		CompanyID:   pgUUIDToString(updatedRole.CompanyID),
		Name:        updatedRole.Name,
		Color:       updatedRole.Color,
		Permissions: sanitizedPerms,
		IsSystem:    updatedRole.IsSystem,
		CreatedAt:   updatedRole.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   updatedRole.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	})
}

func (h *RolesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	person := middleware.GetPerson(r.Context())
	if !person.HasPermission(authz.PermTeamManageRoles) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only members with team.manage_roles can delete roles",
		})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(r.Context())
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	roleIDStr := chi.URLParam(r, "id")
	roleUUID, err := uuid.Parse(roleIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_role_id"})
		return
	}

	existingRole, err := h.queries.GetRoleByID(r.Context(), db.GetRoleByIDParams{
		ID:        pgtype.UUID{Bytes: roleUUID, Valid: true},
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "role_not_found"})
		return
	}

	// Nobody can delete the role they themselves have
	if strings.EqualFold(existingRole.Name, person.Role) || (person.RoleID != uuid.Nil && existingRole.ID.Bytes == person.RoleID) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "cannot_delete_own_role",
			"message": "Nobody can delete the role they themselves have",
		})
		return
	}

	if existingRole.IsSystem {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "cannot_delete_system_role",
			"message": "System roles like Admin cannot be deleted",
		})
		return
	}

	// Check if any members are currently assigned to this role
	memberCount, err := h.queries.CountRoleMembers(r.Context(), pgtype.UUID{Bytes: roleUUID, Valid: true})
	if err == nil && memberCount > 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "role_has_members",
			"message": "Cannot delete a role that has active members assigned. Reassign its members to another role first.",
		})
		return
	}

	if err := h.queries.DeleteRole(r.Context(), db.DeleteRoleParams{
		ID:        pgtype.UUID{Bytes: roleUUID, Valid: true},
		CompanyID: companyID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_delete_role"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
