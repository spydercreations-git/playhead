package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
)

func setupDriveTestRouter(driveH *DriveHandler) *chi.Mux {
	r := chi.NewRouter()
	r.Get("/api/v1/drive/folders", driveH.ListFolders)
	r.Get("/api/v1/drive/items", driveH.ListItems)
	r.Post("/api/v1/drive/folders", driveH.CreateFolder)
	r.Patch("/api/v1/drive/items/{id}", driveH.RenameItem)
	r.Delete("/api/v1/drive/items/{id}", driveH.DeleteItem)
	r.Post("/api/v1/drive/items/{id}/restore", driveH.RestoreItem)
	r.Post("/api/v1/drive/items/{id}/move", driveH.MoveToProject)
	r.Post("/api/v1/drive/items/{id}/copy", driveH.CopyToProject)
	r.Get("/api/v1/drive/recent", driveH.ListRecentItems)
	r.Post("/api/v1/drive/recent", driveH.RecordRecentItem)
	r.Get("/api/v1/drive/trash", driveH.ListTrash)
	return r
}

func TestMyDriveAccessAndPermissions(t *testing.T) {
	cfg := config.Load()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Skipf("skipping database test: postgres not reachable: %v", err)
	}
	defer pool.Close()

	queries := db.New(pool)
	driveH := NewDriveHandler(queries, pool, nil, cfg)
	router := setupDriveTestRouter(driveH)

	// Create test company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Drive Test Studio",
		Slug:              fmt.Sprintf("drive-test-%d", time.Now().UnixNano()),
		Plan:              plans.PlanPro,
		Status:            "active",
		StorageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		Seats:             5,
	})
	if err != nil {
		t.Fatalf("failed to create test company: %v", err)
	}

	// 1. Owner user (Alice)
	alice, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("alice-%d@test.com", time.Now().UnixNano()),
		Name:  "Alice DriveOwner",
	})
	if err != nil {
		t.Fatalf("failed to create alice: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    alice.ID,
		Role:      authz.RoleMember,
	})

	// 2. Another Member user (Bob)
	bob, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("bob-%d@test.com", time.Now().UnixNano()),
		Name:  "Bob Colleague",
	})
	if err != nil {
		t.Fatalf("failed to create bob: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    bob.ID,
		Role:      authz.RoleMember,
	})

	// 3. Viewer user (Charlie)
	charlie, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("charlie-%d@test.com", time.Now().UnixNano()),
		Name:  "Charlie Viewer",
	})
	if err != nil {
		t.Fatalf("failed to create charlie: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    charlie.ID,
		Role:      authz.RoleGuest,
	})

	// 4. Admin user (Dave)
	dave, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("dave-%d@test.com", time.Now().UnixNano()),
		Name:  "Dave Admin",
	})
	if err != nil {
		t.Fatalf("failed to create dave: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    dave.ID,
		Role:      authz.RoleAdmin,
	})

	// Target project for move/copy
	clientRec, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme Studio",
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientRec.ID,
		Name:      "Acme Commercial 2026",
		CreatedBy: alice.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// Give Alice Full grant on the project so she can upload/move items into it
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       alice.Email,
		UserID:      alice.ID,
		Level:       authz.LevelFull,
		CanDownload: true,
		GrantedBy:   alice.ID,
	})



	var defaultFolders []DriveFolderItem
	var defaultVideosFolderID string

	// -------------------------------------------------------------------------
	// A. Listing folders seeds 4 default folders (Videos, Images, Documents, Music)
	// -------------------------------------------------------------------------
	t.Run("Alice lists drive folders: auto-seeds 4 default folders", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/drive/folders", nil)
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp struct {
			Folders []DriveFolderItem `json:"folders"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode folders response: %v", err)
		}

		if len(resp.Folders) < 4 {
			t.Fatalf("expected at least 4 default folders, got %d", len(resp.Folders))
		}

		foundCategories := make(map[string]bool)
		for _, f := range resp.Folders {
			if f.IsDefaultFolder {
				foundCategories[f.Category] = true
				if f.Category == "videos" {
					defaultVideosFolderID = f.ID
				}
			}
		}

		for _, required := range []string{"videos", "images", "documents", "music"} {
			if !foundCategories[required] {
				t.Errorf("missing default folder category %s", required)
			}
		}
		defaultFolders = resp.Folders
	})

	// -------------------------------------------------------------------------
	// B. Default folders CANNOT be renamed or deleted (Hard Rule)
	// -------------------------------------------------------------------------
	t.Run("Default folders cannot be renamed", func(t *testing.T) {
		renameBody, _ := json.Marshal(map[string]string{"name": "Renamed Videos"})
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/drive/items/%s", defaultVideosFolderID), bytes.NewReader(renameBody))
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when renaming default folder, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("Default folders cannot be deleted", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/drive/items/%s", defaultVideosFolderID), nil)
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when deleting default folder, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("Default folders cannot be moved to project", func(t *testing.T) {
		moveBody, _ := json.Marshal(map[string]interface{}{
			"target_project_id": uuid.UUID(proj.ID.Bytes).String(),
		})
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/drive/items/%s/move", defaultVideosFolderID), bytes.NewReader(moveBody))
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when moving default folder, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// C. Custom folders & files: creation, rename, trash, restore
	// -------------------------------------------------------------------------
	var customFolderID string
	t.Run("Alice creates custom folder, renames, trashes, and restores it", func(t *testing.T) {
		// 1. Create custom folder
		createBody, _ := json.Marshal(map[string]string{"name": "Project Pitches"})
		req := httptest.NewRequest("POST", "/api/v1/drive/folders", bytes.NewReader(createBody))
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
		}
		var created db.Item
		_ = json.Unmarshal(rr.Body.Bytes(), &created)
		customFolderID = uuid.UUID(created.ID.Bytes).String()

		// 2. Rename custom folder
		renameBody, _ := json.Marshal(map[string]string{"name": "Project Pitches 2026"})
		reqRename := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/drive/items/%s", customFolderID), bytes.NewReader(renameBody))
		reqRename = reqRename.WithContext(contextWithAuth(reqRename.Context(), alice, comp.ID, authz.RoleMember))
		rrRename := httptest.NewRecorder()
		router.ServeHTTP(rrRename, reqRename)

		if rrRename.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on rename custom folder, got %d: %s", rrRename.Code, rrRename.Body.String())
		}

		// 3. Trash custom folder
		reqTrash := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/drive/items/%s", customFolderID), nil)
		reqTrash = reqTrash.WithContext(contextWithAuth(reqTrash.Context(), alice, comp.ID, authz.RoleMember))
		rrTrash := httptest.NewRecorder()
		router.ServeHTTP(rrTrash, reqTrash)

		if rrTrash.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on trash custom folder, got %d: %s", rrTrash.Code, rrTrash.Body.String())
		}

		// 4. Verify in trash list
		reqListTrash := httptest.NewRequest("GET", "/api/v1/drive/trash", nil)
		reqListTrash = reqListTrash.WithContext(contextWithAuth(reqListTrash.Context(), alice, comp.ID, authz.RoleMember))
		rrListTrash := httptest.NewRecorder()
		router.ServeHTTP(rrListTrash, reqListTrash)

		var trashResp struct {
			Items []db.Item `json:"items"`
		}
		_ = json.Unmarshal(rrListTrash.Body.Bytes(), &trashResp)
		found := false
		for _, it := range trashResp.Items {
			if uuid.UUID(it.ID.Bytes).String() == customFolderID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected custom folder %s in trash list", customFolderID)
		}

		// 5. Restore custom folder
		reqRestore := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/drive/items/%s/restore", customFolderID), nil)
		reqRestore = reqRestore.WithContext(contextWithAuth(reqRestore.Context(), alice, comp.ID, authz.RoleMember))
		rrRestore := httptest.NewRecorder()
		router.ServeHTTP(rrRestore, reqRestore)

		if rrRestore.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on restore, got %d: %s", rrRestore.Code, rrRestore.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// D. OWNER-ONLY ACCESS ENFORCEMENT: Blocked actors
	// "Tests for access: another user, a Viewer, an Admin and a share link visitor all get blocked."
	// -------------------------------------------------------------------------
	t.Run("Another user (Bob) gets blocked (403) from accessing Alice's folder", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/drive/items?folder_id=%s", customFolderID), nil)
		req = req.WithContext(contextWithAuth(req.Context(), bob, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for another user accessing Alice's folder, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("A Viewer (Charlie) gets blocked (403) from accessing Alice's folder", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/drive/items?folder_id=%s", customFolderID), nil)
		req = req.WithContext(contextWithAuth(req.Context(), charlie, comp.ID, authz.RoleGuest))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for Viewer accessing Alice's folder, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("An Admin (Dave) gets blocked (403) from mutating Alice's drive item", func(t *testing.T) {
		renameBody, _ := json.Marshal(map[string]string{"name": "Admin Hijack"})
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/drive/items/%s", customFolderID), bytes.NewReader(renameBody))
		req = req.WithContext(contextWithAuth(req.Context(), dave, comp.ID, authz.RoleAdmin))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for Admin accessing another user's personal drive, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("An unauthenticated user gets blocked (401)", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/drive/folders", nil)
		// No auth context
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized for unauthenticated visitor, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// E. Move custom folder to project (including all subfolders and renditions)
	// -------------------------------------------------------------------------
	t.Run("Move custom folder to project", func(t *testing.T) {
		moveBody, _ := json.Marshal(map[string]interface{}{
			"target_project_id": uuid.UUID(proj.ID.Bytes).String(),
		})
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/drive/items/%s/move", customFolderID), bytes.NewReader(moveBody))
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on move to project, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify item now has project_id and drive_owner_id is NULL
		var movedItem db.Item
		_ = json.Unmarshal(rr.Body.Bytes(), &movedItem)
		if !movedItem.ProjectID.Valid || movedItem.ProjectID != proj.ID {
			t.Errorf("expected project_id to be %v, got %v", proj.ID, movedItem.ProjectID)
		}
		if movedItem.DriveOwnerID.Valid {
			t.Errorf("expected drive_owner_id to be NULL after move, got %v", movedItem.DriveOwnerID)
		}
	})

	// -------------------------------------------------------------------------
	// F. Copy custom folder to project (including subfolders and renditions)
	// -------------------------------------------------------------------------
	t.Run("Copy custom item to project", func(t *testing.T) {
		// Create a new custom folder for copy test
		createBody, _ := json.Marshal(map[string]string{"name": "Assets To Copy"})
		req := httptest.NewRequest("POST", "/api/v1/drive/folders", bytes.NewReader(createBody))
		req = req.WithContext(contextWithAuth(req.Context(), alice, comp.ID, authz.RoleMember))
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var created db.Item
		_ = json.Unmarshal(rr.Body.Bytes(), &created)
		folderToCopyID := uuid.UUID(created.ID.Bytes).String()

		copyBody, _ := json.Marshal(map[string]interface{}{
			"target_project_id": uuid.UUID(proj.ID.Bytes).String(),
		})
		reqCopy := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/drive/items/%s/copy", folderToCopyID), bytes.NewReader(copyBody))
		reqCopy = reqCopy.WithContext(contextWithAuth(reqCopy.Context(), alice, comp.ID, authz.RoleMember))
		rrCopy := httptest.NewRecorder()
		router.ServeHTTP(rrCopy, reqCopy)

		if rrCopy.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created on copy to project, got %d: %s", rrCopy.Code, rrCopy.Body.String())
		}

		var copiedItem db.Item
		_ = json.Unmarshal(rrCopy.Body.Bytes(), &copiedItem)
		if !copiedItem.ProjectID.Valid || copiedItem.ProjectID != proj.ID {
			t.Errorf("expected copied item to belong to project %v", proj.ID)
		}
		if copiedItem.Name != "Assets To Copy (Copy)" {
			t.Errorf("expected copy suffix in name, got %q", copiedItem.Name)
		}
	})

	// -------------------------------------------------------------------------
	// G. Recent items: record and list
	// -------------------------------------------------------------------------
	t.Run("Record and list recent items", func(t *testing.T) {
		recordBody, _ := json.Marshal(map[string]interface{}{
			"item_id":   defaultVideosFolderID,
			"item_type": "folder",
		})
		reqRec := httptest.NewRequest("POST", "/api/v1/drive/recent", bytes.NewReader(recordBody))
		reqRec = reqRec.WithContext(contextWithAuth(reqRec.Context(), alice, comp.ID, authz.RoleMember))
		rrRec := httptest.NewRecorder()
		router.ServeHTTP(rrRec, reqRec)

		if rrRec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on record recent, got %d: %s", rrRec.Code, rrRec.Body.String())
		}

		reqList := httptest.NewRequest("GET", "/api/v1/drive/recent", nil)
		reqList = reqList.WithContext(contextWithAuth(reqList.Context(), alice, comp.ID, authz.RoleMember))
		rrList := httptest.NewRecorder()
		router.ServeHTTP(rrList, reqList)

		if rrList.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on list recent, got %d: %s", rrList.Code, rrList.Body.String())
		}

		var recentResp struct {
			Items []map[string]interface{} `json:"items"`
		}
		_ = json.Unmarshal(rrList.Body.Bytes(), &recentResp)
		if len(recentResp.Items) == 0 {
			t.Fatalf("expected at least 1 recent item, got 0")
		}
	})

	_ = defaultFolders
}
