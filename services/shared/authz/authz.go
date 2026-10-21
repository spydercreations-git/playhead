package authz

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/db"
	"golang.org/x/crypto/argon2"
)

// Roles at Company Level (Phase 1: 3 roles only)
const (
	RoleStaff  = "Staff"
	RoleEditor = "Editor"
	RoleClient = "Client"

	// Legacy role names kept for backward compatibility
	RoleCEO            = "CEO"
	RoleCOO            = "COO"
	RoleCFO            = "CFO"
	RoleCSO            = "Chief Sales Officer"
	RoleDesignHead     = "Design Head"
	RoleProjectManager = "Project Manager"

	// Access Types
	AccessTypeFull       = "full_access"
	AccessTypePerProject = "per_project"
)

// The 12 exact permission switch keys per person
const (
	PermAdmin            = "admin"              // open Admin page
	PermManageAccess     = "manage_access"     // add/edit/remove people on projects and items
	PermCreateProject    = "create_project"    // create new project (clients: own client only)
	PermRenameProject    = "rename_project"    // rename project
	PermDeleteProject    = "delete_project"    // archive or delete project
	PermMoveItems        = "move_items"        // move folders and files
	PermCopyItems        = "copy_items"        // copy folders and files
	PermDeleteItems      = "delete_items"      // delete folders and files
	PermCreateTask       = "create_task"       // create task (clients: own client only)
	PermDeleteTask       = "delete_task"       // delete task
	PermChangeTaskStatus = "change_task_status" // change task status
	PermInvitePeople     = "invite_people"     // invite new staff/editors
)

var SwitchKeys = []string{
	PermAdmin,
	PermManageAccess,
	PermCreateProject,
	PermRenameProject,
	PermDeleteProject,
	PermMoveItems,
	PermCopyItems,
	PermDeleteItems,
	PermCreateTask,
	PermDeleteTask,
	PermChangeTaskStatus,
	PermInvitePeople,
}

func IsValidPermissionSwitch(key string) bool {
	for _, k := range SwitchKeys {
		if k == key {
			return true
		}
	}
	return false
}

// DefaultPermissions returns the default switch state for a given role.
func DefaultPermissions(role string) map[string]bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "editor":
		return map[string]bool{
			PermAdmin:            false,
			PermManageAccess:     false,
			PermCreateProject:    false,
			PermRenameProject:    false,
			PermDeleteProject:    false,
			PermMoveItems:        true,
			PermCopyItems:        true,
			PermDeleteItems:      false,
			PermCreateTask:       false,
			PermDeleteTask:       false,
			PermChangeTaskStatus: true,
			PermInvitePeople:     false,
		}
	case "client":
		return map[string]bool{
			PermAdmin:            false,
			PermManageAccess:     false,
			PermCreateProject:    true,
			PermRenameProject:    false,
			PermDeleteProject:    false,
			PermMoveItems:        false,
			PermCopyItems:        false,
			PermDeleteItems:      false,
			PermCreateTask:       true,
			PermDeleteTask:       false,
			PermChangeTaskStatus: false,
			PermInvitePeople:     false,
		}
	default: // Staff
		return map[string]bool{
			PermAdmin:            false,
			PermManageAccess:     true,
			PermCreateProject:    true,
			PermRenameProject:    true,
			PermDeleteProject:    true,
			PermMoveItems:        true,
			PermCopyItems:        true,
			PermDeleteItems:      true,
			PermCreateTask:       true,
			PermDeleteTask:       true,
			PermChangeTaskStatus: true,
			PermInvitePeople:     true,
		}
	}
}

var roleHierarchy = map[string]int{
	"owner":               60,
	"ceo":                 50,
	"coo":                 50,
	"cfo":                 50,
	"chief sales officer": 50,
	"chief_sales_officer": 50,
	"design head":         50,
	"design_head":         50,
	"admin":               50,
	"staff":               50,
	"project manager":     30,
	"project_manager":     30,
	"manager":             30,
	"editor":              10,
	"client":              5,
	"member":              10,
	"guest":               5,
}

// Access Levels at Project, Folder, and File Level
const (
	LevelNone      = "none"
	LevelViewer    = "viewer"
	LevelCommenter = "commenter"
	LevelUploader  = "uploader"
	LevelEditor    = "editor"
	LevelFull      = "full"
)

var accessHierarchy = map[string]int{
	LevelFull:      50,
	LevelEditor:    40,
	LevelUploader:  30,
	LevelCommenter: 20,
	LevelViewer:    10,
	LevelNone:      0,
}

