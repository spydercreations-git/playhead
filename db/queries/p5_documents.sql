-- name: GetItemByIDOnly :one
SELECT * FROM items WHERE id = $1 AND deleted_at IS NULL;

-- name: CreateDocument :one
INSERT INTO documents (
    id, company_id, content_state, content_json, plain_text, public_plain_text, word_count, character_count, reading_time_seconds
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: GetDocument :one
SELECT d.*, 
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
FROM documents d
JOIN items i ON i.id = d.id
LEFT JOIN projects p ON p.id = i.project_id
LEFT JOIN clients c ON c.id = p.client_id
LEFT JOIN users u ON u.id = i.created_by
WHERE d.id = $1 AND d.company_id = $2 AND i.deleted_at IS NULL;

-- name: UpdateDocumentCollab :one
UPDATE documents
SET content_state = $3,
    content_json = $4,
    plain_text = $5,
    public_plain_text = $6,
    word_count = $7,
    character_count = $8,
    reading_time_seconds = $9,
    updated_at = NOW()
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: CreateDocumentVersion :one
INSERT INTO document_versions (
    document_id, company_id, name, is_named, content_state, content_json, plain_text, created_by
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: ListDocumentVersions :many
SELECT dv.*, 
       u.name AS author_name, 
       u.email AS author_email
FROM document_versions dv
LEFT JOIN users u ON u.id = dv.created_by
WHERE dv.document_id = $1 AND dv.company_id = $2
ORDER BY dv.created_at DESC;

-- name: GetDocumentVersion :one
SELECT dv.*, 
       u.name AS author_name, 
       u.email AS author_email
FROM document_versions dv
LEFT JOIN users u ON u.id = dv.created_by
WHERE dv.id = $1 AND dv.document_id = $2 AND dv.company_id = $3;

-- name: CreateDocumentAsset :one
INSERT INTO document_assets (
    document_id, company_id, storage_key, filename, mime, size_bytes, width, height, uploaded_by, in_team_notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetDocumentAsset :one
SELECT da.*
FROM document_assets da
WHERE da.id = $1 AND da.company_id = $2;

-- name: UpdateDocumentAssetInTeamNotes :exec
UPDATE document_assets
SET in_team_notes = $3
WHERE id = $1 AND company_id = $2;


