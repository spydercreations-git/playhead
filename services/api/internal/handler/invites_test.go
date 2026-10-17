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
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
)

func TestTrialMaxFiveSeatsEnforcement(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	mailClient := mailer.New(mailer.Config{})
	inviteH := NewInviteHandler(queries, mailClient)

	ctx := context.Background()

	// 1. Create a company on trial
	testCompany, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Five Seat Cap Agency",
		Slug:              "five-seats-" + time.Now().Format("150405000000"),
		Plan:              plans.PlanTrial,
		Status:            "trialing",
		TrialEndsAt:       pgtype.Timestamptz{Time: time.Now().Add(14 * 24 * time.Hour), Valid: true},
		StorageLimitBytes: plans.TrialStorageTotal,
		Seats:             1,
	})
	if err != nil {
		t.Fatalf("failed to create test company: %v", err)
	}
	_, _ = SeedDefaultCompanyRoles(ctx, queries, testCompany.ID)

	// 2. Create owner user
	ownerUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: "owner-inv-" + time.Now().Format("20060102150405.000000000") + "@playhead.dev",
		Name:  "Owner",
	})
	if err != nil {
		t.Fatalf("failed to create owner user: %v", err)
	}

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: testCompany.ID,
		UserID:    ownerUser.ID,
		Role:      authz.RoleCEO,
	})

	authOwner := &middleware.AuthenticatedUser{
		ID:    ownerUser.ID,
		Email: ownerUser.Email,
		Name:  ownerUser.Name,
	}
	ownerPerson := authz.Person{
		UserID:      uuid.UUID(ownerUser.ID.Bytes),
		CompanyID:   uuid.UUID(testCompany.ID.Bytes),
		Email:       ownerUser.Email,
		Role:        "admin",
		Permissions: authz.AllPermissions,
	}
	userCtx := context.WithValue(ctx, middleware.UserContextKey, authOwner)
	userCtx = context.WithValue(userCtx, middleware.CompanyContextKey, testCompany.ID)
	userCtx = context.WithValue(userCtx, middleware.RoleContextKey, authz.RoleCEO)
	userCtx = context.WithValue(userCtx, middleware.PersonContextKey, ownerPerson)

	// Function to send invite
	sendInvite := func(email string) int {
		body, _ := json.Marshal(CreateInviteRequest{
			Email: email,
			Role:  authz.RoleEditor,
		})
		req := httptest.NewRequest("POST", "/api/v1/companies/test/invites", bytes.NewReader(body)).WithContext(userCtx)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("company_id", fmtUUID(testCompany.ID))
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rec := httptest.NewRecorder()
		inviteH.Create(rec, req)
		return rec.Code
	}

	// Owner takes seat 1.
	// Can invite seat 2, 3, 4, 5 (4 invites).
	for i := 2; i <= 5; i++ {
		email := "member" + string(rune('0'+i)) + "@playhead.dev"
		code := sendInvite(email)
		if code != http.StatusCreated {
			t.Fatalf("expected 201 Created for seat %d, got %d", i, code)
		}
	}

	// Attempting 6th seat on trial must be refused with 400 Bad Request
	code6 := sendInvite("member6@playhead.dev")
	if code6 != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when exceeding 5-seat trial cap, got %d", code6)
	}
}

func fmtUUID(u pgtype.UUID) string {
	b := u.Bytes
	return string([]byte{
		hexByte(b[0] >> 4), hexByte(b[0] & 0xf),
		hexByte(b[1] >> 4), hexByte(b[1] & 0xf),
		hexByte(b[2] >> 4), hexByte(b[2] & 0xf),
		hexByte(b[3] >> 4), hexByte(b[3] & 0xf),
		'-',
		hexByte(b[4] >> 4), hexByte(b[4] & 0xf),
		hexByte(b[5] >> 4), hexByte(b[5] & 0xf),
		'-',
		hexByte(b[6] >> 4), hexByte(b[6] & 0xf),
		hexByte(b[7] >> 4), hexByte(b[7] & 0xf),
		'-',
		hexByte(b[8] >> 4), hexByte(b[8] & 0xf),
		hexByte(b[9] >> 4), hexByte(b[9] & 0xf),
		'-',
		hexByte(b[10] >> 4), hexByte(b[10] & 0xf),
		hexByte(b[11] >> 4), hexByte(b[11] & 0xf),
		hexByte(b[12] >> 4), hexByte(b[12] & 0xf),
		hexByte(b[13] >> 4), hexByte(b[13] & 0xf),
		hexByte(b[14] >> 4), hexByte(b[14] & 0xf),
		hexByte(b[15] >> 4), hexByte(b[15] & 0xf),
	})
}

func hexByte(b byte) byte {
	if b < 10 {
		return '0' + b
	}
	return 'a' + b - 10
}
