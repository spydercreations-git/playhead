package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
)

type GoogleTokenInfo struct {
	Iss           string `json:"iss"`
	Aud           string `json:"aud"`
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Exp           string `json:"exp"`
}

type GoogleOAuthClient interface {
	ExchangeCode(ctx context.Context, code, clientID, clientSecret, redirectURI string) (*GoogleTokenInfo, error)
}

type RealGoogleOAuthClient struct {
	httpClient *http.Client
}

func NewRealGoogleOAuthClient() *RealGoogleOAuthClient {
	return &RealGoogleOAuthClient{
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *RealGoogleOAuthClient) ExchangeCode(ctx context.Context, code, clientID, clientSecret, redirectURI string) (*GoogleTokenInfo, error) {
	form := url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact Google token endpoint: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google token endpoint returned status %d", resp.StatusCode)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		IdToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse google token response: %w", err)
	}

	if tokenResp.IdToken == "" {
		return nil, errors.New("no id_token in google response")
	}

	// Verify ID token via Google's tokeninfo endpoint (cryptographic signature checked against Google certs)
	verifyReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://oauth2.googleapis.com/tokeninfo?id_token="+url.QueryEscape(tokenResp.IdToken), nil)
	if err != nil {
		return nil, err
	}

	verifyResp, err := c.httpClient.Do(verifyReq)
	if err != nil {
		return nil, fmt.Errorf("failed to verify id_token with google: %w", err)
	}
	defer verifyResp.Body.Close()

	if verifyResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google tokeninfo returned status %d", verifyResp.StatusCode)
	}

	var tokenInfo GoogleTokenInfo
	if err := json.NewDecoder(verifyResp.Body).Decode(&tokenInfo); err != nil {
		return nil, fmt.Errorf("failed to decode google tokeninfo: %w", err)
	}

	return &tokenInfo, nil
}

type AuthHandler struct {
	queries            *db.Queries
	mailer             *mailer.Mailer
	googleClientID     string
	googleClientSecret string
	appURL             string
	isProduction       bool
	environment        string
	googleOAuthClient  GoogleOAuthClient
}

func NewAuthHandler(queries *db.Queries, mailer *mailer.Mailer, googleClientID, appURL string, isProduction bool) *AuthHandler {
	env := "development"
	if isProduction {
		env = "production"
	}
	return &AuthHandler{
		queries:           queries,
		mailer:            mailer,
		googleClientID:    googleClientID,
		appURL:            appURL,
		isProduction:      isProduction,
		environment:       env,
		googleOAuthClient: NewRealGoogleOAuthClient(),
	}
}

func (h *AuthHandler) SetEnvironment(env string) {
	h.environment = env
}

func (h *AuthHandler) SetGoogleClientSecret(secret string) {
	h.googleClientSecret = secret
}

func (h *AuthHandler) SetGoogleOAuthClient(client GoogleOAuthClient) {
	h.googleOAuthClient = client
}

type SignupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload", "message": "Invalid request format"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	name := strings.TrimSpace(req.Name)
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email", "message": "Valid email address is required"})
		return
	}
	if len(req.Password) < 8 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "weak_password", "message": "Password must be at least 8 characters"})
		return
	}
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	// Internal restriction: only known emails (team members, client contacts, grants, invites) can join
	isKnown, _ := h.queries.CheckEmailIsKnown(r.Context(), email)
	if !isKnown {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "access_denied",
			"message": "This email doesn't have access to Playhead yet. Ask the person who invited you.",
		})
		return
	}

	// Check if user already exists: do not change password, do not log in.
	// Return neutral message to prevent account takeover and email enumeration.
	if _, err := h.queries.GetUserByEmail(r.Context(), email); err == nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "ok",
			"message": "Check your email to continue.",
		})
		return
	}

	// Hash password using Argon2id
	passHash, err := authz.HashPassword(req.Password)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to process password"})
		return
	}

	// Create user (email_verified_at remains NULL until email link clicked)
	user, err := h.queries.CreateUser(r.Context(), db.CreateUserParams{
		Email:        email,
		Name:         name,
		PasswordHash: pgtype.Text{String: passHash, Valid: true},
		GoogleID:     pgtype.Text{Valid: false},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create user account"})
		return
	}

	// Link client contacts and grants
	_ = h.queries.LinkClientContactsToUser(r.Context(), db.LinkClientContactsToUserParams{
		Email:  email,
		UserID: user.ID,
	})
	_ = h.queries.LinkGrantsToUser(r.Context(), db.LinkGrantsToUserParams{
		Email:  email,
		UserID: user.ID,
	})

	// Generate verification token (expires in 24 hours)
	rawToken, err := authz.GenerateSecureToken(32)
	if err == nil {
		tokenHash := authz.HashToken(rawToken)
		_, _ = h.queries.CreateVerificationToken(r.Context(), db.CreateVerificationTokenParams{
			UserID:    user.ID,
			TokenHash: tokenHash,
			ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})

		// Send verification email via Mailpit / Resend
		_ = h.mailer.SendEmailVerification(email, name, rawToken)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "Check your email to continue.",
		"user": map[string]interface{}{
			"id":             user.ID,
			"email":          user.Email,
			"name":           user.Name,
			"email_verified": false,
		},
	})
}

type SendLoginCodeRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) SendLoginCode(w http.ResponseWriter, r *http.Request) {
	var req SendLoginCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload", "message": "Invalid request format"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email", "message": "Valid email address is required"})
		return
	}

	isKnown, err := h.queries.CheckEmailIsKnown(r.Context(), email)
	if err != nil || !isKnown {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "access_denied",
			"message": "This email doesn't have access to Playhead yet. Ask the person who invited you.",
		})
		return
	}

	code, err := authz.Generate6DigitCode()
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to generate code"})
		return
	}

	codeHash := authz.HashToken(code)
	expiresAt := time.Now().Add(10 * time.Minute)

	_, err = h.queries.CreateLoginCode(r.Context(), db.CreateLoginCodeParams{
		Email:     email,
		CodeHash:  codeHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to store login code"})
		return
	}

	_ = h.mailer.SendLoginCode(email, code)

	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Verification code sent to your email",
	})
}

type VerifyLoginCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func (h *AuthHandler) VerifyLoginCode(w http.ResponseWriter, r *http.Request) {
	var req VerifyLoginCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload", "message": "Invalid request format"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	code := strings.TrimSpace(req.Code)
	if email == "" || code == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "Email and code are required"})
		return
	}

	codeHash := authz.HashToken(code)
	loginCode, err := h.queries.GetValidLoginCode(r.Context(), db.GetValidLoginCodeParams{
		Email:    email,
		CodeHash: codeHash,
	})
	if err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "invalid_code",
			"message": "Invalid or expired verification code",
		})
		return
	}

	_ = h.queries.IncrementLoginCodeAttempts(r.Context(), loginCode.ID)

	// Check if user exists; if not, auto-create user
	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		name := strings.Split(email, "@")[0]
		user, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email:        email,
			Name:         name,
			PasswordHash: pgtype.Text{Valid: false},
			GoogleID:     pgtype.Text{Valid: false},
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create user account"})
			return
		}
	}

	// Email code proves the email and marks it verified
	_ = h.queries.VerifyUserEmail(r.Context(), user.ID)

	// Link client contacts and grants
	_ = h.queries.LinkClientContactsToUser(r.Context(), db.LinkClientContactsToUserParams{
		Email:  email,
		UserID: user.ID,
	})
	_ = h.queries.LinkGrantsToUser(r.Context(), db.LinkGrantsToUserParams{
		Email:  email,
		UserID: user.ID,
	})

	_ = h.queries.DeleteLoginCodesForEmail(r.Context(), email)

	// Create session (expires in 30 days)
	rawSessionToken, err := authz.GenerateSecureToken(32)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to generate session"})
		return
	}

	sessionHash := authz.HashToken(rawSessionToken)
	expiresAt := time.Now().Add(30 * 24 * time.Hour)

	_, err = h.queries.CreateSession(r.Context(), db.CreateSessionParams{
		UserID:    user.ID,
		TokenHash: sessionHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
		UserAgent: pgtype.Text{String: r.UserAgent(), Valid: true},
		Ip:        pgtype.Text{String: r.RemoteAddr, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create session"})
		return
	}

	rawCSRFToken, _ := authz.GenerateSecureToken(16)

	http.SetCookie(w, &http.Cookie{
		Name:     "playhead_session",
		Value:    rawSessionToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    rawCSRFToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: false,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "ok",
		"csrf_token": rawCSRFToken,
		"user": map[string]interface{}{
			"id":             user.ID,
			"email":          user.Email,
			"name":           user.Name,
			"avatar_url":     user.AvatarUrl.String,
			"email_verified": true,
		},
	})
}

type VerifyEmailRequest struct {
	Token string `json:"token"`
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req VerifyEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_token", "message": "Verification token is required"})
		return
	}

	tokenHash := authz.HashToken(strings.TrimSpace(req.Token))
	vt, err := h.queries.GetVerificationTokenByHash(r.Context(), tokenHash)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_or_expired_token", "message": "This verification link is invalid or has expired"})
		return
	}

	// Mark user verified
	_ = h.queries.VerifyUserEmail(r.Context(), vt.UserID)
	_ = h.queries.DeleteVerificationToken(r.Context(), tokenHash)

	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "verified",
		"message": "Email address verified successfully. You can now create your workspace.",
	})
}

type ResendVerificationRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req ResendVerificationRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	email := authz.NormalizeEmail(req.Email)
	if email == "" {
		if cookie, err := r.Cookie("playhead_session"); err == nil && cookie.Value != "" {
			tokenHash := authz.HashToken(cookie.Value)
			if session, err := h.queries.GetSessionByTokenHash(r.Context(), tokenHash); err == nil {
				if user, err := h.queries.GetUserByID(r.Context(), session.UserID); err == nil {
					email = user.Email
				}
			}
		}
	}

	if email != "" {
		if user, err := h.queries.GetUserByEmail(r.Context(), email); err == nil {
			if !user.EmailVerifiedAt.Valid {
				rawToken, err := authz.GenerateSecureToken(32)
				if err == nil {
					tokenHash := authz.HashToken(rawToken)
					_, _ = h.queries.CreateVerificationToken(r.Context(), db.CreateVerificationTokenParams{
						UserID:    user.ID,
						TokenHash: tokenHash,
						ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
					})
					_ = h.mailer.SendEmailVerification(user.Email, user.Name, rawToken)
				}
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "If an unverified account exists with this email, a verification link has been sent.",
	})
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload", "message": "Invalid request format"})
		return
	}

	email := authz.NormalizeEmail(req.Email)
	isKnown, _ := h.queries.CheckEmailIsKnown(r.Context(), email)
	if !isKnown {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "access_denied",
			"message": "This email doesn't have access to Playhead yet. Ask the person who invited you.",
		})
		return
	}

	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_credentials", "message": "Invalid email or password"})
		return
	}

	authenticated := false
	isTempPassword := false

	// Try regular password first
	if user.PasswordHash.Valid && user.PasswordHash.String != "" {
		if authz.VerifyPassword(req.Password, user.PasswordHash.String) {
			authenticated = true
		}
	}

	// Try temporary password if regular password failed
	if !authenticated && user.TempPasswordHash.Valid && user.TempPasswordHash.String != "" {
		if !user.TempPasswordUsed && user.TempPasswordExpiresAt.Valid && user.TempPasswordExpiresAt.Time.After(time.Now()) {
			if authz.VerifyPassword(req.Password, user.TempPasswordHash.String) {
				authenticated = true
				isTempPassword = true
				// Note: Temporary password remains valid until onboarding completes or expires
			}
		}
	}

	if !authenticated {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_credentials", "message": "Invalid email or password"})
		return
	}

	// Create session (expires in 30 days)
	rawSessionToken, err := authz.GenerateSecureToken(32)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to generate session"})
		return
	}

	sessionHash := authz.HashToken(rawSessionToken)
	expiresAt := time.Now().Add(30 * 24 * time.Hour)

	_, err = h.queries.CreateSession(r.Context(), db.CreateSessionParams{
		UserID:    user.ID,
		TokenHash: sessionHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
		UserAgent: pgtype.Text{String: r.UserAgent(), Valid: true},
		Ip:        pgtype.Text{String: r.RemoteAddr, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to persist session"})
		return
	}

	// Generate CSRF token for double-submit cookie protection
	rawCSRFToken, _ := authz.GenerateSecureToken(16)

	// Set session cookie (HttpOnly)
	http.SetCookie(w, &http.Cookie{
		Name:     "playhead_session",
		Value:    rawSessionToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	// Set readable CSRF cookie
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    rawCSRFToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: false,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "ok",
		"csrf_token": rawCSRFToken,
		"user": map[string]interface{}{
			"id":                user.ID,
			"email":             user.Email,
			"name":              user.Name,
			"avatar_url":        user.AvatarUrl.String,
			"username":          user.Username.String,
			"is_onboarded":      user.IsOnboarded,
			"has_temp_password": isTempPassword,
			"email_verified":    user.EmailVerifiedAt.Valid,
		},
	})
}

type DevLoginRequest struct {
	Email string `json:"email"`
}

// DevLogin logs in a dev user directly without email verification codes.
// STRICT SECURITY REQUIREMENT:
// 1. Only enabled when ENV=development explicitly set.
// 2. Only accepts requests originating from localhost (127.0.0.1, ::1, or localhost).
func (h *AuthHandler) DevLogin(w http.ResponseWriter, r *http.Request) {
	if h.environment != "development" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	host := r.Host
	if hStr, _, err := net.SplitHostPort(host); err == nil {
		host = hStr
	}
	remote := r.RemoteAddr
	if rStr, _, err := net.SplitHostPort(remote); err == nil {
		remote = rStr
	}

	isLocalHost := host == "localhost" || host == "127.0.0.1" || host == "::1"
	isLocalRemote := remote == "localhost" || remote == "127.0.0.1" || remote == "::1" || remote == ""

	if !isLocalHost || !isLocalRemote {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Dev login is restricted to localhost requests only",
		})
		return
	}

	var req DevLoginRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	email := authz.NormalizeEmail(req.Email)
	if email == "" {
		email = "harsh@idyllproductions.com"
	}

	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "user_not_found",
			"message": "User not found in development database",
		})
		return
	}

	// Create session (expires in 30 days)
	rawSessionToken, err := authz.GenerateSecureToken(32)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to generate session"})
		return
	}

	sessionHash := authz.HashToken(rawSessionToken)
	expiresAt := time.Now().Add(30 * 24 * time.Hour)

	_, err = h.queries.CreateSession(r.Context(), db.CreateSessionParams{
		UserID:    user.ID,
		TokenHash: sessionHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
		UserAgent: pgtype.Text{String: r.UserAgent(), Valid: true},
		Ip:        pgtype.Text{String: r.RemoteAddr, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to persist session"})
		return
	}

	rawCSRFToken, _ := authz.GenerateSecureToken(16)

	http.SetCookie(w, &http.Cookie{
		Name:     "playhead_session",
		Value:    rawSessionToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    rawCSRFToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: false,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "ok",
		"csrf_token": rawCSRFToken,
		"user": map[string]interface{}{
			"id":             user.ID,
			"email":          user.Email,
			"name":           user.Name,
			"avatar_url":     user.AvatarUrl.String,
			"email_verified": user.EmailVerifiedAt.Valid,
		},
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("playhead_session"); err == nil && cookie.Value != "" {
		tokenHash := authz.HashToken(cookie.Value)
		_ = h.queries.DeleteSessionByTokenHash(r.Context(), tokenHash)
	}

	// Expire cookies
	http.SetCookie(w, &http.Cookie{
		Name:     "playhead_session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: false,
	})

	respondJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Email != "" {
		email := strings.ToLower(strings.TrimSpace(req.Email))
		if user, err := h.queries.GetUserByEmail(r.Context(), email); err == nil {
			rawToken, err := authz.GenerateSecureToken(32)
			if err == nil {
				tokenHash := authz.HashToken(rawToken)
				h.queries.CreatePasswordResetToken(r.Context(), db.CreatePasswordResetTokenParams{
					UserID:    user.ID,
					TokenHash: tokenHash,
					ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(1 * time.Hour), Valid: true},
				})
				_ = h.mailer.SendPasswordReset(user.Email, user.Name, rawToken)
			}
		}
	}

	// Always return 200 to prevent account enumeration
	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "If an account exists with this email, instructions to reset your password have been sent.",
	})
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || len(req.NewPassword) < 8 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_request",
			"message": "Token and password of at least 8 characters are required",
		})
		return
	}

	tokenHash := authz.HashToken(strings.TrimSpace(req.Token))
	prt, err := h.queries.GetPasswordResetTokenByHash(r.Context(), tokenHash)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_or_expired_token",
			"message": "Password reset link is invalid or has expired",
		})
		return
	}

	passHash, err := authz.HashPassword(req.NewPassword)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to hash password"})
		return
	}

	_ = h.queries.UpdateUserPassword(r.Context(), db.UpdateUserPasswordParams{
		ID:           prt.UserID,
		PasswordHash: pgtype.Text{String: passHash, Valid: true},
	})
	_ = h.queries.MarkPasswordResetTokenUsed(r.Context(), tokenHash)
	_ = h.queries.DeleteAllSessionsForUser(r.Context(), prt.UserID)

	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Password reset successfully. You can now log in with your new password.",
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Get all companies for user
	companies, _ := h.queries.GetCompaniesForUser(r.Context(), user.ID)

	var activeCompany *db.Company
	var activeRole string

	activeCompanyID, hasActive := middleware.GetActiveCompanyID(r.Context())
	if hasActive {
		for _, c := range companies {
			if c.ID == activeCompanyID {
				activeRole = c.UserRole
				activeCompany = &db.Company{
					ID:                 c.ID,
					Name:               c.Name,
					Slug:               c.Slug,
					Plan:               c.Plan,
					Status:             c.Status,
					StorageLimitBytes:  c.StorageLimitBytes,
					StorageUsedBytes:   c.StorageUsedBytes,
					StorageReservedBytes: c.StorageReservedBytes,
					Verified:           c.Verified,
				}
				break
			}
		}

		// Fallback for client users (no direct company membership)
		if activeCompany == nil && activeCompanyID.Valid {
			c, err := h.queries.GetCompanyByID(r.Context(), activeCompanyID)
			if err == nil {
				activeCompany = &db.Company{
					ID:                   c.ID,
					Name:                 c.Name,
					Slug:                 c.Slug,
					Plan:                 c.Plan,
					Status:               c.Status,
					StorageLimitBytes:    c.StorageLimitBytes,
					StorageUsedBytes:     c.StorageUsedBytes,
					StorageReservedBytes: c.StorageReservedBytes,
					Verified:             c.Verified,
				}
			}
		}
	}

	var roleID string
	var roleName string
	permissions := []string{}

	if activeCompanyID.Valid {
		membership, mErr := h.queries.GetMembership(r.Context(), db.GetMembershipParams{
			CompanyID: activeCompanyID,
			UserID:    user.ID,
		})
		if mErr == nil {
			roleID = pgUUIDToString(membership.RoleID)
			roleName = membership.Role
			if membership.RoleName.Valid && membership.RoleName.String != "" {
				roleName = membership.RoleName.String
			}
			if len(membership.RolePermissions) > 0 {
				_ = json.Unmarshal(membership.RolePermissions, &permissions)
			}
			if strings.ToLower(membership.Role) == "admin" || strings.ToLower(membership.Role) == "owner" ||
				strings.ToLower(roleName) == "admin" || strings.ToLower(roleName) == "owner" {
				permissions = authz.AllPermissions
				if roleID == "" {
					adminRole, err := h.queries.GetRoleByName(r.Context(), db.GetRoleByNameParams{
						CompanyID: activeCompanyID,
						Name:      "Admin",
					})
					if err == nil {
						roleID = pgUUIDToString(adminRole.ID)
						_ = h.queries.UpdateMembershipRole(r.Context(), db.UpdateMembershipRoleParams{
							CompanyID: activeCompanyID,
							UserID:    user.ID,
							Role:      "admin",
							RoleID:    adminRole.ID,
						})
					}
				}
			}
			if activeRole == "" {
				activeRole = roleName
			}
		}
	}

	// A signed-in user with no company must NOT become a client silently.
	// is_client must only be true if the user's email is explicitly registered in client_contacts.
	isClient := false
	if activeRole == "" || strings.ToLower(activeRole) == "guest" {
		contacts, err := h.queries.GetClientContactsByEmail(r.Context(), user.Email)
		if err == nil && len(contacts) > 0 {
			isClient = true
		}
	}

	// If the user has no company membership and is NOT a registered client contact,
	// clear active_company and active_role so they are prompted to ask an Admin.
	if !isClient && activeRole == "" {
		activeCompany = nil
		activeRole = ""
		roleID = ""
		roleName = ""
		permissions = []string{}
	}

	// Feature flags for company plan
	var features map[string]bool
	if activeCompany != nil {
		planDef := plans.Get(activeCompany.Plan)
		features = make(map[string]bool)
		for f, enabled := range planDef.Features {
			features[string(f)] = enabled
		}
	}

	fullUser, _ := h.queries.GetUserByID(r.Context(), user.ID)
	hasTemp := fullUser.TempPasswordHash.Valid && (!fullUser.PasswordHash.Valid || fullUser.PasswordHash.String == "")

	clientName := ""
	clientLogo := ""
	if isClient {
		contacts, err := h.queries.GetClientContactsByEmail(r.Context(), user.Email)
		if err == nil && len(contacts) > 0 {
			cl, cErr := h.queries.GetClientByID(r.Context(), db.GetClientByIDParams{
				ID:        contacts[0].ClientID,
				CompanyID: activeCompanyID,
			})
			if cErr == nil {
				clientName = cl.Name
				clientLogo = cl.LogoKey.String
			}
		}
	}

	userTheme := fullUser.Theme
	if userTheme == "" {
		userTheme = "blue"
	}
	if isClient {
		userTheme = "blue"
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"user": map[string]interface{}{
			"id":                user.ID,
			"email":             user.Email,
			"name":              user.Name,
			"avatar":            user.AvatarURL.String,
			"avatar_url":        user.AvatarURL.String,
			"username":          fullUser.Username.String,
			"is_onboarded":      fullUser.IsOnboarded,
			"has_temp_password": hasTemp,
			"email_verified":    user.EmailVerifiedAt.Valid,
			"theme":             userTheme,
		},
		"client_name":    clientName,
		"client_logo":    clientLogo,
		"active_company": activeCompany,
		"active_role":    activeRole,
		"role_id":        roleID,
		"role_name":      roleName,
		"permissions":    permissions,
		"role": map[string]interface{}{
			"id":          roleID,
			"name":        roleName,
			"permissions": permissions,
		},
		"is_client": isClient,
		"companies": companies,
		"features":  features,
	})
}

