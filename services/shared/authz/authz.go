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

// Person represents an identity acting upon resources.
type Person struct {
	UserID    uuid.UUID
	Email     string
	Role      string // company membership role (admin, manager, editor) or empty for outside clients
	CompanyID uuid.UUID
}

// ProjectTarget represents the project resource being accessed.
type ProjectTarget struct {
	ID        uuid.UUID
	CompanyID uuid.UUID
	ClientID  uuid.UUID
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

// ItemTarget represents an item resource being accessed.
type ItemTarget struct {
	ID        uuid.UUID
	ProjectID uuid.UUID
	CompanyID uuid.UUID
	CreatedBy uuid.UUID
}

// AccessItem evaluates a person's permissions on an item.
// In P2, permissions are inherited directly from the project level.
// (P3 will extend this with folder and file level grant checks).
func AccessItem(ctx context.Context, q *db.Queries, person Person, project ProjectTarget, item ItemTarget) (AccessResult, error) {
	return Access(ctx, q, person, project)
}

// CanManagePeople checks if a person is allowed to add, edit, or remove members on a project.
// Allowed for: Admins, Managers, and people with Full access on that project.
func CanManagePeople(person Person, access AccessResult) bool {
	if person.Role == RoleAdmin || person.Role == RoleManager || person.Role == RoleOwner {
		return true
	}
	return access.Level == LevelFull
}

// Access evaluates a person's permissions on a project by combining:
// 1. Team role (Admin/Manager have Full access + CanDownload=true)
// 2. Project grants
// 3. Client contact default access
// Returning the highest level and appropriate CanDownload flag.
func Access(ctx context.Context, q *db.Queries, person Person, project ProjectTarget) (AccessResult, error) {
	normEmail := NormalizeEmail(person.Email)

	// 1. Team role: Admins and Managers have Full access to everything in the company
	if person.Role == RoleAdmin || person.Role == RoleManager || person.Role == RoleOwner {
		return AccessResult{
			Level:       LevelFull,
			CanDownload: true,
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
