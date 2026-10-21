-- Item operations
-- name: GetItemByID :one
SELECT i.*, 
       COALESCE(fv.storage_key, '') AS latest_storage_key,
       COALESCE(fv.size_bytes, 0) AS latest_size_bytes,
       COALESCE(fv.mime, '') AS latest_mime,
       COALESCE(fv.number, 1) AS latest_version_number,
       u.name AS created_by_name,
       u.email AS created_by_email
FROM items i
LEFT JOIN file_versions fv ON fv.item_id = i.id AND fv.number = (
    SELECT MAX(number) FROM file_versions WHERE item_id = i.id
)
LEFT JOIN users u ON u.id = i.created_by
WHERE i.id = @id AND i.company_id = @company_id;

-- name: FindItemInParentByName :one
SELECT id, kind, name, project_id, parent_id
FROM items
WHERE company_id = @company_id
  AND project_id = @project_id
  AND (sqlc.narg('parent_id')::uuid IS NULL AND parent_id IS NULL OR parent_id = sqlc.narg('parent_id'))
  AND LOWER(name) = LOWER(@name)
  AND deleted_at IS NULL
LIMIT 1;

-- name: ListItemsWithVersions :many
SELECT i.*,
       COALESCE(fv.storage_key, '') AS latest_storage_key,
       COALESCE(fv.size_bytes, 0) AS latest_size_bytes,
       COALESCE(fv.mime, '') AS latest_mime,
       COALESCE(fv.number, 1) AS latest_version_number,
       COALESCE(fv.preview_status, 'none') AS preview_status,
       u.name AS created_by_name,
       EXISTS (
           SELECT 1 FROM stars s 
           WHERE s.item_id = i.id AND s.user_id = @user_id
       ) AS is_starred
FROM items i
LEFT JOIN file_versions fv ON fv.item_id = i.id AND fv.number = (
    SELECT MAX(number) FROM file_versions WHERE item_id = i.id
)
LEFT JOIN users u ON u.id = i.created_by
WHERE i.company_id = @company_id
  AND i.project_id = @project_id
  AND (sqlc.narg('parent_id')::uuid IS NULL AND i.parent_id IS NULL OR i.parent_id = sqlc.narg('parent_id'))
  AND i.deleted_at IS NULL
ORDER BY 
  CASE WHEN i.kind = 'folder' THEN 0 ELSE 1 END ASC,
  i.name ASC;

-- name: ListAllProjectFolders :many
SELECT id, project_id, parent_id, name, file_count, folder_count, video_count, total_bytes
FROM items
WHERE company_id = @company_id
  AND project_id = @project_id
  AND kind = 'folder'
  AND deleted_at IS NULL
ORDER BY name ASC;

-- name: ListProjectItems :many
SELECT i.*,
       COALESCE(fv.storage_key, '') AS latest_storage_key,
       COALESCE(fv.size_bytes, 0) AS latest_size_bytes,
       COALESCE(fv.mime, '') AS latest_mime,
       COALESCE(fv.number, 1) AS latest_version_number
FROM items i
LEFT JOIN file_versions fv ON fv.item_id = i.id AND fv.number = (
    SELECT MAX(number) FROM file_versions WHERE item_id = i.id
)
WHERE i.company_id = @company_id
  AND i.project_id = @project_id
  AND i.deleted_at IS NULL
ORDER BY i.name ASC;

-- name: CreateItemWithCounts :one
INSERT INTO items (
    company_id, project_id, parent_id, kind, name, position, created_by,
    file_count, folder_count, video_count, total_bytes, review_status, locked
)
VALUES (
    @company_id, sqlc.narg('project_id'), sqlc.narg('parent_id'), @kind, @name, @position, @created_by,
    0, 0, 0, 0, 'none', FALSE
)
RETURNING *;

-- name: RenameItem :one
UPDATE items
SET name = @name,
    updated_at = NOW()
WHERE id = @id AND company_id = @company_id
RETURNING *;

-- name: MoveItem :one
UPDATE items
SET parent_id = sqlc.narg('new_parent_id'),
    updated_at = NOW()
WHERE id = @id AND company_id = @company_id
RETURNING *;

-- name: SoftDeleteItem :one
UPDATE items
SET deleted_at = NOW(),
    deleted_by = @deleted_by,
    original_parent_id = parent_id,
    parent_id = NULL,
    updated_at = NOW()
WHERE id = @id AND company_id = @company_id
RETURNING *;

-- name: RestoreItem :one
UPDATE items
SET deleted_at = NULL,
    deleted_by = NULL,
    parent_id = original_parent_id,
    updated_at = NOW()
