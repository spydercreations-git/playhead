-- +goose Up

-- 1. Add username, temporary password fields, and onboarding status to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64);

ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- 2. Populate username for existing primary users
UPDATE users SET username = 'harsh' WHERE (email = 'harsh@idyllproductions.com' OR email = 'harsh@playhead.com') AND username IS NULL;
UPDATE users SET username = 'rohit' WHERE (email = 'rohit@idyllproductions.com' OR email = 'rohit@playhead.com') AND username IS NULL;

-- For any remaining users, generate a unique username from their email prefix + id suffix to guarantee uniqueness
UPDATE users 
SET username = SUBSTR(LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9.]', '', 'g')), 1, 24) || '_' || SUBSTR(id::text, 1, 4)
WHERE username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username)) WHERE username IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_users_username_lower;
ALTER TABLE users DROP COLUMN IF EXISTS onboarded_at;
ALTER TABLE users DROP COLUMN IF EXISTS is_onboarded;
ALTER TABLE users DROP COLUMN IF EXISTS temp_password_used;
ALTER TABLE users DROP COLUMN IF EXISTS temp_password_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS temp_password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS username;
