# AHEAD — Cultural Prediction Platform

A visual forecasting platform where people predict what happens next in Style, Home, City, Real Estate, Weather, and Culture — starting with Boston. Users earn virtual Forecast Points, build accuracy reputations, and compete on leaderboards. The tagline: "See what's coming."

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/forecast run dev` — run the frontend (port assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Wouter routing, TanStack Query, Tailwind CSS v4, Fraunces + Plus Jakarta Sans fonts
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (tables: users, markets, predictions)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — DB schema (users.ts, markets.ts, predictions.ts)
- `artifacts/api-server/src/routes/` — route handlers (markets, predictions, users, leaderboard, admin)
- `artifacts/forecast/src/` — frontend React app

## Architecture decisions

- **No auth for MVP** — user ID=1 is hardcoded as the "logged in" demo user; profiles show this user's data
- **Virtual currency only** — 10,000 Forecast Points per user, no real money; correct predictions earn 1.8x back
- **Categories**: STYLE, HOME, CITY, REAL_ESTATE, WEATHER, CULTURE
- **Market statuses**: OPEN → CLOSED → RESOLVED; predictions disabled once market closes
- **Duplicate prediction prevention** — one prediction per user per market, enforced at DB query level

## Product

- **Discover feed** — trending markets with giant probability numbers, platform stats, category nav
- **Markets browse** — filter by category and status with card grid
- **Market detail** — full YES/NO probability bars, token prediction UI, predictions list
- **Leaderboard** — top forecasters ranked by accuracy, filterable by category with tier labels (Elite/Expert/Developing)
- **User profile** — Forecast Points balance, per-category accuracy, prediction history
- **Admin panel** — create markets, resolve with YES/NO outcome (auto-awards tokens to winners)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Admin access

All `/admin/*` API routes require `is_admin = true` on the platform user record. New deployments set every user to `is_admin = false` by default.

**To grant admin access after deploying:**
1. Find your Replit user ID — it is printed in the API server logs as `[auth] upserted user replitId=<id>` on first login.
2. Set the environment variable `INITIAL_ADMIN_IDS` to a comma-separated list of those IDs (e.g. `12345678,87654321`) in Replit Secrets / Environment Variables.
3. Re-run `scripts/post-merge.sh` (or redeploy) — the bootstrap step promotes those users idempotently.

Alternatively, run directly: `psql $DATABASE_URL -c "UPDATE users SET is_admin=true WHERE replit_id='<your-id>'"`

## Gotchas

- After any OpenAPI spec change, run codegen before touching routes or frontend
- `zod.int()` is not available in Zod v3 — use `type: number` in OpenAPI spec (not `type: integer`)
- Orval split mode causes TS2308 collisions when an endpoint has BOTH path params AND query params — fix by removing query params from those endpoints or renaming operation IDs
- `/markets/trending` and `/markets/categories` routes must be registered BEFORE `/markets/:id` in Express, otherwise `:id` captures "trending"/"categories" as a param
- API routes are mounted at `/api` in app.ts — route files should NOT include `/api` prefix

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
