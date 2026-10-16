-- +goose Up
-- 1. Support My Drive owner-scoped items and default folder protection
ALTER TABLE items
    ADD COLUMN IF NOT EXISTS drive_owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS is_default_folder BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS category VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_items_drive_owner ON items(company_id, drive_owner_id) WHERE project_id IS NULL;

-- 2. Allow resumable uploads into My Drive (without requiring project_id)
ALTER TABLE uploads ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS drive_owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 3. Recent items table for Home and Drive activity tracking
CREATE TABLE IF NOT EXISTS recent_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    item_type VARCHAR(32) NOT NULL DEFAULT 'file',
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recent_items_user_item UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_recent_items_user_viewed ON recent_items(user_id, viewed_at DESC);

-- +goose Down
DROP TABLE IF EXISTS recent_items;
ALTER TABLE uploads DROP COLUMN IF EXISTS drive_owner_id;
ALTER TABLE uploads ALTER COLUMN project_id SET NOT NULL;
DROP INDEX IF EXISTS idx_items_drive_owner;
ALTER TABLE items
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS is_default_folder,
    DROP COLUMN IF EXISTS drive_owner_id;
