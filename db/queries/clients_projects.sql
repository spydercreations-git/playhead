-- Login codes
-- name: CreateLoginCode :one
INSERT INTO login_codes (email, code_hash, expires_at)
VALUES (@email, @code_hash, @expires_at)
RETURNING *;

-- name: GetValidLoginCode :one
SELECT * FROM login_codes
WHERE email = @email
  AND code_hash = @code_hash
  AND expires_at > NOW()
  AND attempts < 5
ORDER BY created_at DESC
LIMIT 1;

-- name: IncrementLoginCodeAttempts :exec
UPDATE login_codes
SET attempts = attempts + 1
WHERE id = @id;

-- name: DeleteLoginCodesForEmail :exec
DELETE FROM login_codes
WHERE email = @email;

-- Known email verification
-- name: CheckEmailIsKnown :one
SELECT EXISTS (
    SELECT 1 FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE LOWER(u.email) = @email
    UNION
    SELECT 1 FROM invites i
    WHERE LOWER(i.email) = @email AND i.accepted_at IS NULL AND i.expires_at > NOW()
    UNION
    SELECT 1 FROM client_contacts cc
    WHERE LOWER(cc.email) = @email
    UNION
    SELECT 1 FROM grants g
    WHERE LOWER(g.email) = @email
) AS is_known;

-- Get company ID for a known user by email (from memberships, client_contacts, or grants)
-- name: GetCompanyContextForEmail :one
SELECT company_id FROM (
    SELECT m.company_id, 1 as priority
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE LOWER(u.email) = @email
    UNION ALL
    SELECT cc.company_id, 2 as priority
    FROM client_contacts cc
    WHERE LOWER(cc.email) = @email
    UNION ALL
    SELECT g.company_id, 3 as priority
    FROM grants g
    WHERE LOWER(g.email) = @email
) ctx
ORDER BY priority ASC
LIMIT 1;

-- Clients
-- name: CreateClient :one
INSERT INTO clients (company_id, name, website, notes, created_by)
VALUES (@company_id, @name, @website, @notes, @created_by)
RETURNING *;

-- name: GetClientByID :one
SELECT * FROM clients
WHERE company_id = @company_id AND id = @id AND deleted_at IS NULL;

-- name: ListClients :many
SELECT c.*,
    COALESCE((SELECT COUNT(*) FROM client_contacts cc WHERE cc.client_id = c.id), 0)::int AS contacts_count,
    COALESCE((SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL), 0)::int AS projects_count,
    COALESCE((SELECT SUM(p.total_bytes) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL), 0)::bigint AS total_size_bytes,
    COALESCE((SELECT COUNT(*) FROM items i JOIN projects p ON p.id = i.project_id WHERE p.client_id = c.id AND p.deleted_at IS NULL AND i.deleted_at IS NULL AND i.kind = 'file'), 0)::int AS files_count,
    COALESCE((SELECT COUNT(*) FROM items i JOIN projects p ON p.id = i.project_id WHERE p.client_id = c.id AND p.deleted_at IS NULL AND i.deleted_at IS NULL AND i.kind = 'file' AND (i.review_status = 'needs_review' OR i.review_status = 'pending' OR i.review_status = 'in_review')), 0)::int AS to_review_count
FROM clients c
WHERE c.company_id = @company_id AND c.deleted_at IS NULL
ORDER BY c.updated_at DESC;

-- name: UpdateClient :one
UPDATE clients
SET name = COALESCE(sqlc.narg('name'), name),
    website = COALESCE(sqlc.narg('website'), website),
    notes = COALESCE(sqlc.narg('notes'), notes),
    logo_key = COALESCE(sqlc.narg('logo_key'), logo_key),
    updated_at = NOW()
WHERE company_id = @company_id AND id = @id AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteClient :exec
UPDATE clients
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE company_id = @company_id AND id = @id;

-- Client Contacts
-- name: CreateClientContact :one
INSERT INTO client_contacts (company_id, client_id, name, email, default_level, can_download)
VALUES (@company_id, @client_id, @name, @email, @default_level, @can_download)
RETURNING *;

-- name: GetClientContactByID :one
SELECT * FROM client_contacts
WHERE id = @id;

-- name: ListClientContacts :many
SELECT * FROM client_contacts
WHERE client_id = @client_id
ORDER BY created_at ASC;

-- name: ListClientContactsByCompany :many
SELECT * FROM client_contacts
WHERE company_id = @company_id
ORDER BY name ASC;

-- name: GetClientContactByClientAndEmail :one
SELECT * FROM client_contacts
WHERE client_id = @client_id AND LOWER(email) = @email;

-- name: GetClientContactsByEmail :many
SELECT * FROM client_contacts
WHERE LOWER(email) = @email;

-- name: UpdateClientContact :one
UPDATE client_contacts
SET name = COALESCE(sqlc.narg('name'), name),
    default_level = COALESCE(sqlc.narg('default_level'), default_level),
    can_download = COALESCE(sqlc.narg('can_download'), can_download),
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: DeleteClientContact :exec
DELETE FROM client_contacts
WHERE id = @id;

-- name: LinkClientContactsToUser :exec
UPDATE client_contacts
SET user_id = @user_id,
    last_signed_in_at = NOW(),
    updated_at = NOW()
WHERE LOWER(email) = @email;

-- Projects
-- name: CreateProject :one
INSERT INTO projects (company_id, client_id, name, created_by)
VALUES (@company_id, @client_id, @name, @created_by)
RETURNING *;

-- name: GetProjectByID :one
SELECT p.*, c.name AS client_name
FROM projects p
JOIN clients c ON c.id = p.client_id
WHERE p.company_id = @company_id AND p.id = @id AND p.deleted_at IS NULL;

