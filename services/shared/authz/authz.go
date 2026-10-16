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

// Roles at Company Level
const (
	RoleAdmin   = "admin"
	RoleManager = "manager"
	RoleEditor  = "editor"

	// Legacy aliases maintained for backward compatibility
	RoleOwner  = "owner"
	RoleMember = "member"
	RoleGuest  = "guest"
)

var roleHierarchy = map[string]int{
	RoleOwner:   40,
	RoleAdmin:   30,
	RoleManager: 20,
	RoleEditor:  10,
	RoleMember:  10,
	RoleGuest:   5,
}

// Access Levels at Project, Folder, and File Level
const (
	LevelNone      = "none"
	LevelViewer    = "viewer"
	LevelCommenter = "commenter"
	LevelUploader  = "uploader"
	LevelFull      = "full"
)

var accessHierarchy = map[string]int{
	LevelFull:      40,
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
	userLevel, okUser := roleHierarchy[userRole]
	reqLevel, okReq := roleHierarchy[requiredRole]
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

// Permissions (17 total across 6 categories)
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
	UserID      uuid.UUID
	Email       string
	Role        string // Role name (e.g. "Admin", "Manager", "Editor")
	RoleID      uuid.UUID
	Permissions []string
	CompanyID   uuid.UUID
}

// HasPermission checks if the person possesses the requested permission.
func (p Person) HasPermission(permission string) bool {
	for _, perm := range p.Permissions {
		if perm == permission {
			return true
		}
	}
	r := strings.ToLower(p.Role)
	if r == RoleAdmin || r == RoleOwner {
		return true
	}
	return false
}

// IsAdmin returns true if the person has administrative permissions.
func (p Person) IsAdmin() bool {
	return p.HasPermission(PermAdminSettings)
}

// ProjectTarget represents the project resource being accessed.
type ProjectTarget struct {
	ID           uuid.UUID
	CompanyID    uuid.UUID
	ClientID     uuid.UUID
	IsRestricted bool
}

// AccessResult describes the evaluated access level and download rights.
type AccessResult struct {
	Level       string
	CanDownload bool
}

func (a AccessResult) CanView() bool {
	return a.Level != LevelNone && a.Level != ""
}

func (a AccessResult) CanComment() bool {
	return a.Level == LevelCommenter || a.Level == LevelUploader || a.Level == LevelFull
}

func (a AccessResult) CanUpload() bool {
	return a.Level == LevelUploader || a.Level == LevelFull
}

func (a AccessResult) CanManage() bool {
	return a.Level == LevelFull
}

// CanModifyItem returns true if the person can rename, move, or delete an item.
// Full access can modify any item. Uploader can only modify items they created themselves.
// Viewers and Commenters can never modify items.
func (a AccessResult) CanModifyItem(person Person, itemCreatedBy uuid.UUID) bool {
	if a.Level == LevelFull {
		return true
	}
	if a.Level == LevelUploader && person.UserID != uuid.Nil && itemCreatedBy != uuid.Nil && person.UserID == itemCreatedBy {
		return true
	}
	return false
}

// CanManagePeople checks if a person is allowed to add, edit, or remove members on a project.
func CanManagePeople(person Person, access AccessResult) bool {
	if person.IsAdmin() || person.HasPermission(PermProjectsManagePeople) {
		return true
	}
	return access.Level == LevelFull
}

// CanShareItem checks if a person is allowed to add or change people (grants) on an item.
func CanShareItem(person Person, access AccessResult) bool {
	return access.Level == LevelFull
}

// CanCreatePublicShareLink checks if a person can create a public share link for an item.
func CanCreatePublicShareLink(person Person, access AccessResult) bool {
	return access.Level == LevelFull && person.HasPermission(PermSharingCreatePublicLinks)
}

// ItemTarget represents an item resource being accessed.
type ItemTarget struct {
	ID           uuid.UUID
	ProjectID    uuid.UUID
	CompanyID    uuid.UUID
	CreatedBy    uuid.UUID
	IsRestricted bool
}

