---
name: MULTI_CHOICE market format
description: How AHEAD's multi-contender race markets work end-to-end
---

## The rule
MULTI_CHOICE markets (e.g. HOTTEST IN BOSTON) store contenders as JSON in `description`:
```json
{"contenders":[{"key":"A","name":"Pammy's","venue":"Cambridge"},...],"metric":"...","period":"..."}
```

Predictions use `choice` = contender key ("A", "B", "C", "D", "E"). The server:
- Skips updating `yesCount`/`noCount` for MULTI_CHOICE markets
- Only increments `totalPredictions`
- Stores raw `choice` in predictions table

The frontend aggregates per-contender counts client-side by iterating `predictions` from `GET /markets/:id/predictions`.

**Why:** Adding per-contender count columns to marketsTable would require schema migration for every new contender format. Client aggregation from the predictions endpoint is simpler and sufficient.

**How to apply:**
- Admin resolves MULTI_CHOICE by clicking a contender button → sends contender key as `outcome`
- `market.resolvedOutcome` stores the winning contender key
- `MultiChoiceCard` shows equal splits when no predictions exist; real splits on detail page
