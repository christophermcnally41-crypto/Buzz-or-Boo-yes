-- Migration: add resolution rule columns to markets table
-- These columns capture the Market Bible v0.2 methodology fields
-- (Section 5 & 12) required for every live market.
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS source_primary      text,
  ADD COLUMN IF NOT EXISTS source_backup       text,
  ADD COLUMN IF NOT EXISTS baseline_snapshot   text,
  ADD COLUMN IF NOT EXISTS formula             text,
  ADD COLUMN IF NOT EXISTS void_rule           text,
  ADD COLUMN IF NOT EXISTS geo                 text;
