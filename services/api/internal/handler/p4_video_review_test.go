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
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/playhead/playhead/services/shared/transcode"
)

func TestP4VideoReviewAndPermissions(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	cfg := config.Load()
	stClient, _ := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})

	reviewH := NewReviewHandler(queries, stClient, cfg)
	storageH := NewStorageUploadsHandler(queries, stClient, mailClient, cfg)

	// Setup Company, Owner user, Client, Project
	compOwner, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("p4owner-%d@test.com", time.Now().UnixNano()),
		Name:  "P4 Owner",
	})
	if err != nil {
		t.Fatalf("failed to create owner: %v", err)
	}
	company, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:   fmt.Sprintf("P4 Studio %d", time.Now().UnixNano()),
		Slug:   fmt.Sprintf("p4-%d", time.Now().UnixNano()),
		Plan:   plans.PlanPro,
		Status: "active",
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}
	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    compOwner.ID,
		Role:      authz.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("failed to create owner membership: %v", err)
	}
	ownerPerson := authz.Person{
		UserID:    uuid.UUID(compOwner.ID.Bytes),
		Email:     compOwner.Email,
		Role:      authz.RoleAdmin,
		CompanyID: uuid.UUID(company.ID.Bytes),
	}

	clientRec, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "Acme P4 Client",
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: company.ID,
		ClientID:  clientRec.ID,
		Name:      "Commercial Shoot",
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// 1. Extra Test: Vertical 9:16 video aspect ratio preservation test
	t.Run("Vertical 9:16 video aspect ratio preservation without distortion or black bars", func(t *testing.T) {
		// Source: 1080x1920 (9:16 vertical video)
		w720, h720 := transcode.CalculateDimensions(1080, 1920, 720)
		if w720 != 720 || h720 != 1280 {
			t.Fatalf("expected 720x1280 for 720p 9:16 vertical video, got %dx%d", w720, h720)
		}
		ratioOrig := float64(1080) / float64(1920)
		ratio720 := float64(w720) / float64(h720)
		if fmt.Sprintf("%.4f", ratioOrig) != fmt.Sprintf("%.4f", ratio720) {
			t.Fatalf("aspect ratio changed! orig=%f, 720p=%f", ratioOrig, ratio720)
		}

		// Only make 1080 if short side >= 1080
		if !transcode.ShouldGenerate1080p(1080, 1920) {
			t.Fatalf("expected 1080x1920 to qualify for 1080p variant")
		}
		w1080, h1080 := transcode.CalculateDimensions(1080, 1920, 1080)
		if w1080 != 1080 || h1080 != 1920 {
			t.Fatalf("expected 1080x1920 for 1080p 9:16, got %dx%d", w1080, h1080)
		}

		// 1:1 square: 1080x1080
		wSq, hSq := transcode.CalculateDimensions(1080, 1080, 720)
		if wSq != 720 || hSq != 720 {
			t.Fatalf("expected 720x720 for 1:1 square video, got %dx%d", wSq, hSq)
		}

		// 4:5 vertical: 1080x1350 -> short side 720 -> 720x900
		w45, h45 := transcode.CalculateDimensions(1080, 1350, 720)
		if w45 != 720 || h45 != 900 {
			t.Fatalf("expected 720x900 for 4:5 vertical video, got %dx%d", w45, h45)
		}

		// Sub-1080 source: 640x360 -> short side 360 -> should NOT generate 1080p
		if transcode.ShouldGenerate1080p(640, 360) {
			t.Fatalf("expected 640x360 NOT to qualify for 1080p variant")
		}
	})

	// 2. Extra Test: View-only person without download cannot get original file while processing
	t.Run("View-only person without download cannot get original file while processing (HTTP 425)", func(t *testing.T) {
		rStorage := chi.NewRouter()
		rStorage.Get("/api/v1/items/{id}/view", storageH.ViewItem)
		rStorage.Get("/api/v1/items/{id}/download", storageH.DownloadItem)

		// Create video item and version in "pending" status
		videoItem, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "vertical-reel.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create video item: %v", err)
		}
		ver, err := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     company.ID,
			ItemID:        videoItem.ID,
			Number:        1,
			StorageKey:    "test/vertical-reel.mp4",
			SizeBytes:     5000000,
			Mime:          "video/mp4",
			PreviewStatus: "pending",
			PreviewKeys:   []byte("{}"),
			UploadedBy:    compOwner.ID,
		})
		if err != nil {
			t.Fatalf("failed to create file version: %v", err)
		}
		_ = ver

		// Create view-only user with can_download = false
		viewerUser, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("viewonly-%d@test.com", time.Now().UnixNano()),
			Name:  "View Only Person",
		})
		if err != nil {
			t.Fatalf("failed to create viewer user: %v", err)
		}
		_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   company.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       viewerUser.Email,
			UserID:      viewerUser.ID,
			Level:       "viewer",
			CanDownload: false,
		})
		if err != nil {
			t.Fatalf("failed to grant viewer: %v", err)
		}
		viewerPerson := authz.Person{
			UserID:    uuid.UUID(viewerUser.ID.Bytes),
			Email:     viewerUser.Email,
			Role:      "",
			CompanyID: uuid.UUID(company.ID.Bytes),
		}

		// Viewer attempts to access /items/{id}/view while processing -> Expect 425 Too Early
		itemUUIDStr := uuid.UUID(videoItem.ID.Bytes).String()
		reqView := httptest.NewRequest("GET", "/api/v1/items/"+itemUUIDStr+"/view", nil)
		reqView = reqView.WithContext(contextWithPerson(reqView.Context(), viewerUser, company.ID, viewerPerson))
		recView := httptest.NewRecorder()
		rStorage.ServeHTTP(recView, reqView)

		if recView.Code != http.StatusTooEarly {
			t.Fatalf("expected HTTP 425 Too Early for view-only person during processing, got %d: %s", recView.Code, recView.Body.String())
		}
		var errResp map[string]string
		_ = json.Unmarshal(recView.Body.Bytes(), &errResp)
		if errResp["message"] != "Processing, ready in a few minutes" {
			t.Fatalf("expected 'Processing, ready in a few minutes', got %q", errResp["message"])
		}

		// However, owner (who has can_download = true) CAN get original fallback
		reqOwner := httptest.NewRequest("GET", "/api/v1/items/"+itemUUIDStr+"/view", nil)
		reqOwner = reqOwner.WithContext(contextWithPerson(reqOwner.Context(), compOwner, company.ID, ownerPerson))
		recOwner := httptest.NewRecorder()
		rStorage.ServeHTTP(recOwner, reqOwner)
		if recOwner.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for owner downloading/playing original while processing, got %d: %s", recOwner.Code, recOwner.Body.String())
		}
	})

	// 3. Extra Test: Client contact and share link visitor cannot see or create team-only comments, replies, or counts
	t.Run("Client and share link visitor cannot see or create team only comments or replies or counts", func(t *testing.T) {
		rReview := chi.NewRouter()
		rReview.Get("/api/v1/items/{id}/comments", reviewH.ListComments)
		rReview.Post("/api/v1/items/{id}/comments", reviewH.CreateComment)

		// Create client contact user
		clientUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("clientcontact-%d@test.com", time.Now().UnixNano()),
			Name:  "Client Contact Joe",
		})
		_, err := queries.CreateClientContact(ctx, db.CreateClientContactParams{
			CompanyID:    company.ID,
			ClientID:     clientRec.ID,
			Name:         "Client Contact Joe",
			Email:        clientUser.Email,
			DefaultLevel: "commenter",
			CanDownload:  true,
		})
		if err != nil {
			t.Fatalf("failed to create client contact: %v", err)
		}
		clientPerson := authz.Person{
			UserID:    uuid.UUID(clientUser.ID.Bytes),
			Email:     clientUser.Email,
			Role:      "client",
			CompanyID: uuid.UUID(company.ID.Bytes),
		}

		// Create test item
		testItem, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "client-video.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(200), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create item: %v", err)
		}
		itemUUIDStr := uuid.UUID(testItem.ID.Bytes).String()

		// 3a. Client attempts to create team-only comment -> Expect 403 Forbidden
		teamCommentPayload := map[string]interface{}{
			"body":       "Internal secret note",
			"visibility": "team",
		}
		bodyBytes, _ := json.Marshal(teamCommentPayload)
		reqClient := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/comments", bytes.NewReader(bodyBytes))
		reqClient = reqClient.WithContext(contextWithPerson(reqClient.Context(), clientUser, company.ID, clientPerson))
		recClient := httptest.NewRecorder()
		rReview.ServeHTTP(recClient, reqClient)

		if recClient.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when client tries to create team-only comment, got %d: %s", recClient.Code, recClient.Body.String())
		}

		// 3b. Team member creates a team-only comment and a public comment
		reqTeam1 := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/comments", bytes.NewReader(bodyBytes))
		reqTeam1 = reqTeam1.WithContext(contextWithPerson(reqTeam1.Context(), compOwner, company.ID, ownerPerson))
		recTeam1 := httptest.NewRecorder()
		rReview.ServeHTTP(recTeam1, reqTeam1)
		if recTeam1.Code != http.StatusCreated {
			t.Fatalf("failed to create team comment as owner: %d: %s", recTeam1.Code, recTeam1.Body.String())
		}
		var teamCommentResp map[string]interface{}
		_ = json.Unmarshal(recTeam1.Body.Bytes(), &teamCommentResp)
		teamCommentID := teamCommentResp["id"].(string)

		// Owner creates a reply under the team-only comment
		replyPayload := map[string]interface{}{
			"parent_id": teamCommentID,
			"body":      "Reply to internal note",
		}
		replyBytes, _ := json.Marshal(replyPayload)
		reqReply := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/comments", bytes.NewReader(replyBytes))
		reqReply = reqReply.WithContext(contextWithPerson(reqReply.Context(), compOwner, company.ID, ownerPerson))
		recReply := httptest.NewRecorder()
		rReview.ServeHTTP(recReply, reqReply)
		if recReply.Code != http.StatusCreated {
			t.Fatalf("failed to create reply to team comment: %d: %s", recReply.Code, recReply.Body.String())
		}

		// Owner creates a public comment
		publicCommentPayload := map[string]interface{}{
			"body":       "Public client note",
			"visibility": "everyone",
		}
		pubBytes, _ := json.Marshal(publicCommentPayload)
		reqPub := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/comments", bytes.NewReader(pubBytes))
		reqPub = reqPub.WithContext(contextWithPerson(reqPub.Context(), compOwner, company.ID, ownerPerson))
		recPub := httptest.NewRecorder()
		rReview.ServeHTTP(recPub, reqPub)
		if recPub.Code != http.StatusCreated {
			t.Fatalf("failed to create public comment: %d: %s", recPub.Code, recPub.Body.String())
		}

		// 3c. Client lists comments: must ONLY see the 1 public comment, not the team comment or its reply
		reqListClient := httptest.NewRequest("GET", "/api/v1/items/"+itemUUIDStr+"/comments", nil)
		reqListClient = reqListClient.WithContext(contextWithPerson(reqListClient.Context(), clientUser, company.ID, clientPerson))
		recListClient := httptest.NewRecorder()
		rReview.ServeHTTP(recListClient, reqListClient)

		if recListClient.Code != http.StatusOK {
			t.Fatalf("failed to list comments as client: %d: %s", recListClient.Code, recListClient.Body.String())
		}
		var clientCommentsResp map[string]interface{}
		_ = json.Unmarshal(recListClient.Body.Bytes(), &clientCommentsResp)
		commentsList := clientCommentsResp["comments"].([]interface{})
		if len(commentsList) != 1 {
			t.Fatalf("expected client to see exactly 1 comment, got %d", len(commentsList))
		}
		firstComment := commentsList[0].(map[string]interface{})
		if firstComment["body"] != "Public client note" {
			t.Fatalf("expected 'Public client note', got %v", firstComment["body"])
		}

		// 3d. Team member lists comments: must see both team and public comments
		reqListOwner := httptest.NewRequest("GET", "/api/v1/items/"+itemUUIDStr+"/comments", nil)
		reqListOwner = reqListOwner.WithContext(contextWithPerson(reqListOwner.Context(), compOwner, company.ID, ownerPerson))
		recListOwner := httptest.NewRecorder()
		rReview.ServeHTTP(recListOwner, reqListOwner)
		var ownerCommentsResp map[string]interface{}
		_ = json.Unmarshal(recListOwner.Body.Bytes(), &ownerCommentsResp)
		ownerCommentsList := ownerCommentsResp["comments"].([]interface{})
		if len(ownerCommentsList) != 2 {
			t.Fatalf("expected team member to see 2 top-level comments, got %d", len(ownerCommentsList))
		}

		// 3e. Share link visitor cannot see or create team comments
		token := fmt.Sprintf("sharep4%d", time.Now().UnixNano())
		linkRow, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:        company.ID,
			ProjectID:        proj.ID,
			Name:             "Review Share",
			TokenHash:        authz.HashToken(token),
			Access:           "commenter",
			AllowDownload:    true,
			LatestOnly:       false,
			PasswordHash:     pgtype.Text{Valid: false},
			ExpiresAt:        pgtype.Timestamptz{Valid: false},
			AskIdentity:      false,
			UploadLimitBytes: pgtype.Int8{Valid: false},
			CreatedBy:        compOwner.ID,
		})
		if err != nil {
			t.Fatalf("failed to create share link: %v", err)
		}
		err = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: linkRow.ID,
			ItemID:      testItem.ID,
		})
		if err != nil {
			t.Fatalf("failed to link item: %v", err)
		}

		rPublic := chi.NewRouter()
		rPublic.Get("/s/{token}/items/{id}/comments", reviewH.PublicListComments)
		rPublic.Post("/s/{token}/items/{id}/comments", reviewH.PublicCreateComment)

		// Public visitor tries to create team-only comment
		reqPublicPost := httptest.NewRequest("POST", "/s/"+token+"/items/"+itemUUIDStr+"/comments", bytes.NewReader(bodyBytes))
		recPublicPost := httptest.NewRecorder()
		rPublic.ServeHTTP(recPublicPost, reqPublicPost)
		if recPublicPost.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for public visitor creating team comment, got %d: %s", recPublicPost.Code, recPublicPost.Body.String())
		}

		// Public visitor lists comments -> only 1 public comment returned
		reqPublicList := httptest.NewRequest("GET", "/s/"+token+"/items/"+itemUUIDStr+"/comments", nil)
		recPublicList := httptest.NewRecorder()
		rPublic.ServeHTTP(recPublicList, reqPublicList)
		if recPublicList.Code != http.StatusOK {
			t.Fatalf("failed to list public comments: %d: %s", recPublicList.Code, recPublicList.Body.String())
		}
		var pubResp map[string]interface{}
		_ = json.Unmarshal(recPublicList.Body.Bytes(), &pubResp)
		pubComments := pubResp["comments"].([]interface{})
		if len(pubComments) != 1 {
			t.Fatalf("expected public visitor to see exactly 1 comment, got %d", len(pubComments))
		}
	})

	// 4. Extra Test: New version resets approval to Needs review
	t.Run("New version resets approval to Needs review", func(t *testing.T) {
		rReview := chi.NewRouter()
		rReview.Post("/api/v1/items/{id}/review", reviewH.SubmitReview)

		mockStorageH := NewStorageUploadsHandler(queries, nil, mailClient, cfg)
		rStorage := chi.NewRouter()
		rStorage.Post("/api/v1/uploads/{id}/complete", mockStorageH.CompleteUpload)

		item, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "approval-reset-test.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(300), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create item: %v", err)
		}
		itemUUIDStr := uuid.UUID(item.ID.Bytes).String()

		// Version 1
		v1, _ := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     company.ID,
			ItemID:        item.ID,
			Number:        1,
			StorageKey:    "test/v1.mp4",
			SizeBytes:     1000,
			Mime:          "video/mp4",
			PreviewStatus: "ready",
			PreviewKeys:   []byte("{}"),
			UploadedBy:    compOwner.ID,
		})

		// Approve version 1
		approvePayload := map[string]interface{}{
			"version_id": uuid.UUID(v1.ID.Bytes).String(),
			"status":     "approved",
			"notes":      "Looks wonderful, proceed!",
		}
		apprBytes, _ := json.Marshal(approvePayload)
		reqAppr := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/review", bytes.NewReader(apprBytes))
		reqAppr = reqAppr.WithContext(contextWithPerson(reqAppr.Context(), compOwner, company.ID, ownerPerson))
		recAppr := httptest.NewRecorder()
		rReview.ServeHTTP(recAppr, reqAppr)

		if recAppr.Code != http.StatusOK {
			t.Fatalf("failed to approve item: %d: %s", recAppr.Code, recAppr.Body.String())
		}

		// Verify status is approved
		checkItem, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: item.ID, CompanyID: company.ID})
		if checkItem.ReviewStatus != "approved" {
			t.Fatalf("expected review_status 'approved', got %q", checkItem.ReviewStatus)
		}

		// Now upload version 2 via storage upload completion
		upload, err := queries.CreateUpload(ctx, db.CreateUploadParams{
			CompanyID:     company.ID,
			ProjectID:     proj.ID,
			ParentID:      pgtype.UUID{Valid: false},
			TargetItemID:  item.ID,
			Filename:      "approval-reset-test.mp4",
			SizeBytes:     2000,
			Mime:          "video/mp4",
			StorageKey:    "test/v2.mp4",
			UploadID:      "upload-v2-mock",
			UserID:        compOwner.ID,
			TotalParts:    1,
			PartSizeBytes: 2000,
			ExpiresAt:     pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create upload: %v", err)
		}

		uploadUUIDStr := uuid.UUID(upload.ID.Bytes).String()
		reqComplete := httptest.NewRequest("POST", "/api/v1/uploads/"+uploadUUIDStr+"/complete", bytes.NewReader([]byte(`{"parts":[]}`)))
		reqComplete = reqComplete.WithContext(contextWithPerson(reqComplete.Context(), compOwner, company.ID, ownerPerson))
		recComplete := httptest.NewRecorder()
		rStorage.ServeHTTP(recComplete, reqComplete)

		if recComplete.Code != http.StatusOK {
			t.Fatalf("failed to complete upload: %d: %s", recComplete.Code, recComplete.Body.String())
		}

		// Verify item's review_status was reset to 'needs_review'
		refreshedItem, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: item.ID, CompanyID: company.ID})
		if refreshedItem.ReviewStatus != "needs_review" {
			t.Fatalf("expected review_status to reset to 'needs_review', got %q", refreshedItem.ReviewStatus)
		}
	})

	// 5. Extra Test: Uploader can comment; Viewer cannot
	t.Run("Uploader can comment, Viewer cannot comment", func(t *testing.T) {
		rReview := chi.NewRouter()
		rReview.Post("/api/v1/items/{id}/comments", reviewH.CreateComment)

		item, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "permission-test.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(400), Valid: true},
		})
		itemUUIDStr := uuid.UUID(item.ID.Bytes).String()

		// 5a. Create Uploader user
		uploaderUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("uploader-%d@test.com", time.Now().UnixNano()),
			Name:  "Test Uploader",
		})
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   company.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       uploaderUser.Email,
			UserID:      uploaderUser.ID,
			Level:       "uploader",
			CanDownload: true,
		})
		uploaderPerson := authz.Person{
			UserID:    uuid.UUID(uploaderUser.ID.Bytes),
			Email:     uploaderUser.Email,
			Role:      "",
			CompanyID: uuid.UUID(company.ID.Bytes),
		}

		// Uploader comments -> Expect 201 Created
		commentPayload := map[string]interface{}{
			"body": "Comment from uploader",
		}
		bodyBytes, _ := json.Marshal(commentPayload)
		reqUploader := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/comments", bytes.NewReader(bodyBytes))
		reqUploader = reqUploader.WithContext(contextWithPerson(reqUploader.Context(), uploaderUser, company.ID, uploaderPerson))
		recUploader := httptest.NewRecorder()
		rReview.ServeHTTP(recUploader, reqUploader)

		if recUploader.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for uploader commenting, got %d: %s", recUploader.Code, recUploader.Body.String())
		}

		// 5b. Create Viewer user
		viewerUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("viewer2-%d@test.com", time.Now().UnixNano()),
			Name:  "Test Viewer Only",
		})
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   company.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       viewerUser.Email,
			UserID:      viewerUser.ID,
			Level:       "viewer",
			CanDownload: false,
		})
		viewerPerson := authz.Person{
			UserID:    uuid.UUID(viewerUser.ID.Bytes),
			Email:     viewerUser.Email,
			Role:      "",
			CompanyID: uuid.UUID(company.ID.Bytes),
		}

		// Viewer attempts to comment -> Expect 403 Forbidden
		reqViewer := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/comments", bytes.NewReader(bodyBytes))
		reqViewer = reqViewer.WithContext(contextWithPerson(reqViewer.Context(), viewerUser, company.ID, viewerPerson))
		recViewer := httptest.NewRecorder()
		rReview.ServeHTTP(recViewer, reqViewer)

		if recViewer.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for viewer commenting, got %d: %s", recViewer.Code, recViewer.Body.String())
		}
	})

	// 6. Test Review decisions and history in details tab
	t.Run("Approve and Request changes saved in reviews and returned in history", func(t *testing.T) {
		rReview := chi.NewRouter()
		rReview.Post("/api/v1/items/{id}/review", reviewH.SubmitReview)
		rReview.Get("/api/v1/items/{id}/reviews", reviewH.ListReviews)

		item, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "history-test.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(500), Valid: true},
		})
		itemUUIDStr := uuid.UUID(item.ID.Bytes).String()
		v1, _ := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     company.ID,
			ItemID:        item.ID,
			Number:        1,
			StorageKey:    "test/hist.mp4",
			SizeBytes:     1000,
			Mime:          "video/mp4",
			PreviewStatus: "ready",
			PreviewKeys:   []byte("{}"),
			UploadedBy:    compOwner.ID,
		})

		// Request changes
		reqChangesPayload := map[string]interface{}{
			"version_id": uuid.UUID(v1.ID.Bytes).String(),
			"decision":   "changes_requested",
			"note":       "Fix color grading at 01:23",
		}
		chgBytes, _ := json.Marshal(reqChangesPayload)
		reqChg := httptest.NewRequest("POST", "/api/v1/items/"+itemUUIDStr+"/review", bytes.NewReader(chgBytes))
		reqChg = reqChg.WithContext(contextWithPerson(reqChg.Context(), compOwner, company.ID, ownerPerson))
		recChg := httptest.NewRecorder()
		rReview.ServeHTTP(recChg, reqChg)
		if recChg.Code != http.StatusOK {
			t.Fatalf("failed to request changes: %d: %s", recChg.Code, recChg.Body.String())
		}

		// Verify list reviews returns history
		reqList := httptest.NewRequest("GET", "/api/v1/items/"+itemUUIDStr+"/reviews", nil)
		reqList = reqList.WithContext(contextWithPerson(reqList.Context(), compOwner, company.ID, ownerPerson))
		recList := httptest.NewRecorder()
		rReview.ServeHTTP(recList, reqList)

		if recList.Code != http.StatusOK {
			t.Fatalf("failed to list reviews: %d: %s", recList.Code, recList.Body.String())
		}
		var listResp map[string]interface{}
		_ = json.Unmarshal(recList.Body.Bytes(), &listResp)
		reviewsList := listResp["reviews"].([]interface{})
		if len(reviewsList) != 1 {
			t.Fatalf("expected 1 review record, got %d", len(reviewsList))
		}
		firstRev := reviewsList[0].(map[string]interface{})
		if firstRev["decision"] != "changes_requested" || firstRev["note"] != "Fix color grading at 01:23" {
			t.Fatalf("unexpected review record: %v", firstRev)
		}
	})
}
