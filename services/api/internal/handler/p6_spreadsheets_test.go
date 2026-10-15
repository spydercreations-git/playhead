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

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

func TestSpreadsheetColumnLockingAndHiddenSanitization(t *testing.T) {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable")
	if err != nil {
		t.Skip("Postgres not available, skipping db test")
		return
	}
	defer pool.Close()
	queries := db.New(pool)
	cfg := &config.Config{
		CollabInternalSecret: "test-collab-hmac-secret-32-chars-long!",
		CollabURL:            "http://localhost:8082",
	}
	h := NewSpreadsheetsHandler(pool, queries, nil, nil, cfg)

	// 1. Setup Company & Users
	company, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: fmt.Sprintf("P6 Test Agency %d", time.Now().UnixNano()),
		Slug: fmt.Sprintf("p6-agency-%d", time.Now().UnixNano()),
		Plan: "pro",
	})
	if err != nil {
		t.Fatalf("Failed to create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("p6admin-%d@agency.com", time.Now().UnixNano()),
		Name:  "Admin Alice",
	})
	if err != nil {
		t.Fatalf("Failed to create admin user: %v", err)
	}

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})

	clientUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("p6client-%d@client.com", time.Now().UnixNano()),
		Name:  "Client Bob",
	})
	if err != nil {
		t.Fatalf("Failed to create client user: %v", err)
	}

	clientEntity, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "Client Corp",
	})

	var pos pgtype.Numeric
	_ = pos.Scan("1")
	project, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: company.ID,
		ClientID:  clientEntity.ID,
		Name:      "Campaign Video Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("Failed to create project: %v", err)
	}

	// Grant client access as Uploader
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   company.ID,
		TargetType:  "project",
		TargetID:    project.ID,
		Email:       clientUser.Email,
		UserID:      clientUser.ID,
		Level:       authz.LevelUploader,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("Failed to create grant: %v", err)
	}

	// 2. Admin creates a spreadsheet
	sheetItem, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: company.ID,
		ProjectID: project.ID,
		ParentID:  pgtype.UUID{Valid: false},
		Kind:      "spreadsheet",
		Name:      "Production Budget & Margins",
		Position:  pos,
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("Failed to create item: %v", err)
	}

	sheetUUIDStr := uuid.UUID(sheetItem.ID.Bytes).String()

	sheetData := []map[string]interface{}{
		{
			"id":     "sheet_1",
			"name":   "Budget",
			"status": 1,
			"row":    5,
			"column": 3,
			"columnMeta": []map[string]interface{}{
				{"colId": "col_pub", "colIndex": 0, "name": "Item Description", "locked": false, "hidden": false, "type": "text"},
				{"colId": "col_lock", "colIndex": 1, "name": "Client Budget", "locked": true, "hidden": false, "type": "number"},
				{"colId": "col_hide", "colIndex": 2, "name": "Internal Margin", "locked": true, "hidden": true, "type": "number"},
			},
			"celldata": []map[string]interface{}{
				{"r": 0, "c": 0, "v": map[string]interface{}{"v": "Camera Package"}},
				{"r": 0, "c": 1, "v": map[string]interface{}{"v": 5000}},
				{"r": 0, "c": 2, "v": map[string]interface{}{"v": 2500}},
			},
		},
	}
	sJSON, _ := json.Marshal(sheetData)

	_, err = queries.CreateSpreadsheet(ctx, db.CreateSpreadsheetParams{
		ID:              sheetItem.ID,
		CompanyID:       company.ID,
		ContentState:    nil,
		ContentJson:     sJSON,
		PlainText:       "Camera Package 5000 2500 Internal Margin",
		PublicPlainText: "Camera Package 5000",
		RowCount:        5,
		ColCount:        3,
		CellCount:       3,
	})
	if err != nil {
		t.Fatalf("Failed to create spreadsheet: %v", err)
	}

	clientPerson := authz.Person{
		UserID:    uuid.UUID(clientUser.ID.Bytes),
		CompanyID: uuid.UUID(company.ID.Bytes),
		Email:     clientUser.Email,
	}

	// -------------------------------------------------------------------------
	// Test 1: Client viewing spreadsheet view gets sanitized view
	// Hidden column 'col_hide' and margin data '2500' MUST be completely absent!
	// -------------------------------------------------------------------------
	req := httptest.NewRequest("GET", "/api/v1/spreadsheets/"+sheetUUIDStr+"/view", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.PersonContextKey, clientPerson))
	req = withChiURLParams(req, map[string]string{"id": sheetUUIDStr})

	w := httptest.NewRecorder()
	h.GetSpreadsheetView(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK from GetSpreadsheetView, got %d: %s", w.Code, w.Body.String())
	}

	viewBody := w.Body.String()
	if bytes.Contains(w.Body.Bytes(), []byte("Internal Margin")) || bytes.Contains(w.Body.Bytes(), []byte("col_hide")) {
		t.Fatalf("LEAK: Client view contains hidden column data: %s", viewBody)
	}

	// -------------------------------------------------------------------------
	// Test 2: Client attempting to edit a LOCKED column is REJECTED with 403 column_locked
	// -------------------------------------------------------------------------
	cellEditBody, _ := json.Marshal(SetCellValueRequest{
		SheetID: "sheet_1",
		RowID:   "r_test_1",
		ColID:   "col_lock", // This column is locked!
		Value:   9999,
	})

	reqEditLocked := httptest.NewRequest("POST", "/api/v1/spreadsheets/"+sheetUUIDStr+"/cells", bytes.NewReader(cellEditBody))
	reqEditLocked = reqEditLocked.WithContext(context.WithValue(reqEditLocked.Context(), middleware.PersonContextKey, clientPerson))
	reqEditLocked = withChiURLParams(reqEditLocked, map[string]string{"id": sheetUUIDStr})

	wEditLocked := httptest.NewRecorder()
	h.SetCellValue(wEditLocked, reqEditLocked)

	if wEditLocked.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for editing locked column, got %d: %s", wEditLocked.Code, wEditLocked.Body.String())
	}
	if !bytes.Contains(wEditLocked.Body.Bytes(), []byte("column_locked")) {
		t.Errorf("Expected 'column_locked' error, got %s", wEditLocked.Body.String())
	}

	// -------------------------------------------------------------------------
	// Test 3: Client attempting to edit a HIDDEN column is REJECTED
	// -------------------------------------------------------------------------
	cellEditHidden, _ := json.Marshal(SetCellValueRequest{
		SheetID: "sheet_1",
		RowID:   "r_test_1",
		ColID:   "col_hide", // Hidden column!
		Value:   1234,
	})

	reqEditHidden := httptest.NewRequest("POST", "/api/v1/spreadsheets/"+sheetUUIDStr+"/cells", bytes.NewReader(cellEditHidden))
	reqEditHidden = reqEditHidden.WithContext(context.WithValue(reqEditHidden.Context(), middleware.PersonContextKey, clientPerson))
	reqEditHidden = withChiURLParams(reqEditHidden, map[string]string{"id": sheetUUIDStr})

	wEditHidden := httptest.NewRecorder()
	h.SetCellValue(wEditHidden, reqEditHidden)

	if wEditHidden.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for editing hidden column, got %d: %s", wEditHidden.Code, wEditHidden.Body.String())
	}

	// -------------------------------------------------------------------------
	// Test 4: Client attempting to modify columns or locks is REJECTED
	// -------------------------------------------------------------------------
	lockReqBody, _ := json.Marshal(UpdateColumnMetaRequest{
		SheetID: "sheet_1",
		ColID:   "col_pub",
		Name:    "Hacked Column Name",
	})
	reqUpdateCol := httptest.NewRequest("PATCH", "/api/v1/spreadsheets/"+sheetUUIDStr+"/columns", bytes.NewReader(lockReqBody))
	reqUpdateCol = reqUpdateCol.WithContext(context.WithValue(reqUpdateCol.Context(), middleware.PersonContextKey, clientPerson))
	reqUpdateCol = withChiURLParams(reqUpdateCol, map[string]string{"id": sheetUUIDStr})

	wUpdateCol := httptest.NewRecorder()
	h.UpdateColumnMeta(wUpdateCol, reqUpdateCol)

	if wUpdateCol.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for client modifying columns, got %d: %s", wUpdateCol.Code, wUpdateCol.Body.String())
	}

	// -------------------------------------------------------------------------
	// Test 5: Client cannot see version history (Requirement 9)
	// -------------------------------------------------------------------------
	reqVersions := httptest.NewRequest("GET", "/api/v1/spreadsheets/"+sheetUUIDStr+"/versions", nil)
	reqVersions = reqVersions.WithContext(context.WithValue(reqVersions.Context(), middleware.PersonContextKey, clientPerson))
	reqVersions = withChiURLParams(reqVersions, map[string]string{"id": sheetUUIDStr})

	wVersions := httptest.NewRecorder()
	h.ListVersions(wVersions, reqVersions)

	if wVersions.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for client accessing version history, got %d: %s", wVersions.Code, wVersions.Body.String())
	}
}

