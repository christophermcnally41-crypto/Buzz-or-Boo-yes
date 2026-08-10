import { Router, type IRouter } from "express";
import { eq, desc, sql, and, or, isNull, gt, lt } from "drizzle-orm";
import { db, marketsTable } from "@workspace/db";
import {
  GetMarketParams,
  GetMarketResponse,
  ListMarketsQueryParams,
  ListMarketsResponse,
  GetTrendingMarketsQueryParams,
  GetTrendingMarketsResponse,
  GetMarketCategoriesResponse,
  GetPlatformStatsResponse,
  GetMarketPredictionsParams,
  GetMarketPredictionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Compute yesPercent/noPercent from counts and serialize timestamps
function enrichMarket(m: typeof marketsTable.$inferSelect) {
  const total = m.yesCount + m.noCount;
  return {
    ...m,
    closesAt: m.closesAt ? m.closesAt.toISOString() : null,
    resolvedAt: m.resolvedAt ? m.resolvedAt.toISOString() : null,
    publishAt: m.publishAt ? m.publishAt.toISOString() : null,
    peakUntil: m.peakUntil ? m.peakUntil.toISOString() : null,
    expireAt: m.expireAt ? m.expireAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    yesPercent: total > 0 ? Math.round((m.yesCount / total) * 100) : 50,
    noPercent: total > 0 ? Math.round((m.noCount / total) * 100) : 50,
  };
}

// Exclude markets scheduled for a future publish_at (not yet visible to the public)
const notScheduled = or(isNull(marketsTable.publishAt), gt(sql`now()`, marketsTable.publishAt));

// Exclude markets that have passed their hard expiry, even if the worker hasn't archived them yet.
// Uses sql`now()` so the database evaluates the timestamp at query time.
const notExpired = or(isNull(marketsTable.expireAt), gt(marketsTable.expireAt, sql`now()`));

router.get("/markets/trending", async (req, res): Promise<void> => {
  const query = GetTrendingMarketsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 10) : 10;

  const markets = await db
    .select()
    .from(marketsTable)
    .where(and(eq(marketsTable.status, "OPEN"), notScheduled, notExpired))
    .orderBy(desc(marketsTable.totalPredictions))
    .limit(limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketsTable)
    .where(and(eq(marketsTable.status, "OPEN"), notScheduled, notExpired));

  res.json(GetTrendingMarketsResponse.parse({ markets: markets.map(enrichMarket), total: count }));
});

router.get("/markets/categories", async (_req, res): Promise<void> => {
  const categories = ["LOCAL_PULSE", "STYLE", "BEAUTY", "ACCESSORIES", "MOVIES", "HOME", "CITY", "REAL_ESTATE", "WEATHER", "CULTURE"];
  const stats = await Promise.all(
    categories.map(async (category) => {
      const [{ total, open, preds }] = await db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where status = 'OPEN')::int`,
          preds: sql<number>`coalesce(sum(total_predictions), 0)::int`,
        })
        .from(marketsTable)
        .where(eq(marketsTable.category, category));
      return { category, totalMarkets: total, openMarkets: open, totalPredictions: preds };
    })
  );
  res.json(GetMarketCategoriesResponse.parse(stats));
});

router.get("/markets", async (req, res): Promise<void> => {
  const query = ListMarketsQueryParams.safeParse(req.query);
  const { category, status, format, limit = 20, offset = 0 } = query.success ? query.data : {} as any;

  const conditions = [notScheduled, notExpired];
  if (category) conditions.push(eq(marketsTable.category, category));
  if (status) conditions.push(eq(marketsTable.status, status));
  if (format) conditions.push(eq(marketsTable.marketFormat, format));

  const whereClause = and(...conditions);

  const markets = await db
    .select()
    .from(marketsTable)
    .where(whereClause)
    .orderBy(desc(marketsTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketsTable)
    .where(whereClause);

  res.json(ListMarketsResponse.parse({ markets: markets.map(enrichMarket), total: count }));
});

router.get("/markets/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetMarketParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [market] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.id, params.data.id));

  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  // Hide scheduled markets that haven't reached their publish_at yet
  if (market.publishAt && market.publishAt > new Date()) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  // Treat hard-expired markets as gone — independent of the background worker
  if (market.expireAt && market.expireAt <= new Date() && market.status === "OPEN") {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  res.json(GetMarketResponse.parse(enrichMarket(market)));
});

router.get("/markets/:id/tally", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const marketId = Number(raw);
  if (isNaN(marketId) || marketId <= 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }

  const [market] = await db
    .select({ id: marketsTable.id })
    .from(marketsTable)
    .where(eq(marketsTable.id, marketId));

  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  const { predictionsTable } = await import("@workspace/db");
  const rows = await db
    .select({
      choice: predictionsTable.choice,
      count: sql<number>`count(*)::int`,
    })
    .from(predictionsTable)
    .where(eq(predictionsTable.marketId, marketId))
    .groupBy(predictionsTable.choice);

  const tallies: Record<string, number> = {};
  for (const row of rows) {
    tallies[row.choice] = row.count;
  }

  res.json({ tallies });
});

router.get("/markets/:id/predictions", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetMarketPredictionsParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Import here to avoid circular module issues at top level
  const { predictionsTable } = await import("@workspace/db");
  const predictions = await db
    .select()
    .from(predictionsTable)
    .where(eq(predictionsTable.marketId, params.data.id))
    .orderBy(desc(predictionsTable.createdAt))
    .limit(50);

  res.json(
    GetMarketPredictionsResponse.parse(
      predictions.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      }))
    )
  );
});

/**
 * GET /markets/:id/my-prediction
 * Returns the authenticated user's own prediction for this market, or null if
 * they haven't voted. Used by the mobile app to gate the Predict button without
 * scanning the capped recent-predictions list.
 */
router.get("/markets/:id/my-prediction", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const marketId = Number(raw);
  if (isNaN(marketId) || marketId <= 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }

  if (!req.isAuthenticated()) {
    // Unauthenticated — no prediction can exist for this user
    res.json({ prediction: null });
    return;
  }

  const userId = parseInt(req.user.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id in session" });
    return;
  }

  const { predictionsTable } = await import("@workspace/db");
  const [prediction] = await db
    .select()
    .from(predictionsTable)
    .where(and(eq(predictionsTable.marketId, marketId), eq(predictionsTable.userId, userId)))
    .limit(1);

  if (!prediction) {
    res.json({ prediction: null });
    return;
  }

  res.json({
    prediction: {
      ...prediction,
      createdAt: prediction.createdAt.toISOString(),
    },
  });
});

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const { usersTable, predictionsTable } = await import("@workspace/db");

  const [marketStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status = 'OPEN')::int`,
      resolved: sql<number>`count(*) filter (where status = 'RESOLVED')::int`,
    })
    .from(marketsTable);

  const [userStats] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(usersTable);

  const [predStats] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(predictionsTable);

  const [accStats] = await db
    .select({ avg: sql<number | null>`avg(overall_accuracy)` })
    .from(usersTable)
    .where(sql`overall_accuracy is not null`);

  res.json(
    GetPlatformStatsResponse.parse({
      totalMarkets: marketStats.total,
      openMarkets: marketStats.open,
      resolvedMarkets: marketStats.resolved,
      totalPredictions: predStats.total,
      totalUsers: userStats.total,
      avgAccuracy: accStats?.avg ?? null,
    })
  );
});

export default router;
