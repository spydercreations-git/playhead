package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
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

func TestFix1TeamInviteAndResendTempPassword(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	inviteH := NewInviteHandler(queries, mailClient)
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()
	r.Post("/api/v1/companies/{company_id}/invites", inviteH.Create)
	r.Post("/api/v1/companies/{company_id}/invites/{id}/resend", inviteH.Resend)
	r.Post("/api/v1/auth/login", authH.Login)

	// Setup company and Admin
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Fix1 Agency",
		Slug: fmt.Sprintf("fix1-agency-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}
	_, _ = SeedDefaultCompanyRoles(ctx, queries, comp.ID)

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@fix1.com", time.Now().UnixNano()),
		Name:  "Admin Fix1",
	})
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}

	adminPerson := authz.Person{
		UserID:      uuid.UUID(adminUser.ID.Bytes),
		Email:       adminUser.Email,
		Role:        authz.RoleAdmin,
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{authz.PermTeamInvite},
	}

	// 1. Create team invite
	inviteeEmail := fmt.Sprintf("newbie-%d@fix1.com", time.Now().UnixNano())
	createBody, _ := json.Marshal(map[string]interface{}{
		"email": inviteeEmail,
		"role":  "Editor",
	})
	req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites", uuid.UUID(comp.ID.Bytes).String()), bytes.NewReader(createBody))
	req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var createResp struct {
		Invite struct {
			ID string `json:"id"`
		} `json:"invite"`
		TempPassword string `json:"temp_password"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("unmarshal create invite resp: %v", err)
	}
	if len(createResp.TempPassword) < 12 {
		t.Fatalf("expected temp password >= 12 chars, got %d chars: %s", len(createResp.TempPassword), createResp.TempPassword)
	}

	// 2. Sign in with the temporary password -> SUCCESS
	loginBody, _ := json.Marshal(map[string]string{
		"email":    inviteeEmail,
		"password": createResp.TempPassword,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected login with temp password to succeed (200), got %d: %s", w.Code, w.Body.String())
	}

	// 3. Resend the invitation
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites/%s/resend", uuid.UUID(comp.ID.Bytes).String(), createResp.Invite.ID), nil)
	req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected resend to succeed (200), got %d: %s", w.Code, w.Body.String())
	}

	var resendResp struct {
		TempPassword string `json:"temp_password"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resendResp)
	if resendResp.TempPassword == "" || resendResp.TempPassword == createResp.TempPassword {
		t.Fatalf("expected new different temp password on resend, got: %s", resendResp.TempPassword)
	}

	// 4. OLD temporary password must now FAIL (401 Unauthorized)
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected old temp password to fail with 401 Unauthorized, got %d", w.Code)
	}

	// 5. NEW temporary password must now SUCCEED (200 OK)
	newLoginBody, _ := json.Marshal(map[string]string{
		"email":    inviteeEmail,
		"password": resendResp.TempPassword,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(newLoginBody))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected new temp password to succeed with 200 OK, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFix2NoLockOutAndOnboardingAtomicity(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)
	onboardingH := NewOnboardingHandler(queries, nil)
	onboardingH.SetPool(pool)

	r := chi.NewRouter()
	r.Post("/api/v1/auth/login", authH.Login)
	r.Post("/api/v1/users/onboarding", onboardingH.CompleteOnboarding)

	// Create user with a temporary password
	testEmail := fmt.Sprintf("tempuser-%d@fix2.com", time.Now().UnixNano())
	testUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: testEmail,
		Name:  "Temp User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	tempPass := "TempPassword123!"
	tempHash, _ := authz.HashPassword(tempPass)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	err = queries.SetUserTempPassword(ctx, db.SetUserTempPasswordParams{
		ID:                    testUser.ID,
		TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		t.Fatalf("set temp password: %v", err)
	}

	loginPayload, _ := json.Marshal(map[string]string{
		"email":    testEmail,
		"password": tempPass,
	})

	// 1. Sign in with temp password -> SUCCESS
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginPayload))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected initial login with temp pass to succeed, got %d", w.Code)
	}

	// 2. Sign in AGAIN with the SAME temp password -> MUST STILL SUCCEED (No lock-out!)
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginPayload))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected second login with same temp pass to succeed (no lock-out), got %d: %s", w.Code, w.Body.String())
	}

	// 3. User completes onboarding and sets new permanent password
	authCtx := context.WithValue(ctx, middleware.UserContextKey, &middleware.AuthenticatedUser{
		ID:    testUser.ID,
		Email: testUser.Email,
		Name:  testUser.Name,
	})

	permanentPass := "PermanentPassword987!"
	onboardingBody, _ := json.Marshal(map[string]string{
		"name":         "Updated User Name",
		"username":     fmt.Sprintf("user%d", time.Now().UnixNano()%1000000),
		"new_password": permanentPass,
	})
	req = httptest.NewRequest("POST", "/api/v1/users/onboarding", bytes.NewReader(onboardingBody)).WithContext(authCtx)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected onboarding completion to succeed, got %d: %s", w.Code, w.Body.String())
	}

	// 4. Old temp password must now FAIL (401 Unauthorized)
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginPayload))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected temp password to fail after setting new password, got %d", w.Code)
	}

	// 5. New permanent password must SUCCEED (200 OK)
	permLoginPayload, _ := json.Marshal(map[string]string{
		"email":    testEmail,
		"password": permanentPass,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(permLoginPayload))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected permanent password to succeed with 200 OK, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFix3ClientPictureCompanyCheck(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	onboardingH := NewOnboardingHandler(queries, nil)

	r := chi.NewRouter()
	r.Post("/api/v1/clients/{id}/picture", onboardingH.UploadClientPicture)

	// Company A
	compA, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Company A",
		Slug: fmt.Sprintf("comp-a-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create compA: %v", err)
	}
	userA, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("user-a-%d@test.com", time.Now().UnixNano()),
		Name:  "User A",
	})
	personA := authz.Person{
		UserID:      uuid.UUID(userA.ID.Bytes),
		Email:       userA.Email,
		Role:        authz.RoleAdmin,
		CompanyID:   uuid.UUID(compA.ID.Bytes),
		Permissions: []string{authz.PermClientsEdit},
	}

	// Company B and Client B
	compB, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Company B",
		Slug: fmt.Sprintf("comp-b-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create compB: %v", err)
	}
	userB, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("user-b-%d@test.com", time.Now().UnixNano()),
		Name:  "User B",
	})
	clientB, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: compB.ID,
		Name:      "Client of Company B",
		CreatedBy: userB.ID,
	})
	if err != nil {
		t.Fatalf("create clientB: %v", err)
	}

	// User A attempts to upload picture to Client B (from Company B)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", "test.png")
	part.Write(createTestPNG(t, 200, 200))
	writer.Close()

	req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/clients/%s/picture", uuid.UUID(clientB.ID.Bytes).String()), &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(contextWithPerson(req.Context(), userA, compA.ID, personA))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Must be rejected with 404 Not Found before decoding or saving
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found when uploading to another company's client, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFix1ClientContactResendTempPassword(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	clientH := NewClientHandler(queries, mailClient)
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()
	r.Post("/api/v1/contacts/{id}/resend", clientH.ResendContactInvite)
	r.Post("/api/v1/auth/login", authH.Login)

	comp, _ := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Agency Contacts",
		Slug: fmt.Sprintf("agency-contacts-%d", time.Now().UnixNano()),
	})
	adminUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-contacts-%d@test.com", time.Now().UnixNano()),
		Name:  "Admin Contacts",
	})
	adminPerson := authz.Person{
		UserID:      uuid.UUID(adminUser.ID.Bytes),
		Email:       adminUser.Email,
		Role:        authz.RoleAdmin,
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{authz.PermClientsEdit},
	}

	client, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme Brands",
		CreatedBy: adminUser.ID,
	})

	contactEmail := fmt.Sprintf("clientperson-%d@acme.com", time.Now().UnixNano())
	contact, err := queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     client.ID,
		Name:         "Client Person",
		Email:        contactEmail,
		DefaultLevel: "none",
	})
	if err != nil {
		t.Fatalf("create contact: %v", err)
	}

	// 1. Resend invite to client contact
	req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/contacts/%s/resend", uuid.UUID(contact.ID.Bytes).String()), nil)
	req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected resend contact invite to succeed (200), got %d: %s", w.Code, w.Body.String())
	}

	var resendResp1 struct {
		TempPassword string `json:"temp_password"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resendResp1)
	if len(resendResp1.TempPassword) < 12 {
		t.Fatalf("expected temp password >= 12 chars, got: %s", resendResp1.TempPassword)
	}

	// 2. Login with contact's temp password -> SUCCESS
	loginBody1, _ := json.Marshal(map[string]string{
		"email":    contactEmail,
		"password": resendResp1.TempPassword,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody1))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected contact login to succeed with temp pass, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Resend again
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/contacts/%s/resend", uuid.UUID(contact.ID.Bytes).String()), nil)
	req = req.WithContext(contextWithPerson(req.Context(), adminUser, comp.ID, adminPerson))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected second resend to succeed (200), got %d: %s", w.Code, w.Body.String())
	}

	var resendResp2 struct {
		TempPassword string `json:"temp_password"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resendResp2)

	// 4. Old temp password must FAIL
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody1))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected old temp password to fail with 401, got %d", w.Code)
	}

	// 5. New temp password must SUCCEED
	loginBody2, _ := json.Marshal(map[string]string{
		"email":    contactEmail,
		"password": resendResp2.TempPassword,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody2))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected new temp password to succeed with 200, got %d: %s", w.Code, w.Body.String())
	}
}
