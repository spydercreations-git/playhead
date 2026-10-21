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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

func setupAdminPhase1TestRouter(queries *db.Queries) (*chi.Mux, *AdminHandler, *ProjectHandler, *AuthHandler) {
	mailClient := mailer.New(mailer.Config{})
	adminH := NewAdminHandler(queries, mailClient)
	projH := NewProjectHandler(queries)
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()

	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/auth/login", authH.Login)
		api.Post("/auth/dev-login", authH.DevLogin)
		api.Get("/auth/me", authH.Me)

		api.Group(func(protected chi.Router) {
			protected.Route("/admin", func(admin chi.Router) {
				admin.Use(middleware.RequirePermission(authz.PermAdmin))

				admin.Get("/members", adminH.ListMembers)
				admin.Post("/members", adminH.AddMember)
				admin.Patch("/members/{id}", adminH.UpdateMember)
				admin.Delete("/members/{id}", adminH.DeactivateMember)
				admin.Post("/members/{id}/resend", adminH.ResendMemberInvite)
				admin.Get("/members/{id}/audit", adminH.GetMemberAuditLogs)

				admin.Get("/clients", adminH.ListClients)
				admin.Post("/clients/{id}/people", adminH.AddClientPerson)
				admin.Delete("/clients/{id}/people/{person_id}", adminH.RemoveClientPerson)
				admin.Post("/clients/{id}/people/{person_id}/resend", adminH.ResendClientPersonInvite)
			})

			protected.Post("/projects", projH.Create)
			protected.Patch("/projects/{id}", projH.Update)
			protected.Delete("/projects/{id}", projH.Delete)
		})
	})

	return r, adminH, projH, authH
}