WHERE id = @id AND company_id = @company_id
RETURNING *;

-- name: PermanentDeleteItem :exec
DELETE FROM items
WHERE id = @id AND company_id = @company_id;

-- name: GetItemDescendants :many
WITH RECURSIVE item_descendants AS (
    SELECT items.id, items.parent_id, items.kind FROM items
    WHERE items.id = @item_id AND items.company_id = @company_id
    UNION ALL
    SELECT i.id, i.parent_id, i.kind
    FROM items i
    JOIN item_descendants d ON i.parent_id = d.id
    WHERE i.company_id = @company_id
)
SELECT d_res.id, d_res.parent_id, d_res.kind FROM item_descendants d_res;

-- name: SoftDeleteItemsCascade :exec
UPDATE items
SET deleted_at = NOW(),
    deleted_by = @deleted_by,
    delete_batch_id = @delete_batch_id,
    updated_at = NOW()
WHERE company_id = @company_id AND id = ANY(@item_ids::uuid[]) AND deleted_at IS NULL;

-- name: RestoreItemsCascade :exec
UPDATE items
SET deleted_at = NULL,
    deleted_by = NULL,
    delete_batch_id = NULL,
    updated_at = NOW()
WHERE company_id = @company_id AND delete_batch_id = @delete_batch_id;

-- Get path ancestors for an item
-- name: GetItemAncestors :many
WITH RECURSIVE item_ancestors AS (
    SELECT items.id, items.parent_id, items.name, items.kind, 0 as depth
    FROM items
    WHERE items.id = @item_id AND items.company_id = @company_id
    UNION ALL
    SELECT i.id, i.parent_id, i.name, i.kind, ia.depth + 1
    FROM items i
    JOIN item_ancestors ia ON i.id = ia.parent_id
)
SELECT ia.id, ia.parent_id, ia.name, ia.kind
FROM item_ancestors ia
ORDER BY ia.depth DESC;

-- Recursive recalculation of counts for all folders in a project
-- name: RecalculateProjectAndFolderCounts :exec
WITH RECURSIVE item_tree AS (
    SELECT it.id, it.parent_id, it.project_id, it.kind,
           CASE WHEN it.kind = 'folder' THEN 1 ELSE 0 END AS is_folder,
           CASE WHEN it.kind = 'file' THEN 1 ELSE 0 END AS is_file,
           CASE WHEN it.kind = 'file' AND (it.name ILIKE '%.mp4' OR it.name ILIKE '%.mov' OR it.name ILIKE '%.m4v' OR it.name ILIKE '%.webm' OR it.name ILIKE '%.mkv') THEN 1 ELSE 0 END AS is_video,
           COALESCE((
               SELECT fv.size_bytes FROM file_versions fv 
               WHERE fv.item_id = it.id 
               ORDER BY fv.number DESC LIMIT 1
           ), 0) AS size_bytes
    FROM items it
    WHERE it.project_id = @project_id AND it.deleted_at IS NULL
)
UPDATE projects
SET file_count = (SELECT COALESCE(SUM(is_file), 0) FROM item_tree),
    folder_count = (SELECT COALESCE(SUM(is_folder), 0) FROM item_tree),
    video_count = (SELECT COALESCE(SUM(is_video), 0) FROM item_tree),
    total_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM item_tree),
    updated_at = NOW()
WHERE projects.id = @project_id;

-- Recalculate individual folder counts
-- name: RecalculateFolderCounts :exec
WITH RECURSIVE folder_contents AS (
    SELECT fc_init.id, fc_init.parent_id, fc_init.kind, fc_init.name,
           COALESCE((
               SELECT fv.size_bytes FROM file_versions fv 
               WHERE fv.item_id = fc_init.id 
               ORDER BY fv.number DESC LIMIT 1
           ), 0) AS size_bytes
    FROM items fc_init
    WHERE fc_init.parent_id = @folder_id AND fc_init.deleted_at IS NULL
    UNION ALL
    SELECT i.id, i.parent_id, i.kind, i.name,
           COALESCE((
               SELECT fv.size_bytes FROM file_versions fv 
               WHERE fv.item_id = i.id 
               ORDER BY fv.number DESC LIMIT 1
           ), 0) AS size_bytes
    FROM items i
    JOIN folder_contents fc ON i.parent_id = fc.id
    WHERE i.deleted_at IS NULL
)
UPDATE items
SET file_count = (SELECT COUNT(*) FROM folder_contents fc_sub WHERE fc_sub.kind = 'file'),
    folder_count = (SELECT COUNT(*) FROM folder_contents fc_sub WHERE fc_sub.kind = 'folder'),
    video_count = (SELECT COUNT(*) FROM folder_contents fc_sub WHERE fc_sub.kind = 'file' AND (fc_sub.name ILIKE '%.mp4' OR fc_sub.name ILIKE '%.mov' OR fc_sub.name ILIKE '%.m4v' OR fc_sub.name ILIKE '%.webm' OR fc_sub.name ILIKE '%.mkv')),
    total_bytes = (SELECT COALESCE(SUM(fc_sub.size_bytes), 0) FROM folder_contents fc_sub WHERE fc_sub.kind = 'file'),
    updated_at = NOW()