// Errors
var (
	ErrForbidden    = errors.New("forbidden: insufficient permissions")
	ErrUnauthorized = errors.New("unauthorized: authentication required")
	ErrNotFound     = errors.New("not found")
)

// NormalizeEmail converts an email to lowercase and trims surrounding whitespace.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// IsAtLeast verifies that the user's role meets or exceeds the required minimum role.
func IsAtLeast(userRole, requiredRole string) bool {
	userLevel, okUser := roleHierarchy[strings.ToLower(userRole)]
	reqLevel, okReq := roleHierarchy[strings.ToLower(requiredRole)]
	if !okUser || !okReq {
		return false
	}
	return userLevel >= reqLevel
}

// Authorize checks whether userRole meets minimumRole, returning ErrForbidden if not.
func Authorize(userRole, requiredRole string) error {
	if !IsAtLeast(userRole, requiredRole) {
		return ErrForbidden
	}
	return nil
}

// Legacy Permissions (17 total across 6 categories, mapped automatically)
const (
	PermClientsViewAll   = "clients.view_all"
	PermClientsCreate    = "clients.create"
	PermClientsEdit      = "clients.edit"
	PermClientsDelete    = "clients.delete"

	PermProjectsViewAll      = "projects.view_all"
	PermProjectsCreate       = "projects.create"
	PermProjectsArchive      = "projects.archive"
	PermProjectsDelete       = "projects.delete"
	PermProjectsManagePeople = "projects.manage_people"

	PermFilesDeleteForever = "files.delete_forever"
	PermFilesEmptyTrash    = "files.empty_trash"
	PermFilesDownloadAll   = "files.download_all"

	PermSharingCreatePublicLinks = "sharing.create_public_links"

	PermTeamInvite      = "team.invite"
	PermTeamChangeRoles = "team.change_roles"
	PermTeamManageRoles = "team.manage_roles"

	PermAdminStorage  = "admin.storage"
	PermAdminSettings = "admin.settings"
)

var AllPermissions = []string{
	PermClientsViewAll, PermClientsCreate, PermClientsEdit, PermClientsDelete,
	PermProjectsViewAll, PermProjectsCreate, PermProjectsArchive, PermProjectsDelete, PermProjectsManagePeople,
	PermFilesDeleteForever, PermFilesEmptyTrash, PermFilesDownloadAll,
	PermSharingCreatePublicLinks,
	PermTeamInvite, PermTeamChangeRoles, PermTeamManageRoles,
	PermAdminStorage, PermAdminSettings,
}

// Person represents an identity acting upon resources.
type Person struct {
	UserID         uuid.UUID
	Email          string
	Role           string // "Staff", "Editor", "Client"
	RoleID         uuid.UUID
	Title          string // Custom tag for Staff (e.g. CEO, COO, Design Head)
	Status         string // "active", "invited", "deactivated"
	PermissionsMap map[string]bool
	Permissions    []string // Legacy permissions slice for backward compatibility
	CompanyID      uuid.UUID
}

// IsLegacyAdmin checks if role string indicates legacy admin.
func IsLegacyAdmin(role string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	return r == "ceo" || r == "coo" || r == "admin" || r == "owner"
}

// IsFullAccess returns true if the role string represents a full access leadership role.
func IsFullAccess(role string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	return r == "ceo" || r == "coo" || r == "cfo" || r == "cso" ||
		r == "chief sales officer" || r == "chief_sales_officer" ||
		r == "design head" || r == "design_head" || r == "admin" || r == "owner"
}

// IsDeprecatedRole checks if the provided role string is a legacy deprecated role.
func IsDeprecatedRole(role string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	return r == "owner" || r == "member" || r == "guest" || r == "admin" || r == "manager"
}

// CanChangeRoles returns true if the role is authorized to change roles.
func CanChangeRoles(role string) bool {
	return IsLegacyAdmin(role)
}

// IsFullAccess returns true if the person has executive access (e.g. for My Drive, leadership endpoints).
func (p Person) IsFullAccess() bool {
	return IsFullAccess(p.Role) || IsFullAccess(p.Title) || p.IsAdmin()
}

// IsStaff returns true if the person has Staff role.
func (p Person) IsStaff() bool {
	r := strings.ToLower(strings.TrimSpace(p.Role))
	return r == "staff" || IsFullAccess(p.Role) || r == "manager" || r == "project manager" || r == "project_manager"
}

// IsEditor returns true if the person has Editor role.
func (p Person) IsEditor() bool {
	r := strings.ToLower(strings.TrimSpace(p.Role))
	return r == "editor"
}

