-- +goose Up
CREATE TABLE IF NOT EXISTS pending_task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    declared_size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_task_attachments_created ON pending_task_attachments(created_at);

-- +goose Down
DROP TABLE IF EXISTS pending_task_attachments;
