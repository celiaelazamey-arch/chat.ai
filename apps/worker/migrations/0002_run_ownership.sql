-- Existing pre-identity rows intentionally remain unowned and are excluded from user queries.
-- Review/export/delete legacy data before migration in any environment containing user data.
ALTER TABLE runs ADD COLUMN owner_id TEXT;

CREATE INDEX IF NOT EXISTS idx_runs_owner_created_at ON runs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_owner_task_created_at ON runs (owner_id, task_id, created_at DESC);
