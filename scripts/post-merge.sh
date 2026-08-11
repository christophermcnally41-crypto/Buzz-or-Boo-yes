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
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial unique index: at most one OPEN market per title at any time.
-- Backs the ON CONFLICT (title) WHERE status='OPEN' DO NOTHING guard in the
-- recurring auto-cycle insert, which uses speculative insertion to prevent
-- concurrent resolve requests from spawning duplicate successor editions.
-- CREATE INDEX IF NOT EXISTS is idempotent; safe to run on every deployment.
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block;
-- this plain (non-concurrent) form is used here because the post-merge context
-- is not performance-critical and has no ongoing production traffic at this point.
CREATE UNIQUE INDEX IF NOT EXISTS markets_open_title_unique
  ON markets (title)
  WHERE status = 'OPEN';
SQL

echo "Idempotent column and index migrations applied."

# ── Bootstrap initial admin users ────────────────────────────────────────────
# All admin routes require is_admin=true on the platform user record.  On a
# fresh deployment every user starts with is_admin=false by column default.
#
# Set the INITIAL_ADMIN_IDS env var (in Replit Secrets / Environment Variables)
# to a comma-separated list of Replit user IDs (the replit_id column value).
# This step runs every deployment and is idempotent.
#
# Find your Replit user ID: it is logged as "[auth] upserted user replitId=<id>"
# in the API server console on first login, or check the users table directly.
#
# Example:  INITIAL_ADMIN_IDS="12345678,87654321"

if [ -n "${INITIAL_ADMIN_IDS:-}" ]; then
  # Replit user IDs are all-numeric.  Strip any character that is not a digit
  # or comma before passing to SQL, so no injection is possible even if the
  # variable is misconfigured.
  SAFE_IDS="$(echo "$INITIAL_ADMIN_IDS" | tr -cd '0-9,')"

  if [ -z "$SAFE_IDS" ]; then
    echo "[admin-bootstrap] INITIAL_ADMIN_IDS contained no valid numeric IDs; skipped."
  else
    PROMOTED=$(psql "$DATABASE_URL" --tuples-only -c \
      "UPDATE users SET is_admin = true
       WHERE replit_id = ANY(string_to_array('${SAFE_IDS}', ','))
         AND is_admin = false
       RETURNING id;" | grep -c '[0-9]' || true)
    echo "[admin-bootstrap] Promoted ${PROMOTED} user(s) to is_admin=true."
  fi
else
  echo "[admin-bootstrap] INITIAL_ADMIN_IDS not set — no users auto-promoted."
  echo "                  Set INITIAL_ADMIN_IDS=<replit_id,...> to grant admin access."
fi

# ── Sync remaining schema changes via drizzle push ───────────────────────────
# --force skips interactive TTY prompts (safe in CI / post-merge context).
pnpm --filter @workspace/db run push-force
