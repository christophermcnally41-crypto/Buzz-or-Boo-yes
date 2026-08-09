import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
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

// Compute yesPercent/noPercent from counts
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

router.get("/markets/trending", async (req, res): Promise<void> => {
  const query = GetTrendingMarketsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 10) : 10;

  const markets = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.status, "OPEN"))
    .orderBy(desc(marketsTable.totalPredictions))
    .limit(limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketsTable)
    .where(eq(marketsTable.status, "OPEN"));

  res.json(GetTrendingMarketsResponse.parse({ markets: markets.map(enrichMarket), total: count }));
});

router.get("/markets/categories", async (_req, res): Promise<void> => {
  const categories = ["STYLE", "HOME", "CITY", "REAL_ESTATE", "WEATHER", "CULTURE"];
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
  const { category, status, limit = 20, offset = 0 } = query.success ? query.data : {};

  const conditions = [];
  if (category) conditions.push(eq(marketsTable.category, category));
  if (status) conditions.push(eq(marketsTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

  res.json(GetMarketResponse.parse(enrichMarket(market)));
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
