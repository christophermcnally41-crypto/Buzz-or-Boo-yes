-- Migration: add is_admin flag to users table (platform admin authorization)
-- Grants a boolean admin flag that the API server uses to gate all /admin/*
-- mutation routes.  New and existing users default to false; administrators
-- must be promoted directly in the database.
--
-- This column is NOT NULL with a safe default, so it can be applied to any
-- existing database without downtime.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
