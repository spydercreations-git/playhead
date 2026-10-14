-- +goose Up

-- 1. Alter companies for storage tracking, reservation, and alert thresholds
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS storage_reserved_bytes BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS storage_last_alert_gb INT NOT NULL DEFAULT 0;

-- Move Idyll Productions to internal pay-as-you-go plan
UPDATE companies
SET plan = 'internal', storage_limit_bytes = 0
WHERE name ILIKE '%idyll%' OR slug ILIKE '%idyll%';

-- 2. Add video_count to items
ALTER TABLE items
    ADD COLUMN IF NOT EXISTS video_count INT NOT NULL DEFAULT 0;

-- 3. File versions table
CREATE TABLE IF NOT EXISTS file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    number INT NOT NULL DEFAULT 1,
    storage_key VARCHAR(512) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    mime VARCHAR(128) NOT NULL,
    duration_ms INT,
    width INT,
    height INT,
    fps NUMERIC(6,2),
    preview_status VARCHAR(32) NOT NULL DEFAULT 'none',
    preview_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_file_versions_item_number UNIQUE(item_id, number)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_company_id ON file_versions(company_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_item_id ON file_versions(item_id);

-- 4. Uploads table (for resumable multipart uploads)
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES items(id) ON DELETE SET NULL,
    target_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime VARCHAR(128) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    upload_id VARCHAR(255) NOT NULL,
    part_size_bytes BIGINT NOT NULL,
    total_parts INT NOT NULL,
    completed_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, completed, aborted
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_company_id ON uploads(company_id);
CREATE INDEX IF NOT EXISTS idx_uploads_project_id ON uploads(project_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status_expires ON uploads(status, expires_at);

-- 5. Stars table
CREATE TABLE IF NOT EXISTS stars (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_stars_company_user ON stars(company_id, user_id);

-- 6. Activity log
CREATE TABLE IF NOT EXISTS activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_company_project ON activity(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_activity_item_id ON activity(item_id);

-- +goose Down
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS stars;
DROP TABLE IF EXISTS uploads;
DROP TABLE IF EXISTS file_versions;
ALTER TABLE items DROP COLUMN IF EXISTS video_count;
ALTER TABLE companies DROP COLUMN IF EXISTS storage_last_alert_gb;
ALTER TABLE companies DROP COLUMN IF EXISTS storage_reserved_bytes;
