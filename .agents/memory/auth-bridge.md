---
name: Auth bridge pattern
description: How Replit Auth (string sub) is bridged to integer-ID platform users in AHEAD
---

## The rule
Replit Auth OIDC `sub` is a string UUID. Our `usersTable.id` is a serial integer. Bridge via `replitId text unique` column on the users table.

**Why:** Changing users.id to varchar would require migrating predictions.userId FK and all existing data. Adding replitId as a bridge column is backward-compatible.

**How to apply:**
- `upsertUser()` in `artifacts/api-server/src/routes/auth.ts` looks up by `replitId`, creates new platform user if not found.
- Returns `{ id: user.id.toString(), ... }` so AuthUser.id is a string-formatted integer.
- In route handlers, convert back: `parseInt(req.user.id, 10)` to get the integer userId for DB queries.
- DB columns added via raw SQL (not drizzle push) due to TTY issue with unique constraints on populated tables.
