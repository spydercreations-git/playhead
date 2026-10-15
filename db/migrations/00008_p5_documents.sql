-- +goose Up

-- 1. Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    content_state BYTEA,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    plain_text TEXT NOT NULL DEFAULT '',
    public_plain_text TEXT NOT NULL DEFAULT '',
    word_count INT NOT NULL DEFAULT 0,
    character_count INT NOT NULL DEFAULT 0,
    reading_time_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);

-- 2. Document versions table
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255),
    is_named BOOLEAN NOT NULL DEFAULT FALSE,
    content_state BYTEA NOT NULL,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    plain_text TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_company_id ON document_versions(company_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_created_at ON document_versions(created_at DESC);

-- 3. Document image assets table
CREATE TABLE IF NOT EXISTS document_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    storage_key VARCHAR(512) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INT,
    height INT,
    uploaded_by UUID REFERENCES users(id),
    in_team_notes BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_assets_document_id ON document_assets(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_assets_company_id ON document_assets(company_id);

-- +goose Down
DROP TABLE IF EXISTS document_assets;
DROP TABLE IF EXISTS document_versions;
DROP TABLE IF EXISTS documents;
