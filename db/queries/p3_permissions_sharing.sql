-- Roles queries
-- name: ListCompanyRoles :many
SELECT r.id, r.company_id, r.name, r.color, r.permissions, r.is_system, r.created_at, r.updated_at,
       COUNT(m.id)::int as member_count
FROM roles r
LEFT JOIN memberships m ON m.role_id = r.id
WHERE r.company_id = $1
GROUP BY r.id
ORDER BY r.is_system DESC, r.name ASC;

-- name: GetRoleByID :one
SELECT id, company_id, name, color, permissions, is_system, created_at, updated_at
FROM roles
WHERE id = $1 AND company_id = $2;

-- name: GetRoleByName :one
SELECT id, company_id, name, color, permissions, is_system, created_at, updated_at
FROM roles
WHERE company_id = $1 AND name = $2;

-- name: CreateRole :one
INSERT INTO roles (company_id, name, color, permissions, is_system)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, company_id, name, color, permissions, is_system, created_at, updated_at;

-- name: UpdateRole :one
UPDATE roles
SET name = $3, color = $4, permissions = $5, updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND is_system = FALSE
RETURNING id, company_id, name, color, permissions, is_system, created_at, updated_at;

-- name: DeleteRole :exec
DELETE FROM roles
WHERE id = $1 AND company_id = $2 AND is_system = FALSE;

-- name: CountRoleMembers :one
SELECT COUNT(*)::int
FROM memberships
WHERE role_id = $1;

-- name: CountCompanyAdmins :one
SELECT COUNT(*)::int
FROM memberships m
JOIN roles r ON r.id = m.role_id
WHERE m.company_id = $1 AND r.name = 'Admin';

-- Notification Prefs queries
-- name: ListUserNotificationPrefs :many
SELECT id, user_id, event_type, in_app, email, created_at, updated_at
FROM notification_prefs
WHERE user_id = $1;

-- name: UpsertNotificationPref :one
INSERT INTO notification_prefs (user_id, event_type, in_app, email)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, event_type)
DO UPDATE SET in_app = EXCLUDED.in_app, email = EXCLUDED.email, updated_at = NOW()
RETURNING id, user_id, event_type, in_app, email, created_at, updated_at;

-- name: GetProjectNotificationPref :one
SELECT id, user_id, project_id, level, created_at, updated_at
FROM project_notification_prefs
WHERE user_id = $1 AND project_id = $2;

-- name: UpsertProjectNotificationPref :one
INSERT INTO project_notification_prefs (user_id, project_id, level)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, project_id)
DO UPDATE SET level = EXCLUDED.level, updated_at = NOW()
RETURNING id, user_id, project_id, level, created_at, updated_at;

-- name: GetUserSettings :one
SELECT id, user_id, email_frequency, created_at, updated_at
FROM user_settings
WHERE user_id = $1;

-- name: UpsertUserSettings :one
INSERT INTO user_settings (user_id, email_frequency)
VALUES ($1, $2)
ON CONFLICT (user_id)
DO UPDATE SET email_frequency = EXCLUDED.email_frequency, updated_at = NOW()
RETURNING id, user_id, email_frequency, created_at, updated_at;

-- name: ListSharedWithMeItems :many
SELECT i.id, i.company_id, i.project_id, i.parent_id, i.kind, i.name, i.position, i.created_by,
       i.file_count, i.folder_count, i.video_count, i.total_bytes, i.review_status, i.locked,
       i.created_at, i.updated_at, g.level as grant_level, g.can_download as grant_can_download,
       p.name as project_name, c.name as client_name
FROM items i
JOIN grants g ON g.target_id = i.id AND g.target_type = 'item'
JOIN projects p ON p.id = i.project_id
JOIN clients c ON c.id = p.client_id
WHERE g.company_id = $1 AND g.email = $2 AND i.deleted_at IS NULL
ORDER BY g.updated_at DESC;

-- Share Links queries
-- name: ListProjectShareLinks :many
SELECT s.id, s.company_id, s.project_id, s.name, s.token_hash, s.access, s.allow_download,
       s.latest_only, (s.password_hash IS NOT NULL AND s.password_hash != '') as has_password,
       s.expires_at, s.ask_identity, s.upload_limit_bytes, s.uploaded_bytes, s.view_count,
       s.last_opened_at, s.disabled_at, s.created_by, s.created_at, s.updated_at,
       COUNT(sli.item_id)::int as item_count
