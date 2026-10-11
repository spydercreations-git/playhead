package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

type contextKey string

const (
	UserContextKey    contextKey = "auth_user"
	CompanyContextKey contextKey = "auth_company_id"
	RoleContextKey    contextKey = "auth_role"
)

// AuthenticatedUser contains the authenticated session user details.
type AuthenticatedUser struct {
	ID              pgtype.UUID        `json:"id"`
	Email           string             `json:"email"`
	Name            string             `json:"name"`
	AvatarURL       pgtype.Text        `json:"avatar_url"`
	EmailVerifiedAt pgtype.Timestamptz `json:"email_verified_at"`
}

// GetAuthenticatedUser retrieves the user from context.
func GetAuthenticatedUser(ctx context.Context) (*AuthenticatedUser, bool) {
	u, ok := ctx.Value(UserContextKey).(*AuthenticatedUser)
	return u, ok
}

// GetActiveCompanyID retrieves the current company ID from context.
func GetActiveCompanyID(ctx context.Context) (pgtype.UUID, bool) {
	cid, ok := ctx.Value(CompanyContextKey).(pgtype.UUID)
	return cid, ok
}

// GetUserRole retrieves the user's role in the active company from context.
func GetUserRole(ctx context.Context) (string, bool) {
	r, ok := ctx.Value(RoleContextKey).(string)
	return r, ok
}

// AuthMiddleware handles session authentication and company context injection.
type AuthMiddleware struct {
	queries *db.Queries
}

// NewAuthMiddleware creates an AuthMiddleware instance.
func NewAuthMiddleware(queries *db.Queries) *AuthMiddleware {
	return &AuthMiddleware{queries: queries}
}

// Authenticate verifies the session token and injects the user into context.
func (am *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var rawToken string

		// 1. Check Cookie
		if cookie, err := r.Cookie("playhead_session"); err == nil && cookie.Value != "" {
			rawToken = cookie.Value
		}

		// 2. Fallback to Bearer token
		if rawToken == "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				rawToken = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if rawToken == "" {
			rejectUnauthorized(w, "Authentication required")
			return
		}

		// Hash token before database lookup
		tokenHash := authz.HashToken(rawToken)

		session, err := am.queries.GetSessionByTokenHash(r.Context(), tokenHash)
		if err != nil {
			rejectUnauthorized(w, "Invalid or expired session")
			return
		}

		authUser := &AuthenticatedUser{
			ID:              session.UID,
			Email:           session.UEmail,
			Name:            session.UName,
			AvatarURL:       session.UAvatarUrl,
			EmailVerifiedAt: session.UEmailVerifiedAt,
		}

		ctx := context.WithValue(r.Context(), UserContextKey, authUser)

		// Resolve Active Company ID
		var companyID pgtype.UUID
		requestedCompany := r.Header.Get("X-Company-ID")
		if requestedCompany == "" {
			requestedCompany = r.URL.Query().Get("company_id")
		}

		if requestedCompany != "" {
			companyID.Scan(requestedCompany)
		} else {
			// Default to user's first company membership
			companies, err := am.queries.GetCompaniesForUser(ctx, authUser.ID)
			if err == nil && len(companies) > 0 {
				companyID = companies[0].ID
			}
		}

		if companyID.Valid {
			ctx = context.WithValue(ctx, CompanyContextKey, companyID)

			// Look up role in this company
			membership, err := am.queries.GetMembership(ctx, db.GetMembershipParams{
				CompanyID: companyID,
				UserID:    authUser.ID,
			})
			if err == nil {
				ctx = context.WithValue(ctx, RoleContextKey, membership.Role)
			}
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireVerifiedEmail ensures the user has confirmed their email address.
func RequireVerifiedEmail(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := GetAuthenticatedUser(r.Context())
		if !ok || !user.EmailVerifiedAt.Valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "email_unverified",
				"message": "Please verify your email address to continue.",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRole ensures the user has at least the required role in the active company.
func RequireRole(requiredRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, ok := GetUserRole(r.Context())
			if !ok {
				rejectForbidden(w, "You are not a member of this company")
				return
			}

			if err := authz.Authorize(role, requiredRole); err != nil {
				rejectForbidden(w, "Insufficient permissions for this action")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func rejectUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   "unauthorized",
		"message": message,
	})
}

func rejectForbidden(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   "forbidden",
		"message": message,
	})
}
