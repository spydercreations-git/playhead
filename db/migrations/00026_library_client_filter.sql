-- +goose Up
ALTER TABLE users
ADD COLUMN IF NOT EXISTS library_client_filter JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE users
DROP COLUMN IF EXISTS library_client_filter;
