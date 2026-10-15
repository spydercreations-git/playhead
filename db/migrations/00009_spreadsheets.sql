-- +goose Up

-- 1. Spreadsheets table
CREATE TABLE IF NOT EXISTS spreadsheets (
    id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    content_state BYTEA,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    plain_text TEXT NOT NULL DEFAULT '',
    public_plain_text TEXT NOT NULL DEFAULT '',
    row_count INT NOT NULL DEFAULT 0,
    col_count INT NOT NULL DEFAULT 0,
    cell_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spreadsheets_company_id ON spreadsheets(company_id);

-- 2. Spreadsheet versions table
CREATE TABLE IF NOT EXISTS spreadsheet_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spreadsheet_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255),
    is_named BOOLEAN NOT NULL DEFAULT FALSE,
    content_state BYTEA NOT NULL,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    plain_text TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sheet_versions_spreadsheet_id ON spreadsheet_versions(spreadsheet_id);
CREATE INDEX IF NOT EXISTS idx_sheet_versions_company_id ON spreadsheet_versions(company_id);
CREATE INDEX IF NOT EXISTS idx_sheet_versions_created_at ON spreadsheet_versions(created_at DESC);

-- 3. Spreadsheet cell comments table
CREATE TABLE IF NOT EXISTS spreadsheet_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spreadsheet_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sheet_id VARCHAR(64) NOT NULL DEFAULT 'sheet_1',
    row_id VARCHAR(64) NOT NULL,
    col_id VARCHAR(64) NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES spreadsheet_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sheet_comments_spreadsheet ON spreadsheet_comments(spreadsheet_id);
CREATE INDEX IF NOT EXISTS idx_sheet_comments_cell ON spreadsheet_comments(spreadsheet_id, sheet_id, row_id, col_id);

-- +goose Down
DROP TABLE IF EXISTS spreadsheet_comments;
DROP TABLE IF EXISTS spreadsheet_versions;
DROP TABLE IF EXISTS spreadsheets;
