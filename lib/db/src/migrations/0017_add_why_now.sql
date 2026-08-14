-- Add optional "Why Now?" context blurb to markets
ALTER TABLE markets ADD COLUMN IF NOT EXISTS why_now text;
