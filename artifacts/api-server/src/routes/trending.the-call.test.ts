/**
 * Confirms that THE_CALL format markets appear in GET /markets/trending
 * when they have accumulated predictions.
 *
 * The trending endpoint orders all OPEN markets by totalPredictions with no
 * format filter, so THE_CALL markets compete on equal footing with other
 * formats. These tests verify that assumption holds end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { inArray } from "drizzle-orm";
import { db, pool, marketsTable } from "@workspace/db";
import marketsRouter from "./markets.js";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(marketsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const createdMarketIds: number[] = [];

const FUTURE = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

const THE_CALL_DESCRIPTION = JSON.stringify({
  options: [
    { key: "A", label: "Option A" },
    { key: "B", label: "Option B" },
    { key: "C", label: "Option C" },
  ],
  context: "Pick the best option.",
});

async function insertMarket(
  overrides: Partial<typeof marketsTable.$inferInsert>,
): Promise<number> {
  const [market] = await db
    .insert(marketsTable)
    .values({
      title: `_test_trending_thecall_${RUN_ID}_${Math.random().toString(36).slice(2)}`,
      question: "Trending test question?",
      category: "CULTURE",
      subcategory: "test",
      status: "OPEN",
      marketFormat: "STANDARD",
      expireAt: FUTURE,
      ...overrides,
    })
    .returning({ id: marketsTable.id });
  createdMarketIds.push(market.id);
  return market.id;
}

async function getTrendingIds(limit = 200): Promise<number[]> {
  const app = buildApp();
  const res = await request(app).get(`/markets/trending?limit=${limit}`);
  expect(res.status).toBe(200);
  const markets: Array<{ id: number }> = res.body.markets ?? [];
  return markets.map((m) => m.id);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
  createdMarketIds.length = 0;
});

afterEach(async () => {
  if (createdMarketIds.length > 0) {
    await db.delete(marketsTable).where(inArray(marketsTable.id, createdMarketIds));
  }
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /markets/trending — THE_CALL format inclusion", () => {
  it("includes a THE_CALL market with predictions in the trending results", async () => {
    const theCallId = await insertMarket({
      marketFormat: "THE_CALL",
      description: THE_CALL_DESCRIPTION,
      totalPredictions: 50,
    });

    const ids = await getTrendingIds();
    expect(ids).toContain(theCallId);
  });

  it("ranks a high-traction THE_CALL market above a low-traction STANDARD market", async () => {
    const theCallId = await insertMarket({
      marketFormat: "THE_CALL",
      description: THE_CALL_DESCRIPTION,
      totalPredictions: 500,
    });
    const standardId = await insertMarket({
      marketFormat: "STANDARD",
      totalPredictions: 1,
    });

    const ids = await getTrendingIds();
    const theCallPos = ids.indexOf(theCallId);
    const standardPos = ids.indexOf(standardId);

    expect(theCallPos).toBeGreaterThanOrEqual(0);
    expect(standardPos).toBeGreaterThanOrEqual(0);
    // THE_CALL with 500 predictions should appear before STANDARD with 1
    expect(theCallPos).toBeLessThan(standardPos);
  });

  it("does not include a RESOLVED THE_CALL market in trending", async () => {
    const resolvedId = await insertMarket({
      marketFormat: "THE_CALL",
      description: THE_CALL_DESCRIPTION,
      status: "RESOLVED",
      totalPredictions: 9999, // would rank first if not filtered out
    });

    const ids = await getTrendingIds();
    expect(ids).not.toContain(resolvedId);
  });

  it("does not include an expired THE_CALL market in trending", async () => {
    const expiredId = await insertMarket({
      marketFormat: "THE_CALL",
      description: THE_CALL_DESCRIPTION,
      status: "OPEN",
      expireAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
      totalPredictions: 9999,
    });

    const ids = await getTrendingIds();
    expect(ids).not.toContain(expiredId);
  });

  it("THE_CALL and MULTI_CHOICE and HOT_OR_NOT all appear together in trending when all are OPEN", async () => {
    const theCallId = await insertMarket({
      marketFormat: "THE_CALL",
      description: THE_CALL_DESCRIPTION,
      totalPredictions: 10,
    });
    const multiChoiceId = await insertMarket({
      marketFormat: "MULTI_CHOICE",
      totalPredictions: 10,
    });
    const hotOrNotId = await insertMarket({
      marketFormat: "HOT_OR_NOT",
      totalPredictions: 10,
    });

    const ids = await getTrendingIds();
    expect(ids).toContain(theCallId);
    expect(ids).toContain(multiChoiceId);
    expect(ids).toContain(hotOrNotId);
  });
});
