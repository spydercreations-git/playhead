-- +goose Up
-- Migration 00021: Migrate all legacy roles (admin, owner, manager, member, guest, ceo, etc.)
-- strictly into Staff, Editor, or Client, and enforce constraint.

-- 1. Migrate Admin and Owner -> Staff (keep title, turn on admin switch)
UPDATE memberships
SET role = 'Staff',
    title = COALESCE(NULLIF(title, ''), 'Admin'),
    permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{admin}', 'true')
WHERE LOWER(role) IN ('admin', 'owner');

-- 2. Migrate CEO and COO -> Staff (title kept or role uppercase, turn on admin switch)
UPDATE memberships
SET role = 'Staff',
    title = COALESCE(NULLIF(title, ''), UPPER(role)),
    permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{admin}', 'true')
WHERE LOWER(role) IN ('ceo', 'coo');

-- 3. Migrate other executive leadership -> Staff (keep title)
UPDATE memberships
SET role = 'Staff',
    title = COALESCE(NULLIF(title, ''), role)
WHERE LOWER(role) IN ('cfo', 'cso', 'chief sales officer', 'chief_sales_officer', 'design head', 'design_head', 'producer');

-- 4. Migrate Manager -> Staff (title 'Project Manager')
UPDATE memberships
SET role = 'Staff',
    title = 'Project Manager'
WHERE LOWER(role) IN ('manager', 'project manager', 'project_manager');

-- 5. Standardize any remaining Staff casing
UPDATE memberships
SET role = 'Staff'
WHERE LOWER(role) = 'staff';

-- 6. Populate default Staff permissions if empty (preserving admin switch)
UPDATE memberships
SET permissions = jsonb_build_object(
    'admin', COALESCE((permissions->>'admin')::boolean, false),
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
    'invite_people', false
)
WHERE role = 'Staff' AND (permissions IS NULL OR permissions = '{}'::jsonb);

-- 7. Migrate Member / editor / viewer / commenter / uploader -> Editor
UPDATE memberships
SET role = 'Editor',
    permissions = jsonb_build_object(
        'admin', false,
        'manage_access', false,
        'create_project', false,
        'rename_project', false,
        'delete_project', false,
        'move_items', false,
        'copy_items', false,
        'delete_items', false,
        'create_task', false,
        'delete_task', false,
        'change_task_status', false,
        'invite_people', false
    )
WHERE LOWER(role) IN ('member', 'editor', 'viewer', 'uploader', 'commenter');

-- 8. Migrate Guest / client -> Client
UPDATE memberships
SET role = 'Client',
    permissions = jsonb_build_object(
        'admin', false,
        'manage_access', false,
        'create_project', false,
        'rename_project', false,
        'delete_project', false,
        'move_items', false,
        'copy_items', false,
        'delete_items', false,
        'create_task', false,
        'delete_task', false,
        'change_task_status', false,
        'invite_people', false
    )
WHERE LOWER(role) IN ('guest', 'client');

-- 9. Any leftover fallback -> Staff if previously executive/manager, else Editor
UPDATE memberships
SET role = 'Editor'
WHERE role NOT IN ('Staff', 'Editor', 'Client');

-- 10. Update invites table legacy roles to 3 roles
UPDATE invites
SET role = 'Staff'
WHERE LOWER(role) IN ('admin', 'owner', 'manager', 'ceo', 'coo', 'cfo', 'cso', 'staff', 'project manager');

UPDATE invites
SET role = 'Editor'
WHERE LOWER(role) IN ('member', 'editor', 'viewer', 'uploader', 'commenter');

UPDATE invites
SET role = 'Client'
WHERE LOWER(role) IN ('guest', 'client');

UPDATE invites
SET role = 'Editor'
WHERE role NOT IN ('Staff', 'Editor', 'Client');

-- 11. Enforce CHECK constraints
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS check_membership_role_three_roles;
ALTER TABLE memberships ADD CONSTRAINT check_membership_role_three_roles CHECK (role IN ('Staff', 'Editor', 'Client'));

ALTER TABLE invites DROP CONSTRAINT IF EXISTS check_invite_role_three_roles;
ALTER TABLE invites ADD CONSTRAINT check_invite_role_three_roles CHECK (role IN ('Staff', 'Editor', 'Client'));

-- +goose Down
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS check_membership_role_three_roles;
ALTER TABLE invites DROP CONSTRAINT IF EXISTS check_invite_role_three_roles;
