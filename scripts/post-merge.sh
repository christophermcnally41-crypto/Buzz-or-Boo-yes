#!/bin/bash
set -e

pnpm install --frozen-lockfile

# ── Explicit idempotent column migrations ─────────────────────────────────────
# These columns were added to the Drizzle schema but require an explicit SQL
# step because a fresh deployment database may not yet have them.
# Each ADD COLUMN IF NOT EXISTS is safe to run multiple times.

psql "$DATABASE_URL" <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS buzz_score INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_topup_at TIMESTAMPTZ;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS is_rising BOOLEAN NOT NULL DEFAULT FALSE;
SQL

echo "Idempotent column migrations applied."

# ── Sync remaining schema changes via drizzle push ───────────────────────────
# --force skips interactive TTY prompts (safe in CI / post-merge context).
pnpm --filter @workspace/db run push-force
