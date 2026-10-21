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
)

func TestPhase2LibraryRules(t *testing.T) {
	ctx := context.Background()
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	cfg := config.Load()
	stClient, _ := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})
	mailClient := mailer.New(mailer.Config{})

	projectsH := NewProjectHandler(queries)
	projectsH.SetPool(pool)
	projectsH.SetStorage(stClient)

	itemsH := NewItemsHandler(queries, stClient)
	itemsH.SetPool(pool)

	storageH := NewStorageUploadsHandler(queries, stClient, mailClient, cfg)
	storageH.SetPool(pool)

	shareLinksH := NewShareLinksHandler(queries, stClient, cfg.SessionSecret, cfg.Environment)
	grantsH := NewGrantsHandler(queries, mailClient)

	// Setup Base Company & Users
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              fmt.Sprintf("Idyll Phase2 Studio %d", time.Now().UnixNano()),
		Slug:              fmt.Sprintf("idyll-phase2-%d", time.Now().UnixNano()),
		Plan:              plans.PlanPro,
		Status:            "active",
		StorageLimitBytes: 100 * plans.GB,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	staffUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("staff-%d@idyllproductions.com", time.Now().UnixNano()),
		Name:  "Staff Member",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    staffUser.ID,
		Role:      authz.RoleStaff,
	})

	editorUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("editor-%d@idyllproductions.com", time.Now().UnixNano()),
		Name:  "Video Editor",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    editorUser.ID,
		Role:      authz.RoleEditor,
	})

	clientRecord, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme Corp",
	})

	clientUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("client-%d@acme.com", time.Now().UnixNano()),
		Name:  "Acme Client",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    clientUser.ID,
		Role:      authz.RoleClient,
	})
	// Attach client user as client contact
	_, _ = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     clientRecord.ID,
		Name:         clientUser.Name,
		Email:        clientUser.Email,
		DefaultLevel: authz.LevelViewer,
		CanDownload:  true,
	})

	otherClientRecord, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Stark Industries",
	})

	// Helper for auth context
	withAuth := func(r *http.Request, u db.User, role string, companyID pgtype.UUID) *http.Request {
		return r.WithContext(contextWithAuth(r.Context(), u, companyID, role))
	}
	withPersonAuth := func(r *http.Request, u db.User, p authz.Person, companyID pgtype.UUID) *http.Request {
		return r.WithContext(contextWithPerson(r.Context(), u, companyID, p))
	}

	// -------------------------------------------------------------------------
	// RULE 13 & 4: Project Creation and Default Folders
	// - Editor cannot create projects -> 403
	// - Client cannot create project for another client -> 403
	// - Client can create project in own client -> 201 with default folders
	// -------------------------------------------------------------------------
	t.Run("Rule 13 & 4: Project Creation & Default Folders", func(t *testing.T) {
		// 1. Editor attempts to create project -> 403
		payload := map[string]interface{}{
			"name":      "Editor Project",
			"client_id": uuid.UUID(clientRecord.ID.Bytes).String(),
		}
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(b))
		req = withAuth(req, editorUser, authz.RoleEditor, comp.ID)
		rr := httptest.NewRecorder()
		projectsH.Create(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for editor creating project, got %d", rr.Code)
		}

		// 2. Client attempts to create project for another client -> 403
		payloadOther := map[string]interface{}{
			"name":      "Stark Project",
			"client_id": uuid.UUID(otherClientRecord.ID.Bytes).String(),
		}
		bOther, _ := json.Marshal(payloadOther)
		reqOther := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(bOther))
		reqOther = withAuth(reqOther, clientUser, authz.RoleClient, comp.ID)
		rrOther := httptest.NewRecorder()
		projectsH.Create(rrOther, reqOther)
		if rrOther.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for client creating project for other client, got %d", rrOther.Code)
		}

		// 3. Client creates project for their own client -> 201 Created
		bOwn, _ := json.Marshal(payload)
		reqOwn := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(bOwn))
		reqOwn = withAuth(reqOwn, clientUser, authz.RoleClient, comp.ID)
		rrOwn := httptest.NewRecorder()
		projectsH.Create(rrOwn, reqOwn)
		if rrOwn.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for client creating project in own client, got %d: %s", rrOwn.Code, rrOwn.Body.String())
		}

		var createdProj map[string]interface{}
		_ = json.Unmarshal(rrOwn.Body.Bytes(), &createdProj)
		projIDStr := createdProj["id"].(string)
		projUUID, _ := uuid.Parse(projIDStr)

		// Verify default folders "Raw files" and "Edited files" were automatically created
		folders, err := queries.ListAllProjectFolders(ctx, db.ListAllProjectFoldersParams{
			CompanyID: comp.ID,
			ProjectID: pgtype.UUID{Bytes: projUUID, Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to query folders: %v", err)
		}
		folderNames := make(map[string]bool)
		for _, f := range folders {
			folderNames[f.Name] = true
		}
		if !folderNames["Raw files"] || !folderNames["Edited files"] {
			t.Errorf("expected default folders 'Raw files' and 'Edited files', found: %v", folderNames)
		}
	})

	// Setup a standard project for remaining tests
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientRecord.ID,
		Name:      "Campaign Library Project",
		CreatedBy: staffUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	projUUIDStr := uuid.UUID(proj.ID.Bytes).String()

	// Default folders for proj
	rawFolder, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "folder",
		Name:      "Raw files",
		Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
		CreatedBy: staffUser.ID,
	})
	editedFolder, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "folder",
		Name:      "Edited files",
		Position:  pgtype.Numeric{Int: big.NewInt(2000), Valid: true},
		CreatedBy: staffUser.ID,
	})

	rawFolderIDStr := uuid.UUID(rawFolder.ID.Bytes).String()
	editedFolderIDStr := uuid.UUID(editedFolder.ID.Bytes).String()

	// Grant editor access to proj
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       editorUser.Email,
		UserID:      editorUser.ID,
		Level:       authz.LevelEditor,
		CanDownload: true,
		GrantedBy:   staffUser.ID,
	})

	// -------------------------------------------------------------------------
	// RULE 5: UPLOADS ONLY IN FOLDERS
	// - Upload to project root rejected (400)
	// - Upload outside project rejected (400)
	// - Upload into folder succeeds (200)
	// -------------------------------------------------------------------------
	t.Run("Rule 5: Uploads only in folders", func(t *testing.T) {
		// 1. Upload to project root without parent_id -> 400
		rootPayload := map[string]interface{}{
			"project_id": projUUIDStr,
			"filename":   "root_file.mp4",
			"size_bytes": 1024 * 1024,
			"mime":       "video/mp4",
		}
		bRoot, _ := json.Marshal(rootPayload)
		reqRoot := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(bRoot))
		reqRoot = withAuth(reqRoot, staffUser, authz.RoleStaff, comp.ID)
		rrRoot := httptest.NewRecorder()
		storageH.InitiateUpload(rrRoot, reqRoot)
		if rrRoot.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for root upload, got %d", rrRoot.Code)
		}

		// 2. Upload with invalid/non-existent folder -> 400
		fakeFolderPayload := map[string]interface{}{
			"project_id": projUUIDStr,
			"parent_id":  uuid.New().String(),
			"filename":   "fake_folder_file.mp4",
			"size_bytes": 1024 * 1024,
			"mime":       "video/mp4",
		}
		bFake, _ := json.Marshal(fakeFolderPayload)
		reqFake := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(bFake))
		reqFake = withAuth(reqFake, staffUser, authz.RoleStaff, comp.ID)
		rrFake := httptest.NewRecorder()
		storageH.InitiateUpload(rrFake, reqFake)
		if rrFake.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for invalid folder upload, got %d", rrFake.Code)
		}

		// 3. Upload into raw files folder -> 200 OK
		validPayload := map[string]interface{}{
			"project_id": projUUIDStr,
			"parent_id":  rawFolderIDStr,
			"filename":   "valid_clip.mp4",
			"size_bytes": 1024 * 1024,
			"mime":       "video/mp4",
		}
		bValid, _ := json.Marshal(validPayload)
		reqValid := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(bValid))
		reqValid = withAuth(reqValid, staffUser, authz.RoleStaff, comp.ID)
		rrValid := httptest.NewRecorder()
		storageH.InitiateUpload(rrValid, reqValid)
		if rrValid.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for folder upload, got %d: %s", rrValid.Code, rrValid.Body.String())
		}
	})

	// Create test file item in raw files folder
	fileItem, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  rawFolder.ID,
		Kind:      "file",
		Name:      "test_clip.mp4",
		Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
		CreatedBy: staffUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create file item: %v", err)
	}
	_, _ = queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:     comp.ID,
		ItemID:        fileItem.ID,
		Number:        1,
		StorageKey:    fmt.Sprintf("companies/%s/projects/%s/items/%s/test_clip.mp4", uuid.UUID(comp.ID.Bytes), projUUIDStr, uuid.UUID(fileItem.ID.Bytes)),
		SizeBytes:     1024 * 1024,
		Mime:          "video/mp4",
		PreviewStatus: "none",
		UploadedBy:    staffUser.ID,
	})

	// -------------------------------------------------------------------------
	// RULE 6: MOVE RULES
	// - Same project: file into folder -> succeeds
	// - Cycle prevention: folder into self or descendant -> 400
	// - Another project -> 403 ("Files can't move to another project")
	// -------------------------------------------------------------------------
	t.Run("Rule 6: Move rules", func(t *testing.T) {
		// 1. Move file to another project -> 403 Forbidden
		otherProj, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  clientRecord.ID,
			Name:      "Other Project",
			CreatedBy: staffUser.ID,
		})
		otherFolder, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: comp.ID,
			ProjectID: otherProj.ID,
			ParentID:  pgtype.UUID{Valid: false},
			Kind:      "folder",
			Name:      "Other Folder",
			Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
			CreatedBy: staffUser.ID,
		})

		moveAcrossPayload := map[string]interface{}{
			"target_parent_id":  uuid.UUID(otherFolder.ID.Bytes).String(),
			"target_project_id": uuid.UUID(otherProj.ID.Bytes).String(),
		}
		bCross, _ := json.Marshal(moveAcrossPayload)
		reqCross := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/items/%s/move", uuid.UUID(fileItem.ID.Bytes)), bytes.NewReader(bCross))
		reqCross = withAuth(reqCross, staffUser, authz.RoleStaff, comp.ID)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", uuid.UUID(fileItem.ID.Bytes).String())
		reqCross = reqCross.WithContext(context.WithValue(reqCross.Context(), chi.RouteCtxKey, rctx))
		rrCross := httptest.NewRecorder()
		itemsH.MoveItem(rrCross, reqCross)
		if rrCross.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden when moving item across projects, got %d", rrCross.Code)
		}

		// 2. Move folder into itself -> 400 Bad Request
		moveSelfPayload := map[string]interface{}{
			"target_parent_id": rawFolderIDStr,
		}
		bSelf, _ := json.Marshal(moveSelfPayload)
		reqSelf := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/items/%s/move", rawFolderIDStr), bytes.NewReader(bSelf))
		reqSelf = withAuth(reqSelf, staffUser, authz.RoleStaff, comp.ID)
		rctxSelf := chi.NewRouteContext()
		rctxSelf.URLParams.Add("id", rawFolderIDStr)
		reqSelf = reqSelf.WithContext(context.WithValue(reqSelf.Context(), chi.RouteCtxKey, rctxSelf))
		rrSelf := httptest.NewRecorder()
		itemsH.MoveItem(rrSelf, reqSelf)
		if rrSelf.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request when moving folder into itself, got %d", rrSelf.Code)
		}

		// 3. Move file within same project -> 200 OK
		moveValidPayload := map[string]interface{}{
			"target_parent_id": editedFolderIDStr,
		}
		bValid, _ := json.Marshal(moveValidPayload)
		reqValid := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/items/%s/move", uuid.UUID(fileItem.ID.Bytes)), bytes.NewReader(bValid))
		reqValid = withAuth(reqValid, staffUser, authz.RoleStaff, comp.ID)
		rctxValid := chi.NewRouteContext()
		rctxValid.URLParams.Add("id", uuid.UUID(fileItem.ID.Bytes).String())
		reqValid = reqValid.WithContext(context.WithValue(reqValid.Context(), chi.RouteCtxKey, rctxValid))
		rrValid := httptest.NewRecorder()
		itemsH.MoveItem(rrValid, reqValid)
		if rrValid.Code != http.StatusOK {
			t.Errorf("expected 200 OK when moving file within same project, got %d: %s", rrValid.Code, rrValid.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// RULE 7: COPY TO / DUPLICATE
	// - Only into projects of SAME client
	// - Different client returns 403 Forbidden
	// - Duplicate creates independent copy
	// -------------------------------------------------------------------------
	t.Run("Rule 7: Copy to and Duplicate", func(t *testing.T) {
		// 1. Create a project under a DIFFERENT client
		diffClientProj, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  otherClientRecord.ID,
			Name:      "Diff Client Project",
			CreatedBy: staffUser.ID,
		})
		diffFolder, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: comp.ID,
			ProjectID: diffClientProj.ID,
			ParentID:  pgtype.UUID{Valid: false},
			Kind:      "folder",
			Name:      "Diff Folder",
			Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
			CreatedBy: staffUser.ID,
		})

		// Copy to different client project -> 403 Forbidden
		copyDiffPayload := map[string]interface{}{
			"target_project_id": uuid.UUID(diffClientProj.ID.Bytes).String(),
			"target_parent_id":  uuid.UUID(diffFolder.ID.Bytes).String(),
		}
		bDiff, _ := json.Marshal(copyDiffPayload)
		reqDiff := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/items/%s/copy", uuid.UUID(fileItem.ID.Bytes)), bytes.NewReader(bDiff))
		reqDiff = withAuth(reqDiff, staffUser, authz.RoleStaff, comp.ID)
		rctxDiff := chi.NewRouteContext()
		rctxDiff.URLParams.Add("id", uuid.UUID(fileItem.ID.Bytes).String())
		reqDiff = reqDiff.WithContext(context.WithValue(reqDiff.Context(), chi.RouteCtxKey, rctxDiff))
		rrDiff := httptest.NewRecorder()
		itemsH.CopyItem(rrDiff, reqDiff)
		if rrDiff.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden when copying to different client project, got %d", rrDiff.Code)
		}

		// 2. Duplicate in same project/folder -> 200 OK
		reqDup := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/items/%s/duplicate", uuid.UUID(fileItem.ID.Bytes)), nil)
		reqDup = withAuth(reqDup, staffUser, authz.RoleStaff, comp.ID)
		rctxDup := chi.NewRouteContext()
		rctxDup.URLParams.Add("id", uuid.UUID(fileItem.ID.Bytes).String())
		reqDup = reqDup.WithContext(context.WithValue(reqDup.Context(), chi.RouteCtxKey, rctxDup))
		rrDup := httptest.NewRecorder()
		itemsH.CopyItem(rrDup, reqDup)
		if rrDup.Code != http.StatusOK && rrDup.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created or 200 OK when duplicating item, got %d: %s", rrDup.Code, rrDup.Body.String())
		}

		var dupResp map[string]interface{}
		_ = json.Unmarshal(rrDup.Body.Bytes(), &dupResp)
		dupIDStr := dupResp["id"].(string)
		if dupIDStr == uuid.UUID(fileItem.ID.Bytes).String() {
			t.Errorf("duplicated item should have new ID, got same ID")
		}
	})

	// -------------------------------------------------------------------------
	// RULE 8: PERMISSIONS INHERITANCE AND OVERRIDES
	// - Project grant passes down to folder and file
	// - Override on folder (e.g. less access) overrides project level
	// -------------------------------------------------------------------------
	t.Run("Rule 8: Permissions inheritance and overrides", func(t *testing.T) {
		// New user Charlie (Editor role)
		charlie, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("charlie-%d@idyllproductions.com", time.Now().UnixNano()),
			Name:  "Charlie",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    charlie.ID,
			Role:      authz.RoleEditor,
		})

		// 1. Grant Charlie "Editor" on project
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       charlie.Email,
			UserID:      charlie.ID,
			Level:       authz.LevelEditor,
			CanDownload: true,
			GrantedBy:   staffUser.ID,
		})

		projTarget := authz.ProjectTarget{
			ID:        uuid.UUID(proj.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			ClientID:  uuid.UUID(clientRecord.ID.Bytes),
		}
		charliePerson := authz.Person{
			UserID:    uuid.UUID(charlie.ID.Bytes),
			Email:     charlie.Email,
			Role:      authz.RoleEditor,
			CompanyID: uuid.UUID(comp.ID.Bytes),
		}

		// Check permission on rawFolder -> inherited Editor
		accFolder, err := authz.AccessFolder(ctx, queries, charliePerson, projTarget, uuid.UUID(rawFolder.ID.Bytes))
		if err != nil || accFolder.Level != authz.LevelEditor {
			t.Errorf("expected Charlie to inherit Editor level on folder, got level=%s err=%v", accFolder.Level, err)
		}

		// 2. Override on rawFolder with "Viewer" (less access) via AddItemGrant
		canDown := false
		overridePayload := UpsertGrantRequest{
			Email:       charlie.Email,
			Level:       authz.LevelViewer,
			CanDownload: &canDown,
		}
		bOvr, _ := json.Marshal(overridePayload)
		reqOvr := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/items/%s/grants", rawFolderIDStr), bytes.NewReader(bOvr))
		staffPerson := authz.Person{
			UserID:         uuid.UUID(staffUser.ID.Bytes),
			Email:          staffUser.Email,
			Role:           authz.RoleStaff,
			CompanyID:      uuid.UUID(comp.ID.Bytes),
			PermissionsMap: authz.DefaultPermissions(authz.RoleStaff),
		}
		reqOvr = withPersonAuth(reqOvr, staffUser, staffPerson, comp.ID)
		rctxOvr := chi.NewRouteContext()
		rctxOvr.URLParams.Add("id", rawFolderIDStr)
		reqOvr = reqOvr.WithContext(context.WithValue(reqOvr.Context(), chi.RouteCtxKey, rctxOvr))
		rrOvr := httptest.NewRecorder()
		grantsH.AddItemGrant(rrOvr, reqOvr)
		if rrOvr.Code != http.StatusCreated && rrOvr.Code != http.StatusOK {
			t.Fatalf("failed to create override grant: %d: %s", rrOvr.Code, rrOvr.Body.String())
		}

		// Re-check permission on rawFolder -> now Viewer (override wins)
		accFolderAfter, err := authz.AccessFolder(ctx, queries, charliePerson, projTarget, uuid.UUID(rawFolder.ID.Bytes))
		if err != nil || accFolderAfter.Level != authz.LevelViewer || accFolderAfter.CanDownload {
			t.Errorf("expected Charlie to have overridden Viewer level without download, got level=%s download=%v", accFolderAfter.Level, accFolderAfter.CanDownload)
		}
	})

	// -------------------------------------------------------------------------
	// RULE 9: SHARE LINKS AUDIENCE
	// - "people_with_access" (default) requires authentication and access check
	// - "anyone_with_link" view-only without login, no comments, no download
	// -------------------------------------------------------------------------
	t.Run("Rule 9: Share link audience", func(t *testing.T) {
		// 1. Create link with audience = "anyone_with_link"
		pubPayload := map[string]interface{}{
			"target_type": "project",
			"target_id":   projUUIDStr,
			"item_ids":    []string{uuid.UUID(fileItem.ID.Bytes).String()},
			"audience":    "anyone_with_link",
			"permission":  "view",
		}
		bPub, _ := json.Marshal(pubPayload)
		reqPub := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/projects/%s/share-links", projUUIDStr), bytes.NewReader(bPub))
		reqPub = withAuth(reqPub, staffUser, authz.RoleStaff, comp.ID)
		rctxProj := chi.NewRouteContext()
		rctxProj.URLParams.Add("id", projUUIDStr)
		reqPub = reqPub.WithContext(context.WithValue(reqPub.Context(), chi.RouteCtxKey, rctxProj))
		rrPub := httptest.NewRecorder()
		shareLinksH.Create(rrPub, reqPub)
		if rrPub.Code != http.StatusCreated {
			t.Fatalf("failed to create public share link: %d: %s", rrPub.Code, rrPub.Body.String())
		}

		var pubResp map[string]interface{}
		_ = json.Unmarshal(rrPub.Body.Bytes(), &pubResp)
		pubToken := pubResp["token"].(string)

		// Public access without auth -> 200 OK
		reqGetPub := httptest.NewRequest("GET", fmt.Sprintf("/s/%s", pubToken), nil)
		rctxPub := chi.NewRouteContext()
		rctxPub.URLParams.Add("token", pubToken)
		reqGetPub = reqGetPub.WithContext(context.WithValue(reqGetPub.Context(), chi.RouteCtxKey, rctxPub))
		rrGetPub := httptest.NewRecorder()
		shareLinksH.PublicGet(rrGetPub, reqGetPub)
		if rrGetPub.Code != http.StatusOK {
			t.Errorf("expected 200 OK for anyone_with_link preview without login, got %d", rrGetPub.Code)
		}

		// Download attempt on anyone_with_link -> 403 Forbidden
		reqDownPub := httptest.NewRequest("GET", fmt.Sprintf("/s/%s/download", pubToken), nil)
		reqDownPub = reqDownPub.WithContext(context.WithValue(reqDownPub.Context(), chi.RouteCtxKey, rctxPub))
		rrDownPub := httptest.NewRecorder()
		shareLinksH.PublicDownload(rrDownPub, reqDownPub)
		if rrDownPub.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for public download on anyone_with_link, got %d", rrDownPub.Code)
		}

		// 2. Create link with audience = "people_with_access"
		privPayload := map[string]interface{}{
			"target_type": "project",
			"target_id":   projUUIDStr,
			"item_ids":    []string{uuid.UUID(fileItem.ID.Bytes).String()},
			"audience":    "people_with_access",
			"permission":  "view",
		}
		bPriv, _ := json.Marshal(privPayload)
		reqPriv := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/projects/%s/share-links", projUUIDStr), bytes.NewReader(bPriv))
		reqPriv = withAuth(reqPriv, staffUser, authz.RoleStaff, comp.ID)
		rctxPrivCreate := chi.NewRouteContext()
		rctxPrivCreate.URLParams.Add("id", projUUIDStr)
		reqPriv = reqPriv.WithContext(context.WithValue(reqPriv.Context(), chi.RouteCtxKey, rctxPrivCreate))
		rrPriv := httptest.NewRecorder()
		shareLinksH.Create(rrPriv, reqPriv)
		if rrPriv.Code != http.StatusCreated {
			t.Fatalf("failed to create people_with_access link: %d", rrPriv.Code)
		}

		var privResp map[string]interface{}
		_ = json.Unmarshal(rrPriv.Body.Bytes(), &privResp)
		privToken := privResp["token"].(string)

		// Anonymous access to people_with_access link -> 401 Unauthorized
		reqGetAnon := httptest.NewRequest("GET", fmt.Sprintf("/s/%s", privToken), nil)
		rctxPriv := chi.NewRouteContext()
		rctxPriv.URLParams.Add("token", privToken)
		reqGetAnon = reqGetAnon.WithContext(context.WithValue(reqGetAnon.Context(), chi.RouteCtxKey, rctxPriv))
		rrGetAnon := httptest.NewRecorder()
		shareLinksH.PublicGet(rrGetAnon, reqGetAnon)
		if rrGetAnon.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 Unauthorized for people_with_access link without login, got %d", rrGetAnon.Code)
		}

		// Authenticated user with project access -> 200 OK
		reqGetAuth := httptest.NewRequest("GET", fmt.Sprintf("/s/%s", privToken), nil)
		reqGetAuth = withAuth(reqGetAuth, staffUser, authz.RoleStaff, comp.ID)
		reqGetAuth = reqGetAuth.WithContext(context.WithValue(reqGetAuth.Context(), chi.RouteCtxKey, rctxPriv))
		rrGetAuth := httptest.NewRecorder()
		shareLinksH.PublicGet(rrGetAuth, reqGetAuth)
		if rrGetAuth.Code != http.StatusOK {
			t.Errorf("expected 200 OK for authenticated user with access, got %d", rrGetAuth.Code)
		}
	})
}