func TestPhase1AdminSafetyRulesAndPermissions(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	router, _, projH, authH := setupAdminPhase1TestRouter(queries)
	projH.SetPool(pool)

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Phase 1 Productions",
		Slug: fmt.Sprintf("phase1-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	// Create roles in roles table
	_, _ = queries.CreateRole(ctx, db.CreateRoleParams{CompanyID: comp.ID, Name: "Staff", Permissions: []byte("[]")})
	_, _ = queries.CreateRole(ctx, db.CreateRoleParams{CompanyID: comp.ID, Name: "Editor", Permissions: []byte("[]")})
	_, _ = queries.CreateRole(ctx, db.CreateRoleParams{CompanyID: comp.ID, Name: "Client", Permissions: []byte("[]")})

	// 1. Create Admin User (Harsh style, CEO)
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("harsh-%d@idyll.com", time.Now().UnixNano()),
		Name:  "Harsh Admin",
	})
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}
	adminPerms, _ := json.Marshal(map[string]bool{"admin": true, "manage_access": true, "create_project": true, "delete_project": true})
	adminM, err := queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      adminUser.ID,
		Role:        "Staff",
		Title:       pgtype.Text{String: "CEO", Valid: true},
		Permissions: adminPerms,
		Status:      "active",
	})
	if err != nil {
		t.Fatalf("create admin membership: %v", err)
	}

	adminPerson := authz.Person{
		UserID:         uuid.UUID(adminUser.ID.Bytes),
		Email:          adminUser.Email,
		Role:           "Staff",
		Title:          "CEO",
		Status:         "active",
		PermissionsMap: map[string]bool{"admin": true, "manage_access": true, "create_project": true, "delete_project": true},
		CompanyID:      uuid.UUID(comp.ID.Bytes),
	}

	// 2. Create Regular Staff Member (without admin switch)
	staffUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("staff-%d@idyll.com", time.Now().UnixNano()),
		Name:  "Regular Staff",
	})
	if err != nil {
		t.Fatalf("create staff user: %v", err)
	}
	staffPerms, _ := json.Marshal(authz.DefaultPermissions(authz.RoleStaff))
	staffM, err := queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      staffUser.ID,
		Role:        "Staff",
		Title:       pgtype.Text{String: "Project Manager", Valid: true},
		Permissions: staffPerms,
		Status:      "active",
	})
	if err != nil {
		t.Fatalf("create staff membership: %v", err)
	}
	staffPerson := authz.Person{
		UserID:         uuid.UUID(staffUser.ID.Bytes),
		Email:          staffUser.Email,
		Role:           "Staff",
		Title:          "Project Manager",
		Status:         "active",
		PermissionsMap: authz.DefaultPermissions(authz.RoleStaff),
		CompanyID:      uuid.UUID(comp.ID.Bytes),
	}

	// 3. Create Editor Member
	editorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("editor-%d@idyll.com", time.Now().UnixNano()),
		Name:  "Test Editor",
	})
	if err != nil {
		t.Fatalf("create editor user: %v", err)
	}
	editorPerms, _ := json.Marshal(authz.DefaultPermissions(authz.RoleEditor))
	_, err = queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      editorUser.ID,
		Role:        "Editor",
		Permissions: editorPerms,
		Status:      "active",
	})
	if err != nil {
		t.Fatalf("create editor membership: %v", err)
	}
	editorPerson := authz.Person{
		UserID:         uuid.UUID(editorUser.ID.Bytes),
		Email:          editorUser.Email,
		Role:           "Editor",
		Status:         "active",
		PermissionsMap: authz.DefaultPermissions(authz.RoleEditor),
		CompanyID:      uuid.UUID(comp.ID.Bytes),
	}

	// Test A: Non-admin gets 403 on Admin APIs
	t.Run("Non-admin gets 403 on Admin APIs", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/admin/members", nil)
		req = req.WithContext(contextWithPerson(req.Context(), staffUser, comp.ID, staffPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected 403 for non-admin on /admin/members, got %d", rec.Code)
		}

		reqEd := httptest.NewRequest("GET", "/api/v1/admin/members", nil)
		reqEd = reqEd.WithContext(contextWithPerson(reqEd.Context(), editorUser, comp.ID, editorPerson))
		recEd := httptest.NewRecorder()
		router.ServeHTTP(recEd, reqEd)

		if recEd.Code != http.StatusForbidden {
			t.Errorf("expected 403 for editor on /admin/members, got %d", recEd.Code)
		}
	})

	// Test B: Admin can list members
	t.Run("Admin can list members", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/admin/members", nil)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for admin on /admin/members, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string][]MemberResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}
		if len(res["members"]) < 3 {
			t.Errorf("expected at least 3 members, got %d", len(res["members"]))
		}
	})

	// Test C: Admin Safety Rule: Nobody can remove their own admin switch
	t.Run("Admin Safety Rule: Nobody can remove their own admin switch", func(t *testing.T) {
		body := bytes.NewReader([]byte(`{"permissions": {"admin": false}}`))
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(adminM.ID)), body)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when admin removes own admin switch, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Test D: Admin Safety Rule: Nobody can deactivate themselves
	t.Run("Admin Safety Rule: Nobody can deactivate themselves", func(t *testing.T) {
		body := bytes.NewReader([]byte(`{"status": "deactivated"}`))
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(adminM.ID)), body)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when admin deactivates self via PATCH, got %d: %s", rec.Code, rec.Body.String())
		}

		reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(adminM.ID)), nil)
		reqDel = reqDel.WithContext(contextWithPerson(reqDel.Context(), adminUser, comp.ID, adminPerson))
		recDel := httptest.NewRecorder()
		router.ServeHTTP(recDel, reqDel)

		if recDel.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when admin deactivates self via DELETE, got %d: %s", recDel.Code, recDel.Body.String())
		}
	})

	// Test E: Admin Safety Rule: The last active admin can never lose admin or be deactivated
	t.Run("Admin Safety Rule: Last active admin protection", func(t *testing.T) {
		// Even if another admin attempts to remove admin from the only admin:
		// adminUser is the only active admin with permissions["admin"] = true
		body := bytes.NewReader([]byte(`{"permissions": {"admin": false}}`))
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(adminM.ID)), body)
		// Use a mock super-admin context to test the last admin logic
		otherAdminPerson := authz.Person{
			UserID:         uuid.New(),
			Email:          "super@idyll.com",
			Role:           "Staff",
			Status:         "active",
			PermissionsMap: map[string]bool{"admin": true},
			CompanyID:      uuid.UUID(comp.ID.Bytes),
		}
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, otherAdminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when attempting to remove admin from the last admin, got %d", rec.Code)
		}
	})

	// Test F: Admin Safety Rule: Unknown permission names are rejected with 400
	t.Run("Admin Safety Rule: Unknown permission names rejected with 400", func(t *testing.T) {
		body := bytes.NewReader([]byte(`{"permissions": {"fly_to_moon": true}}`))
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(staffM.ID)), body)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for unknown permission name, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Test G: Admin Safety Rule: Clients can never be given admin, manage_access or invite_people
	t.Run("Admin Safety Rule: Clients cannot receive administrative permissions", func(t *testing.T) {
		body := bytes.NewReader([]byte(`{"role": "Client", "permissions": {"admin": true}}`))
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(staffM.ID)), body)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when attempting to grant admin to a client, got %d: %s", rec.Code, rec.Body.String())
		}

		body2 := bytes.NewReader([]byte(`{"role": "Client", "permissions": {"manage_access": true}}`))
		req2 := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(staffM.ID)), body2)
		req2 = req2.WithContext(contextWithPerson(req2.Context(), adminUser, comp.ID, adminPerson))
		rec2 := httptest.NewRecorder()
		router.ServeHTTP(rec2, req2)

		if rec2.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when attempting to grant manage_access to a client, got %d", rec2.Code)
		}
	})

	// Test H: Changing someone's role (Staff <-> Editor) resets their switches to role defaults
	t.Run("Changing role resets switches to role defaults", func(t *testing.T) {
		body := bytes.NewReader([]byte(`{"role": "Editor"}`))
		req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(staffM.ID)), body)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 on role change, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		perms, _ := resp["permissions"].(map[string]interface{})
		if perms["create_project"] != false || perms["move_items"] != true {
			t.Errorf("expected Editor defaults (create_project=false, move_items=true), got: %v", perms)
		}
	})

	// Test I: Deactivate member revokes session and blocks API calls and login
	t.Run("Deactivated user cannot sign in or call APIs", func(t *testing.T) {
		// Create session for staffUser
		rawSessionToken, _ := authz.GenerateSecureToken(32)
		sessionHash := authz.HashToken(rawSessionToken)
		_, err := queries.CreateSession(ctx, db.CreateSessionParams{
			UserID:    staffUser.ID,
			TokenHash: sessionHash,
			ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})
		if err != nil {
			t.Fatalf("create session: %v", err)
		}

		// Admin deactivates staffUser
		delReq := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/admin/members/%s", pgUUIDToString(staffM.ID)), nil)
		delReq = delReq.WithContext(contextWithPerson(delReq.Context(), adminUser, comp.ID, adminPerson))
		delRec := httptest.NewRecorder()
		router.ServeHTTP(delRec, delReq)

		if delRec.Code != http.StatusOK {
			t.Fatalf("expected 200 on deactivate member, got %d: %s", delRec.Code, delRec.Body.String())
		}

		// Verify session was revoked in database
		_, err = queries.GetSessionByTokenHash(ctx, sessionHash)
		if err == nil {
			t.Errorf("expected session to be deleted upon deactivation, but session still exists")
		}

		// Verify user cannot log in via dev-login or login
		devReq := httptest.NewRequest("POST", "/api/v1/auth/dev-login", bytes.NewReader([]byte(fmt.Sprintf(`{"email": "%s"}`, staffUser.Email))))
		devReq.Header.Set("Content-Type", "application/json")
		devRec := httptest.NewRecorder()
		authH.DevLogin(devRec, devReq)

		if devRec.Code != http.StatusForbidden {
			t.Errorf("expected 403 for deactivated user dev-login, got %d: %s", devRec.Code, devRec.Body.String())
		}
	})

	// Test J: Client Limits: Client cannot create a project for another client
	t.Run("Client Limits: Client cannot create project for another client", func(t *testing.T) {
		// Create Client A and Client B
		clientA, err := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: comp.ID,
			Name:      "Client Alpha",
		})
		if err != nil {
			t.Fatalf("create clientA: %v", err)
		}
		clientB, err := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: comp.ID,
			Name:      "Client Beta",
		})
		if err != nil {
			t.Fatalf("create clientB: %v", err)
		}

		// Create client user who is contact of Client A ONLY
		clientUser, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("contact-a-%d@alpha.com", time.Now().UnixNano()),
			Name:  "Alpha Contact",
		})
		if err != nil {
			t.Fatalf("create client user: %v", err)
		}
		_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
			CompanyID:    comp.ID,
			ClientID:     clientA.ID,
			Name:         "Alpha Contact",
			Email:        clientUser.Email,
			DefaultLevel: "editor",
			CanDownload:  true,
		})
		if err != nil {
			t.Fatalf("create client contact: %v", err)
		}
		_ = queries.LinkClientContactsToUser(ctx, db.LinkClientContactsToUserParams{
			Email:  clientUser.Email,
			UserID: clientUser.ID,
		})

		clientPerson := authz.Person{
			UserID:         uuid.UUID(clientUser.ID.Bytes),
			Email:          clientUser.Email,
			Role:           "Client",
			Status:         "active",
			PermissionsMap: map[string]bool{"create_project": true, "create_task": true},
			CompanyID:      uuid.UUID(comp.ID.Bytes),
		}

		// Attempt to create project for Client B -> MUST FAIL 403
		bodyB := bytes.NewReader([]byte(fmt.Sprintf(`{"name": "Spy Project", "client_id": "%s"}`, pgUUIDToString(clientB.ID))))
		reqB := httptest.NewRequest("POST", "/api/v1/projects", bodyB)
		reqB = reqB.WithContext(contextWithPerson(reqB.Context(), clientUser, comp.ID, clientPerson))
		recB := httptest.NewRecorder()
		router.ServeHTTP(recB, reqB)

		if recB.Code != http.StatusForbidden {
			t.Errorf("expected 403 when client attempts to create project for another client, got %d: %s", recB.Code, recB.Body.String())
		}

		// Attempt to create project for own Client A -> MUST SUCCEED 201
		bodyA := bytes.NewReader([]byte(fmt.Sprintf(`{"name": "Legit Project", "client_id": "%s"}`, pgUUIDToString(clientA.ID))))
		reqA := httptest.NewRequest("POST", "/api/v1/projects", bodyA)
		reqA = reqA.WithContext(contextWithPerson(reqA.Context(), clientUser, comp.ID, clientPerson))
		recA := httptest.NewRecorder()
		router.ServeHTTP(recA, reqA)

		if recA.Code != http.StatusCreated {
			t.Errorf("expected 201 when client creates project for own client, got %d: %s", recA.Code, recA.Body.String())
		}
	})

	// Test K: History audit logging
	t.Run("History audit logging for admin actions", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/admin/members/%s/audit", pgUUIDToString(staffM.ID)), nil)
		req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 on audit logs, got %d: %s", rec.Code, rec.Body.String())
		}

		var auditResp map[string][]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &auditResp)
		if len(auditResp["history"]) == 0 {
			t.Errorf("expected audit history records for staff user, got 0")
		}
	})
}
