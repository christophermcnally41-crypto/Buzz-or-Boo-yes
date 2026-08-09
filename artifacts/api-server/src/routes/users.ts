import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, predictionsTable, marketsTable } from "@workspace/db";
import {
  GetUserParams,
  GetUserResponse,
  GetMeResponse,
  GetUserPredictionsParams,
  GetUserPredictionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const TOPUP_THRESHOLD = 500;
const TOPUP_TARGET = 500;
const TOPUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    ...u,
    lastTopupAt: u.lastTopupAt ? u.lastTopupAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

function enrichMarket(m: typeof marketsTable.$inferSelect) {
  const total = m.yesCount + m.noCount;
  return {
    ...m,
    closesAt: m.closesAt ? m.closesAt.toISOString() : null,
    resolvedAt: m.resolvedAt ? m.resolvedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    yesPercent: total > 0 ? Math.round((m.yesCount / total) * 100) : 50,
    noPercent: total > 0 ? Math.round((m.noCount / total) * 100) : 50,
  };
}

// GET /users/me — returns the authenticated user's platform profile
router.get("/users/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const platformId = parseInt(req.user.id, 10);
  if (isNaN(platformId)) {
    res.status(400).json({ error: "Invalid user id in session" });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, platformId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Daily top-up: if balance is below threshold and 24h have elapsed since last top-up
  if (user.tokenBalance < TOPUP_THRESHOLD) {
    const now = new Date();
    const lastTopup = user.lastTopupAt;
    const eligibleForTopup = !lastTopup || (now.getTime() - lastTopup.getTime()) >= TOPUP_INTERVAL_MS;

    if (eligibleForTopup) {
      const [updated] = await db
        .update(usersTable)
        .set({ tokenBalance: TOPUP_TARGET, lastTopupAt: now })
        .where(eq(usersTable.id, platformId))
        .returning();
      if (updated) user = updated;
    }
  }

  res.json(GetMeResponse.parse(serializeUser(user)));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetUserParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserResponse.parse(serializeUser(user)));
});

router.get("/users/:id/predictions", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetUserPredictionsParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select({
      prediction: predictionsTable,
      market: marketsTable,
    })
    .from(predictionsTable)
    .innerJoin(marketsTable, eq(predictionsTable.marketId, marketsTable.id))
    .where(eq(predictionsTable.userId, params.data.id))
    .orderBy(desc(predictionsTable.createdAt))
    .limit(50);

  const result = rows.map(({ prediction, market }) => ({
    ...prediction,
    createdAt: prediction.createdAt.toISOString(),
    market: enrichMarket(market),
  }));

  res.json(GetUserPredictionsResponse.parse(result));
});

export default router;
