-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY widgets_name_idx ON widgets (lower(name));

-- +goose Down
DROP INDEX CONCURRENTLY widgets_name_idx;
