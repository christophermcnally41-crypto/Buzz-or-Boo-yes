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

function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    ...u,
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

// GET /users/me — returns user id=1 (demo user for MVP)
router.get("/users/me", async (_req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, 1));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
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
