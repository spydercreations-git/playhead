-- Tasks Queries (Phase 3)

-- name: ListTasksForStaff :many
SELECT t.id, t.company_id, t.client_id, t.project_id, t.name, t.status, t.deadline,
       t.description_title, t.description_json, t.description_html, t.position,
       t.created_by, t.created_at, t.updated_at,
       c.name AS client_name,
       p.name AS project_name,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.deleted_at IS NULL) AS total_comments_count,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.tab = 'client' AND tc.deleted_at IS NULL) AS client_comments_count,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.tab = 'internal' AND tc.deleted_at IS NULL) AS internal_comments_count
FROM tasks t
JOIN clients c ON c.id = t.client_id
LEFT JOIN projects p ON p.id = t.project_id
WHERE t.company_id = sqlc.arg('company_id')
  AND t.deleted_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR t.client_id = sqlc.narg('client_id'))
  AND (sqlc.narg('status')::text IS NULL OR sqlc.narg('status') = '' OR t.status = sqlc.narg('status'))
ORDER BY t.position ASC, t.created_at DESC;

-- name: ListTasksForEditor :many
SELECT t.id, t.company_id, t.client_id, t.project_id, t.name, t.status, t.deadline,
       t.description_title, t.description_json, t.description_html, t.position,
       t.created_by, t.created_at, t.updated_at,
       c.name AS client_name,
       p.name AS project_name,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.deleted_at IS NULL) AS total_comments_count,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.tab = 'client' AND tc.deleted_at IS NULL) AS client_comments_count,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.tab = 'internal' AND tc.deleted_at IS NULL) AS internal_comments_count
FROM tasks t
JOIN clients c ON c.id = t.client_id
LEFT JOIN projects p ON p.id = t.project_id
JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = sqlc.arg('user_id')
WHERE t.company_id = sqlc.arg('company_id')
  AND t.deleted_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR t.client_id = sqlc.narg('client_id'))
  AND (sqlc.narg('status')::text IS NULL OR sqlc.narg('status') = '' OR t.status = sqlc.narg('status'))
ORDER BY t.position ASC, t.created_at DESC;

-- name: ListTasksForClient :many
SELECT t.id, t.company_id, t.client_id, t.project_id, t.name, t.status, t.deadline,
       t.description_title, t.description_json, t.description_html, t.position,
       t.created_by, t.created_at, t.updated_at,
       c.name AS client_name,
       p.name AS project_name,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.tab = 'client' AND tc.deleted_at IS NULL) AS total_comments_count,
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.tab = 'client' AND tc.deleted_at IS NULL) AS client_comments_count,
       0::bigint AS internal_comments_count
FROM tasks t
JOIN clients c ON c.id = t.client_id
LEFT JOIN projects p ON p.id = t.project_id
WHERE t.company_id = sqlc.arg('company_id')
  AND t.client_id = sqlc.arg('client_id')
  AND t.deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR sqlc.narg('status') = '' OR t.status = sqlc.narg('status'))
ORDER BY t.position ASC, t.created_at DESC;

-- name: GetTaskByID :one
SELECT t.id, t.company_id, t.client_id, t.project_id, t.name, t.status, t.deadline,
       t.description_title, t.description_json, t.description_html, t.position,
       t.created_by, t.created_at, t.updated_at, t.deleted_at,
       c.name AS client_name,
       p.name AS project_name
FROM tasks t
JOIN clients c ON c.id = t.client_id
LEFT JOIN projects p ON p.id = t.project_id
WHERE t.id = $1 AND t.company_id = $2;

-- name: CreateTask :one
INSERT INTO tasks (
    company_id, client_id, project_id, name, status, deadline,
    description_title, description_json, description_html, position, created_by
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11
) RETURNING *;

-- name: UpdateTaskDetails :one
UPDATE tasks
SET name = $3,
    deadline = $4,
    description_title = $5,
    description_json = $6,
    description_html = $7,
    project_id = $8,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateTaskStatus :one
UPDATE tasks
SET status = $3,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateTaskPosition :exec
UPDATE tasks
SET position = $3,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2;

-- name: SoftDeleteTask :exec
UPDATE tasks
SET deleted_at = NOW(),
    deleted_by = $3,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: RestoreTask :exec
UPDATE tasks
SET deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2;

-- name: PermanentDeleteTask :exec
DELETE FROM tasks
WHERE id = $1 AND company_id = $2;

-- name: ListTrashTasks :many
SELECT t.id, t.company_id, t.client_id, t.project_id, t.name, t.status, t.deadline,
       t.deleted_at, t.deleted_by, u.name AS deleted_by_name,
       c.name AS client_name
