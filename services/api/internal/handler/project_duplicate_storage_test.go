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
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
	"github.com/playhead/playhead/services/shared/storage"
)

func TestProjectDuplicateStorageIsolation(t *testing.T) {
	ctx := context.Background()
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	cfg := config.Load()
	stClient, err := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})
	if err != nil {
		t.Fatalf("failed to init storage: %v", err)
	}
	_ = stClient.EnsureBucket(ctx)

	projectsH := NewProjectHandler(queries)
	projectsH.SetPool(pool)
	projectsH.SetStorage(stClient)

	itemsH := NewItemsHandler(queries, stClient)
	itemsH.SetPool(pool)

	// Setup Company, Client, and Staff user
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              fmt.Sprintf("Dup Storage Co %d", time.Now().UnixNano()),
		Slug:              fmt.Sprintf("dup-storage-%d", time.Now().UnixNano()),
		Plan:              plans.PlanPro,
		Status:            "active",
		StorageLimitBytes: 100 * plans.GB,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("create company error: %v", err)
	}

	clientRec, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Dup Client",
	})
	if err != nil {
		t.Fatalf("create client error: %v", err)
	}

	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("ceo-%d@test.com", time.Now().UnixNano()),
		Name:  "CEO User",
	})
	if err != nil {
		t.Fatalf("create user error: %v", err)
	}

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    user.ID,
		Role:      authz.RoleCEO,
	})

	withAuth := func(r *http.Request, u db.User, role string, companyID pgtype.UUID) *http.Request {
		return r.WithContext(contextWithAuth(r.Context(), u, companyID, role))
	}

	// Helper to create a source project with a video file and preview objects in storage
	setupProjectWithVideo := func(projName string) (db.Project, db.Item, string) {
		proj, pErr := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  clientRec.ID,
			Name:      projName,
			CreatedBy: user.ID,
		})
		if pErr != nil {
			t.Fatalf("create project error: %v", pErr)
		}

		item, iErr := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			ParentID:  pgtype.UUID{Valid: false},
			Kind:      "file",
			Name:      "test_video.mp4",
			Position:  pgtype.Numeric{Int: big.NewInt(1), Valid: true},
			CreatedBy: user.ID,
		})
		if iErr != nil {
			t.Fatalf("create item error: %v", iErr)
		}

		storageKey := fmt.Sprintf("companies/%s/items/%s/v1", uuid.UUID(comp.ID.Bytes).String(), uuid.UUID(item.ID.Bytes).String())
		videoContent := []byte("fake video content for project duplicate test " + projName)
		if putErr := stClient.PutObject(ctx, storageKey, bytes.NewReader(videoContent), int64(len(videoContent)), "video/mp4"); putErr != nil {
			t.Fatalf("put object error: %v", putErr)
		}

		// Also put a preview object
		verID := uuid.New()
		previewKey := fmt.Sprintf("previews/%s/%s/poster.jpg", uuid.UUID(comp.ID.Bytes).String(), verID.String())
		previewContent := []byte("fake poster image")
		_ = stClient.PutObject(ctx, previewKey, bytes.NewReader(previewContent), int64(len(previewContent)), "image/jpeg")

		previewJSON := fmt.Sprintf(`{"poster":"%s"}`, previewKey)
		ver, vErr := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     comp.ID,
			ItemID:        item.ID,
			Number:        1,
			StorageKey:    storageKey,
			SizeBytes:     int64(len(videoContent)),
			Mime:          "video/mp4",
			DurationMs:    pgtype.Int4{Int32: 5000, Valid: true},
			Width:         pgtype.Int4{Int32: 1920, Valid: true},
			Height:        pgtype.Int4{Int32: 1080, Valid: true},
			Fps:           pgtype.Numeric{Valid: false},
			PreviewStatus: "ready",
			PreviewKeys:   []byte(previewJSON),
			UploadedBy:    user.ID,
		})
		if vErr != nil {
			t.Fatalf("create file version error: %v", vErr)
		}

		// Set preview key prefix to match version ID
		actualVID := uuid.UUID(ver.ID.Bytes).String()
		correctPreviewKey := fmt.Sprintf("previews/%s/%s/poster.jpg", uuid.UUID(comp.ID.Bytes).String(), actualVID)
		_ = stClient.PutObject(ctx, correctPreviewKey, bytes.NewReader(previewContent), int64(len(previewContent)), "image/jpeg")
		correctPreviewJSON := fmt.Sprintf(`{"poster":"%s"}`, correctPreviewKey)
		_, _ = pool.Exec(ctx, "UPDATE file_versions SET preview_keys = $1 WHERE id = $2", []byte(correctPreviewJSON), ver.ID)

		return proj, item, storageKey
	}

	t.Run("Test 1: Duplicate project, delete duplicate forever, original videos still exist and play", func(t *testing.T) {
		origProj, origItem, origKey := setupProjectWithVideo("Original Project 1")

		// Duplicate original project
		dupReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/projects/%s/duplicate", uuid.UUID(origProj.ID.Bytes).String()), nil)
		dupReq = withAuth(dupReq, user, authz.RoleCEO, comp.ID)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", uuid.UUID(origProj.ID.Bytes).String())
		dupReq = dupReq.WithContext(context.WithValue(dupReq.Context(), chi.RouteCtxKey, rctx))
		rr := httptest.NewRecorder()
		projectsH.Duplicate(rr, dupReq)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created on duplicate, got %d: %s", rr.Code, rr.Body.String())
		}

		var dupProj db.Project
		if err := json.Unmarshal(rr.Body.Bytes(), &dupProj); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}

		// Verify duplicate has its own items and distinct storage keys
		var dupItemID pgtype.UUID
		if err := pool.QueryRow(ctx, "SELECT id FROM items WHERE project_id = $1 AND kind = 'file' AND deleted_at IS NULL LIMIT 1", dupProj.ID).Scan(&dupItemID); err != nil {
			t.Fatalf("failed to query duplicated item: %v", err)
		}

		dupVersions, err := queries.ListFileVersions(ctx, dupItemID)
		if err != nil || len(dupVersions) == 0 {
			t.Fatalf("expected duplicated versions, got %d, err: %v", len(dupVersions), err)
		}
		dupVer := dupVersions[0]

		if dupVer.StorageKey == origKey {
			t.Fatalf("DATA LOSS RISK: duplicated file version has identical storage key %s as original", origKey)
		}

		// Verify duplicated storage key exists in S3
		_, _, headErr := stClient.HeadObject(ctx, dupVer.StorageKey)
		if headErr != nil {
			t.Fatalf("duplicated object not found in storage: %v", headErr)
		}

		// Now permanently delete the duplicate item
		delReq := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/trash/%s", uuid.UUID(dupItemID.Bytes).String()), nil)
		delReq = withAuth(delReq, user, authz.RoleCEO, comp.ID)
		rctxDel := chi.NewRouteContext()
		rctxDel.URLParams.Add("id", uuid.UUID(dupItemID.Bytes).String())
		delReq = delReq.WithContext(context.WithValue(delReq.Context(), chi.RouteCtxKey, rctxDel))
		delRR := httptest.NewRecorder()
		itemsH.PermanentDeleteTrashItem(delRR, delReq)

		if delRR.Code != http.StatusOK {
			t.Fatalf("permanent delete failed with code %d: %s", delRR.Code, delRR.Body.String())
		}

		// Duplicated storage key should be deleted
		_, _, headDeletedErr := stClient.HeadObject(ctx, dupVer.StorageKey)
		if headDeletedErr == nil {
			t.Errorf("expected duplicate storage key to be deleted, but still exists")
		}

		// CRITICAL TEST: Original file's storage key MUST still exist!
		origReader, origSize, origHeadErr := stClient.GetObject(ctx, origKey)
		if origHeadErr != nil {
			t.Fatalf("FATAL DATA LOSS: deleting duplicate deleted original file: %v", origHeadErr)
		}
		defer origReader.Close()
		if origSize == 0 {
			t.Fatalf("original file is empty")
		}

		// Verify original file version in DB still exists
		origVersions, vErr := queries.ListFileVersions(ctx, origItem.ID)
		if vErr != nil || len(origVersions) == 0 || origVersions[0].StorageKey != origKey {
			t.Fatalf("original file version corrupt or missing in DB: %v", vErr)
		}
	})

	t.Run("Test 2: Duplicate project, delete original forever, duplicate's videos still exist and play", func(t *testing.T) {
		origProj, origItem, origKey := setupProjectWithVideo("Original Project 2")

		// Duplicate original project
		dupReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/projects/%s/duplicate", uuid.UUID(origProj.ID.Bytes).String()), nil)
		dupReq = withAuth(dupReq, user, authz.RoleCEO, comp.ID)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", uuid.UUID(origProj.ID.Bytes).String())
		dupReq = dupReq.WithContext(context.WithValue(dupReq.Context(), chi.RouteCtxKey, rctx))
		rr := httptest.NewRecorder()
		projectsH.Duplicate(rr, dupReq)

		if rr.Code != http.StatusCreated {
			t.Fatalf("duplicate failed: %d: %s", rr.Code, rr.Body.String())
		}

		var dupProj db.Project
		_ = json.Unmarshal(rr.Body.Bytes(), &dupProj)
		var dupItemID pgtype.UUID
		if err := pool.QueryRow(ctx, "SELECT id FROM items WHERE project_id = $1 AND kind = 'file' AND deleted_at IS NULL LIMIT 1", dupProj.ID).Scan(&dupItemID); err != nil {
			t.Fatalf("failed to query duplicated item: %v", err)
		}
		dupVersions, _ := queries.ListFileVersions(ctx, dupItemID)
		if len(dupVersions) == 0 {
			t.Fatalf("expected duplicated versions in test 2")
		}
		dupVer := dupVersions[0]

		// Permanently delete original item
		delReq := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/trash/%s", uuid.UUID(origItem.ID.Bytes).String()), nil)
		delReq = withAuth(delReq, user, authz.RoleCEO, comp.ID)
		rctxDel := chi.NewRouteContext()
		rctxDel.URLParams.Add("id", uuid.UUID(origItem.ID.Bytes).String())
		delReq = delReq.WithContext(context.WithValue(delReq.Context(), chi.RouteCtxKey, rctxDel))
		delRR := httptest.NewRecorder()
		itemsH.PermanentDeleteTrashItem(delRR, delReq)

		if delRR.Code != http.StatusOK {
			t.Fatalf("permanent delete of original failed: %d", delRR.Code)
		}

		// Original storage key should be deleted
		_, _, headDeletedErr := stClient.HeadObject(ctx, origKey)
		if headDeletedErr == nil {
			t.Errorf("expected original storage key to be deleted, but still exists")
		}

		// CRITICAL TEST: Duplicate's storage key MUST still exist!
		dupReader, dupSize, dupHeadErr := stClient.GetObject(ctx, dupVer.StorageKey)
		if dupHeadErr != nil {
			t.Fatalf("FATAL DATA LOSS: deleting original deleted duplicate file: %v", dupHeadErr)
		}
		defer dupReader.Close()
		if dupSize == 0 {
			t.Fatalf("duplicate file is empty")
		}
	})

	t.Run("Test 3: Storage copy fails rolls back transaction and leaves no new project", func(t *testing.T) {
		origProj, _, _ := setupProjectWithVideo("Original Project 3")

		// Point storage to a client with an invalid bucket name to trigger storage CopyObject failure
		badStorage, _ := storage.NewClient(ctx, storage.Config{
			Endpoint:        cfg.R2Endpoint,
			AccessKeyID:     cfg.R2AccessKeyID,
			SecretAccessKey: cfg.R2SecretAccessKey,
			Bucket:          "non-existent-bucket-failure-test",
			UsePathStyle:    true,
		})

		badProjectsH := NewProjectHandler(queries)
		badProjectsH.SetPool(pool)
		badProjectsH.SetStorage(badStorage)

		dupReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/projects/%s/duplicate", uuid.UUID(origProj.ID.Bytes).String()), nil)
		dupReq = withAuth(dupReq, user, authz.RoleCEO, comp.ID)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", uuid.UUID(origProj.ID.Bytes).String())
		dupReq = dupReq.WithContext(context.WithValue(dupReq.Context(), chi.RouteCtxKey, rctx))
		rr := httptest.NewRecorder()
		badProjectsH.Duplicate(rr, dupReq)

		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500 Internal Server Error when storage copy fails, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify no new project named "Original Project 3 copy" exists in database
		var count int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM projects WHERE company_id = $1 AND name LIKE '%Original Project 3 copy%'", comp.ID).Scan(&count)
		if err != nil {
			t.Fatalf("query projects error: %v", err)
		}
		if count > 0 {
			t.Fatalf("found phantom duplicated project despite transaction failure!")
		}
	})
}
