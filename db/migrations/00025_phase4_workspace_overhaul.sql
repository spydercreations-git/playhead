-- +goose Up
-- Migration 00025: Phase 4 Workspace Overhaul
-- 1. Move My Drive items to internal client "Idyll Productions" under project "From My Drive"
-- 2. Standalone Documents model with document_shares
-- 3. Remember user last upload destination on server
-- 4. activity_events table
-- 5. quick_links table
-- 6. Full-text search indexes
-- 7. Remove spreadsheets and tracker sheets

-- +goose StatementBegin
DO $$
DECLARE
    comp RECORD;
    idyll_client_id UUID;
    from_drive_proj_id UUID;
    drive_files_folder_id UUID;
BEGIN
    FOR comp IN SELECT id FROM companies LOOP
        -- 1. Ensure Idyll Productions client exists
        SELECT id INTO idyll_client_id FROM clients WHERE company_id = comp.id AND LOWER(name) = 'idyll productions' LIMIT 1;
        IF idyll_client_id IS NULL THEN
            INSERT INTO clients (id, company_id, name, status, created_at, updated_at)
            VALUES (gen_random_uuid(), comp.id, 'Idyll Productions', 'active', NOW(), NOW())
            RETURNING id INTO idyll_client_id;
        END IF;

        -- 2. Ensure 'From My Drive' project exists
        SELECT id INTO from_drive_proj_id FROM projects WHERE company_id = comp.id AND name = 'From My Drive' LIMIT 1;
        IF from_drive_proj_id IS NULL THEN
            INSERT INTO projects (id, company_id, client_id, name, created_at, updated_at)
            VALUES (gen_random_uuid(), comp.id, idyll_client_id, 'From My Drive', NOW(), NOW())
            RETURNING id INTO from_drive_proj_id;
        END IF;

        -- 3. Ensure 'My Drive files' folder exists inside 'From My Drive'
        SELECT id INTO drive_files_folder_id FROM items 
        WHERE project_id = from_drive_proj_id AND parent_id IS NULL AND kind = 'folder' AND name = 'My Drive files' LIMIT 1;
        IF drive_files_folder_id IS NULL THEN
            INSERT INTO items (id, company_id, project_id, parent_id, kind, name, position, created_at, updated_at)
            VALUES (gen_random_uuid(), comp.id, from_drive_proj_id, NULL, 'folder', 'My Drive files', 0, NOW(), NOW())
            RETURNING id INTO drive_files_folder_id;
        END IF;

        -- 4. Give project access to all staff of the company in grants table
        INSERT INTO grants (id, company_id, target_type, target_id, email, user_id, level, can_download, created_at, updated_at)
        SELECT gen_random_uuid(), comp.id, 'project', from_drive_proj_id, u.email, u.id, 'full', true, NOW(), NOW()
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.company_id = comp.id AND m.role = 'Staff'
          AND NOT EXISTS (
              SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = from_drive_proj_id AND g.email = u.email
          );

        -- 5. Move top-level folders from My Drive into project
        UPDATE items
        SET project_id = from_drive_proj_id, drive_owner_id = NULL, is_default_folder = FALSE
        WHERE company_id = comp.id AND project_id IS NULL AND parent_id IS NULL AND kind = 'folder' AND id != drive_files_folder_id;

        -- 6. Move top-level non-folders from My Drive into 'My Drive files' folder
        UPDATE items
        SET project_id = from_drive_proj_id, parent_id = drive_files_folder_id, drive_owner_id = NULL
        WHERE company_id = comp.id AND project_id IS NULL AND parent_id IS NULL AND kind != 'folder';

        -- 7. Move any remaining nested items from My Drive into project
        UPDATE items
        SET project_id = from_drive_proj_id, drive_owner_id = NULL
        WHERE company_id = comp.id AND project_id IS NULL;

        -- 8. Move uploads from My Drive
        UPDATE uploads
        SET project_id = from_drive_proj_id, drive_owner_id = NULL
        WHERE company_id = comp.id AND project_id IS NULL;

        -- 9. Refresh project counts
        UPDATE projects p
        SET folder_count = (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.kind = 'folder' AND i.deleted_at IS NULL),
            file_count = (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.kind = 'file' AND i.deleted_at IS NULL),
            total_bytes = (SELECT COALESCE(SUM(i.total_bytes), 0) FROM items i WHERE i.project_id = p.id AND i.deleted_at IS NULL)
        WHERE p.id = from_drive_proj_id;
    END LOOP;
END $$;
-- +goose StatementEnd

-- 2. Create document_shares table for standalone document sharing
CREATE TABLE IF NOT EXISTS document_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'view', -- 'view' or 'edit'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_document_shares_doc ON document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_document_shares_user ON document_shares(company_id, user_id);

-- Migrate project access for existing documents into document_shares
-- +goose StatementBegin
DO $$
DECLARE
    doc RECORD;
BEGIN
    FOR doc IN SELECT id, company_id, project_id, created_by FROM items WHERE kind = 'document' AND project_id IS NOT NULL LOOP
        -- Copy project grants to document shares
        INSERT INTO document_shares (id, company_id, document_id, user_id, role, created_at, updated_at)
        SELECT gen_random_uuid(), doc.company_id, doc.id, g.user_id,
               CASE WHEN g.level IN ('full', 'editor') THEN 'edit' ELSE 'view' END,
               NOW(), NOW()
        FROM grants g
        WHERE g.target_type = 'project' AND g.target_id = doc.project_id AND g.user_id IS NOT NULL
        ON CONFLICT (document_id, user_id) DO NOTHING;
    END LOOP;
END $$;
-- +goose StatementEnd

-- Detach documents from projects to make them standalone
UPDATE items
SET project_id = NULL, parent_id = NULL
WHERE kind = 'document';

-- 3. Remember user last upload destination on server
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_upload_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_upload_folder_id UUID REFERENCES items(id) ON DELETE SET NULL;

-- 4. Activity events table
CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id UUID NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_events_company_created ON activity_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_project ON activity_events(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_client ON activity_events(client_id);

-- 5. Quick links table
CREATE TABLE IF NOT EXISTS quick_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    position NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quick_links_user ON quick_links(company_id, user_id, position ASC, created_at DESC);

-- 6. Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_items_fts_name ON items USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_projects_fts_name ON projects USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_clients_fts_name ON clients USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_tasks_fts ON tasks USING gin (to_tsvector('english', name || ' ' || COALESCE(description_title, '') || ' ' || COALESCE(description_html, '')));
CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents USING gin (to_tsvector('english', plain_text));

-- 7. Remove spreadsheets tables and spreadsheet items (backed up in ~/playhead-backups/)
DROP TABLE IF EXISTS spreadsheet_comments CASCADE;
DROP TABLE IF EXISTS spreadsheet_versions CASCADE;
DROP TABLE IF EXISTS spreadsheets CASCADE;
DELETE FROM items WHERE kind = 'spreadsheet';

-- +goose Down
DROP TABLE IF EXISTS quick_links;
DROP TABLE IF EXISTS activity_events;
ALTER TABLE users DROP COLUMN IF EXISTS last_upload_project_id;
ALTER TABLE users DROP COLUMN IF EXISTS last_upload_folder_id;
DROP TABLE IF EXISTS document_shares;
DROP INDEX IF EXISTS idx_items_fts_name;
DROP INDEX IF EXISTS idx_projects_fts_name;
DROP INDEX IF EXISTS idx_clients_fts_name;
DROP INDEX IF EXISTS idx_tasks_fts;
DROP INDEX IF EXISTS idx_documents_fts;
