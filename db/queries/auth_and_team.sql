-- name: UpdateUserPassword :exec
UPDATE users
SET password_hash = $2, updated_at = NOW()
WHERE id = $1;

-- name: VerifyUserEmail :exec
UPDATE users
SET email_verified_at = NOW(), updated_at = NOW()
WHERE id = $1;

-- name: SetUserGoogleID :exec
UPDATE users
SET google_id = $2, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
WHERE id = $1;

-- name: CreateSession :one
INSERT INTO sessions (
    user_id, token_hash, expires_at, user_agent, ip
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: GetSessionByTokenHash :one
SELECT 
    s.id as session_id,
    s.user_id,
    s.token_hash,
    s.expires_at,
    u.id as u_id,
    u.email as u_email,
    u.name as u_name,
    u.avatar_url as u_avatar_url,
    u.email_verified_at as u_email_verified_at
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.token_hash = $1 AND s.expires_at > NOW()
LIMIT 1;

-- name: DeleteSessionByTokenHash :exec
DELETE FROM sessions
WHERE token_hash = $1;

-- name: DeleteAllSessionsForUser :exec
DELETE FROM sessions
WHERE user_id = $1;

-- name: CreateVerificationToken :one
INSERT INTO verification_tokens (
    user_id, token_hash, expires_at
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetVerificationTokenByHash :one
SELECT vt.*, u.email as u_email
FROM verification_tokens vt
JOIN users u ON vt.user_id = u.id
WHERE vt.token_hash = $1 AND vt.expires_at > NOW()
LIMIT 1;

-- name: DeleteVerificationToken :exec
DELETE FROM verification_tokens
WHERE token_hash = $1;

-- name: CreatePasswordResetToken :one
INSERT INTO password_reset_tokens (
    user_id, token_hash, expires_at
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetPasswordResetTokenByHash :one
SELECT prt.*, u.email as u_email
FROM password_reset_tokens prt
JOIN users u ON prt.user_id = u.id
WHERE prt.token_hash = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL
LIMIT 1;

-- name: MarkPasswordResetTokenUsed :exec
UPDATE password_reset_tokens
SET used_at = NOW()
WHERE token_hash = $1;

-- name: CreateCompany :one
INSERT INTO companies (
    name, slug, plan, status, trial_ends_at, storage_limit_bytes, seats
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: GetCompanyBySlug :one
SELECT * FROM companies
WHERE slug = $1 LIMIT 1;

-- name: GetCompaniesForUser :many
SELECT c.*, m.role as user_role
FROM companies c
JOIN memberships m ON c.id = m.company_id
WHERE m.user_id = $1
ORDER BY c.created_at ASC;

-- name: CreateMembership :one
INSERT INTO memberships (
    company_id, user_id, role
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetMembership :one
SELECT m.id, m.company_id, m.user_id, m.role, m.role_id, m.created_at, m.updated_at,
       r.name as role_name, r.color as role_color, r.permissions as role_permissions, r.is_system as role_is_system
FROM memberships m
LEFT JOIN roles r ON r.id = m.role_id
WHERE m.company_id = $1 AND m.user_id = $2
LIMIT 1;

-- name: GetMembershipsForCompany :many
SELECT 
    m.id,
    m.company_id,
    m.user_id,
    m.role,
    m.role_id,
    m.created_at,
    u.name as user_name,
    u.email as user_email,
    u.avatar_url as user_avatar_url,
    r.name as role_name,
    r.color as role_color,
    r.is_system as role_is_system,
    r.permissions as role_permissions
FROM memberships m
JOIN users u ON m.user_id = u.id
LEFT JOIN roles r ON r.id = m.role_id
WHERE m.company_id = $1
ORDER BY m.created_at ASC;

-- name: CountCompanyMembers :one
SELECT COUNT(*) as count
FROM memberships
WHERE company_id = $1;

-- name: UpdateMembershipRole :exec
UPDATE memberships
SET role = $3, role_id = $4, updated_at = NOW()
WHERE company_id = $1 AND user_id = $2;

-- name: DeleteMembership :exec
DELETE FROM memberships
WHERE company_id = $1 AND user_id = $2;

-- name: CreateInvite :one
INSERT INTO invites (
    company_id, email, role, token_hash, expires_at
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: GetInviteByTokenHash :one
SELECT i.*, c.name as company_name
FROM invites i
JOIN companies c ON i.company_id = c.id
WHERE i.token_hash = $1 AND i.expires_at > NOW() AND i.accepted_at IS NULL
LIMIT 1;

-- name: GetInvitesForCompany :many
SELECT * FROM invites
WHERE company_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
ORDER BY created_at DESC;

-- name: MarkInviteAccepted :exec
UPDATE invites
SET accepted_at = NOW(), updated_at = NOW()
WHERE id = $1;

-- name: DeleteInvite :exec
DELETE FROM invites
WHERE id = $1 AND company_id = $2;
