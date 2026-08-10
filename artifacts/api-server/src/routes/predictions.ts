import { Router, type IRouter } from "express";
import { eq, and, gte, sql } from "drizzle-orm";
import { db, marketsTable, predictionsTable, usersTable } from "@workspace/db";
import {
  MakePredictionParams,
  MakePredictionBody,
  MakePredictionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Sentinel thrown inside the transaction when the user's balance is insufficient.
 * Drizzle rolls the transaction back automatically when the callback throws, so
 * neither the prediction row nor the market-count increment will persist.
 */
class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient_balance");
  }
}

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

  // Reject bets on markets that are not yet publicly visible (scheduled)
  if (market.publishAt && market.publishAt > new Date()) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  // Reject bets on hard-expired markets immediately, independent of worker archival
  if (market.expireAt && market.expireAt <= new Date()) {
    res.status(400).json({ error: "Market has expired and is no longer accepting predictions" });
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
  } else if (market.marketFormat === "THE_CALL") {
    // Parse options from description and require choice to be a valid option key
    let validKeys: string[] = [];
    try {
      const desc = market.description ? JSON.parse(market.description) : null;
      if (Array.isArray(desc?.options)) {
        validKeys = desc.options.map((o: { key: string }) => o.key);
      }
    } catch {
      // malformed description — reject
    }
    if (validKeys.length === 0) {
      res.status(400).json({ error: "This market has no valid options" });
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

  // BUZZ_OR_BOO and THE_CALL markets use a fixed one-tap stake regardless of client-supplied
  // amount. This enforces the one-tap UX contract and prevents bypass via arbitrary amounts.
  const FIXED_STAKE = 10;
  const betAmount = (market.marketFormat === "BUZZ_OR_BOO" || market.marketFormat === "THE_CALL")
    ? FIXED_STAKE
    : (amount ?? 100);

  // Execute the prediction inside a single DB transaction so that the prediction
  // row, market-count increment, and token deduction are all committed or all
  // rolled back together — no compensating DELETE is ever needed.
  let prediction: typeof predictionsTable.$inferSelect;
  try {
    prediction = await db.transaction(async (tx) => {
      // 1. Insert the prediction.
      //    The unique index on (user_id, market_id) rejects duplicates with 23505.
      const [inserted] = await tx
        .insert(predictionsTable)
        .values({ userId, marketId, choice, amount: betAmount })
        .returning();

      // 2. Update market counts.
      if (market.marketFormat === "MULTI_CHOICE" || market.marketFormat === "THE_CALL") {
        await tx
          .update(marketsTable)
          .set({ totalPredictions: market.totalPredictions + 1 })
          .where(eq(marketsTable.id, marketId));
      } else if (choice === "YES") {
        await tx
          .update(marketsTable)
          .set({
            yesCount: market.yesCount + 1,
            totalPredictions: market.totalPredictions + 1,
          })
          .where(eq(marketsTable.id, marketId));
      } else {
        await tx
          .update(marketsTable)
          .set({
            noCount: market.noCount + 1,
            totalPredictions: market.totalPredictions + 1,
          })
          .where(eq(marketsTable.id, marketId));
      }

      // 3. Atomically deduct tokens — only succeeds if balance is still sufficient.
      //    This guards against two concurrent bets both reading the same stale balance.
      const [deducted] = await tx
        .update(usersTable)
        .set({
          tokenBalance: sql`${usersTable.tokenBalance} - ${betAmount}`,
          totalPredictions: sql`${usersTable.totalPredictions} + 1`,
        })
        .where(and(eq(usersTable.id, userId), gte(usersTable.tokenBalance, betAmount)))
        .returning();

      if (!deducted) {
        // Throwing here causes Drizzle to roll back the entire transaction,
        // so neither the prediction row nor the market-count increment persists.
        throw new InsufficientBalanceError();
      }

      return inserted;
    });
  } catch (err: unknown) {
    if (err instanceof InsufficientBalanceError) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    // PostgreSQL unique-violation error code is '23505'
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      res.status(400).json({ error: "You have already predicted on this market" });
      return;
    }
    throw err;
  }

  res.status(201).json(
    MakePredictionResponse.parse({
      ...prediction,
      createdAt: prediction.createdAt.toISOString(),
    })
  );
});

export default router;
