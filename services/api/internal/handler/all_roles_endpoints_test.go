package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

// TestNoDirectRoleComparisonsInHandlers verifies that no handler file compares role strings directly.
// This test fails if anyone adds a role string check (e.g. role == "admin" or person.Role == ...) again.
func TestNoDirectRoleComparisonsInHandlers(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("failed to list go files: %v", err)
	}

	// Forbidden patterns: checking role strings directly instead of using authz permissions / helpers
	forbiddenRegex := regexp.MustCompile(`(?i)(?:person\.Role|role|userRole|m\.Role)\s*(?:==|!=)\s*(?:authz\.Role[A-Za-z]+|"admin"|"owner"|"manager"|"editor"|"member"|"guest")`)

	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("failed to read %s: %v", file, err)
		}
		lines := strings.Split(string(data), "\n")
		for lno, line := range lines {
			// Skip comments
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "//") {
				continue
			}
			if forbiddenRegex.MatchString(line) {
				t.Errorf("%s:%d: Forbidden direct role string comparison found: %s\nUse person.HasPermission(...) or authz helper methods instead.", file, lno+1, trimmed)
			}
		}
	}
}

// TestAllRolesEndpoints verifies allow/deny behavior across all new roles for core endpoints.
func TestAllRolesEndpoints(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	// Create test company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Role Matrix Productions",
		Slug: fmt.Sprintf("roles-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	clientHandler := NewClientHandler(queries, nil)
	clientHandler.SetPool(pool)
	projectHandler := NewProjectHandler(queries)
	itemsHandler := NewItemsHandler(queries, nil)
	itemsHandler.SetPool(pool)

	// Create test client and project with folder and file item
	cl, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Role Matrix Client",
	})
	pr, _ := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  cl.ID,
		Name:      "Role Matrix Project",
	})
	fld, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: pr.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "folder",
		Name:      "Raw files",
		Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
	})
	fldTarget, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: pr.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "folder",
		Name:      "Edited files",
		Position:  pgtype.Numeric{Int: big.NewInt(2000), Valid: true},
	})
	testItem, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: pr.ID,
		ParentID:  fld.ID,
		Kind:      "file",
		Name:      "sample.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
	})

	r := chi.NewRouter()
	r.Get("/clients", clientHandler.List)
	r.Post("/clients", clientHandler.Create)
	r.Get("/projects", projectHandler.List)
	r.Post("/items/{id}/duplicate", itemsHandler.CopyItem)
	r.Post("/items/{id}/copy", itemsHandler.CopyItem)
	r.Patch("/items/{id}/move", itemsHandler.MoveItem)

	// Roles to test (including Phase 1: Staff, Editor, Client)
	rolesToTest := []struct {
		name       string
		role       string
		isFull     bool
		canViewAll bool
		isClient   bool
		isAdmin    bool
	}{
		{name: "Staff (Admin)", role: authz.RoleStaff, isFull: true, canViewAll: true, isClient: false, isAdmin: true},
		{name: "Staff (Regular)", role: authz.RoleStaff, isFull: true, canViewAll: true, isClient: false, isAdmin: false},
		{name: "CEO User", role: authz.RoleCEO, isFull: true, canViewAll: true, isClient: false, isAdmin: true},
		{name: "COO User", role: authz.RoleCOO, isFull: true, canViewAll: true, isClient: false, isAdmin: true},
		{name: "CFO User", role: authz.RoleCFO, isFull: true, canViewAll: true, isClient: false, isAdmin: false},
		{name: "CSO User", role: authz.RoleCSO, isFull: true, canViewAll: true, isClient: false, isAdmin: false},
		{name: "Design Head", role: authz.RoleDesignHead, isFull: true, canViewAll: true, isClient: false, isAdmin: false},
		{name: "Project Manager", role: authz.RoleProjectManager, isFull: false, canViewAll: false, isClient: false, isAdmin: false},
		{name: "Editor User", role: authz.RoleEditor, isFull: false, canViewAll: false, isClient: false, isAdmin: false},
		{name: "Client Person", role: "client", isFull: false, canViewAll: false, isClient: true, isAdmin: false},
	}

	for _, rt := range rolesToTest {
		t.Run(rt.name, func(t *testing.T) {
			testUser, err := queries.CreateUser(ctx, db.CreateUserParams{
				Email: fmt.Sprintf("%s-%d@test.com", strings.ReplaceAll(strings.ToLower(rt.role), " ", "-"), time.Now().UnixNano()),
				Name:  rt.name,
			})
			if err != nil {
				t.Fatalf("failed to create user: %v", err)
			}

			var perms []string
			permMap := authz.DefaultPermissions(rt.role)
			if rt.isAdmin {
				permMap["admin"] = true
			}
			if rt.isFull {
				perms = authz.AllPermissions
			} else if rt.role == authz.RoleProjectManager {
				perms = []string{authz.PermProjectsManagePeople, authz.PermFilesDownloadAll}
			} else if rt.role == authz.RoleEditor {
				perms = []string{authz.PermFilesDownloadAll}
			}

			person := authz.Person{
				UserID:         uuid.UUID(testUser.ID.Bytes),
				Email:          testUser.Email,
				Role:           rt.role,
				Permissions:    perms,
				PermissionsMap: permMap,
				CompanyID:      uuid.UUID(comp.ID.Bytes),
			}

			buildContext := func() context.Context {
				c := contextWithAuth(context.Background(), testUser, comp.ID, rt.role)
				c = context.WithValue(c, middleware.PersonContextKey, person)
				return c
			}

			// 1. GET /clients
			getReq := httptest.NewRequest("GET", "/clients", nil).WithContext(buildContext())
			getW := httptest.NewRecorder()
			r.ServeHTTP(getW, getReq)

			if rt.isClient {
				if getW.Code != http.StatusForbidden {
					t.Errorf("%s (Client): expected 403 on GET /clients, got %d", rt.name, getW.Code)
				}
			} else {
				if getW.Code != http.StatusOK {
					t.Errorf("%s: expected 200 on GET /clients, got %d (%s)", rt.name, getW.Code, getW.Body.String())
				}
			}

			// 2. POST /clients
			clientBody := `{"name":"Test New Client ` + rt.name + `"}`
			postReq := httptest.NewRequest("POST", "/clients", bytes.NewBufferString(clientBody)).WithContext(buildContext())
			postW := httptest.NewRecorder()
			r.ServeHTTP(postW, postReq)

			if rt.isFull {
				if postW.Code != http.StatusCreated {
					t.Errorf("%s: expected 201 on POST /clients, got %d (%s)", rt.name, postW.Code, postW.Body.String())
				}
				// Verify consistent { id, client } response
				var resp map[string]interface{}
				_ = json.Unmarshal(postW.Body.Bytes(), &resp)
				if resp["id"] == nil || resp["client"] == nil {
					t.Errorf("%s: expected both id and client in POST /clients response, got %v", rt.name, resp)
				}
			} else {
				if postW.Code != http.StatusForbidden {
					t.Errorf("%s: expected 403 on POST /clients, got %d", rt.name, postW.Code)
				}
			}

			// 3. GET /projects
			projReq := httptest.NewRequest("GET", "/projects", nil).WithContext(buildContext())
			projW := httptest.NewRecorder()
			r.ServeHTTP(projW, projReq)

			if rt.isClient {
				// Client without assigned project gets empty or 200/403
				if projW.Code != http.StatusOK && projW.Code != http.StatusForbidden {
					t.Errorf("%s: unexpected code %d on GET /projects", rt.name, projW.Code)
				}
			} else {
				if projW.Code != http.StatusOK {
					t.Errorf("%s: expected 200 on GET /projects, got %d", rt.name, projW.Code)
				}
			}

			// 4. POST /items/{id}/duplicate
			itemPath := fmt.Sprintf("/items/%s/duplicate", uuid.UUID(testItem.ID.Bytes))
			dupReq := httptest.NewRequest("POST", itemPath, nil).WithContext(buildContext())
			dupW := httptest.NewRecorder()
			r.ServeHTTP(dupW, dupReq)

			if rt.isClient || (!rt.isFull && !rt.canViewAll && rt.role == authz.RoleEditor) {
				if dupW.Code != http.StatusNotFound && dupW.Code != http.StatusForbidden {
					t.Errorf("%s: expected 403 or 404 on POST /items/{id}/duplicate, got %d", rt.name, dupW.Code)
				}
			} else {
				if dupW.Code != http.StatusOK && dupW.Code != http.StatusCreated {
					t.Errorf("%s: expected 200 or 201 on POST /items/{id}/duplicate, got %d (%s)", rt.name, dupW.Code, dupW.Body.String())
				}
			}

			// 5. PATCH /items/{id}/move
			movePath := fmt.Sprintf("/items/%s/move", uuid.UUID(testItem.ID.Bytes))
			moveBody := fmt.Sprintf(`{"target_parent_id":"%s"}`, uuid.UUID(fldTarget.ID.Bytes))
			moveReq := httptest.NewRequest("PATCH", movePath, bytes.NewBufferString(moveBody)).WithContext(buildContext())
			moveW := httptest.NewRecorder()
			r.ServeHTTP(moveW, moveReq)

			if rt.isClient || (!rt.isFull && !rt.canViewAll && rt.role == authz.RoleEditor) {
				if moveW.Code != http.StatusNotFound && moveW.Code != http.StatusForbidden {
					t.Errorf("%s: expected 403 or 404 on PATCH /items/{id}/move, got %d", rt.name, moveW.Code)
				}
			} else {
				if moveW.Code != http.StatusOK {
					t.Errorf("%s: expected 200 on PATCH /items/{id}/move, got %d (%s)", rt.name, moveW.Code, moveW.Body.String())
				}
			}
		})
	}
}
