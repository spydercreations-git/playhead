-- Activity Events
-- name: CreateActivityEvent :one
INSERT INTO activity_events (
    id, company_id, actor_id, event_type, target_type, target_id, project_id, client_id, metadata, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
)
RETURNING *;

-- name: ListActivityEventsForUser :many
SELECT ae.id, ae.company_id, ae.actor_id, ae.event_type, ae.target_type, ae.target_id, ae.project_id, ae.client_id, ae.metadata, ae.created_at,
       u.name AS actor_name, u.email AS actor_email, COALESCE(u.avatar_url, '') AS actor_avatar
FROM activity_events ae
JOIN users u ON u.id = ae.actor_id
WHERE ae.company_id = @company_id
  AND (
    @is_staff::boolean = TRUE
    OR (
      @is_client::boolean = TRUE 
      AND ae.client_id = @user_client_id::uuid
      AND COALESCE((ae.metadata->>'is_internal')::boolean, FALSE) = FALSE
    )
    OR (
      @is_editor::boolean = TRUE
      AND (
        (ae.project_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = ae.project_id AND g.user_id = @user_id::uuid
        ))
        OR (ae.target_type = 'task' AND EXISTS (
          SELECT 1 FROM task_assignees ta WHERE ta.task_id = ae.target_id AND ta.user_id = @user_id::uuid
        ))
      )
    )
  )
ORDER BY ae.created_at DESC
LIMIT @query_limit OFFSET @query_offset;

-- Standalone Documents
-- name: ListDocuments :many
SELECT d.id, 
       d.company_id, 
       d.word_count, 
       d.character_count, 
       d.reading_time_seconds, 
       d.updated_at,
       d.plain_text,
       i.name AS title, 
       i.created_by, 
       i.created_at,
       COALESCE(u.name, '') AS created_by_name, 
       COALESCE(u.email, '') AS created_by_email,
       CASE 
         WHEN i.created_by = @user_id THEN 'owner'
         ELSE COALESCE(ds.role, CASE WHEN @is_staff::boolean = TRUE THEN 'edit' ELSE 'view' END)
       END AS my_role,
       EXISTS (
         SELECT 1 FROM document_shares s WHERE s.document_id = d.id
       ) AS is_shared
FROM documents d
JOIN items i ON i.id = d.id
LEFT JOIN users u ON u.id = i.created_by
LEFT JOIN document_shares ds ON ds.document_id = d.id AND ds.user_id = @user_id
WHERE d.company_id = @company_id
  AND i.deleted_at IS NULL
  AND (
    @is_staff::boolean = TRUE
    OR i.created_by = @user_id
    OR ds.id IS NOT NULL
  )
  AND (sqlc.narg('owner_id')::uuid IS NULL OR i.created_by = sqlc.narg('owner_id'))
  AND (
    sqlc.narg('search')::text IS NULL 
    OR i.name ILIKE '%' || sqlc.narg('search')::text || '%'
    OR d.plain_text ILIKE '%' || sqlc.narg('search')::text || '%'
  )
ORDER BY 
  CASE WHEN @sort_by::text = 'title' THEN i.name END ASC,
  CASE WHEN @sort_by::text = 'created' THEN i.created_at END DESC,
  d.updated_at DESC;

-- name: ListDocumentShares :many
SELECT ds.id, ds.company_id, ds.document_id, ds.user_id, ds.role, ds.created_at, ds.updated_at,
       u.name AS user_name, u.email AS user_email, COALESCE(u.avatar_url, '') AS user_avatar
FROM document_shares ds
JOIN users u ON u.id = ds.user_id
WHERE ds.document_id = $1 AND ds.company_id = $2
ORDER BY ds.created_at ASC;

