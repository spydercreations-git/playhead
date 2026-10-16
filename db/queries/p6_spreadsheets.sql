-- name: CreateSpreadsheet :one
INSERT INTO spreadsheets (
    id, company_id, content_state, content_json, plain_text, public_plain_text, row_count, col_count, cell_count
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: GetSpreadsheet :one
SELECT s.*, 
       i.name AS title, 
       i.project_id, 
       i.parent_id, 
       i.created_by, 
       i.created_at AS item_created_at, 
       i.updated_at AS item_updated_at,
       COALESCE(p.name, 'My documents') AS project_name, 
       p.client_id, 
       COALESCE(c.name, '') AS client_name,
       u.name AS created_by_name, 
       u.email AS created_by_email
FROM spreadsheets s
JOIN items i ON i.id = s.id
LEFT JOIN projects p ON p.id = i.project_id
LEFT JOIN clients c ON c.id = p.client_id
LEFT JOIN users u ON u.id = i.created_by
WHERE s.id = $1 AND s.company_id = $2 AND i.deleted_at IS NULL;

-- name: UpdateSpreadsheetCollab :one
UPDATE spreadsheets
SET content_state = $3,
    content_json = $4,
    plain_text = $5,
    public_plain_text = $6,
    row_count = $7,
    col_count = $8,
    cell_count = $9,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: CreateSpreadsheetVersion :one
INSERT INTO spreadsheet_versions (
    spreadsheet_id, company_id, name, is_named, content_state, content_json, plain_text, created_by
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: ListSpreadsheetVersions :many
SELECT sv.*, 
       u.name AS author_name, 
       u.email AS author_email
FROM spreadsheet_versions sv
LEFT JOIN users u ON u.id = sv.created_by
WHERE sv.spreadsheet_id = $1 AND sv.company_id = $2
ORDER BY sv.created_at DESC;

-- name: GetSpreadsheetVersion :one
SELECT sv.*, 
       u.name AS author_name, 
       u.email AS author_email
FROM spreadsheet_versions sv
LEFT JOIN users u ON u.id = sv.created_by
WHERE sv.id = $1 AND sv.spreadsheet_id = $2 AND sv.company_id = $3;

-- name: CreateSpreadsheetComment :one
INSERT INTO spreadsheet_comments (
    spreadsheet_id, company_id, sheet_id, row_id, col_id, author_id, parent_comment_id, content
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: ListSpreadsheetComments :many
SELECT sc.*,
       u.name AS author_name,
       u.email AS author_email,
       u.avatar_url AS author_avatar_url
FROM spreadsheet_comments sc
JOIN users u ON u.id = sc.author_id
WHERE sc.spreadsheet_id = $1 AND sc.company_id = $2
ORDER BY sc.created_at ASC;

-- name: ResolveSpreadsheetComment :one
UPDATE spreadsheet_comments
SET resolved = TRUE,
    resolved_by = $3,
    resolved_at = NOW(),
    updated_at = NOW()
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: ListSpreadsheetsForCompany :many
SELECT s.id, 
       s.company_id, 
       s.row_count, 
       s.col_count, 
       s.cell_count, 
       s.updated_at,
       s.plain_text,
       s.public_plain_text,
       i.name AS title, 
       i.project_id, 
       i.parent_id, 
       i.created_by, 
       i.created_at,
       COALESCE(p.name, 'My documents') AS project_name, 
       p.client_id, 
       COALESCE(c.name, '') AS client_name,
       u.name AS created_by_name, 
       u.email AS created_by_email,
       EXISTS (
           SELECT 1 FROM stars st WHERE st.item_id = i.id AND st.user_id = @user_id
       ) AS is_starred
FROM spreadsheets s
JOIN items i ON i.id = s.id
LEFT JOIN projects p ON p.id = i.project_id
LEFT JOIN clients c ON c.id = p.client_id
LEFT JOIN users u ON u.id = i.created_by
WHERE s.company_id = @company_id
  AND i.deleted_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR p.client_id = sqlc.narg('client_id'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR i.project_id = sqlc.narg('project_id'))
  AND (
    i.project_id IS NOT NULL
    OR i.created_by = @user_id
  )
ORDER BY s.updated_at DESC;

-- name: SetProjectTrackerItemID :exec
UPDATE projects
SET tracker_item_id = $2,
    updated_at = NOW()
WHERE id = $1 AND company_id = $3;
