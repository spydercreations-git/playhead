-- +goose Up
-- 1. Merge duplicate default folders for My Drive across companies
-- +goose StatementBegin
DO $$
DECLARE
    rec RECORD;
    canonical_id UUID;
BEGIN
    FOR rec IN 
        SELECT company_id, LOWER(category) as cat
        FROM items
        WHERE project_id IS NULL AND is_default_folder = TRUE AND category IS NOT NULL
        GROUP BY company_id, LOWER(category)
        HAVING COUNT(*) > 1
    LOOP
        -- Pick the earliest created folder as canonical
        SELECT id INTO canonical_id
        FROM items
        WHERE company_id = rec.company_id 
          AND project_id IS NULL 
          AND is_default_folder = TRUE 
          AND LOWER(category) = rec.cat
        ORDER BY created_at ASC, id ASC
        LIMIT 1;

        -- Re-parent items belonging to duplicate folders to the canonical folder
        UPDATE items
        SET parent_id = canonical_id
        WHERE parent_id IN (
            SELECT id FROM items
            WHERE company_id = rec.company_id
              AND project_id IS NULL
              AND is_default_folder = TRUE
              AND LOWER(category) = rec.cat
              AND id != canonical_id
        );

        -- Delete the duplicate default folders
        DELETE FROM items
        WHERE company_id = rec.company_id
          AND project_id IS NULL
          AND is_default_folder = TRUE
          AND LOWER(category) = rec.cat
          AND id != canonical_id;
    END LOOP;
END $$;
-- +goose StatementEnd

-- 2. Clear drive_owner_id on all My Drive items so they belong to the company shared drive
UPDATE items
SET drive_owner_id = NULL
WHERE project_id IS NULL;

-- 3. Clear drive_owner_id on uploads
UPDATE uploads
SET drive_owner_id = NULL
WHERE project_id IS NULL;

-- 4. Create unique constraint on (company_id, category) for shared default folders
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_company_default_folder 
ON items (company_id, LOWER(category)) 
WHERE project_id IS NULL AND is_default_folder = TRUE;

-- 5. Index for fast lookup of company shared drive items
CREATE INDEX IF NOT EXISTS idx_items_shared_drive 
ON items (company_id, parent_id) 
WHERE project_id IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_items_shared_drive;
DROP INDEX IF EXISTS uq_items_company_default_folder;