-- name: UpsertDocumentShare :one
INSERT INTO document_shares (id, company_id, document_id, user_id, role, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
ON CONFLICT (document_id, user_id) 
DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
RETURNING *;

-- name: DeleteDocumentShare :exec
DELETE FROM document_shares
WHERE document_id = $1 AND user_id = $2 AND company_id = $3;

-- Quick Links
-- name: ListQuickLinks :many
SELECT * FROM quick_links
WHERE company_id = $1 AND user_id = $2
ORDER BY position ASC, created_at DESC;

-- name: CreateQuickLink :one
INSERT INTO quick_links (id, company_id, user_id, title, url, position, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
RETURNING *;

-- name: DeleteQuickLink :exec
DELETE FROM quick_links
WHERE id = $1 AND user_id = $2 AND company_id = $3;

-- Home Dashboard
-- name: GetWaitingForReviewItems :many
SELECT i.id, i.company_id, i.project_id, i.name, i.total_bytes, i.review_status, i.category, i.created_at, i.updated_at,
       p.name AS project_name, p.client_id, c.name AS client_name,
       COALESCE((SELECT COUNT(*) FROM comments cm WHERE cm.item_id = i.id AND cm.deleted_at IS NULL), 0)::int AS comment_count,
       COALESCE((SELECT fv.version_number FROM file_versions fv WHERE fv.item_id = i.id ORDER BY fv.version_number DESC LIMIT 1), 1)::int AS current_version,
       COALESCE((SELECT fv.duration_seconds FROM file_versions fv WHERE fv.item_id = i.id ORDER BY fv.version_number DESC LIMIT 1), 0)::numeric AS duration_seconds,
       COALESCE((SELECT fv.thumbnail_key FROM file_versions fv WHERE fv.item_id = i.id ORDER BY fv.version_number DESC LIMIT 1), '')::text AS thumbnail_key
FROM items i
JOIN projects p ON p.id = i.project_id
JOIN clients c ON c.id = p.client_id
WHERE i.company_id = @company_id
  AND i.kind = 'file'
  AND i.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND p.status = 'active'
  AND i.review_status IN ('needs_review', 'changes_requested')
  AND (
    @is_staff::boolean = TRUE
    OR (@is_client::boolean = TRUE AND p.client_id = @user_client_id::uuid)
    OR (@is_editor::boolean = TRUE AND EXISTS (
      SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = p.id AND g.user_id = @user_id::uuid
    ))
  )
ORDER BY i.updated_at DESC
LIMIT @query_limit;

-- name: CountWaitingForReviewItems :one
SELECT COUNT(*)::bigint
FROM items i
JOIN projects p ON p.id = i.project_id
WHERE i.company_id = @company_id
  AND i.kind = 'file'
  AND i.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND p.status = 'active'
  AND i.review_status IN ('needs_review', 'changes_requested')
  AND (
    @is_staff::boolean = TRUE
    OR (@is_client::boolean = TRUE AND p.client_id = @user_client_id::uuid)
    OR (@is_editor::boolean = TRUE AND EXISTS (
      SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = p.id AND g.user_id = @user_id::uuid
    ))
  );

-- name: GetRecentProjectsForHome :many
SELECT p.id, p.company_id, p.client_id, p.name, p.file_count, p.folder_count, p.total_bytes, p.updated_at,
       c.name AS client_name,
       COALESCE((
         SELECT COUNT(*) FROM items i 
         WHERE i.project_id = p.id AND i.kind = 'file' AND i.deleted_at IS NULL AND i.review_status IN ('needs_review', 'changes_requested')
       ), 0)::int AS items_to_review_count
FROM projects p
JOIN clients c ON c.id = p.client_id
WHERE p.company_id = @company_id
  AND p.deleted_at IS NULL
  AND p.status = 'active'
  AND (
    @is_staff::boolean = TRUE
    OR (@is_client::boolean = TRUE AND p.client_id = @user_client_id::uuid)
    OR (@is_editor::boolean = TRUE AND EXISTS (
      SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = p.id AND g.user_id = @user_id::uuid
    ))
  )
ORDER BY p.updated_at DESC
LIMIT 4;

-- name: GetUserUploadDestination :one
SELECT last_upload_project_id, last_upload_folder_id
FROM users WHERE id = $1;

-- name: UpdateUserUploadDestination :exec
UPDATE users
SET last_upload_project_id = $2, last_upload_folder_id = $3, updated_at = NOW()
WHERE id = $1;

-- Storage
-- name: GetStorageOverview :one
SELECT 
  COALESCE(SUM(it.total_bytes), 0)::bigint AS total_bytes,
  COUNT(*) FILTER (WHERE it.kind = 'file' AND it.deleted_at IS NULL)::bigint AS files_count,
  COALESCE((SELECT COUNT(*) FROM projects pr WHERE pr.company_id = @company_id AND pr.deleted_at IS NULL), 0)::bigint AS projects_count,
  COALESCE((SELECT COUNT(*) FROM clients cl WHERE cl.company_id = @company_id AND cl.deleted_at IS NULL), 0)::bigint AS clients_count,
  COALESCE(SUM(it.total_bytes) FILTER (WHERE it.category = 'videos' AND it.kind = 'file' AND it.deleted_at IS NULL), 0)::bigint AS videos_bytes,
  COALESCE(SUM(it.total_bytes) FILTER (WHERE it.category = 'images' AND it.kind = 'file' AND it.deleted_at IS NULL), 0)::bigint AS images_bytes,
  COALESCE(SUM(it.total_bytes) FILTER (WHERE it.category = 'documents' AND it.kind = 'file' AND it.deleted_at IS NULL), 0)::bigint AS documents_bytes,
  COALESCE(SUM(it.total_bytes) FILTER (WHERE (it.category NOT IN ('videos', 'images', 'documents') OR it.category IS NULL) AND it.kind = 'file' AND it.deleted_at IS NULL), 0)::bigint AS other_bytes
FROM items it
WHERE it.company_id = @company_id AND it.deleted_at IS NULL;

-- name: GetStorageByClient :many
SELECT 
  c.id AS client_id,
  c.name AS client_name,
  COUNT(DISTINCT p.id)::int AS project_count,
  COALESCE(SUM(i.total_bytes), 0)::bigint AS used_bytes
FROM clients c
LEFT JOIN projects p ON p.client_id = c.id AND p.deleted_at IS NULL
LEFT JOIN items i ON i.project_id = p.id AND i.kind = 'file' AND i.deleted_at IS NULL
WHERE c.company_id = @company_id AND c.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY used_bytes DESC, c.name ASC;