// IsClient returns true if the person is a client.
func (p Person) IsClient() bool {
	r := strings.ToLower(strings.TrimSpace(p.Role))
	return r == "client" || r == ""
}

// IsAdmin returns true if the person has the admin switch turned on.
func (p Person) IsAdmin() bool {
	if p.PermissionsMap != nil && p.PermissionsMap[PermAdmin] {
		return true
	}
	return IsLegacyAdmin(p.Role)
}

// HasPermission checks if the person possesses the requested permission.
func (p Person) HasPermission(permission string) bool {
	// 1. Admin switch has all permissions
	if p.IsAdmin() {
		return true
	}

	// 2. Check direct switch key in PermissionsMap
	if p.PermissionsMap != nil {
		if val, exists := p.PermissionsMap[permission]; exists {
			return val
		}
	}

	// 3. Check legacy permissions slice for exact match or equivalent
	for _, perm := range p.Permissions {
		if perm == permission {
			return true
		}
		if (permission == PermInvitePeople && perm == PermTeamInvite) ||
			(permission == PermTeamInvite && perm == PermInvitePeople) {
			return true
		}
		if permission == PermCreateProject && perm == PermProjectsCreate {
			return true
		}
		if permission == PermDeleteProject && (perm == PermProjectsDelete || perm == PermProjectsArchive) {
			return true
		}
		if permission == PermManageAccess && (perm == PermProjectsManagePeople || perm == PermSharingCreatePublicLinks || perm == PermClientsEdit) {
			return true
		}
	}

	// 4. Backward-compatible mapping from legacy permission names to new switches
	switch permission {
	case PermClientsViewAll, PermProjectsViewAll:
		return p.IsStaff()
	case PermClientsCreate:
		if p.IsClient() || p.IsEditor() || strings.EqualFold(p.Role, RoleProjectManager) {
			return false
		}
		return p.IsStaff() && (p.HasPermission(PermCreateProject) || p.HasPermission(PermAdmin))
	case PermClientsEdit:
		return p.HasPermission(PermManageAccess)
	case PermClientsDelete:
		return p.IsAdmin()
	case PermProjectsCreate:
		return p.HasPermission(PermCreateProject)
	case PermProjectsArchive, PermProjectsDelete:
		return p.HasPermission(PermDeleteProject)
	case PermProjectsManagePeople:
		return p.HasPermission(PermManageAccess)
	case PermFilesDeleteForever, PermFilesEmptyTrash:
		return p.IsAdmin()
	case PermFilesDownloadAll:
		return p.IsStaff() || p.IsEditor()
	case PermSharingCreatePublicLinks:
		return p.HasPermission(PermManageAccess)
	case PermTeamInvite:
		return p.HasPermission(PermInvitePeople)
	case PermTeamChangeRoles, PermTeamManageRoles, PermAdminStorage, PermAdminSettings:
		return p.IsAdmin()
	}

	return false
}

// CanChangeRoles returns true if the user is authorized to change roles.
func (p Person) CanChangeRoles() bool {
	return p.IsAdmin()
}

// IsTeamMember returns true if the person is an authenticated team member of the company (not a client contact or guest).
func (p Person) IsTeamMember() bool {
	if p.Role == "" || strings.ToLower(p.Role) == "guest" {
		return false
	}
	return true
}

// ProjectTarget represents the project resource being accessed.
type ProjectTarget struct {
	ID        uuid.UUID
	CompanyID uuid.UUID
	ClientID  uuid.UUID
}

// AccessResult describes the evaluated access level and download rights.
type AccessResult struct {
	Level          string
	CanDownload    bool
	IsProjectLevel bool
}

func (a AccessResult) CanView() bool {
	return a.Level != LevelNone && a.Level != ""
}

func (a AccessResult) CanComment() bool {
	return a.Level == LevelCommenter || a.Level == LevelUploader || a.Level == LevelEditor || a.Level == LevelFull
}

func (a AccessResult) CanUpload() bool {
	return a.Level == LevelUploader || a.Level == LevelEditor || a.Level == LevelFull
}

func (a AccessResult) CanEdit() bool {
	return a.Level == LevelEditor || a.Level == LevelFull
}

func (a AccessResult) CanManage() bool {
	return a.Level == LevelFull
}

func (a AccessResult) CanDeleteProject(person Person) bool {
	return a.Level == LevelFull || person.HasPermission(PermDeleteProject)
}

func (a AccessResult) CanRenameProject(person Person) bool {
	return person.HasPermission(PermRenameProject) || a.Level == LevelFull || a.Level == LevelEditor
}

