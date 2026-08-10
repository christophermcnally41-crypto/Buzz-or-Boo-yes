-- Migration: add buzzScore and last_topup_at columns to users table, and missing markets rule columns
-- BuzzScore is a 0–100 integer (Brier-style calibration metric) that
-- replaces the raw accuracy fraction as the consumer-facing reputation metric.
-- last_topup_at was missing from the DB but present in the schema.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS buzz_score    integer,
  ADD COLUMN IF NOT EXISTS last_topup_at timestamptz;

-- Backfill buzzScore for all users who already have resolved predictions.
-- Future resolutions update buzz_score incrementally in admin.ts.
UPDATE users
SET buzz_score = ROUND((total_correct::float / total_resolved) * 100)::int
WHERE total_resolved > 0
  AND buzz_score IS NULL;

-- markets rule columns added by migration 0010 but missing in some environments
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS source_primary    text,
  ADD COLUMN IF NOT EXISTS source_backup     text,
  ADD COLUMN IF NOT EXISTS baseline_snapshot text,
  ADD COLUMN IF NOT EXISTS formula           text,
  ADD COLUMN IF NOT EXISTS void_rule         text,
  ADD COLUMN IF NOT EXISTS geo               text;
