package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

func createTestPNG(t *testing.T, w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode test png: %v", err)
	}
	return buf.Bytes()
}

func TestCheckUsernameEndpoint(t *testing.T) {
	queries, teardown := setupTestDB(t)
	defer teardown()

	handler := NewOnboardingHandler(queries, nil)

	// 1. Invalid usernames (too short, invalid chars)
	req := httptest.NewRequest(http.MethodGet, "/users/check-username?username=ab", nil)
	w := httptest.NewRecorder()
	handler.CheckUsername(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["available"] != false {
		t.Fatalf("expected ab to be not available")
	}

	req = httptest.NewRequest(http.MethodGet, "/users/check-username?username=invalid_space", nil)
	w = httptest.NewRecorder()
	handler.CheckUsername(w, req)
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["available"] != false {
		t.Fatalf("expected invalid_space to be false")
	}

	// 2. Existing username check (case-insensitive)
	req = httptest.NewRequest(http.MethodGet, "/users/check-username?username=HARSH", nil)
	w = httptest.NewRecorder()
	handler.CheckUsername(w, req)
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["available"] != false {
		t.Fatalf("expected HARSH to be taken (harsh exists in seed)")
	}

	// 3. Unique new username
	uniqueUsername := fmt.Sprintf("creative.user.%d", time.Now().UnixNano()%100000)
	req = httptest.NewRequest(http.MethodGet, "/users/check-username?username="+uniqueUsername, nil)
	w = httptest.NewRecorder()
	handler.CheckUsername(w, req)
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["available"] != true {
		t.Fatalf("expected %s to be available", uniqueUsername)
	}
}

func TestTemporaryPasswordSingleUse(t *testing.T) {
	queries, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()
	authHandler := NewAuthHandler(queries, nil, "", "http://localhost:3000", false)

	// Create a test user with a temporary password
	testEmail := fmt.Sprintf("temp-user-%d@playhead.internal", time.Now().UnixNano())
	tempPassword := "SecretTemp123!"
	tempHash, err := authz.HashPassword(tempPassword)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        testEmail,
		Name:         "Temp User",
		PasswordHash: pgtype.Text{Valid: false},
		GoogleID:     pgtype.Text{Valid: false},
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	_ = queries.VerifyUserEmail(ctx, user.ID)
	_ = queries.SetUserTempPassword(ctx, db.SetUserTempPasswordParams{
		ID:                    user.ID,
		TempPasswordHash:      pgtype.Text{String: tempHash, Valid: true},
		TempPasswordExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
	})

	// 1. First login with temporary password should SUCCEED
	body, _ := json.Marshal(map[string]string{
		"email":    testEmail,
		"password": tempPassword,
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	w := httptest.NewRecorder()
	authHandler.Login(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("first temp password login expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var loginResp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &loginResp)
	userMap := loginResp["user"].(map[string]interface{})
	if userMap["has_temp_password"] != true {
		t.Fatalf("expected has_temp_password=true on first temp login")
	}

	// 2. Second login with the same temporary password must SUCCEED (No lockout before onboarding)
	req2 := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	w2 := httptest.NewRecorder()
	authHandler.Login(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("second temp password login expected 200 OK (no lockout), got %d: %s", w2.Code, w2.Body.String())
	}

	// 3. Complete onboarding with new password
	onboardingHandler := NewOnboardingHandler(queries, nil)
	authCtx := context.WithValue(ctx, middleware.UserContextKey, &middleware.AuthenticatedUser{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
	})
	onboardBody, _ := json.Marshal(map[string]string{
		"name":         "New Name",
		"username":     fmt.Sprintf("user.%d", time.Now().UnixNano()%100000000),
		"new_password": "NewPermanentPassword123!",
	})
	onboardReq := httptest.NewRequest(http.MethodPost, "/users/onboarding", bytes.NewReader(onboardBody)).WithContext(authCtx)
	onboardW := httptest.NewRecorder()
	onboardingHandler.CompleteOnboarding(onboardW, onboardReq)
	if onboardW.Code != http.StatusOK {
		t.Fatalf("complete onboarding expected 200, got %d: %s", onboardW.Code, onboardW.Body.String())
	}

	// 4. Third login with old temp password must FAIL (401 Unauthorized)
	req3 := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	w3 := httptest.NewRecorder()
	authHandler.Login(w3, req3)
	if w3.Code != http.StatusUnauthorized {
		t.Fatalf("third temp password login after onboarding expected 401 Unauthorized, got %d", w3.Code)
	}
}

func TestCompleteOnboardingEndpoint(t *testing.T) {
	queries, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()
	handler := NewOnboardingHandler(queries, nil)

	testEmail := fmt.Sprintf("onboard-user-%d@playhead.internal", time.Now().UnixNano())
	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        testEmail,
		Name:         "Initial Name",
		PasswordHash: pgtype.Text{Valid: false},
		GoogleID:     pgtype.Text{Valid: false},
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	uniqueUsername := fmt.Sprintf("dir.%d", time.Now().UnixNano()%1000000000)

	// Auth context setup
	reqCtx := context.WithValue(ctx, middleware.UserContextKey, &middleware.AuthenticatedUser{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
	})

	// Complete onboarding with new name and unique username
	reqBody, _ := json.Marshal(CompleteOnboardingRequest{
		Name:        "Director Sarah",
		Username:    "@" + uniqueUsername,
		AvatarURL:   "/api/v1/users/avatar/default.webp",
		NewPassword: "PermanentPassword123!",
	})
	req := httptest.NewRequest(http.MethodPost, "/users/onboarding/complete", bytes.NewReader(reqBody)).WithContext(reqCtx)
	w := httptest.NewRecorder()
	handler.CompleteOnboarding(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on complete onboarding, got %d: %s", w.Code, w.Body.String())
	}

	// Verify user record in database
	updated, err := queries.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("fetch updated user: %v", err)
	}
	if !updated.IsOnboarded {
		t.Fatalf("expected is_onboarded=true")
	}
	if updated.Username.String != uniqueUsername {
		t.Fatalf("expected username=%s, got %s", uniqueUsername, updated.Username.String)
	}
	if updated.Name != "Director Sarah" {
		t.Fatalf("expected name='Director Sarah', got %s", updated.Name)
	}
	if !updated.PasswordHash.Valid || !authz.VerifyPassword("PermanentPassword123!", updated.PasswordHash.String) {
		t.Fatalf("expected password hash to match permanent password")
	}
}

func TestImageCropValidation(t *testing.T) {
	// 1. Test SVG rejection
	svgData := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>`)
	_, err := DecodeAndValidateImage(bytes.NewReader(svgData))
	if err == nil || err != ErrSVGNotAllowed {
		t.Fatalf("expected ErrSVGNotAllowed for svg, got: %v", err)
	}

	// 2. Test valid PNG decoding and resizing
	pngBytes := createTestPNG(t, 600, 600)
	img, err := DecodeAndValidateImage(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("expected valid png to decode: %v", err)
	}

	// 3. Test square resize
	resized512 := ResizeSquare(img, 512)
	bounds512 := resized512.Bounds()
	if bounds512.Dx() != 512 || bounds512.Dy() != 512 {
		t.Fatalf("expected 512x512, got %dx%d", bounds512.Dx(), bounds512.Dy())
	}

	resized256 := ResizeSquare(img, 256)
	if resized256.Bounds().Dx() != 256 {
		t.Fatalf("expected 256x256")
	}

	resized64 := ResizeSquare(img, 64)
	if resized64.Bounds().Dx() != 64 {
		t.Fatalf("expected 64x64")
	}

	// 4. Test WebP encoding
	webpBytes, err := EncodeWebP(resized512, 85)
	if err != nil {
		t.Fatalf("encode webp failed: %v", err)
	}
	if len(webpBytes) < 12 || string(webpBytes[:4]) != "RIFF" || string(webpBytes[8:12]) != "WEBP" {
		t.Fatalf("invalid webp header in encoded bytes")
	}

	// 5. Test decoding the generated WebP
	decodedWebP, err := DecodeAndValidateImage(bytes.NewReader(webpBytes))
	if err != nil {
		t.Fatalf("failed to decode generated webp: %v", err)
	}
	if decodedWebP.Bounds().Dx() != 512 {
		t.Fatalf("expected decoded webp to be 512x512")
	}
}

func TestUploadAvatarSVGRejectionHTTP(t *testing.T) {
	queries, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()
	handler := NewOnboardingHandler(queries, nil)

	testUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        fmt.Sprintf("svg-test-%d@playhead.internal", time.Now().UnixNano()),
		Name:         "SVG Test",
		PasswordHash: pgtype.Text{Valid: false},
		GoogleID:     pgtype.Text{Valid: false},
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	reqCtx := context.WithValue(ctx, middleware.UserContextKey, &middleware.AuthenticatedUser{
		ID:    testUser.ID,
		Email: testUser.Email,
		Name:  testUser.Name,
	})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", "avatar.svg")
	part.Write([]byte(`<svg width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>`))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/users/avatar", &body).WithContext(reqCtx)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	w := httptest.NewRecorder()
	handler.UploadAvatar(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request on SVG avatar upload, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "SVG files are not supported") {
		t.Fatalf("expected clear message explaining SVG not supported, got: %s", w.Body.String())
	}
}
