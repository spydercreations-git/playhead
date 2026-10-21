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
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/shared/plans"
)

func getTestDatabaseURL() string {
	testDBURL := os.Getenv("TEST_DATABASE_URL")
	if testDBURL == "" {
		return "postgres://postgres:postgres@localhost:5432/playhead_test?sslmode=disable"
	}
	return testDBURL
}

func setupTestDB(t *testing.T) (*db.Queries, func()) {
	testDBURL := getTestDatabaseURL()
	ctx := context.Background()
	pool, err := db.Connect(ctx, testDBURL)
	if err != nil {
		t.Skipf("skipping database test: postgres test db not reachable: %v", err)
	}

	queries := db.New(pool)
	_ = EnsureDevAdmins(ctx, pool.Pool, queries, "harsh@idyllproductions.com,dev@playhead.internal")

	return queries, func() {
		pool.Close()
	}
}

func setupTestPool(t *testing.T) (*pgxpool.Pool, *db.Queries, func()) {
	testDBURL := getTestDatabaseURL()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, testDBURL)
	if err != nil {
		t.Skipf("skipping database test: postgres test db not reachable: %v", err)
	}

	queries := db.New(pool)
	_ = EnsureDevAdmins(ctx, pool, queries, "harsh@idyllproductions.com,dev@playhead.internal")

	return pool, queries, func() {
		pool.Close()
	}
}

type testGoogleOAuthClient struct {
	tokenInfo *GoogleTokenInfo
	err       error
}

func (m *testGoogleOAuthClient) ExchangeCode(ctx context.Context, code, clientID, clientSecret, redirectURI string) (*GoogleTokenInfo, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.tokenInfo, nil
}

func TestSignupAndLoginFlow(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	testEmail := "test-" + time.Now().Format("20060102150405.000000") + "@playhead.dev"
	testPassword := "CorrectPassword123!"

	// 1. Unknown email signup must be rejected with 403 Forbidden
	signupBody, _ := json.Marshal(SignupRequest{
		Email:    testEmail,
		Password: testPassword,
		Name:     "Test User",
	})
	req := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody))
	rec := httptest.NewRecorder()
	authH.Signup(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden on unknown signup, got %d: %s", rec.Code, rec.Body.String())
	}

	// 2. Add an invite for testEmail so it becomes a known email
	comp, err := queries.CreateCompany(context.Background(), db.CreateCompanyParams{
		Name: "Test Company",
		Slug: "test-comp-" + time.Now().Format("20060102150405000000"),
	})
	if err != nil {
		t.Fatalf("failed to create test company: %v", err)
	}
	_, err = queries.CreateInvite(context.Background(), db.CreateInviteParams{
		CompanyID: comp.ID,
		Email:     testEmail,
		Role:      "Editor",
		TokenHash: authz.HashToken("test-invite-token-" + testEmail),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create test invite: %v", err)
	}

	// 3. Known email signup should now succeed with 200 OK
	recKnown := httptest.NewRecorder()
	reqKnown := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody))
	authH.Signup(recKnown, reqKnown)

	if recKnown.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on known signup, got %d: %s", recKnown.Code, recKnown.Body.String())
	}

	// Duplicate Signup should return 200 OK with identical neutral message ("Check your email to continue.")
	recDup := httptest.NewRecorder()
	reqDup := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody))
	authH.Signup(recDup, reqDup)
	if recDup.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on duplicate signup, got %d: %s", recDup.Code, recDup.Body.String())
	}

	// 3. Login with incorrect password should be rejected
	badLoginBody, _ := json.Marshal(LoginRequest{
		Email:    testEmail,
		Password: "WrongPassword!",
	})
	reqBadLogin := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(badLoginBody))
	recBadLogin := httptest.NewRecorder()
	authH.Login(recBadLogin, reqBadLogin)
	if recBadLogin.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized on bad password, got %d", recBadLogin.Code)
	}

	// 4. Login with correct password
	loginBody, _ := json.Marshal(LoginRequest{
		Email:    testEmail,
		Password: testPassword,
	})
	reqLogin := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	recLogin := httptest.NewRecorder()
	authH.Login(recLogin, reqLogin)
	if recLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on successful login, got %d: %s", recLogin.Code, recLogin.Body.String())
	}

	// Verify session cookie was set
	cookies := recLogin.Result().Cookies()
	var foundSession, foundCSRF bool
	for _, c := range cookies {
		if c.Name == "playhead_session" && c.Value != "" {
			foundSession = true
		}
		if c.Name == middleware.CSRFCookieName && c.Value != "" {
			foundCSRF = true
		}
	}
	if !foundSession || !foundCSRF {
		t.Errorf("expected session and CSRF cookies to be set on login response")
	}
}