WHERE items.id = @folder_id;

-- File versions
-- name: CreateFileVersion :one
INSERT INTO file_versions (
    company_id, item_id, number, storage_key, size_bytes, mime, duration_ms, width, height, fps, preview_status, preview_keys, uploaded_by
)
VALUES (
    @company_id, @item_id, @number, @storage_key, @size_bytes, @mime, sqlc.narg('duration_ms'), sqlc.narg('width'), sqlc.narg('height'), sqlc.narg('fps'), @preview_status, @preview_keys, @uploaded_by
)
RETURNING *;

-- name: GetLatestFileVersion :one
SELECT * FROM file_versions
WHERE item_id = @item_id
ORDER BY number DESC
LIMIT 1;

-- name: ListFileVersions :many
SELECT fv.*, u.name AS uploaded_by_name
FROM file_versions fv
LEFT JOIN users u ON u.id = fv.uploaded_by
WHERE fv.item_id = @item_id
ORDER BY fv.number DESC;

-- name: GetFileVersionByNumber :one
SELECT * FROM file_versions
WHERE item_id = @item_id AND number = @number;

-- Uploads
-- name: CreateUpload :one
INSERT INTO uploads (
    company_id, user_id, project_id, parent_id, target_item_id, share_link_id, filename, size_bytes, mime,
    storage_key, upload_id, part_size_bytes, total_parts, completed_parts, status, expires_at
)
VALUES (
    @company_id, @user_id, @project_id, sqlc.narg('parent_id'), sqlc.narg('target_item_id'), sqlc.narg('share_link_id'),
    @filename, @size_bytes, @mime, @storage_key, @upload_id, @part_size_bytes, @total_parts,
    '[]'::jsonb, 'pending', @expires_at
)
RETURNING *;

-- name: GetUploadByID :one
SELECT * FROM uploads
WHERE id = @id AND company_id = @company_id;

-- name: GetUploadByIDSimple :one
SELECT * FROM uploads
WHERE id = @id;

-- name: UpdateUploadCompletedParts :one
UPDATE uploads
SET completed_parts = @completed_parts,
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: CompleteUpload :one
UPDATE uploads
SET status = 'completed',
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: AbortUpload :one
UPDATE uploads
SET status = 'aborted',
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: ListExpiredPendingUploads :many
SELECT * FROM uploads
WHERE status = 'pending' AND expires_at < NOW()
LIMIT 100;

-- Stars
-- name: StarItem :exec
INSERT INTO stars (company_id, user_id, item_id)
VALUES (@company_id, @user_id, @item_id)
ON CONFLICT (user_id, item_id) DO NOTHING;

-- name: UnstarItem :exec
DELETE FROM stars
WHERE company_id = @company_id AND user_id = @user_id AND item_id = @item_id;

-- name: ListStarredItems :many
SELECT i.*, 
       COALESCE(fv.storage_key, '') AS latest_storage_key,
       COALESCE(fv.size_bytes, 0) AS latest_size_bytes,
       COALESCE(fv.mime, '') AS latest_mime,
       p.name AS project_name,
       p.id AS project_id,
       c.name AS client_name,
       c.id AS client_id
FROM stars s
JOIN items i ON i.id = s.item_id
JOIN projects p ON p.id = i.project_id
JOIN clients c ON c.id = p.client_id
LEFT JOIN file_versions fv ON fv.item_id = i.id AND fv.number = (
    SELECT MAX(number) FROM file_versions WHERE item_id = i.id
)
WHERE s.company_id = @company_id AND s.user_id = @user_id AND i.deleted_at IS NULL
ORDER BY s.created_at DESC;

-- Trash
-- name: ListTrashItems :many
SELECT i.*, 
       u.name AS deleted_by_name,
       COALESCE(fv.size_bytes, 0) AS latest_size_bytes,
       COALESCE(fv.mime, '') AS latest_mime,
       p.name AS project_name,
       p.id AS project_id
