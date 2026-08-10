-- Migration: add question clock lifecycle columns (Market Bible v0.5 §40)
-- Six clock types: EVERGREEN, SEASONAL, NOW, EVENT_DRIVEN, ROLLING_FORECAST, RECURRING_PULSE
-- Also adds ARCHIVED as a valid market status so the clock worker can
-- archive expired markets without touching RESOLVED/CLOSED rows.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS clock_type      text        NOT NULL DEFAULT 'EVERGREEN',
  ADD COLUMN IF NOT EXISTS publish_at      timestamptz,
  ADD COLUMN IF NOT EXISTS peak_until      timestamptz,
  ADD COLUMN IF NOT EXISTS expire_at       timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_rule    text,
  ADD COLUMN IF NOT EXISTS freshness_score real,
  ADD COLUMN IF NOT EXISTS series_id       integer;
