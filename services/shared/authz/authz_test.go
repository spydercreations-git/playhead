package authz

import (
	"testing"

	"github.com/google/uuid"
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

func TestNormalizeEmail(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"Harsh@Example.com", "harsh@example.com"},
		{"  harsh@example.com  ", "harsh@example.com"},
		{"ROHIT@IDYLL.PRODUCTIONS", "rohit@idyll.productions"},
	}

	for _, c := range cases {
		got := NormalizeEmail(c.input)
		if got != c.expected {
			t.Errorf("expected %q, got %q", c.expected, got)
		}
	}

	if NormalizeEmail("Harsh@Example.com") != NormalizeEmail("harsh@example.com") {
		t.Errorf("Harsh@Example.com and harsh@example.com must be equal after normalization")
	}
}

func TestCanManagePeople(t *testing.T) {
	ceo := Person{Role: RoleCEO}
	pm := Person{Role: RoleProjectManager}
	editor := Person{Role: RoleEditor}
	client := Person{Role: ""}

	if !CanManagePeople(ceo, AccessResult{Level: LevelViewer}) {
		t.Errorf("CEO must always be able to manage people")
	}

	if CanManagePeople(pm, AccessResult{Level: LevelViewer}) {
		t.Errorf("Project Manager with Viewer must not be able to manage people")
	}

	if !CanManagePeople(pm, AccessResult{Level: LevelFull}) {
		t.Errorf("Project Manager with Full access must be able to manage people")
	}

	if CanManagePeople(editor, AccessResult{Level: LevelCommenter}) {
		t.Errorf("Editor with Commenter must not be able to manage people")
	}

	if !CanManagePeople(editor, AccessResult{Level: LevelFull}) {
		t.Errorf("Editor with Full access must be able to manage people")
	}

	if CanManagePeople(client, AccessResult{Level: LevelUploader}) {
		t.Errorf("Client with Uploader must not be able to manage people")
	}

	if !CanManagePeople(client, AccessResult{Level: LevelFull}) {
		t.Errorf("Client with Full access must be able to manage people")
	}
}

func TestCanModifyItem(t *testing.T) {
	aliceID := uuid.New()
	bobID := uuid.New()

	alice := Person{UserID: aliceID}
	bob := Person{UserID: bobID}

	fullAccess := AccessResult{Level: LevelFull}
	uploaderAccess := AccessResult{Level: LevelUploader}
	commenterAccess := AccessResult{Level: LevelCommenter}
	viewerAccess := AccessResult{Level: LevelViewer}

	// Full access can modify any item
	if !fullAccess.CanModifyItem(alice, bobID) {
		t.Errorf("Full access should be able to modify anyone's item")
	}

	// Uploader can modify own item
	if !uploaderAccess.CanModifyItem(alice, aliceID) {
		t.Errorf("Uploader should be able to modify own item")
	}
	if !uploaderAccess.CanModifyItem(bob, bobID) {
		t.Errorf("Uploader bob should be able to modify own item")
	}

	// Uploader CANNOT modify someone else's item
	if uploaderAccess.CanModifyItem(alice, bobID) {
		t.Errorf("Uploader must NOT be able to modify someone else's item")
	}

	// Viewer and Commenter can NEVER modify items
	if viewerAccess.CanModifyItem(alice, aliceID) {
		t.Errorf("Viewer must NOT be able to modify item")
	}
	if commenterAccess.CanModifyItem(alice, aliceID) {
		t.Errorf("Commenter must NOT be able to modify item")
	}
}