FROM tasks t
JOIN clients c ON c.id = t.client_id
LEFT JOIN users u ON u.id = t.deleted_by
WHERE t.company_id = $1 AND t.deleted_at IS NOT NULL
ORDER BY t.deleted_at DESC;

-- Assignees
-- name: ListTaskAssignees :many
SELECT u.id, u.name, u.email, u.avatar_url, m.role, ta.assigned_at
FROM task_assignees ta
JOIN users u ON u.id = ta.user_id
LEFT JOIN memberships m ON m.user_id = u.id AND m.company_id = $2
WHERE ta.task_id = $1
ORDER BY ta.assigned_at ASC;

-- name: IsUserAssignedToTask :one
SELECT EXISTS(
    SELECT 1 FROM task_assignees
    WHERE task_id = $1 AND user_id = $2
) AS is_assigned;

-- name: AddTaskAssignee :exec
INSERT INTO task_assignees (task_id, user_id, assigned_by, assigned_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (task_id, user_id) DO NOTHING;

-- name: RemoveTaskAssignee :exec
DELETE FROM task_assignees
WHERE task_id = $1 AND user_id = $2;

-- Links
-- name: ListTaskLinks :many
SELECT tl.id, tl.task_id, tl.title, tl.url, tl.library_item_id, tl.position, tl.created_at,
       i.name AS library_item_name, i.kind AS library_item_kind
FROM task_links tl
LEFT JOIN items i ON i.id = tl.library_item_id
WHERE tl.task_id = $1
ORDER BY tl.position ASC, tl.created_at ASC;

-- name: CountTaskLinks :one
SELECT COUNT(*) FROM task_links WHERE task_id = $1;

-- name: CreateTaskLink :one
INSERT INTO task_links (task_id, title, url, library_item_id, position)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: DeleteTaskLink :exec
DELETE FROM task_links
WHERE id = $1 AND task_id = $2;

-- Comments
-- name: ListTaskCommentsByTab :many
SELECT tc.id, tc.company_id, tc.task_id, tc.tab, tc.user_id, tc.body,
       tc.reply_to_comment_id, tc.is_history, tc.deleted_at, tc.created_at, tc.updated_at,
       u.name AS user_name, u.email AS user_email, u.avatar_url AS user_avatar_url,
       m.role AS user_role,
       reply.body AS reply_body,
       reply_u.name AS reply_user_name
FROM task_comments tc
JOIN users u ON u.id = tc.user_id
LEFT JOIN memberships m ON m.user_id = u.id AND m.company_id = tc.company_id
LEFT JOIN task_comments reply ON reply.id = tc.reply_to_comment_id
LEFT JOIN users reply_u ON reply_u.id = reply.user_id
WHERE tc.task_id = $1
  AND tc.tab = $2
ORDER BY tc.created_at ASC;

-- name: GetTaskCommentByID :one
SELECT tc.id, tc.company_id, tc.task_id, tc.tab, tc.user_id, tc.body,
       tc.reply_to_comment_id, tc.is_history, tc.deleted_at, tc.created_at, tc.updated_at,
       u.name AS user_name, u.email AS user_email, u.avatar_url AS user_avatar_url
FROM task_comments tc
JOIN users u ON u.id = tc.user_id
WHERE tc.id = $1 AND tc.company_id = $2;

-- name: CreateTaskComment :one
INSERT INTO task_comments (
    company_id, task_id, tab, user_id, body, reply_to_comment_id, is_history
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: UpdateTaskComment :one
UPDATE task_comments
SET body = $3,
    updated_at = NOW()
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteTaskComment :exec
UPDATE task_comments
SET deleted_at = NOW(),
    body = 'Message deleted',
    updated_at = NOW()
WHERE id = $1 AND user_id = $2;

-- Attachments
-- name: CreateTaskCommentAttachment :one
INSERT INTO task_comment_attachments (
    comment_id, storage_key, filename, mime, size_bytes
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: ListTaskCommentAttachments :many
SELECT id, comment_id, storage_key, filename, mime, size_bytes, created_at
FROM task_comment_attachments
WHERE comment_id = $1
ORDER BY created_at ASC;

-- name: ListAttachmentsForTaskComments :many
SELECT a.id, a.comment_id, a.storage_key, a.filename, a.mime, a.size_bytes, a.created_at
FROM task_comment_attachments a
JOIN task_comments tc ON tc.id = a.comment_id
WHERE tc.task_id = $1 AND tc.tab = $2;

-- name: GetTaskCommentAttachmentByID :one
SELECT a.id, a.comment_id, a.storage_key, a.filename, a.mime, a.size_bytes, a.created_at,
       tc.company_id, tc.task_id, tc.tab
FROM task_comment_attachments a
JOIN task_comments tc ON tc.id = a.comment_id
WHERE a.id = $1;
