package authz

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Roles
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
	RoleGuest  = "guest"
)

var roleHierarchy = map[string]int{
	RoleOwner:  40,
	RoleAdmin:  30,
	RoleMember: 20,
	RoleGuest:  10,
}

// Errors
var (
	ErrForbidden    = errors.New("forbidden: insufficient permissions")
	ErrUnauthorized = errors.New("unauthorized: authentication required")
)

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

// HashToken produces a SHA-256 hex digest of a token string.
// Tokens (sessions, email verification, password reset, invites) are stored ONLY as hashes.
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

	// Format: $argon2id$v=19$m=65536,t=1,p=4$<salt-b64>$<hash-b64>
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
