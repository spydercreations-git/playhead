package handler

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

// EnsureDevHarshAdmin ensures that Harsh (harsh@idyllproductions.com) always exists
// as an active Admin member of Idyll Productions on server startup in development.
func EnsureDevHarshAdmin(ctx context.Context, pool *pgxpool.Pool, q *db.Queries) error {
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

	// 2. Ensure default roles exist for Idyll Productions
	var adminRoleID string
	err = pool.QueryRow(ctx, `
		SELECT id::text FROM roles
		WHERE company_id = $1::uuid AND (name = 'Admin' OR is_system = true)
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

	// 3. Ensure user Harsh exists and is verified
	var harshUserID string
	err = pool.QueryRow(ctx, `
		INSERT INTO users (email, name, email_verified_at)
		VALUES ('harsh@idyllproductions.com', 'Harsh', NOW())
		ON CONFLICT (email) DO UPDATE SET
			name = 'Harsh',
			email_verified_at = COALESCE(users.email_verified_at, NOW())
		RETURNING id::text
	`).Scan(&harshUserID)
	if err != nil {
		slog.Warn("dev_seed: failed to ensure user Harsh", "error", err)
		return err
	}

	// 4. Ensure Harsh's membership is Admin
	_, err = pool.Exec(ctx, `
		INSERT INTO memberships (company_id, user_id, role, role_id)
		VALUES ($1::uuid, $2::uuid, 'admin', CASE WHEN $3 = '' THEN NULL ELSE $3::uuid END)
		ON CONFLICT (company_id, user_id) DO UPDATE SET
			role = 'admin',
			role_id = CASE WHEN $3 = '' THEN memberships.role_id ELSE $3::uuid END
	`, companyID, harshUserID, adminRoleID)
	if err != nil {
		slog.Warn("dev_seed: failed to ensure Harsh admin membership", "error", err)
		return err
	}

	// 5. Ensure Harsh is NOT treated as an external client contact
	_, _ = pool.Exec(ctx, `
		DELETE FROM client_contacts
		WHERE LOWER(email) = 'harsh@idyllproductions.com'
	`)

	slog.Info("dev_seed: Harsh successfully ensured as Admin of Idyll Productions",
		"user_id", harshUserID,
		"company_id", companyID,
		"role", "admin",
	)

	// Also ensure admin role permissions contain all permissions
	if adminRoleID != "" {
		allPermsJSON, _ := json.Marshal(authz.AllPermissions)
		if len(allPermsJSON) > 0 {
			_, _ = pool.Exec(ctx, `
				UPDATE roles SET permissions = $1
				WHERE id = $2::uuid
			`, allPermsJSON, adminRoleID)
		}
	}

	// 6. Ensure dev session exists for bearer token "dev-harsh-token"
	const devHarshTokenHash = "a67c19335a6884b04701926fae4d4c889d9a79fd5d08c3d2d696e864291e1352"
	_, _ = pool.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, expires_at)
		VALUES ($1::uuid, $2, NOW() + INTERVAL '365 days')
		ON CONFLICT (token_hash) DO UPDATE SET
			user_id = $1::uuid,
			expires_at = NOW() + INTERVAL '365 days'
	`, harshUserID, devHarshTokenHash)

	return nil
}
