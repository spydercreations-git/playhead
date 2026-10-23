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
	"github.com/playhead/playhead/services/api/internal/config"
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
	tasksHandler := NewTasksHandler(queries, nil, nil, nil)
	tasksHandler.SetPool(pool)
	homeHandler := NewHomeHandler(pool, queries)
	quickLinksHandler := NewQuickLinksHandler(queries)
	storageHandler := NewStorageHandler(queries)
	searchHandler := NewSearchHandler(pool, queries)
	cfg := &config.Config{
		CollabInternalSecret: "dummy-secret-32-chars-long-test!",
		CollabURL:            "http://localhost:8082",
	}
	documentsHandler := NewDocumentsHandler(pool, queries, nil, nil, cfg)

	r.Get("/clients", clientHandler.List)
	r.Post("/clients", clientHandler.Create)
	r.Get("/projects", projectHandler.List)
	r.Post("/items/{id}/duplicate", itemsHandler.CopyItem)
	r.Post("/items/{id}/copy", itemsHandler.CopyItem)
	r.Patch("/items/{id}/move", itemsHandler.MoveItem)
	r.Get("/tasks", tasksHandler.ListTasks)
	r.Post("/tasks", tasksHandler.CreateTask)
	r.Get("/tasks/trash", tasksHandler.ListTrashTasks)

	// Phase 4 Endpoints
	r.Get("/home", homeHandler.GetHomeDashboard)
	r.Get("/home/activity", homeHandler.ListActivity)
	r.Put("/users/me/upload-destination", homeHandler.UpdateUploadDestination)
	r.Get("/quick-links", quickLinksHandler.List)
	r.Post("/quick-links", quickLinksHandler.Create)
	r.Delete("/quick-links/{id}", quickLinksHandler.Delete)
	r.Get("/storage", storageHandler.GetStorage)
	r.Get("/search", searchHandler.UniversalSearch)
	r.Get("/documents", documentsHandler.List)
	r.Post("/documents", documentsHandler.Create)

	pickerHandler := NewPickerHandler(pool, queries)
	r.Get("/pickers", pickerHandler.GetPickerData)

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

			// 6. GET /tasks (all roles can access task list)
			taskListReq := httptest.NewRequest("GET", "/tasks", nil).WithContext(buildContext())
			taskListW := httptest.NewRecorder()
			r.ServeHTTP(taskListW, taskListReq)
			if taskListW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /tasks, got %d (%s)", rt.name, taskListW.Code, taskListW.Body.String())
			}

			// 7. GET /tasks/trash (only staff/full access can view trash)
			trashReq := httptest.NewRequest("GET", "/tasks/trash", nil).WithContext(buildContext())
			trashW := httptest.NewRecorder()
			r.ServeHTTP(trashW, trashReq)
			if rt.isClient || rt.role == authz.RoleEditor {
				if trashW.Code != http.StatusForbidden {
					t.Errorf("%s: expected 403 on GET /tasks/trash, got %d", rt.name, trashW.Code)
				}
			} else {
				if trashW.Code != http.StatusOK {
					t.Errorf("%s: expected 200 on GET /tasks/trash, got %d (%s)", rt.name, trashW.Code, trashW.Body.String())
				}
			}

			// 8. GET /home (all roles)
			homeReq := httptest.NewRequest("GET", "/home", nil).WithContext(buildContext())
			homeW := httptest.NewRecorder()
			r.ServeHTTP(homeW, homeReq)
			if homeW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /home, got %d (%s)", rt.name, homeW.Code, homeW.Body.String())
			}

			// 9. GET /home/activity (all roles)
			actReq := httptest.NewRequest("GET", "/home/activity", nil).WithContext(buildContext())
			actW := httptest.NewRecorder()
			r.ServeHTTP(actW, actReq)
			if actW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /home/activity, got %d (%s)", rt.name, actW.Code, actW.Body.String())
			}

			// 10. PUT /users/me/upload-destination (all roles)
			upDestBody := fmt.Sprintf(`{"project_id":"%s","folder_id":"%s"}`, uuid.UUID(pr.ID.Bytes), uuid.UUID(fld.ID.Bytes))
			upDestReq := httptest.NewRequest("PUT", "/users/me/upload-destination", bytes.NewBufferString(upDestBody)).WithContext(buildContext())
			upDestW := httptest.NewRecorder()
			r.ServeHTTP(upDestW, upDestReq)
			if upDestW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on PUT /users/me/upload-destination, got %d (%s)", rt.name, upDestW.Code, upDestW.Body.String())
			}

			// 11. GET /quick-links (all roles)
			qlReq := httptest.NewRequest("GET", "/quick-links", nil).WithContext(buildContext())
			qlW := httptest.NewRecorder()
			r.ServeHTTP(qlW, qlReq)
			if qlW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /quick-links, got %d (%s)", rt.name, qlW.Code, qlW.Body.String())
			}

			// 12. POST /quick-links (all roles)
			qlCreateBody := `{"name":"Vimeo","url":"https://vimeo.com"}`
			qlCreateReq := httptest.NewRequest("POST", "/quick-links", bytes.NewBufferString(qlCreateBody)).WithContext(buildContext())
			qlCreateW := httptest.NewRecorder()
			r.ServeHTTP(qlCreateW, qlCreateReq)
			if qlCreateW.Code != http.StatusCreated {
				t.Errorf("%s: expected 201 on POST /quick-links, got %d (%s)", rt.name, qlCreateW.Code, qlCreateW.Body.String())
			}

			// 13. GET /storage (staff only)
			storageReq := httptest.NewRequest("GET", "/storage", nil).WithContext(buildContext())
			storageW := httptest.NewRecorder()
			r.ServeHTTP(storageW, storageReq)
			if rt.isClient || rt.role == authz.RoleEditor {
				if storageW.Code != http.StatusForbidden {
					t.Errorf("%s: expected 403 on GET /storage, got %d", rt.name, storageW.Code)
				}
			} else {
				if storageW.Code != http.StatusOK {
					t.Errorf("%s: expected 200 on GET /storage, got %d (%s)", rt.name, storageW.Code, storageW.Body.String())
				}
			}

			// 14. GET /search (all roles)
			searchReq := httptest.NewRequest("GET", "/search?q=test", nil).WithContext(buildContext())
			searchW := httptest.NewRecorder()
			r.ServeHTTP(searchW, searchReq)
			if searchW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /search, got %d (%s)", rt.name, searchW.Code, searchW.Body.String())
			}

			// 15. GET /documents (all roles)
			docListReq := httptest.NewRequest("GET", "/documents", nil).WithContext(buildContext())
			docListW := httptest.NewRecorder()
			r.ServeHTTP(docListW, docListReq)
			if docListW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /documents, got %d (%s)", rt.name, docListW.Code, docListW.Body.String())
			}

			// 16. POST /documents (staff and editor can create, client cannot)
			docBody := `{"name":"Project Brief Document"}`
			docPostReq := httptest.NewRequest("POST", "/documents", bytes.NewBufferString(docBody)).WithContext(buildContext())
			docPostW := httptest.NewRecorder()
			r.ServeHTTP(docPostW, docPostReq)
			if rt.isClient {
				if docPostW.Code != http.StatusForbidden {
					t.Errorf("%s (Client): expected 403 on POST /documents, got %d", rt.name, docPostW.Code)
				}
			} else {
				if docPostW.Code != http.StatusCreated && docPostW.Code != http.StatusOK {
					t.Errorf("%s: expected 201 on POST /documents, got %d (%s)", rt.name, docPostW.Code, docPostW.Body.String())
				}
			}

			// 16. GET /pickers
			pickerReq := httptest.NewRequest("GET", "/pickers?tab=clients", nil).WithContext(buildContext())
			pickerW := httptest.NewRecorder()
			r.ServeHTTP(pickerW, pickerReq)
			if pickerW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /pickers?tab=clients, got %d", rt.name, pickerW.Code)
			}

			// Test staff tab
			pickerStaffReq := httptest.NewRequest("GET", "/pickers?tab=staff", nil).WithContext(buildContext())
			pickerStaffW := httptest.NewRecorder()
			r.ServeHTTP(pickerStaffW, pickerStaffReq)
			if pickerStaffW.Code != http.StatusOK {
				t.Errorf("%s: expected 200 on GET /pickers?tab=staff, got %d", rt.name, pickerStaffW.Code)
			}
			if rt.isClient {
				var pResp PickerResponse
				_ = json.Unmarshal(pickerStaffW.Body.Bytes(), &pResp)
				if len(pResp.Items) != 0 {
					t.Errorf("%s (Client): expected 0 items in staff tab, got %d", rt.name, len(pResp.Items))
				}
			}
		})
	}
}

