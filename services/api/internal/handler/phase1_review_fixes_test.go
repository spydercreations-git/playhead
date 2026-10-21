package handler

import (
	"bytes"
	"context"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
)

func TestFix1_OnlyThreeRolesExistAndConstraintEnforced(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	// 1. Assert that in the database, 100% of memberships have role in ('Staff', 'Editor', 'Client')
	var invalidRoleCount int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM memberships
		WHERE role NOT IN ('Staff', 'Editor', 'Client')
	`).Scan(&invalidRoleCount)
	if err != nil {
		t.Fatalf("failed to query memberships for invalid roles: %v", err)
	}
	if invalidRoleCount > 0 {
		t.Fatalf("expected 0 memberships with legacy roles, found %d", invalidRoleCount)
	}

	// 2. Assert that inserting any role other than Staff, Editor, or Client is rejected by check constraint
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Role Constraint Company",
		Slug:              fmt.Sprintf("role-comp-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 100 * 1024 * 1024,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	testUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("invalid-role-%d@test.com", time.Now().UnixNano()),
		Name:  "Invalid Role Tester",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	// Try inserting "Admin" role (legacy) -> MUST FAIL check constraint
	_, err = pool.Exec(ctx, `
		INSERT INTO memberships (company_id, user_id, role)
		VALUES ($1, $2, 'Admin')
	`, comp.ID, testUser.ID)
	if err == nil {
		t.Fatalf("expected check constraint violation for role 'Admin', but insert succeeded")
	}

	// Try inserting "CEO" role -> MUST FAIL
	_, err = pool.Exec(ctx, `
		INSERT INTO memberships (company_id, user_id, role)
		VALUES ($1, $2, 'CEO')
	`, comp.ID, testUser.ID)
	if err == nil {
		t.Fatalf("expected check constraint violation for role 'CEO', but insert succeeded")
	}

	// Try inserting "Manager" role -> MUST FAIL
	_, err = pool.Exec(ctx, `
		INSERT INTO memberships (company_id, user_id, role)
		VALUES ($1, $2, 'Manager')
	`, comp.ID, testUser.ID)
	if err == nil {
		t.Fatalf("expected check constraint violation for role 'Manager', but insert succeeded")
	}

	// Try inserting valid role "Staff" -> MUST SUCCEED
	_, err = pool.Exec(ctx, `
		INSERT INTO memberships (company_id, user_id, role)
		VALUES ($1, $2, 'Staff')
	`, comp.ID, testUser.ID)
	if err != nil {
		t.Fatalf("inserting valid role 'Staff' failed: %v", err)
	}
}

func TestFix2_DevSeedNeverGrantsAdminAndDevLoginEnforced(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	// 1. Dev seed creates a Staff user with admin switch strictly false
	_ = os.Setenv("ENV", "development")
	seedEmail := fmt.Sprintf("fresh-seed-%d@idyllproductions.com", time.Now().UnixNano())
	err := EnsureDevAdmins(ctx, pool, queries, seedEmail)
	if err != nil {
		t.Fatalf("EnsureDevAdmins failed: %v", err)
	}

	var role string
	var isAdmin bool
	err = pool.QueryRow(ctx, `
		SELECT m.role, COALESCE((m.permissions->>'admin')::boolean, false)
		FROM memberships m
		JOIN users u ON m.user_id = u.id
		WHERE u.email = $1
	`, seedEmail).Scan(&role, &isAdmin)
	if err != nil {
		t.Fatalf("failed to query seeded user: %v", err)
	}

	if role != "Staff" {
		t.Errorf("expected seeded role to be 'Staff', got %s", role)
	}
	if isAdmin {
		t.Errorf("dev seed must NEVER create accounts with the admin switch (got admin=true)")
	}

	// 2. Dev seed refuses to run if ENV != "development"
	_ = os.Setenv("ENV", "production")
	nonDevEmail := fmt.Sprintf("prod-attempt-%d@test.com", time.Now().UnixNano())
	_ = EnsureDevAdmins(ctx, pool, queries, nonDevEmail)

	var count int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE email = $1`, nonDevEmail).Scan(&count)
	if count > 0 {
		t.Errorf("EnsureDevAdmins must NOT create accounts when ENV is not development")
	}

	// 3. DevLogin returns 404 when ENV is not development
	authH := NewAuthHandler(queries, nil, "client-id", "http://localhost:3000", false)
	authH.SetEnvironment("production")
	req := httptest.NewRequest("POST", "/api/v1/auth/dev-login", bytes.NewReader([]byte(`{"email":"harsh@idyllproductions.com"}`)))
	rec := httptest.NewRecorder()
	authH.DevLogin(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 from DevLogin in non-development environment, got %d", rec.Code)
	}

	_ = os.Setenv("ENV", "development")
}