func TestAutoTrackerCreationOnProjectCreation(t *testing.T) {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable")
	if err != nil {
		t.Skip("Postgres not available")
		return
	}
	defer pool.Close()
	queries := db.New(pool)
	projHandler := NewProjectHandler(queries)

	// Create Company & Admin
	company, _ := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: fmt.Sprintf("Tracker Project Co %d", time.Now().UnixNano()),
		Slug: fmt.Sprintf("tracker-co-%d", time.Now().UnixNano()),
		Plan: "pro",
	})
	adminUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@track.com", time.Now().UnixNano()),
		Name:  "Project Lead",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})
	clientEntity, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "Acme Films",
	})

	createReq := map[string]interface{}{
		"name":      "Docuseries Season 1",
		"client_id": uuid.UUID(clientEntity.ID.Bytes).String(),
		"template":  "video_project",
	}
	b, _ := json.Marshal(createReq)

	req := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(b))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserContextKey, &middleware.AuthenticatedUser{
		ID:    adminUser.ID,
		Email: adminUser.Email,
		Name:  adminUser.Name,
	}))
	req = req.WithContext(context.WithValue(req.Context(), middleware.CompanyContextKey, company.ID))
	req = req.WithContext(context.WithValue(req.Context(), middleware.RoleContextKey, authz.RoleAdmin))

	w := httptest.NewRecorder()
	projHandler.Create(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created from Project Create, got %d: %s", w.Code, w.Body.String())
	}

	var createdProj db.Project
	_ = json.Unmarshal(w.Body.Bytes(), &createdProj)

	if !createdProj.TrackerItemID.Valid {
		t.Fatalf("Expected project.tracker_item_id to be set, but was invalid/nil!")
	}

	// Verify the tracker spreadsheet exists in spreadsheets table
	sheetRow, sErr := queries.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        createdProj.TrackerItemID,
		CompanyID: company.ID,
	})
	if sErr != nil {
		t.Fatalf("Failed to load auto-created Tracker spreadsheet: %v", sErr)
	}

	if sheetRow.Title != "Tracker" {
		t.Errorf("Expected title 'Tracker', got '%s'", sheetRow.Title)
	}
	if sheetRow.ColCount != 7 {
		t.Errorf("Expected 7 columns in default Tracker (Video, File, Editor, Status, Due date, Revisions, Notes), got %d", sheetRow.ColCount)
	}
}