FROM share_links s
LEFT JOIN share_link_items sli ON sli.share_link_id = s.id
WHERE s.company_id = $1 AND s.project_id = $2
GROUP BY s.id
ORDER BY s.created_at DESC;

-- name: GetShareLinkByID :one
SELECT id, company_id, project_id, name, token_hash, access, allow_download, latest_only,
       (password_hash IS NOT NULL AND password_hash != '') as has_password,
       expires_at, ask_identity, upload_limit_bytes, uploaded_bytes, view_count,
       last_opened_at, disabled_at, created_by, created_at, updated_at
FROM share_links
WHERE id = $1 AND company_id = $2;

-- name: GetShareLinkByTokenHash :one
SELECT id, company_id, project_id, name, token_hash, access, allow_download, latest_only,
       password_hash, expires_at, ask_identity, upload_limit_bytes, uploaded_bytes, view_count,
       last_opened_at, disabled_at, created_by, created_at, updated_at
FROM share_links
WHERE token_hash = $1;

-- name: CreateShareLink :one
INSERT INTO share_links (
    company_id, project_id, name, token_hash, access, allow_download, latest_only,
    password_hash, expires_at, ask_identity, upload_limit_bytes, created_by
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
) RETURNING id, company_id, project_id, name, token_hash, access, allow_download, latest_only,
            expires_at, ask_identity, upload_limit_bytes, uploaded_bytes, view_count, created_at;

-- name: AttachShareLinkItem :exec
INSERT INTO share_link_items (share_link_id, item_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListShareLinkItems :many
SELECT i.id, i.company_id, i.project_id, i.parent_id, i.kind, i.name, i.file_count, i.folder_count,
       i.video_count, i.total_bytes, i.review_status, i.created_at, i.updated_at
FROM items i
JOIN share_link_items sli ON sli.item_id = i.id
WHERE sli.share_link_id = $1 AND i.deleted_at IS NULL;

-- name: UpdateShareLink :one
UPDATE share_links
SET name = $3, access = $4, allow_download = $5, latest_only = $6,
    password_hash = $7, expires_at = $8, ask_identity = $9, upload_limit_bytes = $10,
    disabled_at = $11, updated_at = NOW()
WHERE id = $1 AND company_id = $2
RETURNING id, company_id, project_id, name, token_hash, access, allow_download, latest_only,
          expires_at, ask_identity, upload_limit_bytes, disabled_at, updated_at;

-- name: IncrementShareLinkViewCount :exec
UPDATE share_links
SET view_count = view_count + 1, last_opened_at = NOW()
WHERE id = $1;

-- name: AddShareLinkUploadedBytes :exec
UPDATE share_links
SET uploaded_bytes = uploaded_bytes + $2, updated_at = NOW()
WHERE id = $1;

-- name: DeleteShareLink :exec
DELETE FROM share_links
WHERE id = $1 AND company_id = $2;

-- name: UpsertShareVisitor :one
INSERT INTO share_visitors (share_link_id, name, email)
VALUES ($1, $2, $3)
ON CONFLICT (share_link_id, email)
DO UPDATE SET name = EXCLUDED.name, last_seen_at = NOW()
RETURNING id, share_link_id, name, email, first_seen_at, last_seen_at;

-- Hierarchy check: returns whether target_item_id is either in the share link items or a descendant of any folder in the share link items
-- name: IsItemInShareLinkScope :one
WITH RECURSIVE item_hierarchy AS (
    SELECT i.id, i.parent_id
    FROM items i
    WHERE i.id = $2 AND i.deleted_at IS NULL
    UNION ALL
    SELECT p.id, p.parent_id
    FROM items p
    JOIN item_hierarchy h ON h.parent_id = p.id
    WHERE p.deleted_at IS NULL
)
SELECT EXISTS (
    SELECT 1
    FROM share_link_items sli
    JOIN item_hierarchy ih ON ih.id = sli.item_id
    WHERE sli.share_link_id = $1
) as in_scope;