// CanModifyItem returns true if the person can rename, move, or delete an item.
func (a AccessResult) CanModifyItem(person Person, itemCreatedBy uuid.UUID) bool {
	if person.HasPermission(PermMoveItems) || person.HasPermission(PermDeleteItems) || person.IsFullAccess() || a.Level == LevelFull || a.Level == LevelEditor {
		return true
	}
	if a.Level == LevelUploader && person.UserID != uuid.Nil && itemCreatedBy != uuid.Nil && person.UserID == itemCreatedBy {
		return true
	}
	return false
}

// CanManagePeople checks if a person is allowed to add, edit, or remove members on a project.
func CanManagePeople(person Person, access AccessResult) bool {
	if person.HasPermission(PermManageAccess) {
		return true
	}
	r := strings.ToLower(strings.TrimSpace(person.Role))
	if r == "project manager" || r == "project_manager" || r == "manager" {
		return access.Level == LevelFull || access.Level == LevelEditor
	}
	return access.Level == LevelFull
}

// CanCreateProjects checks if a person can create new projects.
func CanCreateProjects(person Person) bool {
	return person.HasPermission(PermCreateProject)
}

// CanShareItem checks if a person is allowed to add or change people (grants) on an item.
func CanShareItem(person Person, access AccessResult) bool {
	return person.HasPermission(PermManageAccess) || access.Level == LevelFull
}

// CanCreatePublicShareLink checks if a person can create a public share link for an item.
func CanCreatePublicShareLink(person Person, access AccessResult) bool {
	return person.HasPermission(PermManageAccess) || access.Level == LevelFull
}

// ItemTarget represents an item resource being accessed.
type ItemTarget struct {
	ID           uuid.UUID
	ProjectID    uuid.UUID
	CompanyID    uuid.UUID
	CreatedBy    uuid.UUID
	DriveOwnerID uuid.UUID
}

// Access evaluates a person's permissions on a project.
func Access(ctx context.Context, q *db.Queries, person Person, project ProjectTarget) (AccessResult, error) {
	normEmail := NormalizeEmail(person.Email)

	// 1. Full access executive roles ("Admins") have universal access
	if person.IsFullAccess() {
		return AccessResult{
			Level:          LevelFull,
			CanDownload:    true,
			IsProjectLevel: true,
		}, nil
	}

	// 2. Staff have access to all projects in their company
	if person.IsStaff() {
		if person.CompanyID == uuid.Nil || project.CompanyID == uuid.Nil || person.CompanyID == project.CompanyID {
			return AccessResult{
				Level:          LevelEditor,
				CanDownload:    true,
				IsProjectLevel: true,
			}, nil
		}
	}

	// 2. Check project grant
	if q != nil && project.ID != uuid.Nil && normEmail != "" {
		grant, err := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
			TargetType: "project",
			TargetID:   pgtype.UUID{Bytes: project.ID, Valid: true},
			Email:      normEmail,
		})
		if err == nil && grant.Level != LevelNone && grant.Level != "" {
			return AccessResult{
				Level:          grant.Level,
				CanDownload:    grant.CanDownload,
				IsProjectLevel: true,
			}, nil
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return AccessResult{Level: LevelNone, CanDownload: false}, err
		}

		// Check if user has explicit grant on any folder or item inside this project
		hasItemGrant, hErr := q.UserHasAnyItemGrantInProject(ctx, db.UserHasAnyItemGrantInProjectParams{
			ProjectID: pgtype.UUID{Bytes: project.ID, Valid: true},
			Email:     normEmail,
		})
		if hErr == nil && hasItemGrant {
			return AccessResult{
				Level:          LevelViewer,
				CanDownload:    false,
				IsProjectLevel: false,
			}, nil
		}
	}

	return AccessResult{Level: LevelNone, CanDownload: false}, nil
}

