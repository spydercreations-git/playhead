-- +goose Up

-- 1. Comments table
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    version_id UUID REFERENCES file_versions(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_visitor_id UUID REFERENCES share_visitors(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL DEFAULT '',
    author_email VARCHAR(255) NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'everyone', -- 'everyone' | 'team'
    timecode_start_ms INT,
    timecode_end_ms INT,
    drawing JSONB,
    attachment_key VARCHAR(512),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comments_item_version ON comments(company_id, item_id, version_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_visibility ON comments(company_id, item_id, visibility);

-- 2. Reviews table (approval and changes requested decisions)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visitor_id UUID REFERENCES share_visitors(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL DEFAULT '',
    decision VARCHAR(32) NOT NULL, -- 'approved' | 'changes_requested'
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_item_version ON reviews(company_id, item_id, version_id);
CREATE INDEX IF NOT EXISTS idx_reviews_company ON reviews(company_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS comments;
