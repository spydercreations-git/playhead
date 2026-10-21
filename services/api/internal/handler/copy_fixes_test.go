package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
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
	"github.com/playhead/playhead/services/shared/storage"
)

func TestFix1_CopyMustNotFailSilently(t *testing.T) {
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
		t.Fatalf("failed to initialize storage client: %v", err)
	}

	itemsH := NewItemsHandler(queries, stClient)
	itemsH.SetPool(pool)

	// Setup Base Company & Admin User
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              fmt.Sprintf("Fix1 Studio %d", time.Now().UnixNano()),
		Slug:              fmt.Sprintf("fix1-%d", time.Now().UnixNano()),
		Plan:              plans.PlanPro,
		Status:            "active",
		StorageLimitBytes: 100 * plans.GB,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@fix1.com", time.Now().UnixNano()),
		Name:  "Admin Tester",
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleStaff,
	})

	clientRecord, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Fix1 Client",
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientRecord.ID,
		Name:      "Copy Failure Test Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// 1. Create a file item that has a non-existent storage key in S3
	nonExistentKey := fmt.Sprintf("companies/%s/items/fake-item-uuid/v1", uuid.UUID(comp.ID.Bytes).String())
	item, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "file",
		Name:      "GhostFile.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create test file item: %v", err)
	}

	_, err = queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:     comp.ID,
		ItemID:        item.ID,
		Number:        1,
		StorageKey:    nonExistentKey,
		SizeBytes:     1024 * 1024,
		Mime:          "video/mp4",
		DurationMs:    pgtype.Int4{Valid: false},
		Width:         pgtype.Int4{Valid: false},
		Height:        pgtype.Int4{Valid: false},
		Fps:           pgtype.Numeric{Valid: false},
		PreviewStatus: "none",
		PreviewKeys:   []byte("{}"),
		UploadedBy:    adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create file version: %v", err)
	}

	// Count items in project before copy
	itemsBefore, err := queries.ListItemsWithVersions(ctx, db.ListItemsWithVersionsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  pgtype.UUID{Valid: false},
		UserID:    adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to list items: %v", err)
	}
	expectedCount := len(itemsBefore)

	// Now execute CopyItem on this file where storage copy will fail
	copyBody := `{"target_project_id":"` + uuid.UUID(proj.ID.Bytes).String() + `"}`
	req := httptest.NewRequest("POST", "/api/v1/items/"+uuid.UUID(item.ID.Bytes).String()+"/copy", strings.NewReader(copyBody))
	req.Header.Set("Content-Type", "application/json")

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.UUID(item.ID.Bytes).String())
	reqCtx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	reqCtx = contextWithAuth(reqCtx, adminUser, comp.ID, authz.RoleStaff)

	rr := httptest.NewRecorder()
	itemsH.CopyItem(rr, req.WithContext(reqCtx))

	// Assert: Copy must NOT fail silently! It must return HTTP 500 error
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected HTTP 500 when storage copy fails, got %d: %s", rr.Code, rr.Body.String())
	}

	var respErr map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &respErr)
	if respErr["error"] != "failed_to_copy_storage" {
		t.Fatalf("expected error 'failed_to_copy_storage', got: %v", respErr)
	}

	// Assert: Database transaction rolled back and left NO item without a real file!
	itemsAfter, err := queries.ListItemsWithVersions(ctx, db.ListItemsWithVersionsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  pgtype.UUID{Valid: false},
		UserID:    adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to list items after copy: %v", err)
	}

	if len(itemsAfter) != expectedCount {
		t.Fatalf("expected item count to remain %d, but found %d items (transaction did not roll back!)", expectedCount, len(itemsAfter))
	}

	for _, it := range itemsAfter {
		if strings.Contains(it.Name, "(Copy)") {
			t.Fatalf("found copied item %q in database despite storage copy failure!", it.Name)
		}
	}
}

