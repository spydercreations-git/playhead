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
		Role:      authz.RoleEditor,
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
		Role:      authz.RoleEditor, // User B is Editor (non-admin), shouldn't see unprojected private doc without grant
	})

	// 2. User A creates a document with NO project
	docPayload, _ := json.Marshal(map[string]interface{}{
		"title":    "Private Strategy Notes",
		"template": "blank",
	})
	reqDoc := httptest.NewRequest("POST", "/api/v1/documents", bytes.NewReader(docPayload))
	reqDoc = reqDoc.WithContext(contextWithAuth(reqDoc.Context(), userA, comp.ID, authz.RoleEditor))
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
	reqGetDocA = reqGetDocA.WithContext(contextWithAuth(reqGetDocA.Context(), userA, comp.ID, authz.RoleEditor))
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

	// 4. User B (non-admin editor) CANNOT view User A's private document without grant
	reqGetDocB := httptest.NewRequest("GET", "/api/v1/documents/"+createdDoc.ID, nil)
	reqGetDocB = withChiURLParams(reqGetDocB, map[string]string{"id": createdDoc.ID})
	reqGetDocB = reqGetDocB.WithContext(contextWithAuth(reqGetDocB.Context(), userB, comp.ID, authz.RoleEditor))
	recGetDocB := httptest.NewRecorder()

	docH.Get(recGetDocB, reqGetDocB)
	if recGetDocB.Code != http.StatusForbidden {
		t.Fatalf("User B (non-admin editor) should NOT be able to view User A's private doc without grant, got %d", recGetDocB.Code)
	}

	// 5. User A shares document with User B
	docUUID, _ = uuid.Parse(createdDoc.ID)
	_, err = queries.UpsertDocumentShare(ctx, db.UpsertDocumentShareParams{
		ID:         pgtype.UUID{Bytes: uuid.New(), Valid: true},
		CompanyID:  comp.ID,
		DocumentID: pgtype.UUID{Bytes: docUUID, Valid: true},
		UserID:     userB.ID,
		Role:       "view",
	})
	if err != nil {
		t.Fatalf("failed to share document with User B: %v", err)
	}

	// 6. User B CAN view the document after share
	reqGetDocBGranted := httptest.NewRequest("GET", "/api/v1/documents/"+createdDoc.ID, nil)
	reqGetDocBGranted = withChiURLParams(reqGetDocBGranted, map[string]string{"id": createdDoc.ID})
	reqGetDocBGranted = reqGetDocBGranted.WithContext(contextWithAuth(reqGetDocBGranted.Context(), userB, comp.ID, authz.RoleEditor))
	recGetDocBGranted := httptest.NewRecorder()

	docH.Get(recGetDocBGranted, reqGetDocBGranted)
	if recGetDocBGranted.Code != http.StatusOK {
		t.Fatalf("User B should be able to view document after share, got %d: %s", recGetDocBGranted.Code, recGetDocBGranted.Body.String())
	}
}