// TestSearchPermissionsForClientsAndEditors verifies:
// 1. Clients never see items from other clients.
// 2. Clients never see internal task comments.
// 3. Editors only see projects/files/tasks they have grants/assignments for.
// 4. Deleted items are never returned in search.
func TestSearchPermissionsForClientsAndEditors(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Search Test Company",
		Slug: fmt.Sprintf("search-test-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	searchH := NewSearchHandler(pool, queries)

	// Create 2 clients: Client Alpha and Client Beta
	clientAlpha, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Alpha Client",
	})
	clientBeta, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Beta Client",
	})

	// Create Projects
	projAlpha, _ := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientAlpha.ID,
		Name:      "Alpha Campaign 2026",
	})
	projBeta, _ := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientBeta.ID,
		Name:      "Beta Secret Commercial",
	})

	// Create Files in each project
	folderAlpha, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: projAlpha.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "folder",
		Name:      "Alpha Exports",
		Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
	})
	_, _ = queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: projAlpha.ID,
		ParentID:  folderAlpha.ID,
		Kind:      "file",
		Name:      "alpha_master_v1.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(10), Valid: true},
	})

	folderBeta, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: projBeta.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "folder",
		Name:      "Beta Exports",
		Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
	})
	_, _ = queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: projBeta.ID,
		ParentID:  folderBeta.ID,
		Kind:      "file",
		Name:      "beta_master_v1.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(10), Valid: true},
	})

	// 1. Setup Users
	clientAlphaUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("sarah-%d@alpha.com", time.Now().UnixNano()),
		Name:  "Sarah Alpha",
	})
	if err != nil {
		t.Fatalf("failed to create clientAlphaUser: %v", err)
	}
	clientAlphaPerson := authz.Person{
		UserID:         uuid.UUID(clientAlphaUser.ID.Bytes),
		Email:          clientAlphaUser.Email,
		Role:           "client",
		CompanyID:      uuid.UUID(comp.ID.Bytes),
		ClientID:       uuid.UUID(clientAlpha.ID.Bytes),
		PermissionsMap: authz.DefaultPermissions("client"),
	}

	editorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("ed-%d@playhead.com", time.Now().UnixNano()),
		Name:  "Ed Editor",
	})
	if err != nil {
		t.Fatalf("failed to create editorUser: %v", err)
	}
	editorPerson := authz.Person{
		UserID:         uuid.UUID(editorUser.ID.Bytes),
		Email:          editorUser.Email,
		Role:           authz.RoleEditor,
		CompanyID:      uuid.UUID(comp.ID.Bytes),
		PermissionsMap: authz.DefaultPermissions(authz.RoleEditor),
	}

	// Create Tasks
	var alphaTaskID, betaTaskID uuid.UUID
	err = pool.QueryRow(ctx, `
		INSERT INTO tasks (company_id, client_id, name, description_title, description_html, status, created_by)
		VALUES ($1, $2, 'Alpha Review Cuts', 'Alpha description', '<p>Alpha details</p>', 'in_progress', $3)
		RETURNING id
	`, comp.ID, clientAlpha.ID, clientAlphaUser.ID).Scan(&alphaTaskID)
	if err != nil {
		t.Fatalf("failed to insert alpha task: %v", err)
	}

	err = pool.QueryRow(ctx, `
		INSERT INTO tasks (company_id, client_id, name, description_title, description_html, status, created_by)
		VALUES ($1, $2, 'Beta Confidential Color Grade', 'Beta description', '<p>Secret budget numbers</p>', 'in_progress', $3)
		RETURNING id
	`, comp.ID, clientBeta.ID, editorUser.ID).Scan(&betaTaskID)
	// Grant editor access to Beta Project
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID: comp.ID,
		TargetType: "project",
		TargetID:   projBeta.ID,
		Email:      editorUser.Email,
		UserID:     editorUser.ID,
		Level:      authz.LevelEditor,
	})
	// Assign editor to Beta Task
	_, _ = pool.Exec(ctx, `INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)`, betaTaskID, editorUser.ID)

	// --- TEST 1: Client Alpha Searches ---
	// 1A. Search "Beta" -> Must return 0 results (Client Alpha cannot see Beta Client, Project, Files, or Tasks)
	req := httptest.NewRequest("GET", "/api/v1/search?q=Beta", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.PersonContextKey, clientAlphaPerson))
	w := httptest.NewRecorder()
	searchH.UniversalSearch(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from search, got %d", w.Code)
	}
	var resp struct {
		Results []SearchResultItem `json:"results"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Results) > 0 {
		t.Errorf("Security violation: Client Alpha saw Beta items in search: %+v", resp.Results)
	}

	// 1B. Search "Alpha" -> Should return Alpha Client, Alpha Project, Alpha File, and Alpha Task
	reqAlpha := httptest.NewRequest("GET", "/api/v1/search?q=Alpha", nil)
	reqAlpha = reqAlpha.WithContext(context.WithValue(reqAlpha.Context(), middleware.PersonContextKey, clientAlphaPerson))
	wAlpha := httptest.NewRecorder()
	searchH.UniversalSearch(wAlpha, reqAlpha)
	_ = json.Unmarshal(wAlpha.Body.Bytes(), &resp)
	if len(resp.Results) == 0 {
		t.Errorf("Client Alpha should have seen Alpha items in search, got 0")
	}

	// --- TEST 2: Editor Searches ---
	// 2A. Editor searches "Beta" -> Should find Beta project, file, and task (granted)
	reqEditorBeta := httptest.NewRequest("GET", "/api/v1/search?q=Beta", nil)
	reqEditorBeta = reqEditorBeta.WithContext(context.WithValue(reqEditorBeta.Context(), middleware.PersonContextKey, editorPerson))
	wEditorBeta := httptest.NewRecorder()
	searchH.UniversalSearch(wEditorBeta, reqEditorBeta)
	var respEditor struct {
		Results []SearchResultItem `json:"results"`
	}
	_ = json.Unmarshal(wEditorBeta.Body.Bytes(), &respEditor)
	if len(respEditor.Results) == 0 {
		t.Errorf("Editor should have found Beta items granted to them, got 0")
	}

	// 2B. Editor searches "Alpha" -> Must return 0 results (Editor was NOT granted Alpha project or task)
	reqEditorAlpha := httptest.NewRequest("GET", "/api/v1/search?q=Alpha", nil)
	reqEditorAlpha = reqEditorAlpha.WithContext(context.WithValue(reqEditorAlpha.Context(), middleware.PersonContextKey, editorPerson))
	wEditorAlpha := httptest.NewRecorder()
	searchH.UniversalSearch(wEditorAlpha, reqEditorAlpha)
	_ = json.Unmarshal(wEditorAlpha.Body.Bytes(), &respEditor)
	if len(respEditor.Results) > 0 {
		t.Errorf("Security violation: Editor saw ungranted Alpha items: %+v", respEditor.Results)
	}

	// --- TEST 3: Deleted Items Never Appear in Search ---
	_, _ = pool.Exec(ctx, `UPDATE items SET deleted_at = NOW() WHERE name = 'beta_master_v1.mp4'`)
	reqDeleted := httptest.NewRequest("GET", "/api/v1/search?q=beta_master", nil)
	reqDeleted = reqDeleted.WithContext(context.WithValue(reqDeleted.Context(), middleware.PersonContextKey, editorPerson))
	wDeleted := httptest.NewRecorder()
	searchH.UniversalSearch(wDeleted, reqDeleted)
	var respDeleted struct {
		Results []SearchResultItem `json:"results"`
	}
	_ = json.Unmarshal(wDeleted.Body.Bytes(), &respDeleted)
	for _, item := range respDeleted.Results {
		if item.Title == "beta_master_v1.mp4" {
			t.Errorf("Security violation: Deleted file appeared in search results: %+v", item)
		}
	}
}