func TestFix2_CopiedVideosNeedPreviewsAndReviewPlayback(t *testing.T) {
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
		t.Fatalf("failed to initialize storage client: %v", err)
	}

	itemsH := NewItemsHandler(queries, stClient)
	itemsH.SetPool(pool)

	reviewH := NewReviewHandler(queries, stClient, cfg)
	mailClient := mailer.New(mailer.Config{})
	storageH := NewStorageUploadsHandler(queries, stClient, mailClient, cfg)
	storageH.SetPool(pool)

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              fmt.Sprintf("Fix2 Studio %d", time.Now().UnixNano()),
		Slug:              fmt.Sprintf("fix2-%d", time.Now().UnixNano()),
		Plan:              plans.PlanPro,
		Status:            "active",
		StorageLimitBytes: 100 * plans.GB,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@fix2.com", time.Now().UnixNano()),
		Name:  "Admin Fix2",
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleStaff,
	})

	clientRecord, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Fix2 Client",
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientRecord.ID,
		Name:      "Video Review Playback Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// 1. Create original video item in database
	origItem, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "file",
		Name:      "PromoFinal.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create original item: %v", err)
	}

	cidStr := uuid.UUID(comp.ID.Bytes).String()
	origItemIDStr := uuid.UUID(origItem.ID.Bytes).String()
	origStorageKey := fmt.Sprintf("companies/%s/items/%s/v1", cidStr, origItemIDStr)

	// Put actual object in MinIO / S3 for the main file
	dummyVideoBytes := []byte("fake-mp4-video-bytes-for-playhead-test")
	err = stClient.PutObject(ctx, origStorageKey, bytes.NewReader(dummyVideoBytes), int64(len(dummyVideoBytes)), "video/mp4")
	if err != nil {
		t.Fatalf("failed to put main video object: %v", err)
	}

	// Create original version in database
	origVer, err := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:     comp.ID,
		ItemID:        origItem.ID,
		Number:        1,
		StorageKey:    origStorageKey,
		SizeBytes:     int64(len(dummyVideoBytes)),
		Mime:          "video/mp4",
		DurationMs:    pgtype.Int4{Int32: 42000, Valid: true},
		Width:         pgtype.Int4{Int32: 1920, Valid: true},
		Height:        pgtype.Int4{Int32: 1080, Valid: true},
		Fps:           pgtype.Numeric{Int: big.NewInt(2400), Exp: -2, Valid: true},
		PreviewStatus: "ready",
		PreviewKeys:   []byte("{}"),
		UploadedBy:    adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create original file version: %v", err)
	}

	// Put actual preview files in MinIO / S3 under previews/<cid>/<origVerID>/
	origVerIDStr := uuid.UUID(origVer.ID.Bytes).String()
	origPrefix := fmt.Sprintf("previews/%s/%s", cidStr, origVerIDStr)

	masterM3U8 := "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2500000\n720p.m3u8\n"
	_ = stClient.PutObject(ctx, origPrefix+"/master.m3u8", strings.NewReader(masterM3U8), int64(len(masterM3U8)), "application/vnd.apple.mpegurl")

	variant720 := "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\n720p_000.ts\n#EXT-X-ENDLIST\n"
	_ = stClient.PutObject(ctx, origPrefix+"/720p.m3u8", strings.NewReader(variant720), int64(len(variant720)), "application/vnd.apple.mpegurl")

	posterJpg := "fake-poster-jpeg-bytes"
	_ = stClient.PutObject(ctx, origPrefix+"/poster.jpg", strings.NewReader(posterJpg), int64(len(posterJpg)), "image/jpeg")

	tsSegment := "fake-ts-video-segment"
	_ = stClient.PutObject(ctx, origPrefix+"/720p_000.ts", strings.NewReader(tsSegment), int64(len(tsSegment)), "video/mp2t")

	// Update original version with its preview keys JSON
	origPreviewKeys := fmt.Sprintf(`{"hls_master":"%s/master.m3u8","hls_720p":"%s/720p.m3u8","poster":"%s/poster.jpg"}`, origPrefix, origPrefix, origPrefix)
	_, err = queries.UpdateVersionMetadataAndPreview(ctx, db.UpdateVersionMetadataAndPreviewParams{
		ID:            origVer.ID,
		CompanyID:     comp.ID,
		DurationMs:    pgtype.Int4{Int32: 42000, Valid: true},
		Width:         pgtype.Int4{Int32: 1920, Valid: true},
		Height:        pgtype.Int4{Int32: 1080, Valid: true},
		Fps:           pgtype.Numeric{Int: big.NewInt(2400), Exp: -2, Valid: true},
		PreviewStatus: "ready",
		PreviewKeys:   []byte(origPreviewKeys),
	})
	if err != nil {
		t.Fatalf("failed to update version metadata: %v", err)
	}

	// 2. Perform CopyItem (or duplication)
	copyReqBody := `{"target_project_id":"` + uuid.UUID(proj.ID.Bytes).String() + `"}`
	req := httptest.NewRequest("POST", "/api/v1/items/"+origItemIDStr+"/copy", strings.NewReader(copyReqBody))
	req.Header.Set("Content-Type", "application/json")

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", origItemIDStr)
	reqCtx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	reqCtx = contextWithAuth(reqCtx, adminUser, comp.ID, authz.RoleStaff)

	rr := httptest.NewRecorder()
	itemsH.CopyItem(rr, req.WithContext(reqCtx))

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected HTTP 201 Created on CopyItem, got %d: %s", rr.Code, rr.Body.String())
	}

	var copiedItem db.Item
	if err := json.Unmarshal(rr.Body.Bytes(), &copiedItem); err != nil {
		t.Fatalf("failed to unmarshal copied item: %v", err)
	}

	copiedIDStr := uuid.UUID(copiedItem.ID.Bytes).String()

	// 3. Verify copied item has preview_status 'ready' and preview objects copied right away!
	copiedVer, err := queries.GetLatestFileVersion(ctx, copiedItem.ID)
	if err != nil {
		t.Fatalf("failed to get copied version: %v", err)
	}

	if copiedVer.PreviewStatus != "ready" {
		t.Fatalf("expected copied version preview_status to be 'ready', got %q", copiedVer.PreviewStatus)
	}

	copiedVIDStr := uuid.UUID(copiedVer.ID.Bytes).String()
	copiedPrefix := fmt.Sprintf("previews/%s/%s", cidStr, copiedVIDStr)

	// Check master.m3u8 exists in storage for copied item!
	rc, sz, err := stClient.GetObject(ctx, copiedPrefix+"/master.m3u8")
	if err != nil {
		t.Fatalf("expected copied preview object %q to exist in storage, got error: %v", copiedPrefix+"/master.m3u8", err)
	}
	defer rc.Close()
	if sz == 0 {
		t.Fatalf("expected non-empty copied playlist in storage")
	}

	// 4. Test that the copied video plays in the Review page (PlaylistProxy)
	reviewReq := httptest.NewRequest("GET", "/api/v1/items/"+copiedIDStr+"/versions/1/playlist.m3u8", nil)
	revCtx := chi.NewRouteContext()
	revCtx.URLParams.Add("id", copiedIDStr)
	revCtx.URLParams.Add("v", "1")
	revCtx.URLParams.Add("playlist", "playlist.m3u8")
	rReqCtx := context.WithValue(reviewReq.Context(), chi.RouteCtxKey, revCtx)
	rReqCtx = contextWithAuth(rReqCtx, adminUser, comp.ID, authz.RoleStaff)

	reviewRR := httptest.NewRecorder()
	reviewH.PlaylistProxy(reviewRR, reviewReq.WithContext(rReqCtx))

	if reviewRR.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 OK for copied video review playlist, got %d: %s", reviewRR.Code, reviewRR.Body.String())
	}

	if !strings.Contains(reviewRR.Header().Get("Content-Type"), "mpegurl") {
		t.Fatalf("expected Content-Type to contain mpegurl, got: %s", reviewRR.Header().Get("Content-Type"))
	}

	respBody := reviewRR.Body.String()
	if !strings.Contains(respBody, "#EXTM3U") {
		t.Fatalf("expected response body to contain #EXTM3U, got: %s", respBody)
	}

	// Test variant playlist proxy with rewritten segment urls
	varReq := httptest.NewRequest("GET", "/api/v1/items/"+copiedIDStr+"/versions/1/720p.m3u8", nil)
	varCtx := chi.NewRouteContext()
	varCtx.URLParams.Add("id", copiedIDStr)
	varCtx.URLParams.Add("v", "1")
	varCtx.URLParams.Add("playlist", "720p.m3u8")
	vReqCtx := context.WithValue(varReq.Context(), chi.RouteCtxKey, varCtx)
	vReqCtx = contextWithAuth(vReqCtx, adminUser, comp.ID, authz.RoleStaff)

	varRR := httptest.NewRecorder()
	reviewH.PlaylistProxy(varRR, varReq.WithContext(vReqCtx))

	if varRR.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 OK for variant playlist, got %d: %s", varRR.Code, varRR.Body.String())
	}
	if !strings.Contains(varRR.Body.String(), "#EXTINF") {
		t.Fatalf("expected variant playlist to contain segments, got: %s", varRR.Body.String())
	}

	// 5. Also test ViewItem returns 200 with inline view_url
	viewReq := httptest.NewRequest("GET", "/api/v1/items/"+copiedIDStr+"/view", nil)
	vwCtx := chi.NewRouteContext()
	vwCtx.URLParams.Add("id", copiedIDStr)
	vwReqCtx := context.WithValue(viewReq.Context(), chi.RouteCtxKey, vwCtx)
	vwReqCtx = contextWithAuth(vwReqCtx, adminUser, comp.ID, authz.RoleStaff)

	vwRR := httptest.NewRecorder()
	storageH.ViewItem(vwRR, viewReq.WithContext(vwReqCtx))

	if vwRR.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 OK on ViewItem for copied video, got %d: %s", vwRR.Code, vwRR.Body.String())
	}
	var vwResp map[string]interface{}
	_ = json.Unmarshal(vwRR.Body.Bytes(), &vwResp)
	if vwResp["view_url"] == "" {
		t.Fatalf("expected non-empty view_url for copied video")
	}
}

// Compile check for unused imports
var _ = io.EOF