func TestEmailVerificationRequiredForCompany(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	companyH := NewCompanyHandler(queries)

	// User WITHOUT verified email
	unverifiedUser := &middleware.AuthenticatedUser{
		ID:              pgtype.UUID{Bytes: [16]byte{1, 2, 3}, Valid: true},
		Email:           "unverified@playhead.dev",
		Name:            "Unverified",
		EmailVerifiedAt: pgtype.Timestamptz{Valid: false},
	}

	ctx := context.WithValue(context.Background(), middleware.UserContextKey, unverifiedUser)

	body, _ := json.Marshal(CreateCompanyRequest{Name: "Unverified Agency"})
	req := httptest.NewRequest("POST", "/api/v1/companies", bytes.NewReader(body)).WithContext(ctx)
	rec := httptest.NewRecorder()

	companyH.Create(rec, req)

	// Must be rejected with 403 Forbidden
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for unverified email on company create, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestInviteEmailMatchingRule(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	mailClient := mailer.New(mailer.Config{})
	inviteH := NewInviteHandler(queries, mailClient)

	// Create a real company and invite
	ctx := context.Background()
	testCompany, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Test Invite Studio",
		Slug:              "invite-studio-" + time.Now().Format("150405000"),
		Plan:              plans.PlanTrial,
		Status:            "trialing",
		TrialEndsAt:       pgtype.Timestamptz{Time: time.Now().Add(14 * 24 * time.Hour), Valid: true},
		StorageLimitBytes: plans.TrialStorageTotal,
		Seats:             1,
	})
	if err != nil {
		t.Fatalf("failed to create test company: %v", err)
	}

	rawToken, _ := authz.GenerateSecureToken(32)
	tokenHash := authz.HashToken(rawToken)
	targetEmail := "intended-recipient@playhead.dev"

	_, err = queries.CreateInvite(ctx, db.CreateInviteParams{
		CompanyID: testCompany.ID,
		Email:     targetEmail,
		Role:      authz.RoleEditor,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create test invite: %v", err)
	}

	// User B (different email) attempts to accept User A's invite
	wrongUser := &middleware.AuthenticatedUser{
		ID:              pgtype.UUID{Bytes: [16]byte{9, 9, 9}, Valid: true},
		Email:           "attacker@playhead.dev",
		Name:            "Attacker",
		EmailVerifiedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}

	userCtx := context.WithValue(ctx, middleware.UserContextKey, wrongUser)
	req := httptest.NewRequest("POST", "/api/v1/invites/"+rawToken+"/accept", nil).WithContext(userCtx)

	// Set URLParam for Chi router context
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("token", rawToken)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	inviteH.Accept(rec, req)

	// Must be rejected with 403 Forbidden due to email mismatch
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for email mismatch on invite accept, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRequireVerifiedEmailAndNeutralSignup(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "mock-client-id", "http://localhost:3000", false)
	authMw := middleware.NewAuthMiddleware(queries)

	// 1. Create a company, project, and client contact
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Security Test Studio",
		Slug: "sec-studio-" + time.Now().Format("150405000000"),
	})
	if err != nil {
		t.Fatalf("failed to create test company: %v", err)
	}

	clientUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: "owner-sec-" + time.Now().Format("20060102150405.000000000") + "@playhead.dev",
		Name:  "Owner",
	})
	if err != nil {
		t.Fatalf("failed to create owner: %v", err)
	}

	testClient, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme Corp",
		CreatedBy: clientUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	clientEmail := "client-" + time.Now().Format("150405000000") + "@acme.corp"
	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     testClient.ID,
		Email:        clientEmail,
		Name:         "Acme Contact",
		DefaultLevel: "full",
		CanDownload:  true,
	})
	if err != nil {
		t.Fatalf("failed to add client contact: %v", err)
	}

	// 2. Someone who knows the client email attempts password signup
	origPassword := "InitialPass123!"
	signupBody, _ := json.Marshal(SignupRequest{
		Email:    clientEmail,
		Password: origPassword,
		Name:     "Imposter",
	})
	recSignup := httptest.NewRecorder()
	reqSignup := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody))
	authH.Signup(recSignup, reqSignup)

	if recSignup.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on signup, got %d: %s", recSignup.Code, recSignup.Body.String())
	}

	var signupResp map[string]interface{}
	json.NewDecoder(recSignup.Body).Decode(&signupResp)
	if signupResp["message"] != "Check your email to continue." {
		t.Fatalf("expected neutral message 'Check your email to continue.', got: %v", signupResp["message"])
	}

	// 3. User logs in with password before verifying email
	loginBody, _ := json.Marshal(LoginRequest{
		Email:    clientEmail,
		Password: origPassword,
	})
	recLogin := httptest.NewRecorder()
	reqLogin := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	authH.Login(recLogin, reqLogin)

	if recLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on login, got %d: %s", recLogin.Code, recLogin.Body.String())
	}

	// Extract session cookie
	var sessionCookie *http.Cookie
	for _, c := range recLogin.Result().Cookies() {
		if c.Name == "playhead_session" {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatalf("expected playhead_session cookie")
	}

	// 4. Construct protected router with Authenticate and RequireVerifiedEmail
	r := chi.NewRouter()
	r.Group(func(protected chi.Router) {
		protected.Use(authMw.Authenticate)
		protected.Use(middleware.RequireVerifiedEmail)

		protected.Get("/api/v1/me", authH.Me)
		protected.Get("/api/v1/projects", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"projects":[]}`))
		})
	})

	// 4a. Attempt to access /api/v1/me while email is unverified -> 403 email_unverified
	reqMe := httptest.NewRequest("GET", "/api/v1/me", nil)
	reqMe.AddCookie(sessionCookie)
	recMe := httptest.NewRecorder()
	r.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for unverified email on /me, got %d: %s", recMe.Code, recMe.Body.String())
	}
	var errResp map[string]string
	json.NewDecoder(recMe.Body).Decode(&errResp)
	if errResp["error"] != "email_unverified" {
		t.Fatalf("expected error 'email_unverified', got '%s'", errResp["error"])
	}

	// 4b. Attempt to access /api/v1/projects while email is unverified -> 403 email_unverified
	reqProjects := httptest.NewRequest("GET", "/api/v1/projects", nil)
	reqProjects.AddCookie(sessionCookie)
	recProjects := httptest.NewRecorder()
	r.ServeHTTP(recProjects, reqProjects)

	if recProjects.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for unverified email on /projects, got %d: %s", recProjects.Code, recProjects.Body.String())
	}

	// 5. Test: Signup for existing email does NOT change password or log in
	hackedPassword := "HackedNewPassword999!"
	signupBody2, _ := json.Marshal(SignupRequest{
		Email:    clientEmail,
		Password: hackedPassword,
		Name:     "Hacker",
	})
	recSignup2 := httptest.NewRecorder()
	reqSignup2 := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody2))
	authH.Signup(recSignup2, reqSignup2)

	if recSignup2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on existing user signup, got %d", recSignup2.Code)
	}

	// Attempt login with hacked password -> must fail with 401 Unauthorized
	loginHackedBody, _ := json.Marshal(LoginRequest{
		Email:    clientEmail,
		Password: hackedPassword,
	})
	recLoginHacked := httptest.NewRecorder()
	reqLoginHacked := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginHackedBody))
	authH.Login(recLoginHacked, reqLoginHacked)

	if recLoginHacked.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized with hacked password, got %d", recLoginHacked.Code)
	}

	// Attempt login with original password -> must succeed
	recLoginOrig := httptest.NewRecorder()
	reqLoginOrig := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	authH.Login(recLoginOrig, reqLoginOrig)

	if recLoginOrig.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with original password, got %d", recLoginOrig.Code)
	}

	// 6. Verify email unlocks access
	dbUser, err := queries.GetUserByEmail(ctx, clientEmail)
	if err != nil {
		t.Fatalf("failed to fetch user from db: %v", err)
	}
	_ = queries.VerifyUserEmail(ctx, dbUser.ID)

	recMeVerified := httptest.NewRecorder()
	reqMeVerified := httptest.NewRequest("GET", "/api/v1/me", nil)
	reqMeVerified.AddCookie(sessionCookie)
	r.ServeHTTP(recMeVerified, reqMeVerified)

	if recMeVerified.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on /me after email verified, got %d: %s", recMeVerified.Code, recMeVerified.Body.String())
	}

	var meResp map[string]interface{}
	if err := json.NewDecoder(recMeVerified.Body).Decode(&meResp); err != nil {
		t.Fatalf("failed to decode /me response: %v", err)
	}
	if meResp["user"] == nil {
		t.Fatalf("expected user in /me response")
	}
	uMap := meResp["user"].(map[string]interface{})
	if uMap["email"] != clientEmail {
		t.Fatalf("expected user email %s, got %v", clientEmail, uMap["email"])
	}
	if _, ok := meResp["permissions"]; !ok {
		t.Fatalf("expected permissions array in /me response")
	}
	if _, ok := meResp["is_client"]; !ok {
		t.Fatalf("expected is_client in /me response")
	}

	// 7. Hardened Google OAuth code flow tests
	// 7a. Forged login attempt: ?email=...&email_verified=true with no valid code or state MUST FAIL
	recSpoof := httptest.NewRecorder()
	reqSpoof := httptest.NewRequest("GET", "/api/v1/auth/google/callback?email="+clientEmail+"&email_verified=true", nil)
	authH.GoogleOAuthCallback(recSpoof, reqSpoof)
	if recSpoof.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for spoofed Google callback with no code/state, got %d: %s", recSpoof.Code, recSpoof.Body.String())
	}

	// 7b. Bad state: invalid or mismatched state parameter MUST FAIL
	recBadState := httptest.NewRecorder()
	reqBadState := httptest.NewRequest("GET", "/api/v1/auth/google/callback?code=mock-code&state=fake-state", nil)
	reqBadState.AddCookie(&http.Cookie{Name: "google_oauth_state", Value: "different-state"})
	authH.GoogleOAuthCallback(recBadState, reqBadState)
	if recBadState.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for mismatched OAuth state, got %d", recBadState.Code)
	}

	// 7c. Missing GOOGLE_CLIENT_ID returns 404
	noClientAuthH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)
	rec404 := httptest.NewRecorder()
	req404 := httptest.NewRequest("GET", "/api/v1/auth/google/callback?code=mock-code&state=mock-state", nil)
	noClientAuthH.GoogleOAuthCallback(rec404, req404)
	if rec404.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found when GOOGLE_CLIENT_ID is empty, got %d", rec404.Code)
	}

	// 7d. Valid OAuth code flow with verified Google ID token succeeds
	mockClient := &testGoogleOAuthClient{
		tokenInfo: &GoogleTokenInfo{
			Iss:           "https://accounts.google.com",
			Aud:           "test-google-client-id",
			Sub:           "google-sub-12345",
			Email:         clientEmail,
			EmailVerified: "true",
			Name:          "Verified Google User",
			Exp:           fmt.Sprintf("%d", time.Now().Add(1*time.Hour).Unix()),
		},
	}
	authHWithClient := NewAuthHandler(queries, mailClient, "test-google-client-id", "http://localhost:3000", false)
	authHWithClient.SetGoogleClientSecret("test-secret")
	authHWithClient.SetGoogleOAuthClient(mockClient)

	recValid := httptest.NewRecorder()
	reqValid := httptest.NewRequest("GET", "/api/v1/auth/google/callback?code=valid-code&state=valid-state-123", nil)
	reqValid.AddCookie(&http.Cookie{Name: "google_oauth_state", Value: "valid-state-123"})
	authHWithClient.GoogleOAuthCallback(recValid, reqValid)

	if recValid.Code != http.StatusFound {
		t.Fatalf("expected 302 Redirect (StatusFound) for valid Google OAuth flow, got %d: %s", recValid.Code, recValid.Body.String())
	}
	// Verify session cookie was set
	hasSessionCookie := false
	for _, c := range recValid.Result().Cookies() {
		if c.Name == "playhead_session" && c.Value != "" {
			hasSessionCookie = true
			break
		}
	}
	if !hasSessionCookie {
		t.Fatalf("expected playhead_session cookie to be set on successful Google login")
	}
}

func TestMe_PermissionsAndRoleGranularity(t *testing.T) {
	ctx := context.Background()
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	mailerInst := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailerInst, "client-id", "http://localhost:3000", false)
	authMiddleware := middleware.NewAuthMiddleware(queries)

	ts := time.Now().UnixNano()
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Role Test Co",
		Slug:              fmt.Sprintf("role-test-%d", ts),
		Plan:              "pro",
		Status:            "active",
		StorageLimitBytes: 100 * 1024 * 1024 * 1024,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	_, _ = SeedDefaultCompanyRoles(ctx, queries, comp.ID)

	// 1. Admin user
	adminEmail := fmt.Sprintf("admin-%d@roletest.com", ts)
	pHash, _ := authz.HashPassword("password123")
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        adminEmail,
		Name:         "Admin User",
		PasswordHash: pgtype.Text{String: pHash, Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	_ = queries.VerifyUserEmail(ctx, adminUser.ID)
	_, _ = queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      adminUser.ID,
		Role:        "Staff",
		Title:       pgtype.Text{String: "CEO", Valid: true},
		Permissions: []byte(`{"admin": true, "create_project": true}`),
		Status:      "active",
	})

	// 2. Editor user
	editorEmail := fmt.Sprintf("editor-%d@roletest.com", ts)
	editorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        editorEmail,
		Name:         "Editor User",
		PasswordHash: pgtype.Text{String: pHash, Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create editor: %v", err)
	}
	_ = queries.VerifyUserEmail(ctx, editorUser.ID)
	_, _ = queries.CreateMembershipWithDetails(ctx, db.CreateMembershipWithDetailsParams{
		CompanyID:   comp.ID,
		UserID:      editorUser.ID,
		Role:        "Editor",
		Permissions: []byte(`{"admin": false}`),
		Status:      "active",
	})

	// 3. Client user (registered client contact)
	clientEmail := fmt.Sprintf("client-%d@clientcorp.com", ts)
	clientUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        clientEmail,
		Name:         "Client Contact",
		PasswordHash: pgtype.Text{String: pHash, Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}
	_ = queries.VerifyUserEmail(ctx, clientUser.ID)
	clientCorp, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      fmt.Sprintf("Client Corp %d", ts),
	})
	_, _ = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     clientCorp.ID,
		Name:         "Client Contact",
		Email:        clientEmail,
		DefaultLevel: "viewer",
		CanDownload:  true,
	})
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "company",
		TargetID:    comp.ID,
		Email:       clientEmail,
		UserID:      clientUser.ID,
		Level:       "viewer",
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})

	// Helper to login and get /me
	callMe := func(email, password string) map[string]interface{} {
		loginBody, _ := json.Marshal(LoginRequest{Email: email, Password: password})
		recLogin := httptest.NewRecorder()
		reqLogin := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
		authH.Login(recLogin, reqLogin)
		if recLogin.Code != http.StatusOK {
			t.Fatalf("login failed for %s: %s", email, recLogin.Body.String())
		}
		cookie := recLogin.Result().Cookies()[0]

		r := chi.NewRouter()
		r.Use(authMiddleware.Authenticate)
		r.Get("/api/v1/me", authH.Me)

		recMe := httptest.NewRecorder()
		reqMe := httptest.NewRequest("GET", "/api/v1/me", nil)
		reqMe.AddCookie(cookie)
		r.ServeHTTP(recMe, reqMe)

		if recMe.Code != http.StatusOK {
			t.Fatalf("failed /me for %s: %s", email, recMe.Body.String())
		}

		var res map[string]interface{}
		_ = json.NewDecoder(recMe.Body).Decode(&res)
		return res
	}

	// Verify Admin
	adminMe := callMe(adminEmail, "password123")
	if adminMe["is_client"] != false {
		t.Fatalf("expected admin is_client == false")
	}
	if adminMe["role_name"] != "Staff" {
		t.Fatalf("expected admin role_name == Staff, got %v", adminMe["role_name"])
	}
	adminPerms := adminMe["permissions"].([]interface{})
	hasProjectsCreate := false
	for _, p := range adminPerms {
		if p.(string) == "projects.create" || p.(string) == "create_project" {
			hasProjectsCreate = true
			break
		}
	}
	if !hasProjectsCreate {
		t.Fatalf("expected Admin to possess create_project permission")
	}

	// Verify Editor
	editorMe := callMe(editorEmail, "password123")
	if editorMe["is_client"] != false {
		t.Fatalf("expected editor is_client == false")
	}
	if editorMe["role_name"] != "Editor" {
		t.Fatalf("expected editor role_name == Editor, got %v", editorMe["role_name"])
	}
	editorPerms := editorMe["permissions"].([]interface{})
	editorHasProjectsCreate := false
	for _, p := range editorPerms {
		if p.(string) == "projects.create" {
			editorHasProjectsCreate = true
			break
		}
	}
	if editorHasProjectsCreate {
		t.Fatalf("expected Editor to NOT possess projects.create permission")
	}

	// Verify Client Contact
	clientMe := callMe(clientEmail, "password123")
	if clientMe["is_client"] != true {
		t.Fatalf("expected client is_client == true, got %v", clientMe["is_client"])
	}
	if clientMe["role_name"] != "" {
		t.Fatalf("expected client role_name to be empty, got %v", clientMe["role_name"])
	}
}

