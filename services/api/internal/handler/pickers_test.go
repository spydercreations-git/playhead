package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

func TestPickerEndpoint(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	// 1. Setup Company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: fmt.Sprintf("Picker Test Co %d", time.Now().UnixNano()),
		Slug: fmt.Sprintf("picker-co-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company error: %v", err)
	}

	// 2. Setup Clients
	cl1, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Everygen Client",
	})
	if err != nil {
		t.Fatalf("create client 1 error: %v", err)
	}

	cl2, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Pizza Hut Client",
	})
	if err != nil {
		t.Fatalf("create client 2 error: %v", err)
	}

	// 3. Setup Users & Roles
	staffUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("staff-%d@test.com", time.Now().UnixNano()),
		Name:  "Sarah Staff",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    staffUser.ID,
		Role:      authz.RoleStaff,
	})

	editorUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("editor-%d@test.com", time.Now().UnixNano()),
		Name:  "Eddie Editor",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    editorUser.ID,
		Role:      authz.RoleEditor,
	})

	clientContactUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("client-%d@everygen.com", time.Now().UnixNano()),
		Name:  "Claire Client",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    clientContactUser.ID,
		Role:      authz.RoleClient,
	})
	_, _ = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     cl1.ID,
		Name:         clientContactUser.Name,
		Email:        clientContactUser.Email,
		DefaultLevel: authz.LevelCommenter,
		CanDownload:  true,
	})

	pickerH := NewPickerHandler(pool, queries)

	t.Run("Staff views clients tab", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/pickers?tab=clients", nil)
		req = req.WithContext(contextWithAuth(req.Context(), staffUser, comp.ID, authz.RoleStaff))
		w := httptest.NewRecorder()
		pickerH.GetPickerData(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp PickerResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}
		if len(resp.Items) < 2 {
			t.Errorf("expected at least 2 clients for staff, got %d", len(resp.Items))
		}
	})

	t.Run("Staff views staff tab", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/pickers?tab=staff", nil)
		req = req.WithContext(contextWithAuth(req.Context(), staffUser, comp.ID, authz.RoleStaff))
		w := httptest.NewRecorder()
		pickerH.GetPickerData(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var resp PickerResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		found := false
		for _, item := range resp.Items {
			if item.ID == uuid.UUID(staffUser.ID.Bytes).String() {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find staff user in staff tab")
		}
	})

	t.Run("Staff views editors tab", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/pickers?tab=editors", nil)
		req = req.WithContext(contextWithAuth(req.Context(), staffUser, comp.ID, authz.RoleStaff))
		w := httptest.NewRecorder()
		pickerH.GetPickerData(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var resp PickerResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		found := false
		for _, item := range resp.Items {
			if item.ID == uuid.UUID(editorUser.ID.Bytes).String() {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find editor user in editors tab")
		}
	})

	t.Run("Client views clients tab sees only own client", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/pickers?tab=clients", nil)
		req = req.WithContext(contextWithAuth(req.Context(), clientContactUser, comp.ID, authz.RoleClient))
		w := httptest.NewRecorder()
		pickerH.GetPickerData(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var resp PickerResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Items) != 1 {
			t.Fatalf("client should see exactly 1 client, got %d", len(resp.Items))
		}
		if resp.Items[0].ID != uuid.UUID(cl1.ID.Bytes).String() {
			t.Errorf("client saw unauthorized client %s instead of %s", resp.Items[0].Name, cl1.Name)
		}
	})

	t.Run("Client views staff tab gets empty list", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/pickers?tab=staff", nil)
		req = req.WithContext(contextWithAuth(req.Context(), clientContactUser, comp.ID, authz.RoleClient))
		w := httptest.NewRecorder()
		pickerH.GetPickerData(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var resp PickerResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Items) != 0 {
			t.Errorf("security violation: client saw staff items: %v", resp.Items)
		}
	})

	t.Run("Search query filters clients", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/pickers?tab=clients&q=Pizza", nil)
		req = req.WithContext(contextWithAuth(req.Context(), staffUser, comp.ID, authz.RoleStaff))
		w := httptest.NewRecorder()
		pickerH.GetPickerData(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var resp PickerResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Items) != 1 || resp.Items[0].ID != uuid.UUID(cl2.ID.Bytes).String() {
			t.Errorf("search failed: expected Pizza Hut Client, got %v", resp.Items)
		}
	})
}
