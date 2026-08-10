-- Migration: add unique constraint on (user_id, market_id) in predictions table
-- This prevents duplicate predictions at the database level, regardless of race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS predictions_user_market_unique
  ON predictions (user_id, market_id);
