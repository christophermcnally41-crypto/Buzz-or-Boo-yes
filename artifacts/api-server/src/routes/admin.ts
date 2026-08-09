import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, marketsTable, predictionsTable, usersTable } from "@workspace/db";
import {
  AdminListMarketsResponse,
  CreateMarketBody,
  CreateMarketResponse,
  ResolveMarketParams,
  ResolveMarketBody,
  ResolveMarketResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

router.get("/admin/markets", async (_req, res): Promise<void> => {
  const markets = await db
    .select()
    .from(marketsTable)
    .orderBy(desc(marketsTable.createdAt));

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketsTable);

  res.json(AdminListMarketsResponse.parse({ markets: markets.map(enrichMarket), total: count }));
});

router.post("/admin/markets", async (req, res): Promise<void> => {
  const parsed = CreateMarketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, question, description, category, subcategory, imageUrl, resolutionSource, closesAt } = parsed.data;

  const [market] = await db
    .insert(marketsTable)
    .values({
      title,
      question,
      description: description ?? null,
      category,
      subcategory,
      imageUrl: imageUrl ?? null,
      resolutionSource: resolutionSource ?? null,
      closesAt: closesAt ? new Date(closesAt) : null,
      status: "OPEN",
    })
    .returning();

  res.status(201).json(CreateMarketResponse.parse(enrichMarket(market)));
});

router.patch("/admin/markets/:id/resolve", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ResolveMarketParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ResolveMarketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { outcome } = parsed.data;
  const marketId = params.data.id;

  const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, marketId));
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  if (market.status === "RESOLVED") {
    res.status(400).json({ error: "Market is already resolved" });
    return;
  }

  // Resolve the market
  const [resolved] = await db
    .update(marketsTable)
    .set({ status: "RESOLVED", resolvedOutcome: outcome, resolvedAt: new Date() })
    .where(eq(marketsTable.id, marketId))
    .returning();

  // Award tokens to correct predictors and update user stats
  const allPredictions = await db
    .select()
    .from(predictionsTable)
    .where(eq(predictionsTable.marketId, marketId));

  const correctPredictions = allPredictions.filter((p) => p.choice === outcome);
  const REWARD_MULTIPLIER = 1.8;

  for (const pred of allPredictions) {
    const isCorrect = pred.choice === outcome;
    const tokensEarned = isCorrect ? Math.round(pred.amount * REWARD_MULTIPLIER) : 0;

    await db
      .update(predictionsTable)
      .set({ isCorrect, tokensEarned })
      .where(eq(predictionsTable.id, pred.id));

    // Update user token balance and stats
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, pred.userId));
    if (user) {
      const newResolved = user.totalResolved + 1;
      const newCorrect = user.totalCorrect + (isCorrect ? 1 : 0);
      const newAccuracy = newResolved > 0 ? Math.round((newCorrect / newResolved) * 100) / 100 : null;

      await db
        .update(usersTable)
        .set({
          tokenBalance: user.tokenBalance + tokensEarned,
          totalResolved: newResolved,
          totalCorrect: newCorrect,
          overallAccuracy: newAccuracy,
        })
        .where(eq(usersTable.id, pred.userId));
    }
  }

  res.json(ResolveMarketResponse.parse(enrichMarket(resolved)));
});

export default router;
