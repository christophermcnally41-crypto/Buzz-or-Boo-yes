---
name: Zod v3 OpenAPI format pitfalls
description: Which OpenAPI format annotations break Zod codegen in this monorepo
---

## The rule
Orval v8.23.0 generates Zod v4 syntax for certain OpenAPI constructs. None of these exist in Zod v3:
- `z.email()` — from `format: email` → remove the `format:` annotation
- `z.url()` — from `format: uri` → remove the `format:` annotation
- `z.int()` — from `type: integer` in **response/body schemas** → use `type: number` instead

`type: integer` in **path/query params** is safe — orval generates `zod.coerce.number().int()` there, which Zod v3 supports.

**Why:** The monorepo uses `zod@3.x` (installed at node_modules/.pnpm/zod@3.x). Orval's Zod v3 generator doesn't guard against this mismatch.

**How to apply:** Never add `format: email` or `format: uri` to any schema property in the OpenAPI spec. Use plain `type: string` instead. The validation can be added in route handlers if needed.
