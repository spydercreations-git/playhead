-- +goose Up

-- 1. Migrate existing memberships roles to admin, manager, editor
UPDATE memberships SET role = 'admin' WHERE role = 'owner';
UPDATE memberships SET role = 'editor' WHERE role IN ('member', 'guest');
ALTER TABLE memberships ALTER COLUMN role SET DEFAULT 'editor';

-- 2. Login codes for passwordless 6-digit email sign-in
CREATE TABLE login_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_codes_email ON login_codes(email);
CREATE INDEX idx_login_codes_code_hash ON login_codes(code_hash);

-- 3. Clients
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    website TEXT,
    notes TEXT,
    notes_item_id UUID,
    logo_key TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_clients_company_id ON clients(company_id);
CREATE INDEX idx_clients_deleted_at ON clients(deleted_at);

-- 4. Client Contacts
CREATE TABLE client_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    default_level VARCHAR(32) NOT NULL DEFAULT 'none', -- none, viewer, commenter, uploader, full
    can_download BOOLEAN NOT NULL DEFAULT TRUE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    last_signed_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_client_contact_email UNIQUE(client_id, email)
);
CREATE INDEX idx_client_contacts_email ON client_contacts(email);
CREATE INDEX idx_client_contacts_company_id ON client_contacts(company_id);
CREATE INDEX idx_client_contacts_client_id ON client_contacts(client_id);

-- 5. Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, archived
    tracker_item_id UUID,
    file_count INT NOT NULL DEFAULT 0,
    folder_count INT NOT NULL DEFAULT 0,
    video_count INT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_projects_company_id ON projects(company_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);

-- 6. Items (Folder templates and files)
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES items(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL DEFAULT 'folder', -- folder, file, document, spreadsheet
    name VARCHAR(255) NOT NULL,
    position NUMERIC NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    file_count INT NOT NULL DEFAULT 0,
    folder_count INT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    review_status VARCHAR(32) NOT NULL DEFAULT 'none',
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id),
    original_parent_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_items_project_id ON items(project_id);
CREATE INDEX idx_items_parent_id ON items(parent_id);
CREATE INDEX idx_items_company_id ON items(company_id);

-- 7. Grants
CREATE TABLE grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    target_type VARCHAR(32) NOT NULL, -- project, item
    target_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    level VARCHAR(32) NOT NULL DEFAULT 'viewer', -- viewer, commenter, uploader, full
    can_download BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_grants_target_email UNIQUE(target_type, target_id, email)
);
CREATE INDEX idx_grants_company_id ON grants(company_id);
CREATE INDEX idx_grants_target ON grants(target_type, target_id);
CREATE INDEX idx_grants_email ON grants(email);
CREATE INDEX idx_grants_user_id ON grants(user_id);

-- +goose Down
DROP TABLE IF EXISTS grants;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS client_contacts;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS login_codes;
