package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
)

func setupTestDB(t *testing.T) (*db.Queries, func()) {
	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Skipf("skipping database test: postgres not reachable: %v", err)
	}

	queries := db.New(pool)
	return queries, func() {
		pool.Close()
	}
}

func TestSignupAndLoginFlow(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	testEmail := "test-" + time.Now().Format("20060102150405.000000") + "@playhead.dev"
	testPassword := "CorrectPassword123!"

	// 1. Signup
	signupBody, _ := json.Marshal(SignupRequest{
		Email:    testEmail,
		Password: testPassword,
		Name:     "Test User",
	})
	req := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody))
	rec := httptest.NewRecorder()
	authH.Signup(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on signup, got %d: %s", rec.Code, rec.Body.String())
	}

	// 2. Duplicate Signup should be rejected with 409 Conflict
	recDup := httptest.NewRecorder()
	reqDup := httptest.NewRequest("POST", "/api/v1/auth/signup", bytes.NewReader(signupBody))
	authH.Signup(recDup, reqDup)
	if recDup.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict on duplicate signup, got %d", recDup.Code)
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
		Role:      authz.RoleMember,
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
