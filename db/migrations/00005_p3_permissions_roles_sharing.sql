-- +goose Up

-- 1. Custom Roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(32) NOT NULL DEFAULT '#0066FF',
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_roles_company_name UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_company_id ON roles(company_id);

-- Seed initial system and starter roles for every existing company
-- +goose StatementBegin
DO $$
DECLARE
    comp RECORD;
    admin_id UUID;
    manager_id UUID;
    editor_id UUID;
    all_perms JSONB := '[
        "clients.view_all", "clients.create", "clients.edit", "clients.delete",
        "projects.view_all", "projects.create", "projects.archive", "projects.delete", "projects.manage_people",
        "files.delete_forever", "files.empty_trash", "files.download_all",
        "sharing.create_public_links",
        "team.invite", "team.change_roles", "team.manage_roles",
        "admin.storage", "admin.settings"
    ]'::jsonb;
    manager_perms JSONB := '[
        "clients.view_all", "clients.create", "clients.edit",
        "projects.view_all", "projects.create", "projects.archive", "projects.manage_people",
        "files.download_all",
        "sharing.create_public_links",
        "team.invite"
    ]'::jsonb;
    editor_perms JSONB := '[
        "files.download_all"
    ]'::jsonb;
BEGIN
    FOR comp IN SELECT id FROM companies LOOP
        -- Admin system role
        INSERT INTO roles (company_id, name, color, permissions, is_system)
        VALUES (comp.id, 'Admin', '#0066FF', all_perms, TRUE)
        ON CONFLICT (company_id, name) DO NOTHING
        RETURNING id INTO admin_id;

        IF admin_id IS NULL THEN
            SELECT id INTO admin_id FROM roles WHERE company_id = comp.id AND name = 'Admin';
        END IF;

        -- Manager starter role
        INSERT INTO roles (company_id, name, color, permissions, is_system)
        VALUES (comp.id, 'Manager', '#10B981', manager_perms, FALSE)
        ON CONFLICT (company_id, name) DO NOTHING
        RETURNING id INTO manager_id;

        IF manager_id IS NULL THEN
            SELECT id INTO manager_id FROM roles WHERE company_id = comp.id AND name = 'Manager';
        END IF;

        -- Editor starter role
        INSERT INTO roles (company_id, name, color, permissions, is_system)
        VALUES (comp.id, 'Editor', '#8B5CF6', editor_perms, FALSE)
        ON CONFLICT (company_id, name) DO NOTHING
        RETURNING id INTO editor_id;

        IF editor_id IS NULL THEN
            SELECT id INTO editor_id FROM roles WHERE company_id = comp.id AND name = 'Editor';
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- 2. Link memberships to roles
ALTER TABLE memberships
    ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_memberships_role_id ON memberships(role_id);

-- Backfill role_id from role column
UPDATE memberships m
SET role_id = r.id
FROM roles r
WHERE m.company_id = r.company_id
  AND (
      (m.role = 'admin' AND r.name = 'Admin') OR
      (m.role = 'manager' AND r.name = 'Manager') OR
      (m.role = 'editor' AND r.name = 'Editor') OR
      (m.role NOT IN ('admin', 'manager') AND r.name = 'Editor')
  )
  AND m.role_id IS NULL;

-- 3. Notification preferences
CREATE TABLE IF NOT EXISTS notification_prefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    in_app BOOLEAN NOT NULL DEFAULT TRUE,
    email BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_prefs_user_event UNIQUE(user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_prefs(user_id);

-- Project notification bell preferences
CREATE TABLE IF NOT EXISTS project_notification_prefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    level VARCHAR(32) NOT NULL DEFAULT 'mentions_and_mine', -- all, mentions_and_mine, off
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_notification_prefs UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_notification_prefs_user_project ON project_notification_prefs(user_id, project_id);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    email_frequency VARCHAR(32) NOT NULL DEFAULT 'instant', -- instant, daily_summary
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Share links & public sharing
CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    access VARCHAR(32) NOT NULL DEFAULT 'view', -- view, comment, upload, comment_upload
    allow_download BOOLEAN NOT NULL DEFAULT TRUE,
    latest_only BOOLEAN NOT NULL DEFAULT TRUE,
    password_hash VARCHAR(255),
    expires_at TIMESTAMPTZ,
    ask_identity BOOLEAN NOT NULL DEFAULT TRUE,
    upload_limit_bytes BIGINT,
    uploaded_bytes BIGINT NOT NULL DEFAULT 0,
    view_count INT NOT NULL DEFAULT 0,
    last_opened_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_token_hash ON share_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_share_links_project_id ON share_links(project_id);
CREATE INDEX IF NOT EXISTS idx_share_links_company_id ON share_links(company_id);

CREATE TABLE IF NOT EXISTS share_link_items (
    share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    PRIMARY KEY(share_link_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_share_link_items_item_id ON share_link_items(item_id);

CREATE TABLE IF NOT EXISTS share_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_share_visitors UNIQUE(share_link_id, email)
);

CREATE INDEX IF NOT EXISTS idx_share_visitors_link_id ON share_visitors(share_link_id);

-- +goose Down
DROP TABLE IF EXISTS share_visitors;
DROP TABLE IF EXISTS share_link_items;
DROP TABLE IF EXISTS share_links;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS project_notification_prefs;
DROP TABLE IF EXISTS notification_prefs;
ALTER TABLE memberships DROP COLUMN IF EXISTS role_id;
DROP TABLE IF EXISTS roles;
