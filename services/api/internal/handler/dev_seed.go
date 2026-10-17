package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

// EnsureDevAdmins ensures that all configured dev admin emails exist as active
// Admin members of Idyll Productions on server startup in development.
func EnsureDevAdmins(ctx context.Context, pool *pgxpool.Pool, q *db.Queries, adminEmails string) error {
	if pool == nil || q == nil {
		return nil
	}

	// 1. Ensure company "Idyll Productions" exists
	var companyID string
	err := pool.QueryRow(ctx, `
		SELECT id::text FROM companies
		WHERE name ILIKE '%Idyll Productions%' OR slug ILIKE '%idyll%'
		ORDER BY created_at ASC LIMIT 1
	`).Scan(&companyID)

	if err != nil {
		// Create company if not exists
		err = pool.QueryRow(ctx, `
			INSERT INTO companies (name, slug, plan, status, verified)
			VALUES ('Idyll Productions', 'idyll-productions', 'internal', 'active', true)
			ON CONFLICT (slug) DO UPDATE SET plan = 'internal', status = 'active', verified = true
			RETURNING id::text
		`).Scan(&companyID)
		if err != nil {
			slog.Warn("dev_seed: failed to ensure Idyll Productions company", "error", err)
			return err
		}
	} else {
		// Ensure plan is internal
		_, _ = pool.Exec(ctx, `
			UPDATE companies SET plan = 'internal', status = 'active', verified = true
			WHERE id = $1::uuid
		`, companyID)
	}

	// 2. Ensure default roles exist for Idyll Productions (look up strictly by name = 'Admin')
	var adminRoleID string
	err = pool.QueryRow(ctx, `
		SELECT id::text FROM roles
		WHERE company_id = $1::uuid AND name = 'Admin'
		LIMIT 1
	`, companyID).Scan(&adminRoleID)

	if err != nil {
		var compPgUUID pgtype.UUID
		_ = compPgUUID.Scan(companyID)
		adminRole, seedErr := SeedDefaultCompanyRoles(ctx, q, compPgUUID)
		if seedErr == nil {
			adminRoleID = pgUUIDToString(adminRole.ID)
		}
	}

	// Ensure admin role permissions contain all permissions
	if adminRoleID != "" {
		allPermsJSON, _ := json.Marshal(authz.AllPermissions)
		if len(allPermsJSON) > 0 {
			_, _ = pool.Exec(ctx, `
				UPDATE roles SET permissions = $1
				WHERE id = $2::uuid
			`, allPermsJSON, adminRoleID)
		}
	}

	// 3. Parse emails (default: harsh@idyllproductions.com)
	if strings.TrimSpace(adminEmails) == "" {
		adminEmails = "harsh@idyllproductions.com"
	}
	emailList := strings.Split(adminEmails, ",")

	for _, rawEmail := range emailList {
		email := strings.TrimSpace(strings.ToLower(rawEmail))
		if email == "" {
			continue
		}

		// Derive display name from email (e.g. harsh@idyllproductions.com -> Harsh)
		displayName := "Admin"
		parts := strings.Split(email, "@")
		if len(parts) > 0 && len(parts[0]) > 0 {
			displayName = strings.ToUpper(parts[0][:1]) + parts[0][1:]
		}

		usernameVal := strings.ToLower(displayName)
		if strings.Contains(email, "harsh") {
			usernameVal = "harsh"
		} else if strings.Contains(email, "rohit") {
			usernameVal = "rohit"
		}

		// Ensure user exists and is verified
		var userID string
		err = pool.QueryRow(ctx, `
			INSERT INTO users (email, name, email_verified_at, username, is_onboarded)
			VALUES ($1, $2, NOW(), $3, true)
			ON CONFLICT (email) DO UPDATE SET
				name = EXCLUDED.name,
				email_verified_at = COALESCE(users.email_verified_at, NOW()),
				username = COALESCE(users.username, EXCLUDED.username)
			RETURNING id::text
		`, email, displayName, usernameVal).Scan(&userID)
		if err != nil {
			slog.Warn("dev_seed: failed to ensure admin user", "email", email, "error", err)
			continue
		}

		// Ensure user's membership is Admin
		_, err = pool.Exec(ctx, `
			INSERT INTO memberships (company_id, user_id, role, role_id)
			VALUES ($1::uuid, $2::uuid, 'admin', CASE WHEN $3 = '' THEN NULL ELSE $3::uuid END)
			ON CONFLICT (company_id, user_id) DO UPDATE SET
				role = 'admin',
				role_id = CASE WHEN $3 = '' THEN memberships.role_id ELSE $3::uuid END
		`, companyID, userID, adminRoleID)
		if err != nil {
			slog.Warn("dev_seed: failed to ensure admin membership", "email", email, "error", err)
			continue
		}

		// Ensure user is NOT treated as an external client contact
		_, _ = pool.Exec(ctx, `
			DELETE FROM client_contacts
			WHERE LOWER(email) = $1
		`, email)

		slog.Info("dev_seed: user successfully ensured as Admin of Idyll Productions",
			"email", email,
			"user_id", userID,
			"company_id", companyID,
			"role", "admin",
		)
	}

	// 4. Security Hardening: Remove the permanent "dev-harsh-token" session from database
	const devHarshTokenHash = "a67c19335a6884b04701926fae4d4c889d9a79fd5d08c3d2d696e864291e1352"
	_, _ = pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, devHarshTokenHash)

	return nil
}

// EnsureDevHarshAdmin wraps EnsureDevAdmins for backward compatibility.
func EnsureDevHarshAdmin(ctx context.Context, pool *pgxpool.Pool, q *db.Queries) error {
	return EnsureDevAdmins(ctx, pool, q, "harsh@idyllproductions.com")
}
