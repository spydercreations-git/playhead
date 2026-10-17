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
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

func TestStep5NewClientModalAndPeople(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	clientH := NewClientHandler(queries, mailClient)
	clientH.SetPool(pool)

	r := chi.NewRouter()
	r.Post("/api/v1/clients", clientH.Create)

	// Setup company and Admin user
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Test Agency",
		Slug: "test-agency-" + time.Now().Format("20060102150405000000"),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@testagency.com", time.Now().UnixNano()),
		Name:  "Agency Admin",
	})
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}

	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("create admin membership: %v", err)
	}

	adminPerson := authz.Person{
		UserID:      uuid.UUID(adminUser.ID.Bytes),
		Email:       adminUser.Email,
		Role:        authz.RoleAdmin,
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{authz.PermClientsCreate, authz.PermClientsViewAll},
	}

	// Setup Editor user (no clients.create permission)
	editorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("editor-%d@testagency.com", time.Now().UnixNano()),
		Name:  "Agency Editor",
	})
	if err != nil {
		t.Fatalf("create editor user: %v", err)
	}
	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    editorUser.ID,
		Role:      authz.RoleEditor,
	})
	if err != nil {
		t.Fatalf("create editor membership: %v", err)
	}
	editorPerson := authz.Person{
		UserID:      uuid.UUID(editorUser.ID.Bytes),
		Email:       editorUser.Email,
		Role:        authz.RoleEditor,
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{},
	}

	// 1. Role permission test: forbidden user without clients.create is rejected with 403
	t.Run("Editor cannot create clients (403 Forbidden)", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name": "Forbidden Client",
		})
		req := httptest.NewRequest("POST", "/api/v1/clients", bytes.NewReader(body))
		req = req.WithContext(contextWithPerson(req.Context(), editorUser, comp.ID, editorPerson))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 2. Create client with 0 people (allowed)
	t.Run("Create client with 0 people", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":    "Zero People Client",
			"website": "https://zeropeople.com",
			"people":  []map[string]string{},
		})
		req := httptest.NewRequest("POST", "/api/v1/clients", bytes.NewReader(body))
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var created db.Client
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if created.Name != "Zero People Client" {
			t.Fatalf("expected name 'Zero People Client', got '%s'", created.Name)
		}

		// Verify 0 contacts created
		contacts, err := queries.ListClientContacts(ctx, created.ID)
		if err != nil {
			t.Fatalf("list contacts: %v", err)
		}
		if len(contacts) != 0 {
			t.Fatalf("expected 0 contacts, got %d", len(contacts))
		}
	})

	// 3. Invalid email rejected with 400
	t.Run("Invalid email rejected (400 Bad Request)", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name": "Invalid Email Client",
			"people": []map[string]string{
				{"name": "Valid Person", "email": "valid@company.com"},
				{"name": "Bad Person", "email": "not-an-email"},
			},
		})
		req := httptest.NewRequest("POST", "/api/v1/clients", bytes.NewReader(body))
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "invalid_email" {
			t.Fatalf("expected error='invalid_email', got '%s'", resp["error"])
		}
	})

	// 4. Duplicate email in same client rejected with 400
	t.Run("Duplicate email rejected (400 Bad Request)", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name": "Duplicate Email Client",
			"people": []map[string]string{
				{"name": "First Instance", "email": "duplicate@company.com"},
				{"name": "Second Instance", "email": "DUPLICATE@COMPANY.COM"},
			},
		})
		req := httptest.NewRequest("POST", "/api/v1/clients", bytes.NewReader(body))
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "duplicate_email" {
			t.Fatalf("expected error='duplicate_email', got '%s'", resp["error"])
		}
	})

	// 5. Create client with 2 people and toggle ON (generates temp password and invites)
	t.Run("Create client with 2 people and toggle ON", func(t *testing.T) {
		p1Email := fmt.Sprintf("sarah-%d@everygen.com", time.Now().UnixNano())
		p2Email := fmt.Sprintf("mark-%d@everygen.com", time.Now().UnixNano())
		sendToggle := true

		body, _ := json.Marshal(map[string]interface{}{
			"name":                   "Everygen Studio",
			"website":                "https://everygen.com",
			"send_invite_emails_now": &sendToggle,
			"people": []map[string]string{
				{"name": "Sarah Lee", "email": p1Email},
				{"name": "Mark Diaz", "email": p2Email},
			},
		})
		req := httptest.NewRequest("POST", "/api/v1/clients", bytes.NewReader(body))
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var created db.Client
		_ = json.Unmarshal(w.Body.Bytes(), &created)

		// Verify 2 contacts created with default_level = "none" (no project access)
		contacts, err := queries.ListClientContacts(ctx, created.ID)
		if err != nil {
			t.Fatalf("list contacts: %v", err)
		}
		if len(contacts) != 2 {
			t.Fatalf("expected 2 contacts, got %d", len(contacts))
		}
		for _, c := range contacts {
			if c.DefaultLevel != authz.LevelNone {
				t.Fatalf("expected default_level 'none', got '%s'", c.DefaultLevel)
			}
			if !c.UserID.Valid {
				t.Fatalf("expected valid UserID linked to client contact")
			}

			// Verify user has temporary password assigned
			u, err := queries.GetUserByID(ctx, c.UserID)
			if err != nil {
				t.Fatalf("get user: %v", err)
			}
			if !u.TempPasswordHash.Valid || u.TempPasswordHash.String == "" {
				t.Fatalf("expected TempPasswordHash set for invited client person")
			}
			if !u.TempPasswordExpiresAt.Valid || u.TempPasswordExpiresAt.Time.Before(time.Now()) {
				t.Fatalf("expected future TempPasswordExpiresAt for invited client person")
			}
			if u.TempPasswordUsed {
				t.Fatalf("expected TempPasswordUsed = false initially")
			}
		}
	})

	// 6. Create client with toggle OFF (send_invite_emails_now = false) sends NO emails and sets NO temp password
	t.Run("Create client with toggle OFF (no invites sent)", func(t *testing.T) {
		pEmail := fmt.Sprintf("offline-%d@client.com", time.Now().UnixNano())
		sendToggle := false

		body, _ := json.Marshal(map[string]interface{}{
			"name":                   "Silent Client",
			"send_invite_emails_now": &sendToggle,
			"people": []map[string]string{
				{"name": "Silent Person", "email": pEmail},
			},
		})
		req := httptest.NewRequest("POST", "/api/v1/clients", bytes.NewReader(body))
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var created db.Client
		_ = json.Unmarshal(w.Body.Bytes(), &created)

		contacts, _ := queries.ListClientContacts(ctx, created.ID)
		if len(contacts) != 1 {
			t.Fatalf("expected 1 contact saved, got %d", len(contacts))
		}
		u, _ := queries.GetUserByID(ctx, contacts[0].UserID)
		if u.TempPasswordHash.Valid && u.TempPasswordHash.String != "" {
			t.Fatalf("expected NO TempPasswordHash when send_invite_emails_now is false")
		}
	})
}
