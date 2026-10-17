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

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
)

func TestPartAStorageLimitAndItemDeletions(t *testing.T) {
	cfg := config.Load()
	ctx := context.Background()
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	mailClient := mailer.New(mailer.Config{})
	itemsH := NewItemsHandler(queries, nil)
	storageH := NewStorageUploadsHandler(queries, nil, mailClient, cfg)
	docsH := NewDocumentsHandler(pool, queries, nil, nil, cfg)
	sheetsH := NewSpreadsheetsHandler(pool, queries, nil, nil, cfg)

	// 1. Create Company "Idyll Productions" with internal plan and storage_limit_bytes = 0
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Idyll Productions",
		Slug:              fmt.Sprintf("idyll-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 0,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("harsh-%d@idyllproductions.com", time.Now().UnixNano()),
		Name:  "Harsh",
	})
	if err != nil {
		t.Fatalf("failed to create admin user: %v", err)
	}

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})

	clientRec, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Everygen",
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientRec.ID,
		Name:      "Campaign Video",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// -------------------------------------------------------------------------
	// Test 1: Test a 2 GB upload on Idyll Productions (storage_limit_bytes = 0)
	// -------------------------------------------------------------------------
	t.Run("2 GB upload on company with storage_limit_bytes = 0 succeeds", func(t *testing.T) {
		const twoGB = 2 * 1024 * 1024 * 1024 // 2 GB

		uploadPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"filename":   "raw_footage_4k.mov",
			"size_bytes": twoGB,
			"mime":       "video/quicktime",
		}
		body, _ := json.Marshal(uploadPayload)

		req := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), adminUser, comp.ID, authz.RoleAdmin))
		rr := httptest.NewRecorder()

		storageH.InitiateUpload(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for 2 GB upload, got %d: %s", rr.Code, rr.Body.String())
		}

		var res map[string]interface{}
		if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse initiate response: %v", err)
		}

		if res["upload_id"] == nil || res["storage_key"] == nil {
			t.Errorf("expected upload_id and storage_key in response, got %v", res)
		}
	})

	t.Run("Non-internal plan with storage_limit_bytes = 0 is blocked immediately", func(t *testing.T) {
		nonInternalComp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
			Name:              "Zero Storage Pro Studio",
			Slug:              fmt.Sprintf("zero-storage-%d", time.Now().UnixNano()),
			Plan:              plans.PlanPro,
			Status:            "active",
			StorageLimitBytes: 0, // No storage allocated
			Seats:             1,
		})
		if err != nil {
			t.Fatalf("failed to create company: %v", err)
		}

		userZero, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("zero-%d@prostudio.com", time.Now().UnixNano()),
			Name:  "Zero User",
		})
		if err != nil {
			t.Fatalf("failed to create user: %v", err)
		}

		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: nonInternalComp.ID,
			UserID:    userZero.ID,
			Role:      authz.RoleAdmin,
		})

		clientZero, err := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: nonInternalComp.ID,
			Name:      "Client Zero",
		})
		if err != nil {
			t.Fatalf("failed to create client: %v", err)
		}

		projZero, err := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: nonInternalComp.ID,
			ClientID:  clientZero.ID,
			Name:      "Zero Project",
			CreatedBy: userZero.ID,
		})
		if err != nil {
			t.Fatalf("failed to create project: %v", err)
		}

		uploadPayload := map[string]interface{}{
			"project_id": uuid.UUID(projZero.ID.Bytes).String(),
			"filename":   "clip.mp4",
			"size_bytes": 1024 * 1024, // 1 MB
			"mime":       "video/mp4",
		}
		body, _ := json.Marshal(uploadPayload)

		req := httptest.NewRequest("POST", "/api/v1/uploads/initiate", bytes.NewReader(body))
		req = req.WithContext(contextWithAuth(req.Context(), userZero, nonInternalComp.ID, authz.RoleAdmin))
		rr := httptest.NewRecorder()

		storageH.InitiateUpload(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for non-internal plan with 0 storage limit, got %d: %s", rr.Code, rr.Body.String())
		}

		var res map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &res)
		if res["error"] != "quota_exceeded" {
			t.Errorf("expected error=quota_exceeded, got %v", res["error"])
		}
	})

	// -------------------------------------------------------------------------
	// Test 2: DELETE /api/v1/documents/{id} sends to Trash and Restore brings it back
	// -------------------------------------------------------------------------
	t.Run("DELETE /documents/{id} sends to trash and restores", func(t *testing.T) {
		// 1. Create a document
		createPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"title":      "Production Brief",
		}
		createBody, _ := json.Marshal(createPayload)
		req := httptest.NewRequest("POST", "/api/v1/documents", bytes.NewReader(createBody))
		req = req.WithContext(contextWithAuth(req.Context(), adminUser, comp.ID, authz.RoleAdmin))
		rr := httptest.NewRecorder()
		docsH.Create(rr, req)
		if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
			t.Fatalf("failed to create document: code %d: %s", rr.Code, rr.Body.String())
		}
		var createdDoc map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &createdDoc)
		docIDStr := createdDoc["id"].(string)

		// 2. Setup chi router for DELETE /documents/{id} and trash
		r := chi.NewRouter()
		r.Delete("/documents/{id}", itemsH.DeleteItem)
		r.Get("/trash", itemsH.ListTrash)
		r.Post("/trash/{id}/restore", itemsH.RestoreTrashItem)

		// 3. Perform DELETE /documents/{id}
		delReq := httptest.NewRequest("DELETE", fmt.Sprintf("/documents/%s", docIDStr), nil)
		delReq = delReq.WithContext(contextWithAuth(delReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
		delRR := httptest.NewRecorder()
		r.ServeHTTP(delRR, delReq)

		if delRR.Code != http.StatusOK && delRR.Code != http.StatusNoContent {
			t.Fatalf("expected 200/204 on DELETE /documents/{id}, got %d: %s", delRR.Code, delRR.Body.String())
		}

		// 4. Verify document is in Trash
		trashReq := httptest.NewRequest("GET", "/trash", nil)
		trashReq = trashReq.WithContext(contextWithAuth(trashReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
		trashRR := httptest.NewRecorder()
		r.ServeHTTP(trashRR, trashReq)
		if trashRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on GET /trash, got %d: %s", trashRR.Code, trashRR.Body.String())
		}

		var trashResp map[string]interface{}
		_ = json.Unmarshal(trashRR.Body.Bytes(), &trashResp)
		itemsList, ok := trashResp["items"].([]interface{})
		if !ok {
			t.Fatalf("expected items array in trash response: %v", trashResp)
		}

		found := false
		for _, item := range itemsList {
			m := item.(map[string]interface{})
			if m["id"] == docIDStr {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected document %s to appear in Trash, items: %v", docIDStr, itemsList)
		}

		// 5. Restore document from Trash
		restoreReq := httptest.NewRequest("POST", fmt.Sprintf("/trash/%s/restore", docIDStr), nil)
		restoreReq = restoreReq.WithContext(contextWithAuth(restoreReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
		restoreRR := httptest.NewRecorder()
		r.ServeHTTP(restoreRR, restoreReq)

		if restoreRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on restore trash item, got %d: %s", restoreRR.Code, restoreRR.Body.String())
		}

		// 6. Verify item is no longer in Trash
		trashRR2 := httptest.NewRecorder()
		trashReq2 := httptest.NewRequest("GET", "/trash", nil)
		trashReq2 = trashReq2.WithContext(contextWithAuth(trashReq2.Context(), adminUser, comp.ID, authz.RoleAdmin))
		r.ServeHTTP(trashRR2, trashReq2)
		_ = json.Unmarshal(trashRR2.Body.Bytes(), &trashResp)
		itemsList2 := trashResp["items"].([]interface{})
		for _, item := range itemsList2 {
			m := item.(map[string]interface{})
			if m["id"] == docIDStr {
				t.Fatalf("document %s should no longer be in trash after restore", docIDStr)
			}
		}
	})

	// -------------------------------------------------------------------------
	// Test 3: DELETE /api/v1/spreadsheets/{id} sends to Trash and Restore brings it back
	// -------------------------------------------------------------------------
	t.Run("DELETE /spreadsheets/{id} sends to trash and restores", func(t *testing.T) {
		// 1. Create a spreadsheet
		createPayload := map[string]interface{}{
			"project_id": uuid.UUID(proj.ID.Bytes).String(),
			"title":      "Budget Sheet",
		}
		createBody, _ := json.Marshal(createPayload)
		req := httptest.NewRequest("POST", "/api/v1/spreadsheets", bytes.NewReader(createBody))
		req = req.WithContext(contextWithAuth(req.Context(), adminUser, comp.ID, authz.RoleAdmin))
		rr := httptest.NewRecorder()
		sheetsH.CreateSpreadsheet(rr, req)
		if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
			t.Fatalf("failed to create spreadsheet: code %d: %s", rr.Code, rr.Body.String())
		}
		var createdSheet map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &createdSheet)
		sheetIDStr := createdSheet["id"].(string)

		// 2. Setup chi router for DELETE /spreadsheets/{id} and trash
		r := chi.NewRouter()
		r.Delete("/spreadsheets/{id}", itemsH.DeleteItem)
		r.Get("/trash", itemsH.ListTrash)
		r.Post("/trash/{id}/restore", itemsH.RestoreTrashItem)

		// 3. Perform DELETE /spreadsheets/{id}
		delReq := httptest.NewRequest("DELETE", fmt.Sprintf("/spreadsheets/%s", sheetIDStr), nil)
		delReq = delReq.WithContext(contextWithAuth(delReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
		delRR := httptest.NewRecorder()
		r.ServeHTTP(delRR, delReq)

		if delRR.Code != http.StatusOK && delRR.Code != http.StatusNoContent {
			t.Fatalf("expected 200/204 on DELETE /spreadsheets/{id}, got %d: %s", delRR.Code, delRR.Body.String())
		}

		// 4. Verify spreadsheet is in Trash
		trashReq := httptest.NewRequest("GET", "/trash", nil)
		trashReq = trashReq.WithContext(contextWithAuth(trashReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
		trashRR := httptest.NewRecorder()
		r.ServeHTTP(trashRR, trashReq)
		if trashRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on GET /trash, got %d: %s", trashRR.Code, trashRR.Body.String())
		}

		var trashResp map[string]interface{}
		_ = json.Unmarshal(trashRR.Body.Bytes(), &trashResp)
		itemsList := trashResp["items"].([]interface{})
		found := false
		for _, item := range itemsList {
			m := item.(map[string]interface{})
			if m["id"] == sheetIDStr {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected spreadsheet %s to appear in Trash, items: %v", sheetIDStr, itemsList)
		}

		// 5. Restore spreadsheet from Trash
		restoreReq := httptest.NewRequest("POST", fmt.Sprintf("/trash/%s/restore", sheetIDStr), nil)
		restoreReq = restoreReq.WithContext(contextWithAuth(restoreReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
		restoreRR := httptest.NewRecorder()
		r.ServeHTTP(restoreRR, restoreReq)

		if restoreRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on restore trash item, got %d: %s", restoreRR.Code, restoreRR.Body.String())
		}

		// 6. Verify item is no longer in Trash
		trashRR2 := httptest.NewRecorder()
		trashReq2 := httptest.NewRequest("GET", "/trash", nil)
		trashReq2 = trashReq2.WithContext(contextWithAuth(trashReq2.Context(), adminUser, comp.ID, authz.RoleAdmin))
		r.ServeHTTP(trashRR2, trashReq2)
		_ = json.Unmarshal(trashRR2.Body.Bytes(), &trashResp)
		itemsList2 := trashResp["items"].([]interface{})
		for _, item := range itemsList2 {
			m := item.(map[string]interface{})
			if m["id"] == sheetIDStr {
				t.Fatalf("spreadsheet %s should no longer be in trash after restore", sheetIDStr)
			}
		}
	})
}