FROM items i
LEFT JOIN users u ON u.id = i.deleted_by
JOIN projects p ON p.id = i.project_id
LEFT JOIN file_versions fv ON fv.item_id = i.id AND fv.number = (
    SELECT MAX(number) FROM file_versions WHERE item_id = i.id
)
WHERE i.company_id = @company_id AND i.deleted_at IS NOT NULL
ORDER BY i.deleted_at DESC;

-- Company Storage Management & Alerts
-- name: ReserveCompanyStorage :exec
UPDATE companies
SET storage_reserved_bytes = storage_reserved_bytes + @bytes,
    updated_at = NOW()
WHERE id = @id;

-- name: ReleaseCompanyReservedStorage :exec
UPDATE companies
SET storage_reserved_bytes = GREATEST(0, storage_reserved_bytes - @bytes),
    updated_at = NOW()
WHERE id = @id;

-- name: CommitCompanyStorage :exec
UPDATE companies
SET storage_used_bytes = storage_used_bytes + @bytes,
    storage_reserved_bytes = GREATEST(0, storage_reserved_bytes - @bytes),
    updated_at = NOW()
WHERE id = @id;

-- name: DecrementCompanyStorage :exec
UPDATE companies
SET storage_used_bytes = GREATEST(0, storage_used_bytes - @bytes),
    updated_at = NOW()
WHERE id = @id;

-- name: GetCompanyStorageDetails :one
SELECT id, name, slug, plan, storage_used_bytes, storage_reserved_bytes, storage_limit_bytes, storage_last_alert_gb
FROM companies
WHERE id = @id;

-- name: UpdateCompanyStorageAlertGB :exec
UPDATE companies
SET storage_last_alert_gb = @alert_gb,
    updated_at = NOW()
WHERE id = @id;

-- name: GetStorageBreakdownByClientAndProject :many
SELECT 
    c.id AS client_id,
    c.name AS client_name,
    p.id AS project_id,
    p.name AS project_name,
    p.file_count,
    p.video_count,
    p.total_bytes AS project_bytes
FROM projects p
JOIN clients c ON c.id = p.client_id
WHERE p.company_id = @company_id AND p.deleted_at IS NULL
ORDER BY c.name ASC, p.name ASC;

-- Activity logging
-- name: CreateActivity :one
INSERT INTO activity (company_id, project_id, item_id, actor_id, action, details)
VALUES (@company_id, @project_id, sqlc.narg('item_id'), sqlc.narg('actor_id'), @action, @details)
RETURNING *;

-- Recursive file gathering for direct-to-storage folder downloads
-- name: GetFolderFilesRecursive :many
WITH RECURSIVE folder_tree AS (
    SELECT i.id, i.parent_id, i.name, i.kind, CAST(i.name AS TEXT) AS relative_path
    FROM items i
    WHERE i.id = @folder_id AND i.deleted_at IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.name, c.kind, ft.relative_path || '/' || c.name AS relative_path
    FROM items c
    JOIN folder_tree ft ON c.parent_id = ft.id
    WHERE c.deleted_at IS NULL
)
SELECT ft.id, ft.name, ft.kind, ft.relative_path,
       COALESCE(fv.storage_key, '') AS storage_key,
       COALESCE(fv.size_bytes, 0) AS size_bytes,
       COALESCE(fv.mime, '') AS mime
FROM folder_tree ft
LEFT JOIN LATERAL (
    SELECT storage_key, size_bytes, mime
    FROM file_versions
    WHERE item_id = ft.id
    ORDER BY number DESC
    LIMIT 1
) fv ON true
WHERE ft.kind = 'file';

-- name: ListFolderChildrenDirect :many
SELECT i.id, i.company_id, i.project_id, i.parent_id, i.kind, i.name, i.position,
       COALESCE(fv.storage_key, '') AS latest_storage_key,
       COALESCE(fv.size_bytes, 0)::bigint AS latest_size_bytes,
       COALESCE(fv.mime, '') AS latest_mime
FROM items i
LEFT JOIN LATERAL (
    SELECT storage_key, size_bytes, mime
    FROM file_versions
    WHERE item_id = i.id
    ORDER BY number DESC
    LIMIT 1
) fv ON true
WHERE i.company_id = @company_id AND i.parent_id = @parent_id AND i.deleted_at IS NULL
ORDER BY CASE WHEN i.kind = 'folder' THEN 0 ELSE 1 END ASC, i.name ASC;

