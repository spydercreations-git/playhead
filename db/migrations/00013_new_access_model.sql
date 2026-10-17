-- +goose Up

-- 1. Remove Restricted completely from projects and items
ALTER TABLE projects DROP COLUMN IF EXISTS is_restricted;
ALTER TABLE items DROP COLUMN IF EXISTS is_restricted;

-- 2. Add access_type and can_change_roles to roles table
ALTER TABLE roles 
    ADD COLUMN IF NOT EXISTS access_type VARCHAR(32) NOT NULL DEFAULT 'per_project',
    ADD COLUMN IF NOT EXISTS can_change_roles BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Seed new team roles and migrate existing users
-- +goose StatementBegin
DO $$
DECLARE
    comp RECORD;
    ceo_id UUID;
    coo_id UUID;
    cfo_id UUID;
    cso_id UUID;
    design_id UUID;
    pm_id UUID;
    editor_id UUID;
    all_perms JSONB := '[
        "clients.view_all", "clients.create", "clients.edit", "clients.delete",
        "projects.view_all", "projects.create", "projects.archive", "projects.delete", "projects.manage_people",
        "files.delete_forever", "files.empty_trash", "files.download_all",
        "sharing.create_public_links",
        "team.invite", "team.change_roles", "team.manage_roles",
        "admin.storage", "admin.settings"
    ]'::jsonb;
    pm_perms JSONB := '[
        "projects.create", "projects.archive", "files.download_all"
    ]'::jsonb;
    editor_perms JSONB := '[
        "files.download_all"
    ]'::jsonb;
BEGIN
    FOR comp IN SELECT id FROM companies LOOP
        -- CEO (Harsh)
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'CEO', '#0066FF', all_perms, TRUE, 'full_access', TRUE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'full_access', can_change_roles = TRUE, permissions = all_perms
        RETURNING id INTO ceo_id;
        IF ceo_id IS NULL THEN
            SELECT id INTO ceo_id FROM roles WHERE company_id = comp.id AND name = 'CEO';
        END IF;

        -- COO (Rohit)
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'COO', '#0066FF', all_perms, TRUE, 'full_access', TRUE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'full_access', can_change_roles = TRUE, permissions = all_perms
        RETURNING id INTO coo_id;
        IF coo_id IS NULL THEN
            SELECT id INTO coo_id FROM roles WHERE company_id = comp.id AND name = 'COO';
        END IF;

        -- CFO
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'CFO', '#0066FF', all_perms, FALSE, 'full_access', FALSE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'full_access', can_change_roles = FALSE, permissions = all_perms
        RETURNING id INTO cfo_id;

        -- Chief Sales Officer
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'Chief Sales Officer', '#0066FF', all_perms, FALSE, 'full_access', FALSE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'full_access', can_change_roles = FALSE, permissions = all_perms
        RETURNING id INTO cso_id;

        -- Design Head
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'Design Head', '#0066FF', all_perms, FALSE, 'full_access', FALSE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'full_access', can_change_roles = FALSE, permissions = all_perms
        RETURNING id INTO design_id;

        -- Project Manager
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'Project Manager', '#10B981', pm_perms, FALSE, 'per_project', FALSE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'per_project', can_change_roles = FALSE, permissions = pm_perms
        RETURNING id INTO pm_id;
        IF pm_id IS NULL THEN
            SELECT id INTO pm_id FROM roles WHERE company_id = comp.id AND name = 'Project Manager';
        END IF;

        -- Editor
        INSERT INTO roles (company_id, name, color, permissions, is_system, access_type, can_change_roles)
        VALUES (comp.id, 'Editor', '#8B5CF6', editor_perms, FALSE, 'per_project', FALSE)
        ON CONFLICT (company_id, name) DO UPDATE 
            SET access_type = 'per_project', can_change_roles = FALSE, permissions = editor_perms
        RETURNING id INTO editor_id;
        IF editor_id IS NULL THEN
            SELECT id INTO editor_id FROM roles WHERE company_id = comp.id AND name = 'Editor';
        END IF;

        -- Migrate existing memberships:
        -- Harsh -> CEO
        UPDATE memberships m
        SET role_id = ceo_id, role = 'ceo'
        FROM users u
        WHERE m.user_id = u.id AND m.company_id = comp.id
          AND LOWER(u.email) LIKE 'harsh@%';

        -- Rohit -> COO
        UPDATE memberships m
        SET role_id = coo_id, role = 'coo'
        FROM users u
        WHERE m.user_id = u.id AND m.company_id = comp.id
          AND LOWER(u.email) LIKE 'rohit@%';

        -- Other Admins/Owners -> COO
        UPDATE memberships m
        SET role_id = coo_id, role = 'coo'
        FROM users u
        WHERE m.user_id = u.id AND m.company_id = comp.id
          AND m.role IN ('admin', 'owner')
          AND LOWER(u.email) NOT LIKE 'harsh@%'
          AND LOWER(u.email) NOT LIKE 'rohit@%';

        -- Managers -> Project Manager
        UPDATE memberships m
        SET role_id = pm_id, role = 'project_manager'
        WHERE m.company_id = comp.id AND m.role = 'manager';

        -- Editors / Others -> Editor
        UPDATE memberships m
        SET role_id = editor_id, role = 'editor'
        WHERE m.company_id = comp.id AND m.role NOT IN ('ceo', 'coo', 'project_manager');

        -- Remove old Admin and Manager role records
        DELETE FROM roles WHERE company_id = comp.id AND name IN ('Admin', 'Manager');
    END LOOP;
END $$;
-- +goose StatementEnd

-- 4. Update grants constraint/comments to document full, editor, uploader, commenter, viewer
COMMENT ON COLUMN grants.level IS 'Access level: full, editor, uploader, commenter, viewer, none';

-- +goose Down
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE roles DROP COLUMN IF EXISTS can_change_roles;
ALTER TABLE roles DROP COLUMN IF EXISTS access_type;
