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
)

func TestStep3ProjectStructureAndRules(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	projectH := NewProjectHandler(queries)
	itemsH := NewItemsHandler(queries, nil)
	clientH := NewClientHandler(queries, nil)
	cfg := &config.Config{
		CollabInternalSecret: "test-collab-hmac-secret-32-chars-long!",
		CollabURL:            "http://localhost:8082",
	}
	spreadsheetsH := NewSpreadsheetsHandler(pool, queries, nil, nil, cfg)

	// 1. Setup Company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Step 3 Production Studio",
		Slug:              fmt.Sprintf("step3-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 100 * 1024 * 1024 * 1024,
		Seats:             20,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}
	_, _ = SeedDefaultCompanyRoles(ctx, queries, comp.ID)

	createUser := func(name, emailPrefix, role string) db.User {
		u, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("%s-%d@studio.com", emailPrefix, time.Now().UnixNano()),
			Name:  name,
		})
		if err != nil {
			t.Fatalf("failed to create user %s: %v", name, err)
		}
		if role != "" {
			_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
				CompanyID: comp.ID,
				UserID:    u.ID,
				Role:      role,
			})
		}
		return u
	}

	ceoUser := createUser("CEO Alice", "ceo", authz.RoleCEO)
	csoUser := createUser("CSO Bob", "cso", "CSO")
	editorUser := createUser("Editor Carol", "editor", authz.RoleEditor)

	// Create client
	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Nike Productions",
		CreatedBy: ceoUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	// -------------------------------------------------------------------------
	// ADDITION 1 & 3: New Project gets "Raw files", "Edited files" and "Project tracker"
	// -------------------------------------------------------------------------
	t.Run("Addition 1: New project gets Raw files, Edited files, and Project tracker", func(t *testing.T) {
		createPayload := map[string]interface{}{
			"name":      "Nike Campaign",
			"client_id": uuid.UUID(client.ID.Bytes).String(),
		}
		body, _ := json.Marshal(createPayload)

		req := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), ceoUser, comp.ID, authz.RoleCEO))
		rr := httptest.NewRecorder()
		projectH.Create(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
		}

		var createdProj db.Project
		_ = json.Unmarshal(rr.Body.Bytes(), &createdProj)

		// Verify folders
		folders, err := queries.ListItemsByProjectAndParent(ctx, db.ListItemsByProjectAndParentParams{
			CompanyID: comp.ID,
			ProjectID: createdProj.ID,
			ParentID:  pgtype.UUID{Valid: false},
		})
		if err != nil {
			t.Fatalf("failed to list project items: %v", err)
		}

		folderNames := make(map[string]bool)
		for _, f := range folders {
			if f.Kind == "folder" {
				folderNames[f.Name] = true
			}
		}

		if !folderNames["Raw files"] {
			t.Errorf("expected 'Raw files' folder in new project")
		}
		if !folderNames["Edited files"] {
			t.Errorf("expected 'Edited files' folder in new project")
		}

		// Verify Project tracker
		if !createdProj.TrackerItemID.Valid {
			t.Fatalf("expected project.TrackerItemID to be set")
		}
		trackerItem, err := queries.GetItemByID(ctx, db.GetItemByIDParams{
			ID:        createdProj.TrackerItemID,
			CompanyID: comp.ID,
		})
		if err != nil {
			t.Fatalf("failed to get tracker item: %v", err)
		}
		if trackerItem.Name != "Project tracker" {
			t.Errorf("expected tracker name 'Project tracker', got '%s'", trackerItem.Name)
		}
		if !trackerItem.IsTracker {
			t.Errorf("expected trackerItem.IsTracker to be true")
		}
	})

	// -------------------------------------------------------------------------
	// ADDITION 3: Tracker Immutability, Clear, and Manage Access
	// -------------------------------------------------------------------------
	t.Run("Addition 3: Tracker cannot be deleted or moved, only cleared", func(t *testing.T) {
		// Create project
		createPayload := map[string]interface{}{
			"name":      "Tracker Safety Proj",
			"client_id": uuid.UUID(client.ID.Bytes).String(),
		}
		body, _ := json.Marshal(createPayload)
		req := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), ceoUser, comp.ID, authz.RoleCEO))
		rr := httptest.NewRecorder()
		projectH.Create(rr, req)

		var proj db.Project
		_ = json.Unmarshal(rr.Body.Bytes(), &proj)
		trackerIDStr := uuid.UUID(proj.TrackerItemID.Bytes).String()

		// 1. Attempt to Delete tracker -> 400 Bad Request
		delReq := httptest.NewRequest("DELETE", "/api/v1/items/"+trackerIDStr, nil)
		delReq = delReq.WithContext(contextWithAuth(delReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", trackerIDStr)
		delReq = delReq.WithContext(context.WithValue(delReq.Context(), chi.RouteCtxKey, rctx))
		delRr := httptest.NewRecorder()
		itemsH.DeleteItem(delRr, delReq)

		if delRr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request deleting tracker, got %d: %s", delRr.Code, delRr.Body.String())
		}

		// 2. Attempt to Move tracker -> 400 Bad Request
		movePayload := map[string]interface{}{"target_parent_id": nil}
		mBody, _ := json.Marshal(movePayload)
		moveReq := httptest.NewRequest("POST", "/api/v1/items/"+trackerIDStr+"/move", bytes.NewReader(mBody))
		moveReq = moveReq.WithContext(contextWithAuth(moveReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		moveReq = moveReq.WithContext(context.WithValue(moveReq.Context(), chi.RouteCtxKey, rctx))
		moveRr := httptest.NewRecorder()
		itemsH.MoveItem(moveRr, moveReq)

		if moveRr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request moving tracker, got %d: %s", moveRr.Code, moveRr.Body.String())
		}

		// 3. Attempt to Rename tracker -> 400 Bad Request
		renamePayload := map[string]interface{}{"name": "Hacked Tracker"}
		rBody, _ := json.Marshal(renamePayload)
		renameReq := httptest.NewRequest("PATCH", "/api/v1/items/"+trackerIDStr, bytes.NewReader(rBody))
		renameReq = renameReq.WithContext(contextWithAuth(renameReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		renameReq = renameReq.WithContext(context.WithValue(renameReq.Context(), chi.RouteCtxKey, rctx))
		renameRr := httptest.NewRecorder()
		itemsH.RenameItem(renameRr, renameReq)

		if renameRr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request renaming tracker, got %d: %s", renameRr.Code, renameRr.Body.String())
		}

		// 4. Clear Tracker -> 200 OK
		clearReq := httptest.NewRequest("POST", "/api/v1/spreadsheets/"+trackerIDStr+"/clear", nil)
		clearReq = clearReq.WithContext(contextWithAuth(clearReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		cRctx := chi.NewRouteContext()
		cRctx.URLParams.Add("id", trackerIDStr)
		clearReq = clearReq.WithContext(context.WithValue(clearReq.Context(), chi.RouteCtxKey, cRctx))
		clearRr := httptest.NewRecorder()
		spreadsheetsH.ClearSpreadsheet(clearRr, clearReq)

		if clearRr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK clearing tracker, got %d: %s", clearRr.Code, clearRr.Body.String())
		}
	})

	t.Run("Addition 3: Tracker Manage Access is server-checked and restricted to project members", func(t *testing.T) {
		createPayload := map[string]interface{}{
			"name":      "Tracker Access Proj",
			"client_id": uuid.UUID(client.ID.Bytes).String(),
		}
		body, _ := json.Marshal(createPayload)
		req := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), ceoUser, comp.ID, authz.RoleCEO))
		rr := httptest.NewRecorder()
		projectH.Create(rr, req)

		var proj db.Project
		_ = json.Unmarshal(rr.Body.Bytes(), &proj)
		trackerIDStr := uuid.UUID(proj.TrackerItemID.Bytes).String()

		// Add editorUser to project
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       editorUser.Email,
			UserID:      editorUser.ID,
			Level:       authz.LevelEditor,
			CanDownload: true,
			GrantedBy:   ceoUser.ID,
		})

		// 1. GetTrackerAccess -> should list editorUser
		getReq := httptest.NewRequest("GET", "/api/v1/items/"+trackerIDStr+"/tracker-access", nil)
		getReq = getReq.WithContext(contextWithAuth(getReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", trackerIDStr)
		getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))
		getRr := httptest.NewRecorder()
		spreadsheetsH.GetTrackerAccess(getRr, getReq)

		if getRr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK getting tracker access, got %d: %s", getRr.Code, getRr.Body.String())
		}

		// 2. UpdateTrackerAccess: valid person in project -> 200 OK
		updatePayload := map[string]interface{}{
			"people": []map[string]interface{}{
				{"email": editorUser.Email, "access": "viewer"},
			},
		}
		uBody, _ := json.Marshal(updatePayload)
		postReq := httptest.NewRequest("POST", "/api/v1/items/"+trackerIDStr+"/tracker-access", bytes.NewReader(uBody))
		postReq = postReq.WithContext(contextWithAuth(postReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		postReq = postReq.WithContext(context.WithValue(postReq.Context(), chi.RouteCtxKey, rctx))
		postRr := httptest.NewRecorder()
		spreadsheetsH.UpdateTrackerAccess(postRr, postReq)

		if postRr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK updating tracker access, got %d: %s", postRr.Code, postRr.Body.String())
		}

		// 3. UpdateTrackerAccess: person NOT in project -> 400 Bad Request
		notInProjectPayload := map[string]interface{}{
			"people": []map[string]interface{}{
				{"email": "stranger@othercompany.com", "access": "viewer"},
			},
		}
		nipBody, _ := json.Marshal(notInProjectPayload)
		nonMemberUser := createUser("Non Member", "nonmember", authz.RoleEditor)
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       nonMemberUser.Email,
			UserID:      nonMemberUser.ID,
			Level:       authz.LevelFull,
			CanDownload: true,
			GrantedBy:   ceoUser.ID,
		})

		nipReq := httptest.NewRequest("POST", "/api/v1/items/"+trackerIDStr+"/tracker-access", bytes.NewReader(nipBody))
		nipReq = nipReq.WithContext(contextWithAuth(nipReq.Context(), nonMemberUser, comp.ID, authz.RoleEditor))
		nipReq = nipReq.WithContext(context.WithValue(nipReq.Context(), chi.RouteCtxKey, rctx))
		nipRr := httptest.NewRecorder()
		spreadsheetsH.UpdateTrackerAccess(nipRr, nipReq)

		if nipRr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request granting tracker access to person not in project, got %d: %s", nipRr.Code, nipRr.Body.String())
		}
	})

	t.Run("Addition 3: Hide from clients column hides columns and blocks edits from client contacts", func(t *testing.T) {
		createPayload := map[string]interface{}{
			"name":      "Tracker Hide Proj",
			"client_id": uuid.UUID(client.ID.Bytes).String(),
		}
		body, _ := json.Marshal(createPayload)
		req := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), ceoUser, comp.ID, authz.RoleCEO))
		rr := httptest.NewRecorder()
		projectH.Create(rr, req)

		var proj db.Project
		_ = json.Unmarshal(rr.Body.Bytes(), &proj)
		trackerIDStr := uuid.UUID(proj.TrackerItemID.Bytes).String()

		// Set column 0 to hidden_from_clients = true
		sheetRow, _ := queries.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
			ID:        proj.TrackerItemID,
			CompanyID: comp.ID,
		})
		var sheets []map[string]interface{}
		_ = json.Unmarshal(sheetRow.ContentJson, &sheets)
		if len(sheets) > 0 {
			if cols, ok := sheets[0]["columnMeta"].([]interface{}); ok && len(cols) > 0 {
				if col0, ok := cols[0].(map[string]interface{}); ok {
					col0["hidden_from_clients"] = true
					col0["colId"] = "col_0"
				}
			}
			updatedJSON, _ := json.Marshal(sheets)
			_, _ = queries.UpdateSpreadsheetCollab(ctx, db.UpdateSpreadsheetCollabParams{
				ID:              sheetRow.ID,
				CompanyID:       sheetRow.CompanyID,
				ContentState:    sheetRow.ContentState,
				ContentJson:     updatedJSON,
				PlainText:       sheetRow.PlainText,
				PublicPlainText: sheetRow.PublicPlainText,
				RowCount:        sheetRow.RowCount,
				ColCount:        sheetRow.ColCount,
				CellCount:       sheetRow.CellCount,
			})
		}

		// Client contact (no team membership)
		clientContactUser := createUser("Client Sarah", "sarah-client", "")
		_, _ = queries.CreateClientContact(ctx, db.CreateClientContactParams{
			CompanyID:    comp.ID,
			ClientID:     client.ID,
			Name:         clientContactUser.Name,
			Email:        clientContactUser.Email,
			DefaultLevel: authz.LevelEditor,
			CanDownload:  true,
		})
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       clientContactUser.Email,
			UserID:      clientContactUser.ID,
			Level:       authz.LevelEditor,
			CanDownload: true,
			GrantedBy:   ceoUser.ID,
		})

		// 1. Client Contact views spreadsheet -> hidden_from_clients column must be stripped
		viewReq := httptest.NewRequest("GET", "/api/v1/spreadsheets/"+trackerIDStr, nil)
		viewReq = viewReq.WithContext(contextWithAuth(viewReq.Context(), clientContactUser, comp.ID, ""))
		vRctx := chi.NewRouteContext()
		vRctx.URLParams.Add("id", trackerIDStr)
		viewReq = viewReq.WithContext(context.WithValue(viewReq.Context(), chi.RouteCtxKey, vRctx))
		viewRr := httptest.NewRecorder()
		spreadsheetsH.GetSpreadsheet(viewRr, viewReq)

		if viewRr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for client contact viewing spreadsheet, got %d: %s", viewRr.Code, viewRr.Body.String())
		}
		var viewResp map[string]interface{}
		_ = json.Unmarshal(viewRr.Body.Bytes(), &viewResp)
		if respSheets, ok := viewResp["sheets"].([]interface{}); ok && len(respSheets) > 0 {
			if s0, ok := respSheets[0].(map[string]interface{}); ok {
				if cols, ok := s0["columnMeta"].([]interface{}); ok {
					if len(cols) != 6 {
						t.Errorf("expected 6 columns after stripping hidden_from_clients column, got %d", len(cols))
					}
				}
			}
		}

		// 2. Client contact attempts to edit hidden_from_clients column -> 403 Forbidden
		cellPayload := map[string]interface{}{
			"sheet_id": "sheet_1",
			"col_id":   "col_0",
			"row_id":   "row_0",
			"value":    "Secret Value",
		}
		cBody, _ := json.Marshal(cellPayload)
		cellReq := httptest.NewRequest("POST", "/api/v1/spreadsheets/"+trackerIDStr+"/cells", bytes.NewReader(cBody))
		cellReq = cellReq.WithContext(contextWithAuth(cellReq.Context(), clientContactUser, comp.ID, ""))
		cellReq = cellReq.WithContext(context.WithValue(cellReq.Context(), chi.RouteCtxKey, vRctx))
		cellRr := httptest.NewRecorder()
		spreadsheetsH.SetCellValue(cellRr, cellReq)

		if cellRr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for client contact editing hidden column, got %d: %s", cellRr.Code, cellRr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// ADDITION 5: Server Delete Permissions
	// -------------------------------------------------------------------------
	t.Run("Addition 5: Delete permissions for projects and clients", func(t *testing.T) {
		// Create client for deletion test
		testClient, err := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: comp.ID,
			Name:      "Delete Perms Client",
			CreatedBy: ceoUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create client: %v", err)
		}

		// 1. Client delete by Editor -> 403 Forbidden
		cDelReq := httptest.NewRequest("DELETE", "/api/v1/clients/"+uuid.UUID(testClient.ID.Bytes).String(), nil)
		cDelReq = cDelReq.WithContext(contextWithAuth(cDelReq.Context(), editorUser, comp.ID, authz.RoleEditor))
		cRctx := chi.NewRouteContext()
		cRctx.URLParams.Add("id", uuid.UUID(testClient.ID.Bytes).String())
		cDelReq = cDelReq.WithContext(context.WithValue(cDelReq.Context(), chi.RouteCtxKey, cRctx))
		cDelRr := httptest.NewRecorder()
		clientH.Delete(cDelRr, cDelReq)

		if cDelRr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for editor deleting client, got %d", cDelRr.Code)
		}

		// 2. Client delete by CSO (full-access role) -> 200 OK
		cDelReqCSO := httptest.NewRequest("DELETE", "/api/v1/clients/"+uuid.UUID(testClient.ID.Bytes).String(), nil)
		cDelReqCSO = cDelReqCSO.WithContext(contextWithAuth(cDelReqCSO.Context(), csoUser, comp.ID, "CSO"))
		cDelReqCSO = cDelReqCSO.WithContext(context.WithValue(cDelReqCSO.Context(), chi.RouteCtxKey, cRctx))
		cDelRrCSO := httptest.NewRecorder()
		clientH.Delete(cDelRrCSO, cDelReqCSO)

		if cDelRrCSO.Code != http.StatusOK {
			t.Errorf("expected 200 OK for CSO deleting client, got %d: %s", cDelRrCSO.Code, cDelRrCSO.Body.String())
		}

		// Create project for project delete test
		testProjClient, _ := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: comp.ID,
			Name:      "Project Perms Client",
			CreatedBy: ceoUser.ID,
		})
		testProj, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  testProjClient.ID,
			Name:      "Project Delete Test",
			CreatedBy: ceoUser.ID,
		})

		// Grant editorUser Editor level on testProj
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    testProj.ID,
			Email:       editorUser.Email,
			UserID:      editorUser.ID,
			Level:       authz.LevelEditor,
			CanDownload: true,
			GrantedBy:   ceoUser.ID,
		})

		// 3. Project delete by person with only Editor access -> 403 Forbidden
		pDelReq := httptest.NewRequest("DELETE", "/api/v1/projects/"+uuid.UUID(testProj.ID.Bytes).String(), nil)
		pDelReq = pDelReq.WithContext(contextWithAuth(pDelReq.Context(), editorUser, comp.ID, authz.RoleEditor))
		pRctx := chi.NewRouteContext()
		pRctx.URLParams.Add("id", uuid.UUID(testProj.ID.Bytes).String())
		pDelReq = pDelReq.WithContext(context.WithValue(pDelReq.Context(), chi.RouteCtxKey, pRctx))
		pDelRr := httptest.NewRecorder()
		projectH.Delete(pDelRr, pDelReq)

		if pDelRr.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for editor deleting project, got %d", pDelRr.Code)
		}

		// 4. Project delete by person with Full access on project -> 200 OK
		fullProjUser := createUser("Full Project User", "fulluser", authz.RoleEditor)
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    testProj.ID,
			Email:       fullProjUser.Email,
			UserID:      fullProjUser.ID,
			Level:       authz.LevelFull,
			CanDownload: true,
			GrantedBy:   ceoUser.ID,
		})

		pDelReqFull := httptest.NewRequest("DELETE", "/api/v1/projects/"+uuid.UUID(testProj.ID.Bytes).String(), nil)
		pDelReqFull = pDelReqFull.WithContext(contextWithAuth(pDelReqFull.Context(), fullProjUser, comp.ID, authz.RoleEditor))
		pDelReqFull = pDelReqFull.WithContext(context.WithValue(pDelReqFull.Context(), chi.RouteCtxKey, pRctx))
		pDelRrFull := httptest.NewRecorder()
		projectH.Delete(pDelRrFull, pDelReqFull)

		if pDelRrFull.Code != http.StatusOK {
			t.Errorf("expected 200 OK for user with Full project access deleting project, got %d: %s", pDelRrFull.Code, pDelRrFull.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// ADDITION 4: Restore Rules & delete_batch_id Isolation
	// -------------------------------------------------------------------------
	t.Run("Addition 4: Cascading trash and restore isolation with delete_batch_id", func(t *testing.T) {
		// 1. Create client and two projects
		cascadeClient, _ := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: comp.ID,
			Name:      "Cascade Client",
			CreatedBy: ceoUser.ID,
		})
		projA, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  cascadeClient.ID,
			Name:      "Project A (Deleted Early)",
			CreatedBy: ceoUser.ID,
		})
		projB, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: comp.ID,
			ClientID:  cascadeClient.ID,
			Name:      "Project B (Active when Client deleted)",
			CreatedBy: ceoUser.ID,
		})

		// Add an item inside Proj B
		itemInProjB, _ := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: comp.ID,
			ProjectID: projB.ID,
			Kind:      "file",
			Name:      "B_Cut.mp4",
			Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
			CreatedBy: ceoUser.ID,
		})

		// 2. Soft-delete Project A separately first
		pDelReq := httptest.NewRequest("DELETE", "/api/v1/projects/"+uuid.UUID(projA.ID.Bytes).String(), nil)
		pDelReq = pDelReq.WithContext(contextWithAuth(pDelReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		pRctxA := chi.NewRouteContext()
		pRctxA.URLParams.Add("id", uuid.UUID(projA.ID.Bytes).String())
		pDelReq = pDelReq.WithContext(context.WithValue(pDelReq.Context(), chi.RouteCtxKey, pRctxA))
		pDelRr := httptest.NewRecorder()
		projectH.Delete(pDelRr, pDelReq)
		if pDelRr.Code != http.StatusOK {
			t.Fatalf("failed to delete Project A: %s", pDelRr.Body.String())
		}

		// 3. Soft-delete the entire Client (should cascade to Project B and item, but Project A keeps its own batch)
		cDelReq := httptest.NewRequest("DELETE", "/api/v1/clients/"+uuid.UUID(cascadeClient.ID.Bytes).String(), nil)
		cDelReq = cDelReq.WithContext(contextWithAuth(cDelReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		cRctx := chi.NewRouteContext()
		cRctx.URLParams.Add("id", uuid.UUID(cascadeClient.ID.Bytes).String())
		cDelReq = cDelReq.WithContext(context.WithValue(cDelReq.Context(), chi.RouteCtxKey, cRctx))
		cDelRr := httptest.NewRecorder()
		clientH.Delete(cDelRr, cDelReq)
		if cDelRr.Code != http.StatusOK {
			t.Fatalf("failed to delete Client: %s", cDelRr.Body.String())
		}

		// 4. Attempt to restore Project A while Client is in Trash -> 400 Bad Request (Cannot restore project while its client is in Trash)
		pRestoreReq := httptest.NewRequest("POST", "/api/v1/projects/"+uuid.UUID(projA.ID.Bytes).String()+"/restore", nil)
		pRestoreReq = pRestoreReq.WithContext(contextWithAuth(pRestoreReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		pRestoreReq = pRestoreReq.WithContext(context.WithValue(pRestoreReq.Context(), chi.RouteCtxKey, pRctxA))
		pRestoreRr := httptest.NewRecorder()
		projectH.Restore(pRestoreRr, pRestoreReq)

		if pRestoreRr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request restoring project while client is in Trash, got %d: %s", pRestoreRr.Code, pRestoreRr.Body.String())
		}

		// 5. Restore the Client -> Restores Client and Project B (same batch), Project A stays in Trash!
		cRestoreReq := httptest.NewRequest("POST", "/api/v1/clients/"+uuid.UUID(cascadeClient.ID.Bytes).String()+"/restore", nil)
		cRestoreReq = cRestoreReq.WithContext(contextWithAuth(cRestoreReq.Context(), ceoUser, comp.ID, authz.RoleCEO))
		cRestoreReq = cRestoreReq.WithContext(context.WithValue(cRestoreReq.Context(), chi.RouteCtxKey, cRctx))
		cRestoreRr := httptest.NewRecorder()
		clientH.Restore(cRestoreRr, cRestoreReq)

		if cRestoreRr.Code != http.StatusOK {
			t.Fatalf("failed to restore Client: %s", cRestoreRr.Body.String())
		}

		// Check Project B status -> should be restored (deleted_at is null)
		restoredProjB, err := queries.GetProjectByID(ctx, db.GetProjectByIDParams{
			CompanyID: comp.ID,
			ID:        projB.ID,
		})
		if err != nil {
			t.Errorf("expected Project B to be restored with client, got error: %v", err)
		}
		if restoredProjB.DeletedAt.Valid {
			t.Errorf("expected Project B deleted_at to be NULL")
		}

		// Check item in Project B -> should be restored
		restoredItem, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{
			CompanyID: comp.ID,
			ID:        itemInProjB.ID,
		})
		if restoredItem.DeletedAt.Valid {
			t.Errorf("expected Item in Project B to be restored with batch")
		}

		// Check Project A status -> must still be in Trash!
		projAInTrash, _ := queries.GetProjectByIDAnyStatus(ctx, db.GetProjectByIDAnyStatusParams{
			CompanyID: comp.ID,
			ID:        projA.ID,
		})
		if !projAInTrash.DeletedAt.Valid {
			t.Errorf("expected Project A to remain in Trash because it was deleted separately in its own batch!")
		}

		// Now that Client is restored, Project A can be restored individually!
		pRestoreReq2 := httptest.NewRequest("POST", "/api/v1/projects/"+uuid.UUID(projA.ID.Bytes).String()+"/restore", nil)
		pRestoreReq2 = pRestoreReq2.WithContext(contextWithAuth(pRestoreReq2.Context(), ceoUser, comp.ID, authz.RoleCEO))
		pRestoreReq2 = pRestoreReq2.WithContext(context.WithValue(pRestoreReq2.Context(), chi.RouteCtxKey, pRctxA))
		pRestoreRr2 := httptest.NewRecorder()
		projectH.Restore(pRestoreRr2, pRestoreReq2)

		if pRestoreRr2.Code != http.StatusOK {
			t.Fatalf("failed to restore Project A after client restored: %s", pRestoreRr2.Body.String())
		}

		projARestored, _ := queries.GetProjectByID(ctx, db.GetProjectByIDParams{
			CompanyID: comp.ID,
			ID:        projA.ID,
		})
		if projARestored.DeletedAt.Valid {
			t.Errorf("expected Project A to now be restored")
		}
	})
}
