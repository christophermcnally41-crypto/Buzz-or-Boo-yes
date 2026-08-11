-- Migration: partial unique index to prevent duplicate open market titles
-- Enforces at the database level that at most one OPEN market may share a
-- given title.  This is the invariant relied upon by the recurring auto-cycle
-- guard: when two concurrent resolve transactions both try to spawn a successor
-- edition, the partial unique index plus INSERT … ON CONFLICT DO NOTHING ensures
-- exactly one row is inserted regardless of transaction isolation level.
--
-- A partial index (WHERE status = 'OPEN') is used deliberately:
--   • Historical RESOLVED/ARCHIVED editions can legitimately share a title
--     with newer OPEN editions — that is the whole point of recurring series.
--   • Only two simultaneously-open editions for the same title are invalid.
--
-- CONCURRENTLY avoids a full table lock on production; safe to run against a
-- live database with active traffic.  If the CONCURRENTLY build is interrupted
-- (e.g. a duplicate key existed at build time) the index is left in an INVALID
-- state; in that case drop it and re-run this migration after resolving
-- duplicates.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS markets_open_title_unique
  ON markets (title)
  WHERE status = 'OPEN';