-- name: ListProjectsForAdminOrManager :many
SELECT p.*, c.name AS client_name,
    COALESCE((SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.deleted_at IS NULL AND i.kind = 'file' AND (i.review_status = 'needs_review' OR i.review_status = 'pending' OR i.review_status = 'in_review')), 0)::int AS to_review_count
FROM projects p
JOIN clients c ON c.id = p.client_id
WHERE p.company_id = @company_id
  AND p.deleted_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR p.client_id = sqlc.narg('client_id'))
  AND (sqlc.narg('status')::text IS NULL OR p.status = sqlc.narg('status'))
ORDER BY p.updated_at DESC;

-- name: ListProjectsForUserWithAccess :many
SELECT DISTINCT p.*, c.name AS client_name,
    COALESCE((SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.deleted_at IS NULL AND i.kind = 'file' AND (i.review_status = 'needs_review' OR i.review_status = 'pending' OR i.review_status = 'in_review')), 0)::int AS to_review_count
FROM projects p
JOIN clients c ON c.id = p.client_id
LEFT JOIN grants g ON g.target_type = 'project' AND g.target_id = p.id AND LOWER(g.email) = @email
LEFT JOIN client_contacts cc ON cc.client_id = p.client_id AND LOWER(cc.email) = @email AND cc.default_level != 'none'
WHERE p.company_id = @company_id
  AND p.deleted_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR p.client_id = sqlc.narg('client_id'))
  AND (sqlc.narg('status')::text IS NULL OR p.status = sqlc.narg('status'))
  AND (
    (p.is_restricted = FALSE AND (g.id IS NOT NULL OR cc.id IS NOT NULL))
    OR
    (p.is_restricted = TRUE AND (g.id IS NOT NULL OR EXISTS (
        SELECT 1 FROM grants ig
        JOIN items i ON i.id = ig.target_id AND i.deleted_at IS NULL
        WHERE i.project_id = p.id
          AND (ig.target_type = 'item' OR ig.target_type = 'folder')
          AND LOWER(ig.email) = LOWER(@email)
          AND ig.level != 'none' AND ig.level != ''
    )))
  )
ORDER BY p.updated_at DESC;

-- name: UpdateProject :one
UPDATE projects
SET name = COALESCE(sqlc.narg('name'), name),
    is_restricted = COALESCE(sqlc.narg('is_restricted'), is_restricted),
    updated_at = NOW()
WHERE company_id = @company_id AND id = @id AND deleted_at IS NULL
RETURNING *;

-- name: MoveProjectToClient :one
UPDATE projects
SET client_id = @client_id,
    updated_at = NOW()
WHERE company_id = @company_id AND id = @id AND deleted_at IS NULL
RETURNING *;

-- name: SetProjectStatus :one
UPDATE projects
SET status = @status,
    updated_at = NOW()
WHERE company_id = @company_id AND id = @id AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProject :exec
UPDATE projects
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE company_id = @company_id AND id = @id;

-- name: SoftDeleteProjectsByClient :exec
UPDATE projects
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE company_id = @company_id AND client_id = @client_id;

-- name: UpdateProjectFolderCount :exec
UPDATE projects
SET folder_count = @folder_count,
    updated_at = NOW()
WHERE id = @id;

-- Items (Folders for template)
-- name: CreateItem :one
INSERT INTO items (company_id, project_id, parent_id, kind, name, position, created_by)
VALUES (@company_id, sqlc.narg('project_id'), @parent_id, @kind, @name, @position, @created_by)
RETURNING *;

-- name: ListItemsByProjectAndParent :many
SELECT * FROM items
WHERE company_id = @company_id
  AND project_id = @project_id
  AND (sqlc.narg('parent_id')::uuid IS NULL AND parent_id IS NULL OR parent_id = sqlc.narg('parent_id'))
  AND deleted_at IS NULL
ORDER BY position ASC, name ASC;

-- Grants
-- name: CreateGrant :one
INSERT INTO grants (company_id, target_type, target_id, email, user_id, level, can_download, granted_by)
VALUES (@company_id, @target_type, @target_id, @email, @user_id, @level, @can_download, @granted_by)
ON CONFLICT (target_type, target_id, email)
DO UPDATE SET
    level = EXCLUDED.level,
    can_download = EXCLUDED.can_download,
    updated_at = NOW()
RETURNING *;

-- name: GetGrantByTargetAndEmail :one
SELECT * FROM grants
WHERE target_type = @target_type AND target_id = @target_id AND LOWER(email) = @email;

-- name: ListGrantsByTarget :many
SELECT g.*, u.name AS user_name, u.avatar_url
FROM grants g
LEFT JOIN users u ON u.id = g.user_id
WHERE g.company_id = @company_id AND g.target_type = @target_type AND g.target_id = @target_id
ORDER BY g.created_at ASC;

-- name: ListGrantsByEmail :many
SELECT * FROM grants
WHERE LOWER(email) = @email;

-- name: UpdateGrant :one
UPDATE grants
SET level = COALESCE(sqlc.narg('level'), level),
    can_download = COALESCE(sqlc.narg('can_download'), can_download),
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: DeleteGrant :exec
DELETE FROM grants
WHERE id = @id;

-- name: DeleteGrantByTargetAndEmail :exec
DELETE FROM grants
WHERE target_type = @target_type AND target_id = @target_id AND LOWER(email) = @email;

-- name: LinkGrantsToUser :exec
UPDATE grants
SET user_id = @user_id,
    updated_at = NOW()
WHERE LOWER(email) = @email;