// Access evaluates a person's permissions on a project by combining:
// 1. Team role permissions (projects.view_all gives Full access + CanDownload=true)
// 2. Project grants
// 3. Client contact default access
// Returning the highest level and appropriate CanDownload flag.
func Access(ctx context.Context, q *db.Queries, person Person, project ProjectTarget) (AccessResult, error) {
	normEmail := NormalizeEmail(person.Email)

	// Restricted project enforcement:
	// When a project is marked restricted:
	// - Inherited access from company role (Member) or client membership STOPS.
	// - Only Admins/Owners and people with an explicit grant on that project can see it.
	// - If a person has an explicit grant on a folder or file inside the project, they can view the project container.
	// - For everyone else it does not exist (returns LevelNone -> 404).
	if project.IsRestricted {
		if person.IsAdmin() {
			return AccessResult{
				Level:       LevelFull,
				CanDownload: true,
			}, nil
		}
		// Non-admins must have an explicit project grant or an explicit grant on a folder/item in the project
		if q != nil && project.ID != uuid.Nil && normEmail != "" {
			grant, err := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
				TargetType: "project",
				TargetID:   pgtype.UUID{Bytes: project.ID, Valid: true},
				Email:      normEmail,
			})
			if err == nil && grant.Level != LevelNone && grant.Level != "" {
				return AccessResult{
					Level:       grant.Level,
					CanDownload: grant.CanDownload,
				}, nil
			}

			hasItemGrant, hErr := q.UserHasAnyItemGrantInProject(ctx, db.UserHasAnyItemGrantInProjectParams{
				ProjectID: pgtype.UUID{Bytes: project.ID, Valid: true},
				Email:     normEmail,
			})
			if hErr == nil && hasItemGrant {
				return AccessResult{
					Level:       LevelViewer,
					CanDownload: false,
				}, nil
			}
		}
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	// 1. Team role / permissions: users with projects.view_all (Admins, Managers) get Full access
	if person.HasPermission(PermProjectsViewAll) {
		canDL := true
		if !person.HasPermission(PermFilesDownloadAll) && !person.IsAdmin() {
			canDL = false
		}
		return AccessResult{
			Level:       LevelFull,
			CanDownload: canDL,
		}, nil
	}

	var hasGrant bool
	var grantLevel string
	var grantCanDownload bool

	// 2. Check project grant
	if q != nil && project.ID != uuid.Nil && normEmail != "" {
		grant, err := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
			TargetType: "project",
			TargetID:   pgtype.UUID{Bytes: project.ID, Valid: true},
			Email:      normEmail,
		})
		if err == nil {
			hasGrant = true
			grantLevel = grant.Level
			grantCanDownload = grant.CanDownload
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return AccessResult{Level: LevelNone, CanDownload: false}, err
		}
	}

	var hasContactDefault bool
	var contactLevel string
	var contactCanDownload bool

	// 3. Check client contact default access for this project's client
	if q != nil && project.ClientID != uuid.Nil && normEmail != "" {
		contact, err := q.GetClientContactByClientAndEmail(ctx, db.GetClientContactByClientAndEmailParams{
			ClientID: pgtype.UUID{Bytes: project.ClientID, Valid: true},
			Email:    normEmail,
		})
		if err == nil && contact.DefaultLevel != LevelNone && contact.DefaultLevel != "" {
			hasContactDefault = true
			contactLevel = contact.DefaultLevel
			contactCanDownload = contact.CanDownload
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return AccessResult{Level: LevelNone, CanDownload: false}, err
		}
	}

	// 4. Combine highest level
	if !hasGrant && !hasContactDefault {
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	if hasGrant && !hasContactDefault {
		return AccessResult{Level: grantLevel, CanDownload: grantCanDownload}, nil
	}

	if !hasGrant && hasContactDefault {
		return AccessResult{Level: contactLevel, CanDownload: contactCanDownload}, nil
	}

	// Both grant and contact default exist: pick highest rank
	grantRank := accessHierarchy[grantLevel]
	contactRank := accessHierarchy[contactLevel]

	if grantRank > contactRank {
		return AccessResult{Level: grantLevel, CanDownload: grantCanDownload}, nil
	} else if contactRank > grantRank {
		return AccessResult{Level: contactLevel, CanDownload: contactCanDownload}, nil
	}

	// Equal rank: apply strictest CanDownload
	return AccessResult{
		Level:       grantLevel,
		CanDownload: grantCanDownload && contactCanDownload,
	}, nil
}

type accessSource struct {
	Level       string
	CanDownload bool
}

func resolveSources(sources []accessSource) AccessResult {
	if len(sources) == 0 {
		return AccessResult{Level: LevelNone, CanDownload: false}
	}

	maxRank := 0
	bestLevel := LevelNone
	for _, s := range sources {
		r := accessHierarchy[s.Level]
		if r > maxRank {
			maxRank = r
			bestLevel = s.Level
		}
	}

	if maxRank == 0 {
		return AccessResult{Level: LevelNone, CanDownload: false}
	}

	canDL := true
	for _, s := range sources {
		if accessHierarchy[s.Level] == maxRank {
			if !s.CanDownload {
				canDL = false
			}
		}
	}

	return AccessResult{
		Level:       bestLevel,
		CanDownload: canDL,
	}
}

