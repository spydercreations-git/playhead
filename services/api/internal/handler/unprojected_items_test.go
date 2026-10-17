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
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
)

func TestUnprojectedDocumentsAndSpreadsheets(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	cfg := config.Load()

	docH := &DocumentsHandler{
		q:      queries,
		cfg:    cfg,
		dbPool: pool,
	}

	sheetH := &SpreadsheetsHandler{
		q:   queries,
		cfg: cfg,
	}

	// 1. Create company, creator (User A) and another member (User B)
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Unprojected Studio",
		Slug:              fmt.Sprintf("unproj-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 0,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	userA, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("usera-%d@studio.com", time.Now().UnixNano()),
		Name:  "User A",
	})
	if err != nil {
		t.Fatalf("failed to create user A: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    userA.ID,
		Role:      authz.RoleMember,
	})

	userB, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("userb-%d@studio.com", time.Now().UnixNano()),
		Name:  "User B",
	})
	if err != nil {
		t.Fatalf("failed to create user B: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    userB.ID,
		Role:      authz.RoleAdmin, // User B is Admin, but shouldn't see unprojected private doc without grant
	})

	// 2. User A creates a document with NO project
	docPayload, _ := json.Marshal(map[string]interface{}{
		"title":    "Private Strategy Notes",
		"template": "blank",
	})
	reqDoc := httptest.NewRequest("POST", "/api/v1/documents", bytes.NewReader(docPayload))
	reqDoc = reqDoc.WithContext(contextWithAuth(reqDoc.Context(), userA, comp.ID, authz.RoleMember))
	recDoc := httptest.NewRecorder()

	docH.Create(recDoc, reqDoc)
	if recDoc.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for unprojected doc, got %d: %s", recDoc.Code, recDoc.Body.String())
	}

	var createdDoc struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(recDoc.Body.Bytes(), &createdDoc); err != nil {
		t.Fatalf("failed to parse created doc response: %v", err)
	}
	if createdDoc.ProjectID != "" {
		t.Errorf("expected empty project_id for unprojected doc, got %s", createdDoc.ProjectID)
	}

	docUUID, err := uuid.Parse(createdDoc.ID)
	if err != nil {
		t.Fatalf("invalid doc UUID: %v", err)
	}

	// Verify items table has project_id IS NULL
	item, err := queries.GetItemByIDOnly(ctx, pgtype.UUID{Bytes: docUUID, Valid: true})
	if err != nil {
		t.Fatalf("failed to get doc item: %v", err)
	}
	if item.ProjectID.Valid {
		t.Errorf("expected item.ProjectID.Valid to be false, got true")
	}

	// 3. User A can view the document
	reqGetDocA := httptest.NewRequest("GET", "/api/v1/documents/"+createdDoc.ID, nil)
	reqGetDocA = withChiURLParams(reqGetDocA, map[string]string{"id": createdDoc.ID})
	reqGetDocA = reqGetDocA.WithContext(contextWithAuth(reqGetDocA.Context(), userA, comp.ID, authz.RoleMember))
	recGetDocA := httptest.NewRecorder()

	docH.Get(recGetDocA, reqGetDocA)
	if recGetDocA.Code != http.StatusOK {
		t.Fatalf("User A should be able to get own document, got %d: %s", recGetDocA.Code, recGetDocA.Body.String())
	}

	var getDocRes map[string]interface{}
	_ = json.Unmarshal(recGetDocA.Body.Bytes(), &getDocRes)
	if getDocRes["project_name"] != "My documents" {
		t.Errorf("expected project_name 'My documents', got %v", getDocRes["project_name"])
	}

	// 4. User B (admin) CANNOT view User A's private document without grant
	reqGetDocB := httptest.NewRequest("GET", "/api/v1/documents/"+createdDoc.ID, nil)
	reqGetDocB = withChiURLParams(reqGetDocB, map[string]string{"id": createdDoc.ID})
	reqGetDocB = reqGetDocB.WithContext(contextWithAuth(reqGetDocB.Context(), userB, comp.ID, authz.RoleAdmin))
	recGetDocB := httptest.NewRecorder()

	docH.Get(recGetDocB, reqGetDocB)
	if recGetDocB.Code != http.StatusForbidden {
		t.Fatalf("User B (admin) should NOT be able to view User A's private doc without grant, got %d", recGetDocB.Code)
	}

	// 5. User A creates an unprojected spreadsheet
	sheetPayload, _ := json.Marshal(map[string]interface{}{
		"title":    "Personal Expense Tracker",
		"template": "blank",
	})
	reqSheet := httptest.NewRequest("POST", "/api/v1/spreadsheets", bytes.NewReader(sheetPayload))
	reqSheet = reqSheet.WithContext(contextWithAuth(reqSheet.Context(), userA, comp.ID, authz.RoleMember))
	recSheet := httptest.NewRecorder()

	sheetH.CreateSpreadsheet(recSheet, reqSheet)
	if recSheet.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for unprojected spreadsheet, got %d: %s", recSheet.Code, recSheet.Body.String())
	}

	var createdSheet struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(recSheet.Body.Bytes(), &createdSheet); err != nil {
		t.Fatalf("failed to parse created spreadsheet response: %v", err)
	}
	if createdSheet.ProjectID != "" {
		t.Errorf("expected empty project_id for unprojected sheet, got %s", createdSheet.ProjectID)
	}

	// 6. User A can view spreadsheet, User B cannot view it
	reqGetSheetA := httptest.NewRequest("GET", "/api/v1/spreadsheets/"+createdSheet.ID, nil)
	reqGetSheetA = withChiURLParams(reqGetSheetA, map[string]string{"id": createdSheet.ID})
	reqGetSheetA = reqGetSheetA.WithContext(contextWithAuth(reqGetSheetA.Context(), userA, comp.ID, authz.RoleMember))
	recGetSheetA := httptest.NewRecorder()

	sheetH.GetSpreadsheet(recGetSheetA, reqGetSheetA)
	if recGetSheetA.Code != http.StatusOK {
		t.Fatalf("User A should be able to get own spreadsheet, got %d: %s", recGetSheetA.Code, recGetSheetA.Body.String())
	}

	reqGetSheetB := httptest.NewRequest("GET", "/api/v1/spreadsheets/"+createdSheet.ID, nil)
	reqGetSheetB = withChiURLParams(reqGetSheetB, map[string]string{"id": createdSheet.ID})
	reqGetSheetB = reqGetSheetB.WithContext(contextWithAuth(reqGetSheetB.Context(), userB, comp.ID, authz.RoleAdmin))
	recGetSheetB := httptest.NewRecorder()

	sheetH.GetSpreadsheet(recGetSheetB, reqGetSheetB)
	if recGetSheetB.Code != http.StatusForbidden {
		t.Fatalf("User B should NOT be able to view User A's private spreadsheet, got %d", recGetSheetB.Code)
	}

	// 7. Explicit grant: Grant User B access to the spreadsheet
	sheetUUID, _ := uuid.Parse(createdSheet.ID)
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "item",
		TargetID:    pgtype.UUID{Bytes: sheetUUID, Valid: true},
		Email:       authz.NormalizeEmail(userB.Email),
		Level:       authz.LevelViewer,
		CanDownload: true,
		GrantedBy:   userA.ID,
	})
	if err != nil {
		t.Fatalf("failed to grant User B access: %v", err)
	}

	// Now User B CAN view the spreadsheet!
	reqGetSheetBGranted := httptest.NewRequest("GET", "/api/v1/spreadsheets/"+createdSheet.ID, nil)
	reqGetSheetBGranted = withChiURLParams(reqGetSheetBGranted, map[string]string{"id": createdSheet.ID})
	reqGetSheetBGranted = reqGetSheetBGranted.WithContext(contextWithAuth(reqGetSheetBGranted.Context(), userB, comp.ID, authz.RoleAdmin))
	recGetSheetBGranted := httptest.NewRecorder()

	sheetH.GetSpreadsheet(recGetSheetBGranted, reqGetSheetBGranted)
	if recGetSheetBGranted.Code != http.StatusOK {
		t.Fatalf("User B should be able to view spreadsheet after explicit grant, got %d: %s", recGetSheetBGranted.Code, recGetSheetBGranted.Body.String())
	}
}
