import { Router, type IRouter } from "express";
import { eq, and, gte, sql } from "drizzle-orm";
import { db, marketsTable, predictionsTable, usersTable } from "@workspace/db";
import {
  MakePredictionParams,
  MakePredictionBody,
  MakePredictionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/markets/:id/predict", async (req, res): Promise<void> => {
  // Require authentication
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "You must be logged in to make predictions" });
    return;
  }

  const userId = parseInt(req.user.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id in session" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = MakePredictionParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = MakePredictionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { choice, amount } = parsed.data;
  const marketId = params.data.id;

  // Validate market exists and is open
  const [market] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.id, marketId));

  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  if (market.status !== "OPEN") {
    res.status(400).json({ error: "Market is not open for predictions" });
    return;
  }

  // Validate choice against market format
  if (market.marketFormat === "MULTI_CHOICE") {
    // Parse contenders from description and require choice to be a valid key
    let validKeys: string[] = [];
    try {
      const desc = market.description ? JSON.parse(market.description) : null;
      if (Array.isArray(desc?.contenders)) {
        validKeys = desc.contenders.map((c: { key: string }) => c.key);
      }
    } catch {
      // malformed description — reject
    }
    if (validKeys.length === 0) {
      res.status(400).json({ error: "This market has no valid contenders" });
      return;
    }
    if (!validKeys.includes(choice)) {
      res.status(400).json({ error: `Invalid choice. Must be one of: ${validKeys.join(", ")}` });
      return;
    }
  } else {
    // Standard / HOT_OR_NOT / HEAD_TO_HEAD / BUZZ_OR_BOO — only YES or NO allowed
    if (choice !== "YES" && choice !== "NO") {
      res.status(400).json({ error: "Invalid choice. Must be YES or NO" });
      return;
    }
  }

  // Validate user exists
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // BUZZ_OR_BOO markets use a fixed one-tap stake regardless of client-supplied amount.
  // This prevents bypass of the one-tap UX contract by submitting arbitrary amounts.
  const BUZZ_OR_BOO_STAKE = 10;
  const betAmount = market.marketFormat === "BUZZ_OR_BOO"
    ? BUZZ_OR_BOO_STAKE
    : (amount ?? 100);

  // Create prediction — the unique index on (user_id, market_id) enforces one-per-user at
  // the database level, so concurrent requests can't both slip through the old SELECT guard.
  let prediction: typeof predictionsTable.$inferSelect;
  try {
    const [inserted] = await db
      .insert(predictionsTable)
      .values({ userId, marketId, choice, amount: betAmount })
      .returning();
    prediction = inserted;
  } catch (err: unknown) {
    // PostgreSQL unique-violation error code is '23505'
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      res.status(400).json({ error: "You have already predicted on this market" });
      return;
    }
    throw err;
  }

  // Update market counts — for MULTI_CHOICE only increment total; for YES/NO markets update yes/no counts
  if (market.marketFormat === "MULTI_CHOICE") {
    await db
      .update(marketsTable)
      .set({ totalPredictions: market.totalPredictions + 1 })
      .where(eq(marketsTable.id, marketId));
  } else if (choice === "YES") {
    await db
      .update(marketsTable)
      .set({
        yesCount: market.yesCount + 1,
        totalPredictions: market.totalPredictions + 1,
      })
      .where(eq(marketsTable.id, marketId));
  } else {
    await db
      .update(marketsTable)
      .set({
        noCount: market.noCount + 1,
        totalPredictions: market.totalPredictions + 1,
      })
      .where(eq(marketsTable.id, marketId));
  }

  // Atomically deduct tokens — only succeeds if balance is still sufficient.
  // This guards against two concurrent bets both reading the same stale balance.
  const [deducted] = await db
    .update(usersTable)
    .set({
      tokenBalance: sql`${usersTable.tokenBalance} - ${betAmount}`,
      totalPredictions: sql`${usersTable.totalPredictions} + 1`,
    })
    .where(and(eq(usersTable.id, userId), gte(usersTable.tokenBalance, betAmount)))
    .returning();

  if (!deducted) {
    // Roll back the prediction we just inserted — balance was insufficient
    await db
      .delete(predictionsTable)
      .where(eq(predictionsTable.id, prediction.id));
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  res.status(201).json(
    MakePredictionResponse.parse({
      ...prediction,
      createdAt: prediction.createdAt.toISOString(),
    })
  );
});

export default router;