// AccessFolder evaluates permissions on a folder using ancestor chain in a single pass.
// Fast rule: never check file by file. Resolve once for folder and apply to all children.
func AccessFolder(ctx context.Context, q *db.Queries, person Person, project ProjectTarget, folderID uuid.UUID) (AccessResult, error) {
	normEmail := NormalizeEmail(person.Email)

	// Base project access
	projAccess, err := Access(ctx, q, person, project)
	if err != nil {
		return AccessResult{Level: LevelNone, CanDownload: false}, err
	}

	// If root of project, return base project access immediately
	if folderID == uuid.Nil {
		// On restricted projects, only admins or users with an explicit PROJECT grant can view root items.
		// A user who only has an item/folder grant inside the project cannot see the project root.
		if project.IsRestricted && !person.IsAdmin() {
			hasProjGrant := false
			if q != nil && project.ID != uuid.Nil && normEmail != "" {
				grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
					TargetType: "project",
					TargetID:   pgtype.UUID{Bytes: project.ID, Valid: true},
					Email:      normEmail,
				})
				if gErr == nil && grant.Level != LevelNone && grant.Level != "" {
					hasProjGrant = true
				}
			}
			if !hasProjGrant {
				return AccessResult{Level: LevelNone, CanDownload: false}, nil
			}
		}
		return projAccess, nil
	}

	var sources []accessSource
	// On restricted projects, base project access is only inherited if the user has an explicit PROJECT grant or is Admin.
	// Users who only have item/folder grants inside the project can view the project container, but do NOT inherit access to other folders.
	canInheritProjectAccess := true
	if project.IsRestricted && !person.IsAdmin() {
		hasProjGrant := false
		if q != nil && project.ID != uuid.Nil && normEmail != "" {
			grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
				TargetType: "project",
				TargetID:   pgtype.UUID{Bytes: project.ID, Valid: true},
				Email:      normEmail,
			})
			if gErr == nil && grant.Level != LevelNone && grant.Level != "" {
				hasProjGrant = true
			}
		}
		if !hasProjGrant {
			canInheritProjectAccess = false
		}
	}

	if canInheritProjectAccess && projAccess.Level != LevelNone && projAccess.Level != "" {
		sources = append(sources, accessSource{
			Level:       projAccess.Level,
			CanDownload: projAccess.CanDownload,
		})
	}

	isFolderRestricted := false
	var folderExplicitGrant *db.Grant

	if q != nil {
		ancestors, err := q.GetItemAncestors(ctx, db.GetItemAncestorsParams{
			ItemID:    pgtype.UUID{Bytes: folderID, Valid: true},
			CompanyID: pgtype.UUID{Bytes: project.CompanyID, Valid: true},
		})
		if err == nil {
			for _, anc := range ancestors {
				if anc.IsRestricted {
					isFolderRestricted = true
				}
				grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
					TargetType: "item",
					TargetID:   anc.ID,
					Email:      normEmail,
				})
				if gErr != nil {
					grant, gErr = q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
						TargetType: "folder",
						TargetID:   anc.ID,
						Email:      normEmail,
					})
				}
				if gErr == nil && grant.Level != LevelNone && grant.Level != "" {
					folderExplicitGrant = &grant
					sources = append(sources, accessSource{
						Level:       grant.Level,
						CanDownload: grant.CanDownload,
					})
				}
			}
		}
	}

	// If folder or any ancestor is restricted:
	// Inherited access from company role (Member) or client membership STOPS.
	// Only Admins and people with an explicit grant on that project/folder can see it.
	if isFolderRestricted {
		if person.IsAdmin() {
			return AccessResult{Level: LevelFull, CanDownload: true}, nil
		}
		if folderExplicitGrant != nil {
			return AccessResult{
				Level:       folderExplicitGrant.Level,
				CanDownload: folderExplicitGrant.CanDownload,
			}, nil
		}
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	return resolveSources(sources), nil
}

// AccessItem evaluates permissions on an item by resolving its parent folder access.
func AccessItem(ctx context.Context, q *db.Queries, person Person, project ProjectTarget, item ItemTarget) (AccessResult, error) {
	// Unprojected items ("My documents" / unprojected spreadsheets):
	// Visible ONLY to creator and people with explicit grants.
	// Admins cannot see others' private docs unless explicitly granted.
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

	folderAccess, err := AccessFolder(ctx, q, person, project, item.ID)
	if err != nil {
		return AccessResult{Level: LevelNone, CanDownload: false}, err
	}

	var sources []accessSource
	if folderAccess.Level != LevelNone && folderAccess.Level != "" {
		sources = append(sources, accessSource{
			Level:       folderAccess.Level,
			CanDownload: folderAccess.CanDownload,
		})
	}

	var itemExplicitGrant *db.Grant
	if q != nil {
		normEmail := NormalizeEmail(person.Email)
		grant, gErr := q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
			TargetType: "item",
			TargetID:   pgtype.UUID{Bytes: item.ID, Valid: true},
			Email:      normEmail,
		})
		if gErr != nil {
			grant, gErr = q.GetGrantByTargetAndEmail(ctx, db.GetGrantByTargetAndEmailParams{
				TargetType: "folder",
				TargetID:   pgtype.UUID{Bytes: item.ID, Valid: true},
				Email:      normEmail,
			})
		}
		if gErr == nil && grant.Level != LevelNone && grant.Level != "" {
			itemExplicitGrant = &grant
			sources = append(sources, accessSource{
				Level:       grant.Level,
				CanDownload: grant.CanDownload,
			})
		}
	}

	if item.IsRestricted {
		if person.IsAdmin() {
			return AccessResult{Level: LevelFull, CanDownload: true}, nil
		}
		if itemExplicitGrant != nil {
			return AccessResult{
				Level:       itemExplicitGrant.Level,
				CanDownload: itemExplicitGrant.CanDownload,
			}, nil
		}
		return AccessResult{Level: LevelNone, CanDownload: false}, nil
	}

	return resolveSources(sources), nil
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
