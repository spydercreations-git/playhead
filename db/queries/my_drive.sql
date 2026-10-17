-- name: ListDriveFolders :many
SELECT * FROM items
WHERE company_id = $1
  AND project_id IS NULL
  AND parent_id IS NULL
  AND kind = 'folder'
  AND deleted_at IS NULL
ORDER BY is_default_folder DESC, position ASC, name ASC;

-- name: GetDefaultDriveFolderByCategory :one
SELECT * FROM items
WHERE company_id = $1
  AND project_id IS NULL
  AND parent_id IS NULL
  AND is_default_folder = TRUE
  AND LOWER(category) = LOWER($2)
  AND deleted_at IS NULL
LIMIT 1;

-- name: ListDriveItems :many
SELECT * FROM items
WHERE company_id = $1
  AND project_id IS NULL
  AND (
    (sqlc.narg('parent_id')::uuid IS NULL AND parent_id IS NULL)
    OR (parent_id = sqlc.narg('parent_id')::uuid)
  )
  AND deleted_at IS NULL
ORDER BY kind = 'folder' DESC, name ASC;

-- name: GetDriveItemByID :one
SELECT * FROM items
WHERE id = $1
  AND company_id = $2
  AND project_id IS NULL;

-- name: CreateDriveFolder :one
INSERT INTO items (
    company_id, drive_owner_id, project_id, parent_id, kind, name, position, created_by, is_default_folder, category
) VALUES (
    $1, NULL, NULL, $2, 'folder', $3, $4, $5, $6, $7
) RETURNING *;

-- name: UpdateDriveItemName :one
UPDATE items
SET name = $3, updated_at = NOW()
WHERE id = $1
  AND company_id = $2
  AND project_id IS NULL
  AND is_default_folder = FALSE
RETURNING *;

-- name: TrashDriveItem :exec
UPDATE items
SET deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
WHERE id = $1
  AND company_id = $2
  AND project_id IS NULL
  AND is_default_folder = FALSE;

-- name: TrashDriveItemDescendants :exec
WITH RECURSIVE item_tree(tree_id) AS (
    SELECT root_item.id FROM items root_item WHERE root_item.id = $1 AND root_item.company_id = $2 AND root_item.project_id IS NULL
    UNION ALL
    SELECT c.id FROM items c JOIN item_tree t ON c.parent_id = t.tree_id WHERE c.company_id = $2 AND c.project_id IS NULL
)
UPDATE items target
SET deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
WHERE target.id IN (SELECT tree_id FROM item_tree) AND target.company_id = $2;

-- name: RestoreDriveItem :exec
UPDATE items
SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
WHERE id = $1
  AND company_id = $2
  AND project_id IS NULL;

-- name: RestoreDriveItemDescendants :exec
WITH RECURSIVE item_tree(tree_id) AS (
    SELECT root_item.id FROM items root_item WHERE root_item.id = $1 AND root_item.company_id = $2 AND root_item.project_id IS NULL
    UNION ALL
    SELECT c.id FROM items c JOIN item_tree t ON c.parent_id = t.tree_id WHERE c.company_id = $2 AND c.project_id IS NULL
)
UPDATE items target
SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
WHERE target.id IN (SELECT tree_id FROM item_tree) AND target.company_id = $2;

-- name: MoveDriveItemToProject :one
UPDATE items
SET project_id = $3, parent_id = $4, drive_owner_id = NULL, updated_at = NOW()
WHERE id = $1
  AND company_id = $2
  AND project_id IS NULL
RETURNING *;

-- name: MoveDriveDescendantsToProject :exec
WITH RECURSIVE item_tree(tree_id) AS (
    SELECT root_item.id FROM items root_item WHERE root_item.id = $1 AND root_item.company_id = $2
    UNION ALL
    SELECT c.id FROM items c JOIN item_tree t ON c.parent_id = t.tree_id WHERE c.company_id = $2
)
UPDATE items target
SET project_id = $3, drive_owner_id = NULL, updated_at = NOW()
WHERE target.id IN (SELECT tree_id FROM item_tree) AND target.company_id = $2;

-- name: GetDriveFolderStats :one
SELECT 
    COUNT(id)::int AS file_count,
    COALESCE(SUM(total_bytes), 0)::bigint AS total_bytes
FROM items
WHERE company_id = $1
  AND project_id IS NULL
  AND parent_id = $2
  AND deleted_at IS NULL;

-- name: RecordRecentItem :exec
INSERT INTO recent_items (
    company_id, user_id, item_id, item_type, project_id, viewed_at
) VALUES (
    $1, $2, $3, $4, $5, NOW()
)
ON CONFLICT (user_id, item_id)
DO UPDATE SET viewed_at = NOW(), project_id = EXCLUDED.project_id;

-- name: ListRecentItems :many
SELECT r.id, r.company_id, r.user_id, r.item_id, r.item_type, r.project_id, r.viewed_at,
       i.name AS item_name, i.kind AS item_kind, i.total_bytes, i.category,
       p.name AS project_name
FROM recent_items r
JOIN items i ON r.item_id = i.id AND i.deleted_at IS NULL
LEFT JOIN projects p ON r.project_id = p.id
WHERE r.company_id = $1
  AND r.user_id = $2
ORDER BY r.viewed_at DESC
LIMIT $3;

-- name: CreateDriveUpload :one
INSERT INTO uploads (
    company_id, user_id, drive_owner_id, project_id, parent_id, target_item_id, share_link_id, filename, size_bytes, mime,
    storage_key, upload_id, part_size_bytes, total_parts, completed_parts, status, expires_at
)
VALUES (
    $1, $2, NULL, NULL, $3, $4, NULL,
    $5, $6, $7, $8, $9, $10, $11,
    '[]'::jsonb, 'pending', $12
)
RETURNING *;

-- name: CreateDriveFileItem :one
INSERT INTO items (
    company_id, drive_owner_id, project_id, parent_id, kind, name, position, created_by,
    file_count, folder_count, video_count, total_bytes, review_status, locked, category, is_default_folder
)
VALUES (
    $1, NULL, NULL, $2, 'file', $3, $4, $5,
    0, 0, 0, $6, 'none', FALSE, $7, FALSE
)
RETURNING *;

-- name: GetFileVersionsForItem :many
SELECT * FROM file_versions
WHERE item_id = $1
ORDER BY number ASC;

-- name: ListDriveDescendants :many
WITH RECURSIVE item_tree(tree_id) AS (
    SELECT root_item.id FROM items root_item WHERE root_item.id = $1 AND root_item.company_id = $2 AND root_item.project_id IS NULL
    UNION ALL
    SELECT c.id FROM items c JOIN item_tree t ON c.parent_id = t.tree_id WHERE c.company_id = $2 AND c.project_id IS NULL
)
SELECT i.* FROM items i
JOIN item_tree ON i.id = item_tree.tree_id
ORDER BY i.kind = 'folder' DESC, i.created_at ASC;

-- name: ListTrashedDriveItems :many
SELECT * FROM items
WHERE company_id = $1
  AND project_id IS NULL
  AND deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- name: PermanentDeleteDriveItem :exec
DELETE FROM items
WHERE id = $1
  AND company_id = $2
  AND project_id IS NULL
  AND is_default_folder = FALSE;
