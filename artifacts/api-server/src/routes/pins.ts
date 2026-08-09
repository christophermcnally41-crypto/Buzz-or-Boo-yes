import { Router } from "express";
import { db, marketPinsTable, marketsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

// GET /users/:id/pins — all pinned markets for a user
router.get("/users/:id/pins", async (req, res): Promise<void> => {
  const userId = parseId(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }

  const pins = await db
    .select({ market: marketsTable, pinnedAt: marketPinsTable.pinnedAt })
    .from(marketPinsTable)
    .innerJoin(marketsTable, eq(marketPinsTable.marketId, marketsTable.id))
    .where(eq(marketPinsTable.userId, userId))
    .orderBy(desc(marketPinsTable.pinnedAt));

  res.json({ pins: pins.map(p => ({ ...p.market, pinnedAt: p.pinnedAt.toISOString() })) });
});

// GET /markets/:id/pin — check if current user has pinned this market
router.get("/markets/:id/pin", async (req, res): Promise<void> => {
  if (!req.user) { res.json({ pinned: false }); return; }
  const marketId = parseId(req.params.id);
  if (!marketId) { res.status(400).json({ error: "Invalid market id" }); return; }

  const authUserId = parseInt(req.user.id, 10);
  const [pin] = await db
    .select()
    .from(marketPinsTable)
    .where(and(eq(marketPinsTable.userId, authUserId), eq(marketPinsTable.marketId, marketId)));

  res.json({ pinned: !!pin });
});

// POST /markets/:id/pin — pin a market (requires auth)
router.post("/markets/:id/pin", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const marketId = parseId(req.params.id);
  if (!marketId) { res.status(400).json({ error: "Invalid market id" }); return; }

  const authUserId = parseInt(req.user.id, 10);
  await db
    .insert(marketPinsTable)
    .values({ userId: authUserId, marketId })
    .onConflictDoNothing();

  res.json({ pinned: true });
});

// DELETE /markets/:id/pin — unpin a market (requires auth)
router.delete("/markets/:id/pin", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const marketId = parseId(req.params.id);
  if (!marketId) { res.status(400).json({ error: "Invalid market id" }); return; }

  const authUserId = parseInt(req.user.id, 10);
  await db
    .delete(marketPinsTable)
    .where(and(eq(marketPinsTable.userId, authUserId), eq(marketPinsTable.marketId, marketId)));

  res.json({ pinned: false });
});

export default router;
