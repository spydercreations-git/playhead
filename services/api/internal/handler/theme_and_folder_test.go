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

func TestSingleThemeNoThemeInMe(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()
	r.Get("/api/v1/auth/me", authH.Me)

	// Create user & company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Single Theme Co",
		Slug: fmt.Sprintf("single-theme-co-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("single-theme-%d@example.com", time.Now().UnixNano()),
		Name:  "Single Theme User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    user.ID,
		Role:      "Editor",
	})
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}

	person := authz.Person{
		UserID:      uuid.UUID(user.ID.Bytes),
		Email:       user.Email,
		Role:        "Editor",
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{},
	}

	// 1. Verify Me returns user profile without any theme field
	reqMe := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	reqMe = reqMe.WithContext(contextWithPerson(reqMe.Context(), user, comp.ID, person))
	recMe := httptest.NewRecorder()
	r.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusOK {
		t.Fatalf("expected 200 from Me, got %d: %s", recMe.Code, recMe.Body.String())
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal(recMe.Body.Bytes(), &rawMap); err != nil {
		t.Fatalf("unmarshal me response: %v", err)
	}
	userMap, ok := rawMap["user"].(map[string]interface{})
	if !ok {
		t.Fatalf("user object not found in Me response")
	}
	if _, hasTheme := userMap["theme"]; hasTheme {
		t.Errorf("expected no 'theme' field in Me response user object, but found: %v", userMap["theme"])
	}

	// 2. Verify /api/v1/users/theme does not exist (returns 404 on router)
	reqBadRoute := httptest.NewRequest("PATCH", "/api/v1/users/theme", bytes.NewReader([]byte(`{"theme":"purple"}`)))
	recBadRoute := httptest.NewRecorder()
	r.ServeHTTP(recBadRoute, reqBadRoute)
	if recBadRoute.Code != http.StatusNotFound {
		t.Errorf("expected 404 for removed theme route, got %d", recBadRoute.Code)
	}
}