type UpdateThemeRequest struct {
	Theme string `json:"theme"`
}

var validThemes = map[string]bool{
	"blue":   true,
	"green":  true,
	"yellow": true,
	"purple": true,
	"orange": true,
	"pink":   true,
}

// UpdateTheme updates the authenticated user's color theme
func (h *AuthHandler) UpdateTheme(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetAuthenticatedUser(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req UpdateThemeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_body", "message": "Invalid request body"})
		return
	}

	theme := strings.ToLower(strings.TrimSpace(req.Theme))
	if !validThemes[theme] {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_theme",
			"message": "Theme must be one of: blue, green, yellow, purple, orange, pink",
		})
		return
	}

	updatedUser, err := h.queries.UpdateUserTheme(r.Context(), db.UpdateUserThemeParams{
		ID:    user.ID,
		Theme: theme,
	})
	if err != nil {
		slog.Error("failed to update user theme", "error", err, "user_id", user.ID)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to update theme"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "playhead_theme",
		Value:    theme,
		Path:     "/",
		MaxAge:   365 * 24 * 3600,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"theme": updatedUser.Theme,
	})
}

// GoogleOAuthURL returns the Google authorization URL and sets a short-lived state cookie
func (h *AuthHandler) GoogleOAuthURL(w http.ResponseWriter, r *http.Request) {
	if h.googleClientID == "" {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "google_auth_disabled",
			"message": "Google Login is not configured. Set GOOGLE_CLIENT_ID to enable.",
		})
		return
	}

	state, err := authz.GenerateSecureToken(24)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to generate oauth state"})
		return
	}

	// Set short-lived state cookie (10 minutes) to prevent CSRF / login forgery
	http.SetCookie(w, &http.Cookie{
		Name:     "google_oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		Expires:  time.Now().Add(10 * time.Minute),
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	redirectURI := h.appURL + "/api/v1/auth/google/callback"
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + url.QueryEscape(h.googleClientID) +
		"&redirect_uri=" + url.QueryEscape(redirectURI) +
		"&response_type=code&scope=openid%20email%20profile&state=" + url.QueryEscape(state)

	respondJSON(w, http.StatusOK, map[string]string{"url": authURL})
}

func (h *AuthHandler) GoogleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	// If GOOGLE_CLIENT_ID is not set, return 404
	if h.googleClientID == "" {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error":   "not_found",
			"message": "Google Login is not configured.",
		})
		return
	}

	// 1. Extract code and state from URL query or JSON POST body
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if r.Method == http.MethodPost && (code == "" || state == "") {
		var postReq struct {
			Code  string `json:"code"`
			State string `json:"state"`
		}
		_ = json.NewDecoder(r.Body).Decode(&postReq)
		if postReq.Code != "" {
			code = postReq.Code
		}
		if postReq.State != "" {
			state = postReq.State
		}
	}

	// 2. Validate state cookie to prevent CSRF / login forgery
	stateCookie, stateErr := r.Cookie("google_oauth_state")
	// Clear state cookie immediately
	http.SetCookie(w, &http.Cookie{
		Name:     "google_oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	if stateErr != nil || stateCookie.Value == "" || state == "" || state != stateCookie.Value {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_state",
			"message": "Invalid or expired OAuth state parameter. Please try logging in again.",
		})
		return
	}

	// 3. Authorization code is required
	if strings.TrimSpace(code) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "missing_code",
			"message": "Authorization code is required.",
		})
		return
	}

	// 4. Exchange authorization code with Google using Client ID and Secret, and verify ID token
	redirectURI := h.appURL + "/api/v1/auth/google/callback"
	client := h.googleOAuthClient
	if client == nil {
		client = NewRealGoogleOAuthClient()
	}

	tokenInfo, err := client.ExchangeCode(r.Context(), code, h.googleClientID, h.googleClientSecret, redirectURI)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "oauth_exchange_failed",
			"message": "Failed to authenticate with Google: " + err.Error(),
		})
		return
	}

	// 5. Verify token audience, issuer, expiry, and email_verified
	if tokenInfo.Aud != h.googleClientID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "invalid_audience",
			"message": "Google token audience mismatch.",
		})
		return
	}

	if tokenInfo.Iss != "https://accounts.google.com" && tokenInfo.Iss != "accounts.google.com" {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "invalid_issuer",
			"message": "Invalid token issuer.",
		})
		return
	}

	if expInt, err := strconv.ParseInt(tokenInfo.Exp, 10, 64); err == nil && expInt > 0 {
		if time.Now().Unix() > expInt {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error":   "token_expired",
				"message": "Google token has expired.",
			})
			return
		}
	}

	if tokenInfo.EmailVerified != "true" && tokenInfo.EmailVerified != "1" {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "email_unverified",
			"message": "Google account email is not verified. Please verify your Google email first.",
		})
		return
	}

	// 6. Use ONLY the email from the verified token. Ignore any browser-provided email, name, or google_id
	email := authz.NormalizeEmail(tokenInfo.Email)
	if email == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "missing_email",
			"message": "Google account did not provide a valid email.",
		})
		return
	}

	// 7. Email must be known in Playhead (invite, client contact, grant, or existing user)
	isKnown, err := h.queries.CheckEmailIsKnown(r.Context(), email)
	if err != nil || !isKnown {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "access_denied",
			"message": "This email doesn't have access to Playhead yet. Ask the person who invited you.",
		})
		return
	}

	name := strings.TrimSpace(tokenInfo.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		user, err = h.queries.CreateUser(r.Context(), db.CreateUserParams{
			Email:        email,
			Name:         name,
			PasswordHash: pgtype.Text{Valid: false},
			GoogleID:     pgtype.Text{String: tokenInfo.Sub, Valid: tokenInfo.Sub != ""},
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to create user account"})
			return
		}
	} else if tokenInfo.Sub != "" && !user.GoogleID.Valid {
		_ = h.queries.SetUserGoogleID(r.Context(), db.SetUserGoogleIDParams{
			ID:       user.ID,
			GoogleID: pgtype.Text{String: tokenInfo.Sub, Valid: true},
		})
	}

	// Google sign in with verified email marks the user's email as verified
	_ = h.queries.VerifyUserEmail(r.Context(), user.ID)

	_ = h.queries.LinkClientContactsToUser(r.Context(), db.LinkClientContactsToUserParams{
		Email:  email,
		UserID: user.ID,
	})
	_ = h.queries.LinkGrantsToUser(r.Context(), db.LinkGrantsToUserParams{
		Email:  email,
		UserID: user.ID,
	})

	// Create session
	rawSessionToken, err := authz.GenerateSecureToken(32)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to generate session"})
		return
	}

	sessionHash := authz.HashToken(rawSessionToken)
	expiresAt := time.Now().Add(30 * 24 * time.Hour)

	_, err = h.queries.CreateSession(r.Context(), db.CreateSessionParams{
		UserID:    user.ID,
		TokenHash: sessionHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
		UserAgent: pgtype.Text{String: r.UserAgent(), Valid: true},
		Ip:        pgtype.Text{String: r.RemoteAddr, Valid: true},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "server_error", "message": "Failed to persist session"})
		return
	}

	rawCSRFToken, _ := authz.GenerateSecureToken(16)

	http.SetCookie(w, &http.Cookie{
		Name:     "playhead_session",
		Value:    rawSessionToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    rawCSRFToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: false,
		Secure:   h.isProduction,
		SameSite: http.SameSiteLaxMode,
	})

	if r.Method == http.MethodGet {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "ok",
		"csrf_token": rawCSRFToken,
		"user": map[string]interface{}{
			"id":             user.ID,
			"email":          user.Email,
			"name":           user.Name,
			"avatar_url":     user.AvatarUrl.String,
			"email_verified": true,
		},
	})
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
