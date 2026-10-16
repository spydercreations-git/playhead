-- +goose Up
ALTER TABLE items ALTER COLUMN project_id DROP NOT NULL;

-- +goose Down
ALTER TABLE items ALTER COLUMN project_id SET NOT NULL;
