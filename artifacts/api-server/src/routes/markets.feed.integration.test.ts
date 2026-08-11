/**
 * Integration tests — public market feed filtering
 *
 * Verifies that GET /api/markets and GET /api/markets/trending correctly exclude:
 *   1. Markets whose expire_at is in the past (even if status is still OPEN)
 *   2. Markets whose publish_at is in the future (scheduled but not yet live)
 *
 * Uses a REAL PostgreSQL connection (no mocks). Test fixtures are inserted before
 * each test and deleted after.
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

const PAST = new Date(Date.now() - 60 * 1000); // 1 minute ago
const FUTURE = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
const FAR_FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now

async function insertMarket(
  overrides: Partial<typeof marketsTable.$inferInsert>,
): Promise<number> {
  const [market] = await db
    .insert(marketsTable)
    .values({
      title: `_test_feed_${RUN_ID}_${Math.random().toString(36).slice(2)}`,
      question: "Feed test question?",
      category: "CULTURE",
      subcategory: "test",
      status: "OPEN",
      marketFormat: "STANDARD",
      ...overrides,
    })
    .returning({ id: marketsTable.id });
  createdMarketIds.push(market.id);
  return market.id;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
  createdMarketIds.length = 0;
});

afterEach(async () => {
  if (createdMarketIds.length > 0) {
    await db
      .delete(marketsTable)
      .where(inArray(marketsTable.id, createdMarketIds));
  }
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Helper: check if a market id appears in a feed response
// ---------------------------------------------------------------------------

async function getMarketIds(path: string): Promise<number[]> {
  const app = buildApp();
  const res = await request(app).get(path);
  expect(res.status).toBe(200);
  const markets: Array<{ id: number }> = res.body.markets ?? res.body;
  return markets.map((m) => m.id);
}

// ---------------------------------------------------------------------------
// GET /markets — expiry filtering
// ---------------------------------------------------------------------------

describe("GET /markets — expired market filtering", () => {
  it("excludes a market whose expireAt is in the past (worker hasn't archived it yet)", async () => {
    const expiredId = await insertMarket({ expireAt: PAST, status: "OPEN" });

    const ids = await getMarketIds("/markets");
    expect(ids).not.toContain(expiredId);
  });

  it("includes a market whose expireAt is in the future", async () => {
    const activeId = await insertMarket({ expireAt: FUTURE });

    const ids = await getMarketIds("/markets");
    expect(ids).toContain(activeId);
  });

  it("includes an EVERGREEN market (no expireAt)", async () => {
    const evergreenId = await insertMarket({ expireAt: null });

    const ids = await getMarketIds("/markets");
    expect(ids).toContain(evergreenId);
  });

  it("excludes expired markets and includes active markets simultaneously", async () => {
    const expiredId = await insertMarket({ expireAt: PAST, status: "OPEN" });
    const activeId = await insertMarket({ expireAt: FUTURE });

    const ids = await getMarketIds("/markets");

    expect(ids).not.toContain(expiredId);
    expect(ids).toContain(activeId);
  });

  it("excludes ARCHIVED markets when status=OPEN is requested", async () => {
    const archivedId = await insertMarket({ status: "ARCHIVED", expireAt: FUTURE });

    // The /markets route requires an explicit status=OPEN filter to exclude
    // archived markets; without it all statuses are returned.
    const ids = await getMarketIds("/markets?status=OPEN");
    expect(ids).not.toContain(archivedId);
  });
});

// ---------------------------------------------------------------------------
// GET /markets — publishAt filtering
// ---------------------------------------------------------------------------

describe("GET /markets — future publishAt filtering", () => {
  it("excludes a market whose publishAt is in the future (scheduled but not live)", async () => {
    const scheduledId = await insertMarket({ publishAt: FUTURE, expireAt: FAR_FUTURE });

    const ids = await getMarketIds("/markets");
    expect(ids).not.toContain(scheduledId);
  });

  it("includes a market whose publishAt is in the past (already live)", async () => {
    const liveId = await insertMarket({
      publishAt: new Date(Date.now() - 60 * 1000),
      expireAt: FUTURE,
    });

    const ids = await getMarketIds("/markets");
    expect(ids).toContain(liveId);
  });

  it("includes a market with no publishAt at all (immediately live)", async () => {
    const noPublishAtId = await insertMarket({ publishAt: null, expireAt: FUTURE });

    const ids = await getMarketIds("/markets");
    expect(ids).toContain(noPublishAtId);
  });

  it("excludes a market that is scheduled AND expired", async () => {
    const id = await insertMarket({ publishAt: FUTURE, expireAt: PAST, status: "OPEN" });

    const ids = await getMarketIds("/markets");
    expect(ids).not.toContain(id);
  });
});

// ---------------------------------------------------------------------------
// GET /markets/trending — expiry filtering
// ---------------------------------------------------------------------------

describe("GET /markets/trending — expired market filtering", () => {
  it("excludes a market whose expireAt is in the past from trending", async () => {
    const expiredId = await insertMarket({
      expireAt: PAST,
      status: "OPEN",
      totalPredictions: 9999, // high engagement — would rank first if included
    });

    const ids = await getMarketIds("/markets/trending");
    expect(ids).not.toContain(expiredId);
  });

  it("includes an active market in trending results", async () => {
    const activeId = await insertMarket({ expireAt: FUTURE, totalPredictions: 1 });

    // Use a large limit to avoid being pushed off the list by other markets.
    const ids = await getMarketIds("/markets/trending?limit=200");
    expect(ids).toContain(activeId);
  });

  it("excludes an EVERGREEN market from trending when it is ARCHIVED", async () => {
    const archivedId = await insertMarket({ expireAt: null, status: "ARCHIVED" });

    const ids = await getMarketIds("/markets/trending");
    expect(ids).not.toContain(archivedId);
  });
});

// ---------------------------------------------------------------------------
// GET /markets/trending — publishAt filtering
// ---------------------------------------------------------------------------

describe("GET /markets/trending — future publishAt filtering", () => {
  it("excludes a scheduled (future publishAt) market from trending", async () => {
    const scheduledId = await insertMarket({
      publishAt: FUTURE,
      expireAt: FAR_FUTURE,
      totalPredictions: 9999,
    });

    const ids = await getMarketIds("/markets/trending");
    expect(ids).not.toContain(scheduledId);
  });

  it("includes a market with a past publishAt in trending", async () => {
    const liveId = await insertMarket({
      publishAt: new Date(Date.now() - 60 * 1000),
      expireAt: FUTURE,
      totalPredictions: 1,
    });

    // Use a large limit to avoid being pushed off the list by other markets.
    const ids = await getMarketIds("/markets/trending?limit=200");
    expect(ids).toContain(liveId);
  });
});

// ---------------------------------------------------------------------------
// GET /markets/:id — expiry and publishAt filtering
// ---------------------------------------------------------------------------

describe("GET /markets/:id — expiry filtering", () => {
  it("returns 404 for a market whose expireAt is in the past (worker hasn't archived it yet)", async () => {
    const app = buildApp();
    const expiredId = await insertMarket({ expireAt: PAST, status: "OPEN" });

    const res = await request(app).get(`/markets/${expiredId}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 for a market whose expireAt is in the future", async () => {
    const app = buildApp();
    const activeId = await insertMarket({ expireAt: FUTURE });

    const res = await request(app).get(`/markets/${activeId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(activeId);
  });

  it("returns 200 for an EVERGREEN market (no expireAt)", async () => {
    const app = buildApp();
    const evergreenId = await insertMarket({ expireAt: null });

    const res = await request(app).get(`/markets/${evergreenId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(evergreenId);
  });

  it("returns 404 for a market whose publishAt is in the future (not yet live)", async () => {
    const app = buildApp();
    const scheduledId = await insertMarket({ publishAt: FUTURE, expireAt: FAR_FUTURE });

    const res = await request(app).get(`/markets/${scheduledId}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 for a market whose publishAt is in the past (already live)", async () => {
    const app = buildApp();
    const liveId = await insertMarket({
      publishAt: new Date(Date.now() - 60 * 1000),
      expireAt: FUTURE,
    });

    const res = await request(app).get(`/markets/${liveId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(liveId);
  });
});
