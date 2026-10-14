-- +goose Up
ALTER TABLE share_links 
    ADD COLUMN IF NOT EXISTS password_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS upload_reserved_bytes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE uploads 
    ADD COLUMN IF NOT EXISTS share_link_id UUID REFERENCES share_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_share_link_id ON uploads(share_link_id);

-- +goose Down
DROP INDEX IF EXISTS idx_uploads_share_link_id;
ALTER TABLE uploads DROP COLUMN IF EXISTS share_link_id;
ALTER TABLE share_links DROP COLUMN IF EXISTS upload_reserved_bytes;
ALTER TABLE share_links DROP COLUMN IF EXISTS password_version;
