package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
)


func TestAccessMatrix(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	projectH := NewProjectHandler(queries)
	itemsH := NewItemsHandler(queries, nil)

	// 1. Create company and seed roles
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Access Matrix Studio",
		Slug:              fmt.Sprintf("access-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 100 * 1024 * 1024 * 1024,
		Seats:             20,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	_, _ = SeedDefaultCompanyRoles(ctx, queries, comp.ID)

	// Users creation helper
	createUser := func(name, emailPrefix, role string) db.User {
		u, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("%s-%d@studio.com", emailPrefix, time.Now().UnixNano()),
			Name:  name,
		})
		if err != nil {
			t.Fatalf("failed to create user %s: %v", name, err)
		}
		if role != "" {
			membershipRole := role
			title := ""
			isAdmin := false
			if role == authz.RoleCEO {
				membershipRole = authz.RoleStaff
				title = "CEO"
				isAdmin = true
			} else if role == authz.RoleProjectManager {
				membershipRole = authz.RoleStaff
				title = "Project Manager"
			}
			perms := []byte("{}")
			if isAdmin {
				perms = []byte(`{"admin": true}`)
			}
			_, err = queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
				CompanyID:   comp.ID,
				UserID:      u.ID,
				Role:        membershipRole,
				Title:       pgtype.Text{String: title, Valid: title != ""},
				Permissions: perms,
				Status:      "active",
			})
			if err != nil {
				t.Fatalf("failed to create membership for %s: %v", name, err)
			}
		}
		return u
	}

	adminUser := createUser("CEO Harsh", "ceo", authz.RoleCEO)
	fullUser := createUser("Full Member", "full", authz.RoleEditor)
	editorUser := createUser("Editor Freelancer", "editor", authz.RoleEditor)
	uploaderUser := createUser("Uploader User", "uploader", authz.RoleEditor)
	commenterUser := createUser("Commenter User", "commenter", authz.RoleEditor)
	viewerUser := createUser("Viewer User", "viewer", authz.RoleEditor)
	viewerNoDownloadUser := createUser("Viewer NoDL", "nodl", authz.RoleEditor)
	notAddedUser := createUser("Unassigned User", "unassigned", authz.RoleEditor)
	pmUser := createUser("Project Mgr", "pm", authz.RoleProjectManager)

	// Client and client contact
	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Everygen Client",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	clientUser := createUser("Sarah Client", "sarah-client", "")
	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     client.ID,
		Name:         clientUser.Name,
		Email:        clientUser.Email,
		DefaultLevel: authz.LevelNone,
		CanDownload:  false,
	})
	if err != nil {
		t.Fatalf("failed to create client contact: %v", err)
	}

	// 2. Admin creates a project
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Matrix Video Campaign",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	projIDStr := pgUUIDToString(proj.ID)

	// Create root folders
	rawFolder, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "folder",
		Name:      "Raw files",
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create raw folder: %v", err)
	}

	// Create files
	adminFile, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  rawFolder.ID,
		Kind:      "file",
		Name:      "admin_footage.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create admin file: %v", err)
	}

	uploaderFile, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  rawFolder.ID,
		Kind:      "file",
		Name:      "uploader_footage.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: uploaderUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create uploader file: %v", err)
	}

	// 3. Assign grants to project
	addGrant := func(u db.User, level string, canDownload bool) {
		_, gErr := queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       authz.NormalizeEmail(u.Email),
			UserID:      u.ID,
			Level:       level,
			CanDownload: canDownload,
			GrantedBy:   adminUser.ID,
		})
		if gErr != nil {
			t.Fatalf("failed to create grant for %s: %v", u.Email, gErr)
		}
	}

	addGrant(fullUser, authz.LevelFull, true)
	addGrant(editorUser, authz.LevelEditor, true)
	addGrant(uploaderUser, authz.LevelUploader, true)
	addGrant(commenterUser, authz.LevelCommenter, true)
	addGrant(viewerUser, authz.LevelViewer, true)
	addGrant(viewerNoDownloadUser, authz.LevelViewer, false)
	addGrant(clientUser, authz.LevelViewer, true)
	addGrant(pmUser, authz.LevelEditor, true)

	// Folder override: hide rawFolder from Sarah Client by granting "none" on folder
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "folder",
		TargetID:    rawFolder.ID,
		Email:       authz.NormalizeEmail(clientUser.Email),
		UserID:      clientUser.ID,
		Level:       authz.LevelNone,
		CanDownload: false,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create folder override: %v", err)
	}

	// Setup Router
	r := chi.NewRouter()
	r.Get("/api/v1/projects", projectH.List)
	r.Get("/api/v1/projects/{id}", projectH.Get)
	r.Patch("/api/v1/projects/{id}", projectH.Update)
	r.Delete("/api/v1/projects/{id}", projectH.Archive)
	r.Get("/api/v1/projects/{id}/items", itemsH.ListItems)
	r.Post("/api/v1/projects/{id}/folders", itemsH.CreateFolder)
	r.Delete("/api/v1/items/{id}", itemsH.DeleteItem)
	r.Post("/api/v1/projects/{id}/people", projectH.AddPerson)

	t.Run("1. List projects", func(t *testing.T) {
		// Admin sees project
		req := httptest.NewRequest("GET", "/api/v1/projects", nil).WithContext(contextWithAuth(context.Background(), adminUser, comp.ID, authz.RoleCEO))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("Admin list projects expected 200, got %d", rec.Code)
		}

		// Editor sees project
		req = httptest.NewRequest("GET", "/api/v1/projects", nil).WithContext(contextWithAuth(context.Background(), editorUser, comp.ID, authz.RoleEditor))
		rec = httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("Editor list projects expected 200, got %d", rec.Code)
		}

		// Not added user sees empty list (not the project)
		req = httptest.NewRequest("GET", "/api/v1/projects", nil).WithContext(contextWithAuth(context.Background(), notAddedUser, comp.ID, authz.RoleEditor))
		rec = httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("NotAdded list projects expected 200, got %d", rec.Code)
		}
		var out struct {
			Projects []map[string]interface{} `json:"projects"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if len(out.Projects) != 0 {
			t.Fatalf("NotAdded user expected 0 projects, got %d", len(out.Projects))
		}
	})

	t.Run("2. Open project", func(t *testing.T) {
		// Admin, Full, Editor, Viewer can open project (200)
		for _, u := range []db.User{adminUser, fullUser, editorUser, uploaderUser, commenterUser, viewerUser, clientUser} {
			req := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil).WithContext(contextWithAuth(context.Background(), u, comp.ID, authz.RoleEditor))
			if u.ID == adminUser.ID {
				req = httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil).WithContext(contextWithAuth(context.Background(), u, comp.ID, authz.RoleCEO))
			}
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("user %s expected 200 opening project, got %d", u.Name, rec.Code)
			}
		}

		// Not added user gets 404
		req := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil).WithContext(contextWithAuth(context.Background(), notAddedUser, comp.ID, authz.RoleEditor))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("notAddedUser expected 404 opening project, got %d", rec.Code)
		}
	})

	t.Run("3. Folder override enforcement", func(t *testing.T) {
		rawFolderIDStr := pgUUIDToString(rawFolder.ID)

		// Sarah Client has project viewer access but "none" override on rawFolder -> should get 404
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/projects/%s/items?parent_id=%s", projIDStr, rawFolderIDStr), nil)
		req = req.WithContext(contextWithAuth(req.Context(), clientUser, comp.ID, ""))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("Sarah Client expected 404 on overridden folder, got %d", rec.Code)
		}

		// Admin overrides all folder restrictions -> gets 200
		reqAdmin := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/projects/%s/items?parent_id=%s", projIDStr, rawFolderIDStr), nil)
		reqAdmin = reqAdmin.WithContext(contextWithAuth(reqAdmin.Context(), adminUser, comp.ID, authz.RoleCEO))
		recAdmin := httptest.NewRecorder()
		r.ServeHTTP(recAdmin, reqAdmin)
		if recAdmin.Code != http.StatusOK {
			t.Fatalf("Admin expected 200 on overridden folder, got %d", recAdmin.Code)
		}
	})

	t.Run("4. Create folder (Admin/Full/Editor allowed; Uploader/Viewer forbidden)", func(t *testing.T) {
		// Editor can create folder
		body, _ := json.Marshal(map[string]string{"name": "VFX Folder"})
		req := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/folders", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), editorUser, comp.ID, authz.RoleEditor))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("Editor create folder expected 201, got %d: %s", rec.Code, rec.Body.String())
		}

		// Uploader cannot create folder
		body2, _ := json.Marshal(map[string]string{"name": "Uploader Subfolder"})
		req2 := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/folders", bytes.NewReader(body2))
		req2 = req2.WithContext(contextWithAuth(req2.Context(), uploaderUser, comp.ID, authz.RoleEditor))
		rec2 := httptest.NewRecorder()
		r.ServeHTTP(rec2, req2)
		if rec2.Code != http.StatusForbidden {
			t.Fatalf("Uploader create folder expected 403, got %d", rec2.Code)
		}

		// Viewer cannot create folder
		req3 := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/folders", bytes.NewReader(body2))
		req3 = req3.WithContext(contextWithAuth(req3.Context(), viewerUser, comp.ID, authz.RoleEditor))
		rec3 := httptest.NewRecorder()
		r.ServeHTTP(rec3, req3)
		if rec3.Code != http.StatusForbidden {
			t.Fatalf("Viewer create folder expected 403, got %d", rec3.Code)
		}
	})

	t.Run("5. Delete own upload vs other's upload", func(t *testing.T) {
		uploaderFileIDStr := pgUUIDToString(uploaderFile.ID)
		adminFileIDStr := pgUUIDToString(adminFile.ID)

		// Uploader tries to delete Admin's file -> 403 Forbidden
		req := httptest.NewRequest("DELETE", "/api/v1/items/"+adminFileIDStr, nil)
		req = req.WithContext(contextWithAuth(req.Context(), uploaderUser, comp.ID, authz.RoleEditor))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("Uploader deleting Admin's file expected 403, got %d", rec.Code)
		}

		// Uploader deletes THEIR OWN file -> 200 OK
		reqOwn := httptest.NewRequest("DELETE", "/api/v1/items/"+uploaderFileIDStr, nil)
		reqOwn = reqOwn.WithContext(contextWithAuth(reqOwn.Context(), uploaderUser, comp.ID, authz.RoleEditor))
		recOwn := httptest.NewRecorder()
		r.ServeHTTP(recOwn, reqOwn)
		if recOwn.Code != http.StatusOK {
			t.Fatalf("Uploader deleting own file expected 200, got %d: %s", recOwn.Code, recOwn.Body.String())
		}

		// Editor can delete any file
		reqEditor := httptest.NewRequest("DELETE", "/api/v1/items/"+adminFileIDStr, nil)
		reqEditor = reqEditor.WithContext(contextWithAuth(reqEditor.Context(), editorUser, comp.ID, authz.RoleEditor))
		recEditor := httptest.NewRecorder()
		r.ServeHTTP(recEditor, reqEditor)
		if recEditor.Code != http.StatusOK {
			t.Fatalf("Editor deleting file expected 200, got %d", recEditor.Code)
		}
	})

	t.Run("6. Rename project (Admin/Full/Editor allowed; Uploader/Viewer forbidden)", func(t *testing.T) {
		// Editor renames project -> 200 OK
		renameBody, _ := json.Marshal(map[string]string{"name": "Renamed By Editor"})
		req := httptest.NewRequest("PATCH", "/api/v1/projects/"+projIDStr, bytes.NewReader(renameBody))
		req = req.WithContext(contextWithAuth(req.Context(), editorUser, comp.ID, authz.RoleEditor))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("Editor renaming project expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		// Uploader renames project -> 403 Forbidden
		renameBody2, _ := json.Marshal(map[string]string{"name": "Renamed By Uploader"})
		req2 := httptest.NewRequest("PATCH", "/api/v1/projects/"+projIDStr, bytes.NewReader(renameBody2))
		req2 = req2.WithContext(contextWithAuth(req2.Context(), uploaderUser, comp.ID, authz.RoleEditor))
		rec2 := httptest.NewRecorder()
		r.ServeHTTP(rec2, req2)
		if rec2.Code != http.StatusForbidden {
			t.Fatalf("Uploader renaming project expected 403, got %d", rec2.Code)
		}
	})

	t.Run("7. Delete project (Admin and Full allowed; Editor forbidden)", func(t *testing.T) {
		// Editor tries to delete project -> 403 Forbidden
		reqEditor := httptest.NewRequest("DELETE", "/api/v1/projects/"+projIDStr, nil)
		reqEditor = reqEditor.WithContext(contextWithAuth(reqEditor.Context(), editorUser, comp.ID, authz.RoleEditor))
		recEditor := httptest.NewRecorder()
		r.ServeHTTP(recEditor, reqEditor)
		if recEditor.Code != http.StatusForbidden {
			t.Fatalf("Editor deleting project expected 403, got %d", recEditor.Code)
		}

		// Full level user deletes project -> 200 OK
		reqFull := httptest.NewRequest("DELETE", "/api/v1/projects/"+projIDStr, nil)
		reqFull = reqFull.WithContext(contextWithAuth(reqFull.Context(), fullUser, comp.ID, authz.RoleEditor))
		recFull := httptest.NewRecorder()
		r.ServeHTTP(recFull, reqFull)
		if recFull.Code != http.StatusOK {
			t.Fatalf("Full user deleting project expected 200, got %d: %s", recFull.Code, recFull.Body.String())
		}
	})

	t.Run("8. Download switch off", func(t *testing.T) {
		// Viewer with CanDownload = false
		target := authz.ProjectTarget{
			ID:        uuid.UUID(proj.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			ClientID:  uuid.UUID(client.ID.Bytes),
		}
		pNoDL := authz.Person{
			UserID:    uuid.UUID(viewerNoDownloadUser.ID.Bytes),
			Email:     viewerNoDownloadUser.Email,
			Role:      authz.RoleEditor,
			CompanyID: uuid.UUID(comp.ID.Bytes),
		}
		access, err := authz.Access(ctx, queries, pNoDL, target)
		if err != nil {
			t.Fatalf("Access check failed: %v", err)
		}
		if access.CanDownload {
			t.Fatalf("Expected CanDownload to be false for viewerNoDownloadUser")
		}

		// Admin always can download
		pAdmin := authz.Person{
			UserID:    uuid.UUID(adminUser.ID.Bytes),
			Email:     adminUser.Email,
			Role:      authz.RoleCEO,
			CompanyID: uuid.UUID(comp.ID.Bytes),
		}
		accessAdmin, _ := authz.Access(ctx, queries, pAdmin, target)
		if !accessAdmin.CanDownload {
			t.Fatalf("Expected CanDownload to be true for Admin")
		}
	})

	t.Run("9. Manage access (Admin, Full, and PM with Full/Editor level allowed; Editor/Freelancer forbidden)", func(t *testing.T) {
		// Create a separate active project for access test
		p2, err := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  client.ID,
			Name:      "P2 Active",
			CreatedBy: adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create p2: %v", err)
		}
		p2IDStr := pgUUIDToString(p2.ID)

		// Grant PM Editor level on p2
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    p2.ID,
			Email:       authz.NormalizeEmail(pmUser.Email),
			UserID:      pmUser.ID,
			Level:       authz.LevelEditor,
			CanDownload: true,
			GrantedBy:   adminUser.ID,
		})
		// Grant Editor freelance role Editor level on p2
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    p2.ID,
			Email:       authz.NormalizeEmail(editorUser.Email),
			UserID:      editorUser.ID,
			Level:       authz.LevelEditor,
			CanDownload: true,
			GrantedBy:   adminUser.ID,
		})

		body, _ := json.Marshal(map[string]interface{}{
			"email":        "newperson@test.com",
			"level":        authz.LevelViewer,
			"can_download": false,
		})

		// Freelancer Editor cannot manage access -> 403 Forbidden
		reqEditor := httptest.NewRequest("POST", "/api/v1/projects/"+p2IDStr+"/people", bytes.NewReader(body))
		reqEditor = reqEditor.WithContext(contextWithAuth(reqEditor.Context(), editorUser, comp.ID, authz.RoleEditor))
		recEditor := httptest.NewRecorder()
		r.ServeHTTP(recEditor, reqEditor)
		if recEditor.Code != http.StatusForbidden {
			t.Fatalf("Freelancer Editor manage access expected 403, got %d", recEditor.Code)
		}

		// Project Manager with Editor access CAN manage access -> 200 OK
		reqPM := httptest.NewRequest("POST", "/api/v1/projects/"+p2IDStr+"/people", bytes.NewReader(body))
		reqPM = reqPM.WithContext(contextWithAuth(reqPM.Context(), pmUser, comp.ID, authz.RoleProjectManager))
		recPM := httptest.NewRecorder()
		r.ServeHTTP(recPM, reqPM)
		if recPM.Code != http.StatusOK && recPM.Code != http.StatusCreated {
			t.Fatalf("PM with Editor level expected 200/201, got %d: %s", recPM.Code, recPM.Body.String())
		}
	})
}
