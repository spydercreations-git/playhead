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

	"github.com/hibiken/asynq"
	"golang.org/x/crypto/bcrypt"

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
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   company.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       authz.NormalizeEmail(clientUser.Email),
			UserID:      clientUser.ID,
			Level:       authz.LevelCommenter,
			CanDownload: true,
			GrantedBy:   compOwner.ID,
		})

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

func TestP4_AdvisorReviewFixes(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	cfg := config.Load()
	mailClient := mailer.New(mailer.Config{})
	stClient, _ := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})

	redisOpt, err := asynq.ParseRedisURI(cfg.RedisURL)
	if err != nil {
		t.Fatalf("failed to parse redis URL: %v", err)
	}
	asynqClient := asynq.NewClient(redisOpt)
	defer asynqClient.Close()
	inspector := asynq.NewInspector(redisOpt)
	defer inspector.Close()

	reviewH := NewReviewHandler(queries, stClient, cfg)
	reviewH.SetAsynqClient(asynqClient)
	reviewH.SetMailer(mailClient)

	storageH := NewStorageUploadsHandler(queries, stClient, mailClient, cfg)
	storageH.SetAsynqClient(asynqClient)

	shareLinksH := NewShareLinksHandler(queries, stClient, cfg.SessionSecret, cfg.Environment)
	shareLinksH.SetAsynqClient(asynqClient)

	// Setup Base Company & Owner
	compOwner, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("p4fix-owner-%d@test.com", time.Now().UnixNano()),
		Name:  "Fix Owner",
	})
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}
	company, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:   fmt.Sprintf("Fix Studio %d", time.Now().UnixNano()),
		Slug:   fmt.Sprintf("fix-%d", time.Now().UnixNano()),
		Plan:   plans.PlanPro,
		Status: "active",
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    compOwner.ID,
		Role:      authz.RoleAdmin,
	})
	ownerPerson := authz.Person{
		UserID:    uuid.UUID(compOwner.ID.Bytes),
		Email:     compOwner.Email,
		Role:      authz.RoleAdmin,
		CompanyID: uuid.UUID(company.ID.Bytes),
	}

	// Clients A and B
	clientA, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "Client A",
	})
	clientB, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "Client B",
	})

	// Projects A and B
	projA, _ := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: company.ID,
		ClientID:  clientA.ID,
		Name:      "Project A",
	})
	projB, _ := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: company.ID,
		ClientID:  clientB.ID,
		Name:      "Project B",
	})

	// Client Contact User A
	clientUserA, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("clientA-%d@test.com", time.Now().UnixNano()),
		Name:  "Contact A",
	})
	_, _ = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    company.ID,
		ClientID:     clientA.ID,
		Name:         "Contact A",
		Email:        clientUserA.Email,
		DefaultLevel: "commenter",
		CanDownload:  true,
	})
	clientPersonA := authz.Person{
		UserID:    uuid.UUID(clientUserA.ID.Bytes),
		Email:     clientUserA.Email,
		Role:      "client",
		CompanyID: uuid.UUID(company.ID.Bytes),
	}
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   company.ID,
		TargetType:  "project",
		TargetID:    projA.ID,
		Email:       authz.NormalizeEmail(clientUserA.Email),
		UserID:      clientUserA.ID,
		Level:       authz.LevelCommenter,
		CanDownload: true,
		GrantedBy:   compOwner.ID,
	})

	// Client Contact User B
	clientUserB, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("clientB-%d@test.com", time.Now().UnixNano()),
		Name:  "Contact B",
	})
	_, _ = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    company.ID,
		ClientID:     clientB.ID,
		Name:         "Contact B",
		Email:        clientUserB.Email,
		DefaultLevel: "commenter",
		CanDownload:  true,
	})
	clientPersonB := authz.Person{
		UserID:    uuid.UUID(clientUserB.ID.Bytes),
		Email:     clientUserB.Email,
		Role:      "client",
		CompanyID: uuid.UUID(company.ID.Bytes),
	}
	_ = clientPersonB

	// Video Items in Proj A and Proj B
	videoA, _ := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: company.ID,
		ProjectID: projA.ID,
		Kind:      "file",
		Name:      "video-a.mp4",
		CreatedBy: compOwner.ID,
		Position:  pgtype.Numeric{Int: big.NewInt(10), Valid: true},
	})
	videoB, _ := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: company.ID,
		ProjectID: projB.ID,
		Kind:      "file",
		Name:      "video-b.mp4",
		CreatedBy: compOwner.ID,
		Position:  pgtype.Numeric{Int: big.NewInt(20), Valid: true},
	})
	vA1, _ := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:     company.ID,
		ItemID:        videoA.ID,
		Number:        1,
		StorageKey:    "test/video-a.mp4",
		SizeBytes:     1024,
		Mime:          "video/mp4",
		PreviewStatus: "ready",
		PreviewKeys:   []byte(`{"master_playlist_key":"test/master.m3u8"}`),
		UploadedBy:    compOwner.ID,
	})
	_ = vA1

	// Setup Routers
	rPublic := chi.NewRouter()
	rPublic.Get("/s/{token}/items/{id}/playlist.m3u8", reviewH.PublicPlaylistProxy)
	rPublic.Get("/s/{token}/items/{id}/comments", reviewH.PublicListComments)
	rPublic.Post("/s/{token}/items/{id}/comments", reviewH.PublicCreateComment)
	rPublic.Post("/s/{token}/items/{id}/review", reviewH.PublicSubmitReview)
	rPublic.Get("/s/{token}/items/{id}/comments/export", reviewH.PublicExportCommentsCSV)
	rPublic.Post("/s/{token}/unlock", shareLinksH.PublicUnlock)
	rPublic.Post("/s/{token}/identify", shareLinksH.PublicIdentify)

	rProtected := chi.NewRouter()
	rProtected.Get("/api/v1/items/{id}/comments/export", reviewH.ExportCommentsCSV)
	rProtected.Get("/api/v1/items/{id}/mentionable", reviewH.ListMentionable)
	rProtected.Get("/api/v1/reviews/feed", reviewH.ListReviewsFeed)

	// -------------------------------------------------------------
	// 1. Password link: no unlock cookie means 401 on playlist, comments, create comment, approve
	// -------------------------------------------------------------
	t.Run("Password link: no unlock cookie means 401 on playlist, comments, create comment, approve", func(t *testing.T) {
		pwHash, err := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.DefaultCost)
		if err != nil {
			t.Fatalf("bcrypt hash: %v", err)
		}
		pwToken := fmt.Sprintf("pwlink-%d", time.Now().UnixNano())
		pwLink, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:        company.ID,
			ProjectID:        projA.ID,
			Name:             "Password Link",
			TokenHash:        authz.HashToken(pwToken),
			Access:           "commenter",
			AllowDownload:    true,
			LatestOnly:       false,
			PasswordHash:     pgtype.Text{String: string(pwHash), Valid: true},
			ExpiresAt:        pgtype.Timestamptz{Valid: false},
			AskIdentity:      false,
			UploadLimitBytes: pgtype.Int8{Valid: false},
			CreatedBy:        compOwner.ID,
		})
		if err != nil {
			t.Fatalf("create share link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: pwLink.ID,
			ItemID:      videoA.ID,
		})

		vAStr := uuid.UUID(videoA.ID.Bytes).String()

		// Test 1a: Playlist without unlock cookie -> 401
		req := httptest.NewRequest("GET", "/s/"+pwToken+"/items/"+vAStr+"/playlist.m3u8", nil)
		rec := httptest.NewRecorder()
		rPublic.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 on playlist without password unlock, got %d: %s", rec.Code, rec.Body.String())
		}

		// Test 1b: List comments without unlock cookie -> 401
		req = httptest.NewRequest("GET", "/s/"+pwToken+"/items/"+vAStr+"/comments", nil)
		rec = httptest.NewRecorder()
		rPublic.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 on list comments without password unlock, got %d: %s", rec.Code, rec.Body.String())
		}

		// Test 1c: Create comment without unlock cookie -> 401
		bodyBytes, _ := json.Marshal(map[string]interface{}{"body": "Should fail"})
		req = httptest.NewRequest("POST", "/s/"+pwToken+"/items/"+vAStr+"/comments", bytes.NewReader(bodyBytes))
		rec = httptest.NewRecorder()
		rPublic.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 on create comment without password unlock, got %d: %s", rec.Code, rec.Body.String())
		}

		// Test 1d: Approve/submit review without unlock cookie -> 401
		revBytes, _ := json.Marshal(map[string]interface{}{"status": "approved"})
		req = httptest.NewRequest("POST", "/s/"+pwToken+"/items/"+vAStr+"/review", bytes.NewReader(revBytes))
		rec = httptest.NewRecorder()
		rPublic.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 on submit review without password unlock, got %d: %s", rec.Code, rec.Body.String())
		}

		// Now unlock with correct password
		unlockBytes, _ := json.Marshal(map[string]interface{}{"password": "secret123"})
		reqUnlock := httptest.NewRequest("POST", "/s/"+pwToken+"/unlock", bytes.NewReader(unlockBytes))
		recUnlock := httptest.NewRecorder()
		rPublic.ServeHTTP(recUnlock, reqUnlock)
		if recUnlock.Code != http.StatusOK {
			t.Fatalf("failed to unlock link: %d: %s", recUnlock.Code, recUnlock.Body.String())
		}
		cookie := recUnlock.Result().Cookies()
		if len(cookie) == 0 {
			t.Fatalf("expected unlock cookie to be set")
		}

		// With unlock cookie, list comments succeeds (200)
		reqUnlocked := httptest.NewRequest("GET", "/s/"+pwToken+"/items/"+vAStr+"/comments", nil)
		for _, c := range cookie {
			reqUnlocked.AddCookie(c)
		}
		recUnlocked := httptest.NewRecorder()
		rPublic.ServeHTTP(recUnlocked, reqUnlocked)
		if recUnlocked.Code != http.StatusOK {
			t.Fatalf("expected 200 on list comments with unlock cookie, got %d: %s", recUnlocked.Code, recUnlocked.Body.String())
		}
	})

	// -------------------------------------------------------------
	// 2. Client cannot export CSV of another client's video; folder grant user only sees their folder's videos in reviews feed
	// -------------------------------------------------------------
	t.Run("Client cannot export CSV of another client's video; folder grant user only sees their folder's videos in the reviews feed", func(t *testing.T) {
		vAStr := uuid.UUID(videoA.ID.Bytes).String()
		vBStr := uuid.UUID(videoB.ID.Bytes).String()

		// Client A attempts to export CSV of Client B's video -> Refused 404
		reqB := httptest.NewRequest("GET", "/api/v1/items/"+vBStr+"/comments/export", nil)
		reqB = reqB.WithContext(contextWithPerson(reqB.Context(), clientUserA, company.ID, clientPersonA))
		recB := httptest.NewRecorder()
		rProtected.ServeHTTP(recB, reqB)
		if recB.Code != http.StatusNotFound && recB.Code != http.StatusForbidden {
			t.Fatalf("expected 404/403 when Client A exports Client B's CSV, got %d: %s", recB.Code, recB.Body.String())
		}

		// Client A exports CSV of Client A's video -> 200 OK text/csv
		reqA := httptest.NewRequest("GET", "/api/v1/items/"+vAStr+"/comments/export", nil)
		reqA = reqA.WithContext(contextWithPerson(reqA.Context(), clientUserA, company.ID, clientPersonA))
		recA := httptest.NewRecorder()
		rProtected.ServeHTTP(recA, reqA)
		if recA.Code != http.StatusOK {
			t.Fatalf("expected 200 when Client A exports Client A's CSV, got %d: %s", recA.Code, recA.Body.String())
		}

		// Setup Folders and Videos for Folder-Grant user
		folder1, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: projA.ID,
			Kind:      "folder",
			Name:      "Folder 1",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(30), Valid: true},
		})
		folder2, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: projA.ID,
			Kind:      "folder",
			Name:      "Folder 2",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(40), Valid: true},
		})

		vid1, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: projA.ID,
			ParentID:  folder1.ID,
			Kind:      "file",
			Name:      "reel-in-folder1.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(50), Valid: true},
		})
		_, _ = queries.UpdateItemReviewStatus(ctx, db.UpdateItemReviewStatusParams{
			ID:           vid1.ID,
			CompanyID:    company.ID,
			ReviewStatus: "needs_review",
		})

		vid2, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: projA.ID,
			ParentID:  folder2.ID,
			Kind:      "file",
			Name:      "reel-in-folder2.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(60), Valid: true},
		})
		_, _ = queries.UpdateItemReviewStatus(ctx, db.UpdateItemReviewStatusParams{
			ID:           vid2.ID,
			CompanyID:    company.ID,
			ReviewStatus: "needs_review",
		})

		// Create user with ONLY a viewer grant on Folder 1
		fgUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("foldergrant-%d@test.com", time.Now().UnixNano()),
			Name:  "Folder Grant User",
		})
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   company.ID,
			TargetType:  "folder",
			TargetID:    folder1.ID,
			Email:       fgUser.Email,
			UserID:      fgUser.ID,
			Level:       "viewer",
			CanDownload: false,
		})
		fgPerson := authz.Person{
			UserID:    uuid.UUID(fgUser.ID.Bytes),
			Email:     fgUser.Email,
			Role:      "",
			CompanyID: uuid.UUID(company.ID.Bytes),
		}

		// Folder grant user calls GET /api/v1/reviews/feed
		reqFeed := httptest.NewRequest("GET", "/api/v1/reviews/feed", nil)
		reqFeed = reqFeed.WithContext(contextWithPerson(reqFeed.Context(), fgUser, company.ID, fgPerson))
		recFeed := httptest.NewRecorder()
		rProtected.ServeHTTP(recFeed, reqFeed)

		if recFeed.Code != http.StatusOK {
			t.Fatalf("expected 200 on reviews feed, got %d: %s", recFeed.Code, recFeed.Body.String())
		}
		var feedResp map[string]interface{}
		_ = json.Unmarshal(recFeed.Body.Bytes(), &feedResp)
		itemsList := feedResp["items"].([]interface{})

		// Must contain vid1 and MUST NOT contain vid2
		vid1Str := uuid.UUID(vid1.ID.Bytes).String()
		vid2Str := uuid.UUID(vid2.ID.Bytes).String()
		found1 := false
		found2 := false
		for _, raw := range itemsList {
			itm := raw.(map[string]interface{})
			if itm["id"] == vid1Str {
				found1 = true
			}
			if itm["id"] == vid2Str {
				found2 = true
			}
		}
		if !found1 {
			t.Fatalf("expected folder grant user to see vid1 in folder1, but it was missing from feed")
		}
		if found2 {
			t.Fatalf("expected folder grant user NOT to see vid2 in folder2, but it was present in feed")
		}
	})

	// -------------------------------------------------------------
	// 3. Mention list for a client returns no emails and only people with access
	// -------------------------------------------------------------
	t.Run("Mention list for a client returns no emails and only people with access", func(t *testing.T) {
		vAStr := uuid.UUID(videoA.ID.Bytes).String()

		// Client A calls /mentionable on videoA
		reqMent := httptest.NewRequest("GET", "/api/v1/items/"+vAStr+"/mentionable", nil)
		reqMent = reqMent.WithContext(contextWithPerson(reqMent.Context(), clientUserA, company.ID, clientPersonA))
		recMent := httptest.NewRecorder()
		rProtected.ServeHTTP(recMent, reqMent)

		if recMent.Code != http.StatusOK {
			t.Fatalf("expected 200 on mentionable for client contact, got %d: %s", recMent.Code, recMent.Body.String())
		}
		var mentResp map[string]interface{}
		_ = json.Unmarshal(recMent.Body.Bytes(), &mentResp)
		usersList := mentResp["mentionable"].([]interface{})
		if len(usersList) == 0 {
			t.Fatalf("expected at least 1 mentionable person")
		}
		for _, uRaw := range usersList {
			u := uRaw.(map[string]interface{})
			if emailVal, ok := u["email"].(string); ok && emailVal != "" {
				t.Fatalf("leaked email %q to client contact in mentionable list! email must be empty", emailVal)
			}
		}

		// Outsider user without access calls mentionable -> 404
		outsiderUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("outsider-%d@test.com", time.Now().UnixNano()),
			Name:  "Outsider",
		})
		outsiderPerson := authz.Person{
			UserID:    uuid.UUID(outsiderUser.ID.Bytes),
			Email:     outsiderUser.Email,
			Role:      "",
			CompanyID: uuid.UUID(company.ID.Bytes),
		}
		reqOut := httptest.NewRequest("GET", "/api/v1/items/"+vAStr+"/mentionable", nil)
		reqOut = reqOut.WithContext(contextWithPerson(reqOut.Context(), outsiderUser, company.ID, outsiderPerson))
		recOut := httptest.NewRecorder()
		rProtected.ServeHTTP(recOut, reqOut)
		if recOut.Code != http.StatusNotFound && recOut.Code != http.StatusForbidden {
			t.Fatalf("expected 404/403 for outsider calling mentionable, got %d: %s", recOut.Code, recOut.Body.String())
		}
	})

	// -------------------------------------------------------------
	// 4. Visitor cannot approve without identifying; approval saves visitor_id
	// -------------------------------------------------------------
	t.Run("Visitor cannot approve without identifying; approval saves visitor_id", func(t *testing.T) {
		token := fmt.Sprintf("review-vis-%d", time.Now().UnixNano())
		visLink, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:        company.ID,
			ProjectID:        projA.ID,
			Name:             "Visitor Review Link",
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
			t.Fatalf("create share link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: visLink.ID,
			ItemID:      videoA.ID,
		})

		vAStr := uuid.UUID(videoA.ID.Bytes).String()

		// 4a. Approve without identifying -> Expect 401 identity_required
		apprPayload := map[string]interface{}{
			"status": "approved",
			"notes":  "LGTM without identify",
		}
		apprBytes, _ := json.Marshal(apprPayload)
		reqAnon := httptest.NewRequest("POST", "/s/"+token+"/items/"+vAStr+"/review", bytes.NewReader(apprBytes))
		recAnon := httptest.NewRecorder()
		rPublic.ServeHTTP(recAnon, reqAnon)
		if recAnon.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 identity_required when approving without identify, got %d: %s", recAnon.Code, recAnon.Body.String())
		}

		// 4b. Visitor identifies via /identify
		idPayload := map[string]interface{}{
			"name":  "Sarah Visitor",
			"email": "sarah@visitoragency.com",
		}
		idBytes, _ := json.Marshal(idPayload)
		reqId := httptest.NewRequest("POST", "/s/"+token+"/identify", bytes.NewReader(idBytes))
		recId := httptest.NewRecorder()
		rPublic.ServeHTTP(recId, reqId)
		if recId.Code != http.StatusOK {
			t.Fatalf("identify failed: %d: %s", recId.Code, recId.Body.String())
		}
		cookies := recId.Result().Cookies()
		if len(cookies) == 0 {
			t.Fatalf("expected visitor identify cookie to be set")
		}

		// 4c. Approve with identify cookie -> 200 OK
		reqAppr := httptest.NewRequest("POST", "/s/"+token+"/items/"+vAStr+"/review", bytes.NewReader(apprBytes))
		for _, c := range cookies {
			reqAppr.AddCookie(c)
		}
		recAppr := httptest.NewRecorder()
		rPublic.ServeHTTP(recAppr, reqAppr)
		if recAppr.Code != http.StatusOK {
			t.Fatalf("expected 200 on review approval with identify cookie, got %d: %s", recAppr.Code, recAppr.Body.String())
		}

		// 4d. Verify review row in database has visitor_id populated
		revRows, err := queries.ListReviewsByItem(ctx, db.ListReviewsByItemParams{
			ItemID:    videoA.ID,
			CompanyID: company.ID,
		})
		if err != nil || len(revRows) == 0 {
			t.Fatalf("failed to query reviews: %v", err)
		}
		latestRev := revRows[0]
		if !latestRev.VisitorID.Valid {
			t.Fatalf("expected review to save visitor_id, got invalid")
		}
		if latestRev.AuthorName != "Sarah Visitor" {
			t.Fatalf("expected AuthorName 'Sarah Visitor', got %q", latestRev.AuthorName)
		}
		if latestRev.Decision != "approved" {
			t.Fatalf("expected decision 'approved', got %q", latestRev.Decision)
		}
	})

	// -------------------------------------------------------------
	// 5. Enqueue test: completing a video upload creates a process_video_version task
	// -------------------------------------------------------------
	t.Run("Enqueue test: completing a video upload creates a process_video_version task", func(t *testing.T) {
		mockStorageH := NewStorageUploadsHandler(queries, nil, mailClient, cfg)
		mockStorageH.SetAsynqClient(asynqClient)
		rStorage := chi.NewRouter()
		rStorage.Post("/api/v1/uploads/{id}/complete", mockStorageH.CompleteUpload)

		newVid, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: company.ID,
			ProjectID: projA.ID,
			Kind:      "file",
			Name:      "asynq-enqueue-test.mp4",
			CreatedBy: compOwner.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(70), Valid: true},
		})

		upload, err := queries.CreateUpload(ctx, db.CreateUploadParams{
			CompanyID:     company.ID,
			ProjectID:     projA.ID,
			ParentID:      pgtype.UUID{Valid: false},
			TargetItemID:  newVid.ID,
			Filename:      "asynq-enqueue-test.mp4",
			SizeBytes:     1048576,
			Mime:          "video/mp4",
			StorageKey:    "test/asynq-enqueue-test.mp4",
			UploadID:      "upload-asynq-mock",
			UserID:        compOwner.ID,
			TotalParts:    1,
			PartSizeBytes: 1048576,
			ExpiresAt:     pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})
		if err != nil {
			t.Fatalf("create upload: %v", err)
		}

		uUUIDStr := uuid.UUID(upload.ID.Bytes).String()
		reqComplete := httptest.NewRequest("POST", "/api/v1/uploads/"+uUUIDStr+"/complete", bytes.NewReader([]byte(`{"parts":[]}`)))
		reqComplete = reqComplete.WithContext(contextWithPerson(reqComplete.Context(), compOwner, company.ID, ownerPerson))
		recComplete := httptest.NewRecorder()
		rStorage.ServeHTTP(recComplete, reqComplete)

		if recComplete.Code != http.StatusOK {
			t.Fatalf("complete upload failed: %d: %s", recComplete.Code, recComplete.Body.String())
		}

		// Inspect tasks in asynq default queue
		tasks, err := inspector.ListPendingTasks("default", asynq.Page(1), asynq.PageSize(50))
		if err != nil {
			t.Fatalf("failed to inspect pending tasks: %v", err)
		}
		foundTask := false
		for _, task := range tasks {
			if task.Type == "media:process_video_version" {
				foundTask = true
				break
			}
		}
		if !foundTask {
			t.Fatalf("expected media:process_video_version task in asynq queue, but none was found")
		}
	})

	// -------------------------------------------------------------
	// 6. Rotation: a 1920x1080 rotate 90 source produces 720x1280
	// -------------------------------------------------------------
	t.Run("Rotation: a 1920x1080 rotate 90 source produces 720x1280", func(t *testing.T) {
		w, h := transcode.CalculateRotatedDimensions(1920, 1080, 90, 720)
		if w != 720 || h != 1280 {
			t.Fatalf("expected 1920x1080 rotate 90 to produce 720x1280, got %dx%d", w, h)
		}

		// 270 degrees
		w270, h270 := transcode.CalculateRotatedDimensions(1920, 1080, 270, 720)
		if w270 != 720 || h270 != 1280 {
			t.Fatalf("expected 1920x1080 rotate 270 to produce 720x1280, got %dx%d", w270, h270)
		}

		// 0 degrees landscape: 1920x1080 rotate 0 -> 1280x720
		w0, h0 := transcode.CalculateRotatedDimensions(1920, 1080, 0, 720)
		if w0 != 1280 || h0 != 720 {
			t.Fatalf("expected 1920x1080 rotate 0 to produce 1280x720, got %dx%d", w0, h0)
		}

		// 1080p target on 90 degree rotated: 1920x1080 -> 1080x1920
		w1080, h1080 := transcode.CalculateRotatedDimensions(1920, 1080, 90, 1080)
		if w1080 != 1080 || h1080 != 1920 {
			t.Fatalf("expected 1920x1080 rotate 90 at 1080p to produce 1080x1920, got %dx%d", w1080, h1080)
		}
	})
}
