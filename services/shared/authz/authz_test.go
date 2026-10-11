package authz

import (
	"testing"
)

func TestRoleHierarchy(t *testing.T) {
	// Owner can access anything
	if !IsAtLeast(RoleOwner, RoleOwner) || !IsAtLeast(RoleOwner, RoleAdmin) || !IsAtLeast(RoleOwner, RoleMember) || !IsAtLeast(RoleOwner, RoleGuest) {
		t.Errorf("owner should have all privileges")
	}

	// Admin can access admin, member, guest, but not owner
	if IsAtLeast(RoleAdmin, RoleOwner) {
		t.Errorf("admin should not have owner role")
	}
	if !IsAtLeast(RoleAdmin, RoleAdmin) || !IsAtLeast(RoleAdmin, RoleMember) || !IsAtLeast(RoleAdmin, RoleGuest) {
		t.Errorf("admin should have member and guest privileges")
	}

	// Member cannot access admin
	if IsAtLeast(RoleMember, RoleAdmin) {
		t.Errorf("member should not have admin role")
	}
	if !IsAtLeast(RoleMember, RoleMember) || !IsAtLeast(RoleMember, RoleGuest) {
		t.Errorf("member should have member and guest privileges")
	}

	// Guest cannot access member
	if IsAtLeast(RoleGuest, RoleMember) {
		t.Errorf("guest should not have member role")
	}
	if !IsAtLeast(RoleGuest, RoleGuest) {
		t.Errorf("guest should have guest privileges")
	}

	// Unknown role
	if IsAtLeast("hacker", RoleGuest) {
		t.Errorf("unknown role should not have privileges")
	}
}

func TestAuthorize(t *testing.T) {
	if err := Authorize(RoleOwner, RoleAdmin); err != nil {
		t.Errorf("expected nil error, got %v", err)
	}

	if err := Authorize(RoleMember, RoleAdmin); err != ErrForbidden {
		t.Errorf("expected ErrForbidden for member trying admin action, got %v", err)
	}
}

func TestArgon2idPasswordHashing(t *testing.T) {
	password := "supersecret123"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	if !VerifyPassword(password, hash) {
		t.Errorf("password verification failed for matching password")
	}

	if VerifyPassword("wrongpassword", hash) {
		t.Errorf("password verification succeeded for incorrect password")
	}
}

func TestTokenHashing(t *testing.T) {
	rawToken, err := GenerateSecureToken(32)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	hash1 := HashToken(rawToken)
	hash2 := HashToken(rawToken)

	if hash1 != hash2 {
		t.Errorf("token hash should be deterministic")
	}

	if len(hash1) != 64 {
		t.Errorf("sha256 hex digest should be 64 characters, got %d", len(hash1))
	}
}
