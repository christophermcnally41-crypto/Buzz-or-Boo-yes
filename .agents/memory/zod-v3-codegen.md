---
name: Zod v3 OpenAPI format pitfalls
description: Which OpenAPI format annotations break Zod codegen in this monorepo
---

## The rule
Orval generates `z.email()` from `format: email` and `z.url()` from `format: uri`. Neither method exists in Zod v3 — only Zod v4 has them. Remove these format annotations from `lib/api-spec/openapi.yaml`.

**Why:** The monorepo uses `zod@3.x` (installed at node_modules/.pnpm/zod@3.x). Orval's Zod v3 generator doesn't guard against this mismatch.

**How to apply:** Never add `format: email` or `format: uri` to any schema property in the OpenAPI spec. Use plain `type: string` instead. The validation can be added in route handlers if needed.
