package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

type contextKey string

const (
	UserContextKey    contextKey = "auth_user"
	CompanyContextKey contextKey = "auth_company_id"
	RoleContextKey    contextKey = "auth_role"
	PersonContextKey  contextKey = "auth_person"
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

// GetPerson retrieves the authz.Person from context.
func GetPerson(ctx context.Context) authz.Person {
	if p, ok := ctx.Value(PersonContextKey).(authz.Person); ok {
		return p
	}
	user, okU := GetAuthenticatedUser(ctx)
	compID, okC := GetActiveCompanyID(ctx)
	role, _ := GetUserRole(ctx)
	if !okU || !okC {
		return authz.Person{}
	}
	return authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		Role:      role,
		CompanyID: uuid.UUID(compID.Bytes),
	}
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
			if err := companyID.Scan(requestedCompany); err != nil || !companyID.Valid {
				rejectForbidden(w, "Invalid company ID")
				return
			}
			belongs, err := am.queries.CheckUserBelongsToCompany(ctx, db.CheckUserBelongsToCompanyParams{
				CompanyID: companyID,
				UserID:    authUser.ID,
				Email:     authUser.Email,
			})
			if err != nil || !belongs {
				rejectForbidden(w, "Access to requested company denied")
				return
			}
		} else {
			// 1. Try company memberships
			companies, err := am.queries.GetCompaniesForUser(ctx, authUser.ID)
			if err == nil && len(companies) > 0 {
				companyID = companies[0].ID
			}

			// 2. Fallback to client contacts or grants
			if !companyID.Valid {
				compID, err := am.queries.GetCompanyContextForEmail(ctx, authUser.Email)
				if err == nil && compID.Valid {
					companyID = compID
				}
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
				var perms []string
				if len(membership.RolePermissions) > 0 {
					_ = json.Unmarshal(membership.RolePermissions, &perms)
				}
				roleName := membership.Role
				if membership.RoleName.Valid && membership.RoleName.String != "" {
					roleName = membership.RoleName.String
				}
				var roleID uuid.UUID
				if membership.RoleID.Valid {
					roleID = uuid.UUID(membership.RoleID.Bytes)
				}
				if strings.ToLower(roleName) == "admin" || strings.ToLower(membership.Role) == "admin" || strings.ToLower(membership.Role) == "owner" {
					perms = authz.AllPermissions
				}
				person := authz.Person{
					UserID:      uuid.UUID(authUser.ID.Bytes),
					Email:       authUser.Email,
					Role:        roleName,
					RoleID:      roleID,
					Permissions: perms,
					CompanyID:   uuid.UUID(companyID.Bytes),
				}
				ctx = context.WithValue(ctx, PersonContextKey, person)
			} else {
				// External client / outside person (no company membership role)
				ctx = context.WithValue(ctx, RoleContextKey, "")
				person := authz.Person{
					UserID:    uuid.UUID(authUser.ID.Bytes),
					Email:     authUser.Email,
					Role:      "",
					CompanyID: uuid.UUID(companyID.Bytes),
				}
				ctx = context.WithValue(ctx, PersonContextKey, person)
			}
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequirePermission ensures the person has the specified granular permission.
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			person := GetPerson(r.Context())
			if !person.HasPermission(permission) {
				rejectForbidden(w, "Insufficient permissions for this action")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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
