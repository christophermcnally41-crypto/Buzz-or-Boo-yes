-- Migration: Live Franchise template system (Market Bible v0.5 §42)
-- Adds a market_templates table for reusable question molds and a
-- template_id back-reference on markets so every market records which
-- franchise it was spawned from.

CREATE TABLE IF NOT EXISTS market_templates (
  id                    SERIAL PRIMARY KEY,
  franchise_name        TEXT        NOT NULL,
  engine                TEXT        NOT NULL,
  template_question     TEXT        NOT NULL,
  clock_type            TEXT        NOT NULL DEFAULT 'NOW',
  category              TEXT        NOT NULL,
  default_duration_days INTEGER     NOT NULL DEFAULT 7,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES market_templates(id) ON DELETE SET NULL;

-- Index so admins can quickly list all markets for a given franchise
CREATE INDEX IF NOT EXISTS idx_markets_template_id ON markets(template_id);
