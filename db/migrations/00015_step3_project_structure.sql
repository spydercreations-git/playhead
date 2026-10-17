-- +goose Up

-- 1. Add delete_batch_id to items, projects, and clients for cascade trash and atomic batch restore
ALTER TABLE items ADD COLUMN IF NOT EXISTS delete_batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_items_delete_batch_id ON items(delete_batch_id);

ALTER TABLE items ADD COLUMN IF NOT EXISTS is_tracker BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_items_is_tracker ON items(is_tracker);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS delete_batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_projects_delete_batch_id ON projects(delete_batch_id);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS delete_batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_clients_delete_batch_id ON clients(delete_batch_id);

-- 2. Mark existing trackers and ensure display name is 'Project tracker'
UPDATE items 
SET is_tracker = TRUE, name = 'Project tracker'
WHERE id IN (SELECT tracker_item_id FROM projects WHERE tracker_item_id IS NOT NULL);

-- 3. Move existing root files into 'Raw files' folder if present
-- +goose StatementBegin
DO $$
DECLARE
    proj RECORD;
    raw_folder_id UUID;
    root_files_count INT;
BEGIN
    FOR proj IN SELECT id, company_id FROM projects WHERE deleted_at IS NULL LOOP
        SELECT COUNT(*) INTO root_files_count
        FROM items
        WHERE project_id = proj.id AND parent_id IS NULL AND kind = 'file' AND deleted_at IS NULL;

        IF root_files_count > 0 THEN
            -- Check if 'Raw files' already exists at root of project
            SELECT id INTO raw_folder_id
            FROM items
            WHERE project_id = proj.id AND parent_id IS NULL AND kind = 'folder' AND name = 'Raw files' AND deleted_at IS NULL
            LIMIT 1;

            -- Create 'Raw files' if not present
            IF raw_folder_id IS NULL THEN
                INSERT INTO items (
                    id, company_id, project_id, parent_id, kind, name, position, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), proj.company_id, proj.id, NULL, 'folder', 'Raw files', 1, NOW(), NOW()
                ) RETURNING id INTO raw_folder_id;
            END IF;

            -- Move all root files into Raw files folder
            UPDATE items
            SET parent_id = raw_folder_id, updated_at = NOW()
            WHERE project_id = proj.id AND parent_id IS NULL AND kind = 'file' AND deleted_at IS NULL;
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE clients DROP COLUMN IF EXISTS delete_batch_id;
ALTER TABLE projects DROP COLUMN IF EXISTS delete_batch_id;
ALTER TABLE items DROP COLUMN IF EXISTS is_tracker;
ALTER TABLE items DROP COLUMN IF EXISTS delete_batch_id;
