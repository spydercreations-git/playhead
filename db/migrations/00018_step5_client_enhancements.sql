-- +goose Up
-- Step 5: Client Enhancements (status active/inactive, notification mutes per user, grid size)

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

CREATE TABLE IF NOT EXISTS client_notification_mutes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_client_notification_mutes_user_id ON client_notification_mutes(user_id);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS grid_size VARCHAR(16) NOT NULL DEFAULT 'M' CHECK (grid_size IN ('S', 'M', 'L'));

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS grid_size;
DROP TABLE IF EXISTS client_notification_mutes;
ALTER TABLE clients DROP COLUMN IF EXISTS status;
