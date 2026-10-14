-- name: CreateComment :one
INSERT INTO comments (
    company_id, item_id, version_id, parent_id,
    author_user_id, author_visitor_id, author_name, author_email,
    body, visibility, timecode_start_ms, timecode_end_ms,
    drawing, attachment_key
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: GetCommentByID :one
SELECT * FROM comments
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListCommentsByItemVersion :many
SELECT c.id, c.company_id, c.item_id, c.version_id, c.parent_id,
       c.author_user_id, c.author_visitor_id, c.author_name, c.author_email,
       c.body, c.visibility, c.timecode_start_ms, c.timecode_end_ms,
       c.drawing, c.attachment_key, c.resolved_at, c.resolved_by,
       c.created_at, c.updated_at,
       u.name as user_name, u.email as user_email,
       r_u.name as resolved_by_name,
       (SELECT COUNT(*)::int FROM comments rep WHERE rep.parent_id = c.id AND rep.deleted_at IS NULL AND ($4::boolean = TRUE OR rep.visibility = 'everyone')) as reply_count
FROM comments c
LEFT JOIN users u ON u.id = c.author_user_id
LEFT JOIN users r_u ON r_u.id = c.resolved_by
WHERE c.company_id = $1
  AND c.item_id = $2
  AND (c.version_id = $3 OR $3 IS NULL)
  AND c.parent_id IS NULL
  AND c.deleted_at IS NULL
  AND ($4::boolean = TRUE OR c.visibility = 'everyone')
ORDER BY c.timecode_start_ms ASC NULLS FIRST, c.created_at ASC;

-- name: ListCommentReplies :many
SELECT c.id, c.company_id, c.item_id, c.version_id, c.parent_id,
       c.author_user_id, c.author_visitor_id, c.author_name, c.author_email,
       c.body, c.visibility, c.timecode_start_ms, c.timecode_end_ms,
       c.drawing, c.attachment_key, c.resolved_at, c.resolved_by,
       c.created_at, c.updated_at,
       u.name as user_name, u.email as user_email,
       r_u.name as resolved_by_name
FROM comments c
LEFT JOIN users u ON u.id = c.author_user_id
LEFT JOIN users r_u ON r_u.id = c.resolved_by
WHERE c.parent_id = $1
  AND c.company_id = $2
  AND c.deleted_at IS NULL
  AND ($3::boolean = TRUE OR c.visibility = 'everyone')
ORDER BY c.created_at ASC;

-- name: UpdateComment :one
UPDATE comments
SET body = $3, drawing = $4, updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteComment :exec
UPDATE comments
SET deleted_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ResolveComment :one
UPDATE comments
SET resolved_at = NOW(), resolved_by = $3, updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: ReopenComment :one
UPDATE comments
SET resolved_at = NULL, resolved_by = NULL, updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: CountCommentsByItemVersion :one
SELECT COUNT(*)::int
FROM comments
WHERE company_id = $1
  AND item_id = $2
  AND (version_id = $3 OR $3 IS NULL)
  AND deleted_at IS NULL
  AND ($4::boolean = TRUE OR visibility = 'everyone');

-- name: CreateReview :one
INSERT INTO reviews (company_id, item_id, version_id, user_id, visitor_id, author_name, decision, note)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListReviewsByItem :many
SELECT r.id, r.company_id, r.item_id, r.version_id, r.user_id, r.visitor_id,
       r.author_name, r.decision, r.note, r.created_at,
       u.name as user_name, u.email as user_email,
       fv.number as version_number
FROM reviews r
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN file_versions fv ON fv.id = r.version_id
WHERE r.company_id = $1 AND r.item_id = $2
ORDER BY r.created_at DESC;

-- name: UpdateItemReviewStatus :one
UPDATE items
SET review_status = $3, updated_at = NOW()
WHERE id = $1 AND company_id = $2
RETURNING id, company_id, project_id, parent_id, kind, name, review_status, locked, updated_at;

-- name: UpdateVersionMetadataAndPreview :one
UPDATE file_versions
SET duration_ms = $3, width = $4, height = $5, fps = $6,
    preview_status = $7, preview_keys = $8
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: UpdateVersionPreviewStatus :one
UPDATE file_versions
SET preview_status = $3
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: ListReviewsFeed :many
SELECT i.id, i.company_id, i.project_id, i.parent_id, i.kind, i.name,
       i.review_status, i.locked, i.created_at, i.updated_at,
       p.name as project_name,
       fv.id as latest_version_id,
       fv.number as latest_version_number,
       fv.preview_status as latest_preview_status,
       fv.duration_ms, fv.width, fv.height,
       (SELECT COUNT(*)::int FROM comments c WHERE c.item_id = i.id AND c.deleted_at IS NULL AND c.resolved_at IS NULL AND ($3::boolean = TRUE OR c.visibility = 'everyone')) as unresolved_comment_count
FROM items i
JOIN projects p ON p.id = i.project_id
LEFT JOIN file_versions fv ON fv.item_id = i.id AND fv.number = (
    SELECT MAX(number) FROM file_versions sub WHERE sub.item_id = i.id
)
WHERE i.company_id = $1
  AND i.deleted_at IS NULL
  AND i.kind = 'file'
  AND (i.video_count > 0 OR i.name ILIKE '%.mp4' OR i.name ILIKE '%.mov' OR i.name ILIKE '%.m4v' OR i.name ILIKE '%.webm' OR i.name ILIKE '%.avi' OR i.name ILIKE '%.mp3' OR i.name ILIKE '%.wav')
  AND ($2::uuid[] IS NULL OR i.project_id = ANY($2::uuid[]))
ORDER BY i.updated_at DESC;

-- name: GetFileVersionByID :one
SELECT * FROM file_versions
WHERE id = $1;

-- name: ListPendingVideoVersions :many
SELECT id, company_id, item_id, storage_key, mime, preview_status
FROM file_versions
WHERE preview_status = 'pending'
ORDER BY created_at ASC;

-- name: GetShareVisitorByID :one
SELECT * FROM share_visitors
WHERE id = $1;

