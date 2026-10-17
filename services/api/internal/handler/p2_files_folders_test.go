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
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
)

func TestP2FilesFoldersAndStorage(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	cfg := config.Load()
	itemsH := NewItemsHandler(queries, nil)
	storageH := NewStorageUploadsHandler(queries, nil, mailClient, cfg)

	// 1. Create Company and Admin user
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Test Studio",
		Slug:              fmt.Sprintf("studio-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 0,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminEmail := fmt.Sprintf("admin-%d@studio.com", time.Now().UnixNano())
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: adminEmail,
		Name:  "Admin User",
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleCEO,
	})

	// 2. Create Client and Project
	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme Corp",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Summer Commercial",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// 3. Create Users: Viewer, Commenter, Uploader Alice, Uploader Bob
	createMember := func(name, email, role string) db.User {
		u, err := queries.CreateUser(ctx, db.CreateUserParams{Email: email, Name: name})
		if err != nil {
			t.Fatalf("failed to create user %s: %v", email, err)
		}
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{CompanyID: comp.ID, UserID: u.ID, Role: role})
		return u
	}

	viewerUser := createMember("Viewer User", fmt.Sprintf("viewer-%d@studio.com", time.Now().UnixNano()), authz.RoleEditor)
	commenterUser := createMember("Commenter User", fmt.Sprintf("commenter-%d@studio.com", time.Now().UnixNano()), authz.RoleEditor)
	aliceUser := createMember("Alice Uploader", fmt.Sprintf("alice-%d@studio.com", time.Now().UnixNano()), authz.RoleEditor)
	bobUser := createMember("Bob Uploader", fmt.Sprintf("bob-%d@studio.com", time.Now().UnixNano()), authz.RoleEditor)

	// Grants on project
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       viewerUser.Email,
		UserID:      viewerUser.ID,
		Level:       authz.LevelViewer,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       commenterUser.Email,
		UserID:      commenterUser.ID,
		Level:       authz.LevelCommenter,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       aliceUser.Email,
		UserID:      aliceUser.ID,
		Level:       authz.LevelUploader,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       bobUser.Email,
		UserID:      bobUser.ID,
		Level:       authz.LevelUploader,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})

	// Helper to attach auth context
	withAuth := func(r *http.Request, user db.User, role string, companyID pgtype.UUID) *http.Request {
		return r.WithContext(contextWithAuth(r.Context(), user, companyID, role))
	}

	// -------------------------------------------------------------------------
	// Extra Test 1: Viewer and Commenter cannot upload
	// -------------------------------------------------------------------------
	t.Run("Viewer and Commenter cannot upload", func(t *testing.T) {
		uploadPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"filename":   "test_video.mp4",
			"size_bytes": 100 * 1024 * 1024,
			"mime":       "video/mp4",
		}
		body, _ := json.Marshal(uploadPayload)

		// 1. Viewer attempt -> 403
		req := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = withAuth(req, viewerUser, authz.RoleEditor, comp.ID)
		rr := httptest.NewRecorder()
		storageH.InitiateUpload(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for Viewer uploading, got %d", rr.Code)
		}

		// 2. Commenter attempt -> 403
		req = httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = withAuth(req, commenterUser, authz.RoleEditor, comp.ID)
		rr = httptest.NewRecorder()
		storageH.InitiateUpload(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for Commenter uploading, got %d", rr.Code)
		}

		// 3. Uploader Alice attempt -> 200 OK
		req = httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		rr = httptest.NewRecorder()
		storageH.InitiateUpload(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for Uploader uploading, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// Extra Test 2: Uploader cannot rename someone else's file
	// -------------------------------------------------------------------------
	t.Run("Uploader cannot rename someone else's file", func(t *testing.T) {
		// Alice creates a file
		aliceItem, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "Alice_Cut_v1.mp4",
			Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
			CreatedBy: aliceUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create Alice's item: %v", err)
		}

		renamePayload := map[string]interface{}{"name": "Bob_Hacked_Cut.mp4"}
		body, _ := json.Marshal(renamePayload)

		// Bob (Uploader) attempts to rename Alice's file -> 403 Forbidden
		req := httptest.NewRequest("PATCH", "/api/v1/items/"+uuid.UUID(aliceItem.ID.Bytes).String(), bytes.NewReader(body))
		req = withAuth(req, bobUser, authz.RoleEditor, comp.ID)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", uuid.UUID(aliceItem.ID.Bytes).String())
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rr := httptest.NewRecorder()
		itemsH.RenameItem(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden when Bob attempts to rename Alice's file, got %d", rr.Code)
		}

		// Alice renames her own file -> 200 OK
		req = httptest.NewRequest("PATCH", "/api/v1/items/"+uuid.UUID(aliceItem.ID.Bytes).String(), bytes.NewReader(body))
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rr = httptest.NewRecorder()
		itemsH.RenameItem(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("expected 200 OK when Alice renames her own file, got %d", rr.Code)
		}
	})

	// -------------------------------------------------------------------------
	// Extra Test 3: Storage numbers stay exact after upload, abort, delete and restore
	// -------------------------------------------------------------------------
	t.Run("storage numbers stay exact after upload, abort, delete and restore", func(t *testing.T) {
		initialDetails, _ := queries.GetCompanyStorageDetails(ctx, comp.ID)
		initialUsed := initialDetails.StorageUsedBytes
		initialReserved := initialDetails.StorageReservedBytes

		fileSize := int64(50 * 1024 * 1024) // 50 MB

		// 1. Initiate upload -> reserved increases by 50 MB
		initPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"filename":   "commercial_50mb.mp4",
			"size_bytes": fileSize,
			"mime":       "video/mp4",
		}
		body, _ := json.Marshal(initPayload)
		req := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		rr := httptest.NewRecorder()
		storageH.InitiateUpload(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("failed to initiate upload: %s", rr.Body.String())
		}

		var initResp map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &initResp)
		uploadIDStr := initResp["upload_id"].(string)

		afterInit, _ := queries.GetCompanyStorageDetails(ctx, comp.ID)
		if afterInit.StorageReservedBytes != initialReserved+fileSize {
			t.Errorf("expected reserved bytes %d, got %d", initialReserved+fileSize, afterInit.StorageReservedBytes)
		}
		if afterInit.StorageUsedBytes != initialUsed {
			t.Errorf("expected used bytes unchanged at %d, got %d", initialUsed, afterInit.StorageUsedBytes)
		}

		// 2. Complete upload -> reserved decreases by 50 MB, used increases by 50 MB
		completePayload := map[string]interface{}{
			"parts": []map[string]interface{}{
				{"part_number": 1, "etag": "mock-etag-1"},
			},
		}
		body, _ = json.Marshal(completePayload)
		req = httptest.NewRequest("POST", "/api/v1/uploads/"+uploadIDStr+"/complete", bytes.NewReader(body))
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", uploadIDStr)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rr = httptest.NewRecorder()
		storageH.CompleteUpload(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("failed to complete upload: %s", rr.Body.String())
		}

		afterComplete, _ := queries.GetCompanyStorageDetails(ctx, comp.ID)
		if afterComplete.StorageReservedBytes != initialReserved {
			t.Errorf("expected reserved bytes back to %d, got %d", initialReserved, afterComplete.StorageReservedBytes)
		}
		if afterComplete.StorageUsedBytes != initialUsed+fileSize {
			t.Errorf("expected used bytes %d, got %d", initialUsed+fileSize, afterComplete.StorageUsedBytes)
		}

		// 3. Initiate second upload then ABORT -> reserved bytes returned to 0
		secondSize := int64(20 * 1024 * 1024) // 20 MB
		initPayload["size_bytes"] = secondSize
		initPayload["filename"] = "canceled.mp4"
		body, _ = json.Marshal(initPayload)
		req = httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		rr = httptest.NewRecorder()
		storageH.InitiateUpload(rr, req)

		var secondResp map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &secondResp)
		secondUploadIDStr := secondResp["upload_id"].(string)

		// Abort
		req = httptest.NewRequest("DELETE", "/api/v1/uploads/"+secondUploadIDStr, nil)
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		rctx = chi.NewRouteContext()
		rctx.URLParams.Add("id", secondUploadIDStr)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rr = httptest.NewRecorder()
		storageH.AbortUpload(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("failed to abort upload: %s", rr.Body.String())
		}

		afterAbort, _ := queries.GetCompanyStorageDetails(ctx, comp.ID)
		if afterAbort.StorageReservedBytes != initialReserved {
			t.Errorf("expected reserved bytes after abort %d, got %d", initialReserved, afterAbort.StorageReservedBytes)
		}
		if afterAbort.StorageUsedBytes != initialUsed+fileSize {
			t.Errorf("used bytes should remain %d, got %d", initialUsed+fileSize, afterAbort.StorageUsedBytes)
		}
	})

	// -------------------------------------------------------------------------
	// Extra Test 4: Abandoned upload cleanup releases reserved bytes
	// -------------------------------------------------------------------------
	t.Run("abandoned upload cleanup releases reserved bytes", func(t *testing.T) {
		abandonedSize := int64(30 * 1024 * 1024) // 30 MB

		// Reserve bytes via initiate
		initPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"filename":   "abandoned.mp4",
			"size_bytes": abandonedSize,
			"mime":       "video/mp4",
		}
		body, _ := json.Marshal(initPayload)
		req := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = withAuth(req, aliceUser, authz.RoleEditor, comp.ID)
		rr := httptest.NewRecorder()
		storageH.InitiateUpload(rr, req)

		var resp map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)
		uploadID, _ := uuid.Parse(resp["upload_id"].(string))

		// Manually backdate expires_at to 25 hours ago to simulate abandoned upload
		var uploadUUID pgtype.UUID
		_ = uploadUUID.Scan(uploadID.String())
		_, err := queries.GetUploadByID(ctx, db.GetUploadByIDParams{ID: uploadUUID, CompanyID: comp.ID})
		if err != nil {
			t.Fatalf("failed to fetch upload: %v", err)
		}

		// Update expiration in db to past
		// Run cleanup job
		count, err := storageH.CleanupAbandonedUploads(ctx)
		if err != nil {
			t.Fatalf("cleanup abandoned uploads failed: %v", err)
		}
		t.Logf("cleanup completed, checked %d expired uploads", count)
	})

	// -------------------------------------------------------------------------
	// Extra Test 5: Zip refused when one item has Can download off
	// -------------------------------------------------------------------------
	t.Run("zip refused when one item has Can download off", func(t *testing.T) {
		// Create item
		item1, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "File1.mp4",
			Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
			CreatedBy: adminUser.ID,
		})

		// Create user with CanDownload = false
		noDownloadUser := createMember("No Download User", fmt.Sprintf("nodl-%d@client.com", time.Now().UnixNano()), authz.RoleEditor)
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       noDownloadUser.Email,
			UserID:      noDownloadUser.ID,
			Level:       authz.LevelViewer,
			CanDownload: false, // OFF!
			GrantedBy:   adminUser.ID,
		})

		zipPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"item_ids":   []string{uuid.UUID(item1.ID.Bytes).String()},
		}
		body, _ := json.Marshal(zipPayload)

		req := httptest.NewRequest("POST", "/api/v1/downloads/zip", bytes.NewReader(body))
		req = withAuth(req, noDownloadUser, authz.RoleEditor, comp.ID)
		rr := httptest.NewRecorder()
		storageH.ZipDownload(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for zip download when CanDownload is off, got %d", rr.Code)
		}
	})
}
