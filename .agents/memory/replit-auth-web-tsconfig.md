---
name: replit-auth-web tsconfig configuration
description: Why replit-auth-web is excluded from root tsconfig references
---

## The rule
`lib/replit-auth-web` must NOT be included in the root `tsconfig.json` references array. It is a browser-side library with `import.meta.env` and React hooks that fails `tsc --build` (which runs via `typecheck:libs`) when included.

**Why:** The root `tsconfig.json` references are consumed by `pnpm -w run typecheck:libs` → `tsc --build`. This runs in a Node/non-Vite context where `import.meta.env` and `@types/react` aren't available without special config.

**How to apply:**
- Keep `lib/replit-auth-web` out of root `tsconfig.json` references.
- The forecast app resolves it via `package.json` exports (`workspace:*`) — Vite handles the TS resolution at bundle time.
- The `artifacts/forecast/tsconfig.json` can include it as a reference for IDE hints, but it's not strictly required.
