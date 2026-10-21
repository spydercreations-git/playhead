-- +goose Up
-- Migration 00022: Phase 2 Library enhancements

-- 1. Add audience column to share_links ('people_with_access' or 'anyone_with_link')
ALTER TABLE share_links
ADD COLUMN IF NOT EXISTS audience character varying(32) NOT NULL DEFAULT 'people_with_access';

-- 2. Add item_id to share_links for direct item link tracking
ALTER TABLE share_links
ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_share_links_item_id ON share_links(item_id);

-- 3. Create internal client "Idyll Productions" for each company if not exists
INSERT INTO clients (id, company_id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), c.id, 'Idyll Productions', 'active', NOW(), NOW()
FROM companies c
WHERE NOT EXISTS (
    SELECT 1 FROM clients cl WHERE cl.company_id = c.id AND LOWER(cl.name) = 'idyll productions'
);

-- 4. Move any projects without a client into "Idyll Productions"
UPDATE projects p
SET client_id = cl.id
FROM clients cl
WHERE cl.company_id = p.company_id
  AND LOWER(cl.name) = 'idyll productions'
  AND (p.client_id IS NULL OR NOT EXISTS (SELECT 1 FROM clients c2 WHERE c2.id = p.client_id));

-- 5. Seed default "Raw files" and "Edited files" root folders for projects that don't have them
INSERT INTO items (id, company_id, project_id, parent_id, kind, name, position, created_at, updated_at)
SELECT gen_random_uuid(), p.company_id, p.id, NULL, 'folder', 'Raw files', 1000, NOW(), NOW()
FROM projects p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM items i
      WHERE i.project_id = p.id AND i.parent_id IS NULL AND i.kind = 'folder' AND LOWER(i.name) = 'raw files' AND i.deleted_at IS NULL
  );

INSERT INTO items (id, company_id, project_id, parent_id, kind, name, position, created_at, updated_at)
SELECT gen_random_uuid(), p.company_id, p.id, NULL, 'folder', 'Edited files', 2000, NOW(), NOW()
FROM projects p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM items i
      WHERE i.project_id = p.id AND i.parent_id IS NULL AND i.kind = 'folder' AND LOWER(i.name) = 'edited files' AND i.deleted_at IS NULL
  );

-- 6. Refresh project folder counts
UPDATE projects p
SET folder_count = (
    SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.kind = 'folder' AND i.deleted_at IS NULL
);

-- +goose Down
DROP INDEX IF EXISTS idx_share_links_item_id;
ALTER TABLE share_links DROP COLUMN IF EXISTS item_id;
ALTER TABLE share_links DROP COLUMN IF EXISTS audience;
