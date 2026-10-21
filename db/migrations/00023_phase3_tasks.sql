-- +goose Up
-- Migration 00023: Phase 3 Tasks (Work tracking, task panel, comments, attachments)

-- 1. Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'not_started',
    deadline TIMESTAMPTZ,
    description_title TEXT NOT NULL DEFAULT 'Brief',
    description_json JSONB NOT NULL DEFAULT '{}',
    description_html TEXT NOT NULL DEFAULT '',
    position NUMERIC NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_company_client ON tasks(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(company_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);

-- 2. Task Assignees table (staff and editors added to task)
CREATE TABLE IF NOT EXISTS task_assignees (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- 3. Task Links table (max 15 links per task)
CREATE TABLE IF NOT EXISTS task_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT,
    library_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_links_task_id ON task_links(task_id, position ASC);

-- 4. Task Comments table (strictly separated by tab: 'client' or 'internal')
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tab VARCHAR(16) NOT NULL, -- 'client' or 'internal'
    user_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    reply_to_comment_id UUID REFERENCES task_comments(id) ON DELETE SET NULL,
    is_history BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_tab ON task_comments(task_id, tab, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_task_comments_reply ON task_comments(reply_to_comment_id) WHERE reply_to_comment_id IS NOT NULL;

-- 5. Task Comment Attachments (up to 30 MB per file)
CREATE TABLE IF NOT EXISTS task_comment_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comment_attachments_comment ON task_comment_attachments(comment_id);

-- +goose Down
DROP TABLE IF EXISTS task_comment_attachments;
DROP TABLE IF EXISTS task_comments;
DROP TABLE IF EXISTS task_links;
DROP TABLE IF EXISTS task_assignees;
DROP TABLE IF EXISTS tasks;