// AccessFolder evaluates permissions on a folder with folder overrides.
func AccessFolder(ctx context.Context, q *db.Queries, person Person, project ProjectTarget, folderID uuid.UUID) (AccessResult, error) {
	normEmail := NormalizeEmail(person.Email)

	// Full access executive roles always win
	if person.IsFullAccess() {
		return AccessResult{
			Level:       LevelFull,
			CanDownload: true,
		}, nil
	}

	// Base project access
	projAccess, err := Access(ctx, q, person, project)
	if err != nil {
		return AccessResult{Level: LevelNone, CanDownload: false}, err
	}

	if folderID == uuid.Nil {
		return projAccess, nil
	}

	// Check for folder overrides along ancestor chain. Specific folder override wins!
	if q != nil && normEmail != "" {
		ancestors, err := q.GetItemAncestors(ctx, db.GetItemAncestorsParams{
			ItemID:    pgtype.UUID{Bytes: folderID, Valid: true},
			CompanyID: pgtype.UUID{Bytes: project.CompanyID, Valid: true},
		})
		if err == nil {
			for i := len(ancestors) - 1; i >= 0; i-- {
				anc := ancestors[i]
				grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
					TargetType: "folder",
					TargetID:   anc.ID,
					Email:      normEmail,
				})
				if gErr != nil {
					grant, gErr = q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
						TargetType: "item",
						TargetID:   anc.ID,
						Email:      normEmail,
					})
				}
				if gErr == nil && grant.Level != "" {
					if grant.Level == LevelNone {
						return AccessResult{Level: LevelNone, CanDownload: false}, nil
					}
					return AccessResult{
						Level:          grant.Level,
						CanDownload:    grant.CanDownload,
						IsProjectLevel: false,
					}, nil
				}
			}
		}
	}

	if !projAccess.IsProjectLevel {
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	return projAccess, nil
}

// AccessItem evaluates permissions on an item by resolving its parent folder access.
func AccessItem(ctx context.Context, q *db.Queries, person Person, project ProjectTarget, item ItemTarget) (AccessResult, error) {
	// Full access executive roles always win
	if person.IsFullAccess() {
		return AccessResult{
			Level:       LevelFull,
			CanDownload: true,
		}, nil
	}

	// My Drive items: Admins only (handled by person.IsFullAccess() check above)
	if item.DriveOwnerID != uuid.Nil {
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	// Unprojected items: creator or explicit grants
	if item.ProjectID == uuid.Nil {
		if person.UserID != uuid.Nil && item.CreatedBy != uuid.Nil && person.UserID == item.CreatedBy {
			return AccessResult{Level: LevelFull, CanDownload: true}, nil
		}
		if q != nil {
			normEmail := NormalizeEmail(person.Email)
			grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
				TargetType: "item",
				TargetID:   pgtype.UUID{Bytes: item.ID, Valid: true},
				Email:      normEmail,
			})
			if gErr == nil && grant.Level != LevelNone && grant.Level != "" {
				return AccessResult{Level: grant.Level, CanDownload: grant.CanDownload}, nil
			}
		}
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	// Evaluate folder access
	folderAccess, err := AccessFolder(ctx, q, person, project, item.ID)
	if err != nil {
		return AccessResult{Level: LevelNone, CanDownload: false}, err
	}

	// Item explicit grant override
	if q != nil {
		normEmail := NormalizeEmail(person.Email)
		grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
			TargetType: "item",
			TargetID:   pgtype.UUID{Bytes: item.ID, Valid: true},
			Email:      normEmail,
		})
		if gErr == nil && grant.Level != "" {
			if grant.Level == LevelNone {
				return AccessResult{Level: LevelNone, CanDownload: false}, nil
			}
			return AccessResult{
				Level:       grant.Level,
				CanDownload: grant.CanDownload,
			}, nil
		}
	}

	return folderAccess, nil
}

// HashToken produces a SHA-256 hex digest of a token string.
func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}

// GenerateSecureToken returns a cryptographically secure random hex string of length 2*n.
func GenerateSecureToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Generate6DigitCode produces a 6-digit verification code like "482915".
func Generate6DigitCode() (string, error) {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	num := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	return fmt.Sprintf("%06d", num), nil
}

// Argon2id Parameters according to OWASP guidelines:
// Memory: 64MB (65536 KB), Iterations: 1, Parallelism: 4, Salt: 16 bytes, Key: 32 bytes
const (
	argonMemory      = 64 * 1024
	argonIterations  = 1
	argonParallelism = 4
	argonSaltLen     = 16
	argonKeyLen      = 32
)

// HashPassword hashes a plaintext password using Argon2id with a secure random salt.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLen)

	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argonMemory,
		argonIterations,
		argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)
	return encoded, nil
}

// VerifyPassword verifies a plaintext password against an Argon2id formatted hash string.
func VerifyPassword(password, encodedHash string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}

	var memory uint32
	var iterations uint32
	var parallelism uint8
	var version int

	_, err := fmt.Sscanf(parts[2], "v=%d", &version)
	if err != nil || version != argon2.Version {
		return false
	}

	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism)
	if err != nil {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}

	actualHash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expectedHash)))

	return subtle.ConstantTimeCompare(expectedHash, actualHash) == 1
}
