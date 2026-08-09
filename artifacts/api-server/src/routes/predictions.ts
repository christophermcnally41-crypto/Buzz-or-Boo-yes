import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, marketsTable, predictionsTable, usersTable } from "@workspace/db";
import {
  MakePredictionParams,
  MakePredictionBody,
  MakePredictionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/markets/:id/predict", async (req, res): Promise<void> => {
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

  const { userId, choice, amount } = parsed.data;
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

  // Validate user exists and has enough tokens
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const betAmount = amount ?? 100;
  if (user.tokenBalance < betAmount) {
    res.status(400).json({ error: "Insufficient token balance" });
    return;
  }

  // Check if user already predicted on this market
  const [existing] = await db
    .select()
    .from(predictionsTable)
    .where(and(eq(predictionsTable.userId, userId), eq(predictionsTable.marketId, marketId)));

  if (existing) {
    res.status(400).json({ error: "You have already predicted on this market" });
    return;
  }

  // Create prediction
  const [prediction] = await db
    .insert(predictionsTable)
    .values({ userId, marketId, choice, amount: betAmount })
    .returning();

  // Update market counts
  if (choice === "YES") {
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

  // Deduct tokens and increment prediction count
  await db
    .update(usersTable)
    .set({
      tokenBalance: user.tokenBalance - betAmount,
      totalPredictions: user.totalPredictions + 1,
    })
    .where(eq(usersTable.id, userId));

  res.status(201).json(
    MakePredictionResponse.parse({
      ...prediction,
      createdAt: prediction.createdAt.toISOString(),
    })
  );
});

export default router;
