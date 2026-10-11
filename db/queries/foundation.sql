-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1 LIMIT 1;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 LIMIT 1;

-- name: CreateUser :one
INSERT INTO users (
    email, name, password_hash, google_id
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: GetCompanyByID :one
SELECT * FROM companies
WHERE id = $1 LIMIT 1;

-- name: CheckDatabaseHealth :one
SELECT 1 as healthy;