func TestFix3_PermanentDeleteAndEmptyTrashAdminOnly(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()
	ctx := context.Background()

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Trash Admin Test Studio",
		Slug:              fmt.Sprintf("trash-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 10 * 1024 * 1024 * 1024,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	// Create Admin user (admin switch = true)
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@studio.com", time.Now().UnixNano()),
		Name:  "Admin Boss",
	})
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}
	_, _ = queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      adminUser.ID,
		Role:        "Staff",
		Title:       pgtype.Text{String: "CEO", Valid: true},
		Permissions: []byte(`{"admin": true, "delete_items": true}`),
		Status:      "active",
	})
	adminPerson := authz.Person{
		UserID:         uuid.UUID(adminUser.ID.Bytes),
		Email:          adminUser.Email,
		Role:           "Staff",
		PermissionsMap: map[string]bool{"admin": true, "delete_items": true},
		CompanyID:      uuid.UUID(comp.ID.Bytes),
	}

	// Create Staff user with delete_items: true, but admin: false
	staffUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("staff-%d@studio.com", time.Now().UnixNano()),
		Name:  "Staff Member",
	})
	if err != nil {
		t.Fatalf("create staff user: %v", err)
	}
	_, _ = queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      staffUser.ID,
		Role:        "Staff",
		Title:       pgtype.Text{String: "Editor", Valid: true},
		Permissions: []byte(`{"admin": false, "delete_items": true}`),
		Status:      "active",
	})
	staffPerson := authz.Person{
		UserID:         uuid.UUID(staffUser.ID.Bytes),
		Email:          staffUser.Email,
		Role:           "Staff",
		PermissionsMap: map[string]bool{"admin": false, "delete_items": true},
		CompanyID:      uuid.UUID(comp.ID.Bytes),
	}

	itemsH := NewItemsHandler(queries, nil)

	r := chi.NewRouter()
	r.Delete("/api/v1/items/{id}", itemsH.DeleteItem)
	r.Delete("/api/v1/trash/{id}", itemsH.PermanentDeleteTrashItem)
	r.Delete("/api/v1/trash", itemsH.EmptyTrash)

	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Trash Client",
	})
	if err != nil {
		t.Fatalf("create client: %v", err)
	}

	// Create a project and file item
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Trash Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	item, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Name:      "test_video.mp4",
		Kind:      "file",
		Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
		CreatedBy: staffUser.ID,
	})
	if err != nil {
		t.Fatalf("create item: %v", err)
	}
	itemIDStr := pgUUIDToString(item.ID)

	// 1. Staff with delete_items: true can soft delete to trash -> 200 OK
	reqSoftDel := httptest.NewRequest("DELETE", "/api/v1/items/"+itemIDStr, nil)
	reqSoftDel = reqSoftDel.WithContext(contextWithPerson(reqSoftDel.Context(), staffUser, comp.ID, staffPerson))
	recSoftDel := httptest.NewRecorder()
	r.ServeHTTP(recSoftDel, reqSoftDel)
	if recSoftDel.Code != http.StatusOK {
		t.Fatalf("expected soft delete to succeed (200), got %d: %s", recSoftDel.Code, recSoftDel.Body.String())
	}

	// 2. Staff user (admin switch false) tries permanent delete -> MUST BE 403 FORBIDDEN
	reqPermDel := httptest.NewRequest("DELETE", "/api/v1/trash/"+itemIDStr, nil)
	reqPermDel = reqPermDel.WithContext(contextWithPerson(reqPermDel.Context(), staffUser, comp.ID, staffPerson))
	recPermDel := httptest.NewRecorder()
	r.ServeHTTP(recPermDel, reqPermDel)
	if recPermDel.Code != http.StatusForbidden {
		t.Fatalf("expected permanent delete to be 403 Forbidden for non-admin, got %d: %s", recPermDel.Code, recPermDel.Body.String())
	}

	// 3. Staff user (admin switch false) tries empty trash -> MUST BE 403 FORBIDDEN
	reqEmptyTrash := httptest.NewRequest("DELETE", "/api/v1/trash", nil)
	reqEmptyTrash = reqEmptyTrash.WithContext(contextWithPerson(reqEmptyTrash.Context(), staffUser, comp.ID, staffPerson))
	recEmptyTrash := httptest.NewRecorder()
	r.ServeHTTP(recEmptyTrash, reqEmptyTrash)
	if recEmptyTrash.Code != http.StatusForbidden {
		t.Fatalf("expected empty trash to be 403 Forbidden for non-admin, got %d: %s", recEmptyTrash.Code, recEmptyTrash.Body.String())
	}

	// 4. Admin user (admin switch true) permanently deletes item -> MUST BE 200 OK
	reqAdminPermDel := httptest.NewRequest("DELETE", "/api/v1/trash/"+itemIDStr, nil)
	reqAdminPermDel = reqAdminPermDel.WithContext(contextWithPerson(reqAdminPermDel.Context(), adminUser, comp.ID, adminPerson))
	recAdminPermDel := httptest.NewRecorder()
	r.ServeHTTP(recAdminPermDel, reqAdminPermDel)
	if recAdminPermDel.Code != http.StatusOK {
		t.Fatalf("expected admin permanent delete to succeed (200), got %d: %s", recAdminPermDel.Code, recAdminPermDel.Body.String())
	}

	// 5. Admin user (admin switch true) calls empty trash -> MUST BE 200 OK
	reqAdminEmpty := httptest.NewRequest("DELETE", "/api/v1/trash", nil)
	reqAdminEmpty = reqAdminEmpty.WithContext(contextWithPerson(reqAdminEmpty.Context(), adminUser, comp.ID, adminPerson))
	recAdminEmpty := httptest.NewRecorder()
	r.ServeHTTP(recAdminEmpty, reqAdminEmpty)
	if recAdminEmpty.Code != http.StatusOK {
		t.Fatalf("expected admin empty trash to succeed (200), got %d: %s", recAdminEmpty.Code, recAdminEmpty.Body.String())
	}
}
