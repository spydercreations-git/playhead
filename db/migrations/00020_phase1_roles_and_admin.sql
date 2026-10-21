-- +goose Up

-- 1. Add title, permissions, and status to memberships
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS title VARCHAR(255),
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated'));

CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

-- 2. Create admin_audit_logs table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    target_user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_target ON admin_audit_logs(company_id, target_user_id, created_at DESC);

-- 3. Ensure Staff, Editor, Client roles exist for each company
-- +goose StatementBegin
DO $$
DECLARE
    comp RECORD;
    staff_id UUID;
    editor_id UUID;
    client_id UUID;
BEGIN
    FOR comp IN SELECT id FROM companies LOOP
        -- Staff role
        INSERT INTO roles (company_id, name, color, permissions, is_system)
        VALUES (comp.id, 'Staff', '#4876F3', '[]'::jsonb, TRUE)
        ON CONFLICT (company_id, name) DO NOTHING
        RETURNING id INTO staff_id;

        IF staff_id IS NULL THEN
            SELECT id INTO staff_id FROM roles WHERE company_id = comp.id AND name = 'Staff';
        END IF;

        -- Editor role
        INSERT INTO roles (company_id, name, color, permissions, is_system)
        VALUES (comp.id, 'Editor', '#71717A', '[]'::jsonb, TRUE)
        ON CONFLICT (company_id, name) DO NOTHING
        RETURNING id INTO editor_id;

        IF editor_id IS NULL THEN
            SELECT id INTO editor_id FROM roles WHERE company_id = comp.id AND name = 'Editor';
        END IF;

        -- Client role
        INSERT INTO roles (company_id, name, color, permissions, is_system)
        VALUES (comp.id, 'Client', '#3FCF8E', '[]'::jsonb, TRUE)
        ON CONFLICT (company_id, name) DO NOTHING
        RETURNING id INTO client_id;

        IF client_id IS NULL THEN
            SELECT id INTO client_id FROM roles WHERE company_id = comp.id AND name = 'Client';
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- 4. Migrate existing memberships to Staff, Editor, or Client with their individual permissions and titles
-- +goose StatementBegin
DO $$
DECLARE
    m RECORD;
    r_name VARCHAR(64);
    new_role_id UUID;
    is_ceo_coo BOOLEAN;
    is_editor BOOLEAN;
    is_client BOOLEAN;
BEGIN
    FOR m IN 
        SELECT mem.id, mem.company_id, mem.role, mem.role_id, r.name as existing_role_name
        FROM memberships mem
        LEFT JOIN roles r ON mem.role_id = r.id
    LOOP
        r_name := COALESCE(m.existing_role_name, m.role, 'Staff');
        is_ceo_coo := (LOWER(r_name) IN ('ceo', 'coo') OR LOWER(m.role) IN ('ceo', 'coo'));
        is_editor := (LOWER(r_name) = 'editor' OR LOWER(m.role) = 'editor');
        is_client := (LOWER(r_name) = 'client' OR LOWER(m.role) = 'client');

        IF is_editor THEN
            SELECT id INTO new_role_id FROM roles WHERE company_id = m.company_id AND name = 'Editor';
            UPDATE memberships
            SET role = 'Editor',
                role_id = new_role_id,
                title = NULL,
                status = 'active',
                permissions = '{
                    "admin": false,
                    "manage_access": false,
                    "create_project": false,
                    "rename_project": false,
                    "delete_project": false,
                    "move_items": true,
                    "copy_items": true,
                    "delete_items": false,
                    "create_task": false,
                    "delete_task": false,
                    "change_task_status": true,
                    "invite_people": false
                }'::jsonb
            WHERE id = m.id;
        ELSIF is_client THEN
            SELECT id INTO new_role_id FROM roles WHERE company_id = m.company_id AND name = 'Client';
            UPDATE memberships
            SET role = 'Client',
                role_id = new_role_id,
                title = NULL,
                status = 'active',
                permissions = '{
                    "admin": false,
                    "manage_access": false,
                    "create_project": true,
                    "rename_project": false,
                    "delete_project": false,
                    "move_items": false,
                    "copy_items": false,
                    "delete_items": false,
                    "create_task": true,
                    "delete_task": false,
                    "change_task_status": false,
                    "invite_people": false
                }'::jsonb
            WHERE id = m.id;
        ELSE
            -- Staff
            SELECT id INTO new_role_id FROM roles WHERE company_id = m.company_id AND name = 'Staff';
            UPDATE memberships
            SET role = 'Staff',
                role_id = new_role_id,
                title = CASE 
                    WHEN is_ceo_coo THEN UPPER(r_name)
                    WHEN LOWER(r_name) = 'cfo' THEN 'CFO'
                    WHEN LOWER(r_name) = 'cso' OR LOWER(r_name) = 'chief sales officer' THEN 'Chief Sales Officer'
                    WHEN LOWER(r_name) = 'design head' THEN 'Design Head'
                    WHEN LOWER(r_name) = 'project manager' THEN 'Project Manager'
                    WHEN LOWER(r_name) IN ('admin', 'owner') THEN 'Administrator'
                    ELSE INITCAP(r_name)
                END,
                status = 'active',
                permissions = jsonb_build_object(
                    'admin', is_ceo_coo,
                    'manage_access', true,
                    'create_project', true,
                    'rename_project', true,
                    'delete_project', true,
                    'move_items', true,
                    'copy_items', true,
                    'delete_items', true,
                    'create_task', true,
                    'delete_task', true,
                    'change_task_status', true,
                    'invite_people', true
                )
            WHERE id = m.id;
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- 5. Set default values for memberships table
ALTER TABLE memberships ALTER COLUMN role SET DEFAULT 'Staff';

-- +goose Down
DROP TABLE IF EXISTS admin_audit_logs;
DROP INDEX IF EXISTS idx_memberships_status;
ALTER TABLE memberships DROP COLUMN IF EXISTS status;
ALTER TABLE memberships DROP COLUMN IF EXISTS permissions;
ALTER TABLE memberships DROP COLUMN IF EXISTS title;
