/**
 * Integration tests for clockWorker.tick()
 *
 * Uses a REAL PostgreSQL connection (no mocks). Fixtures are inserted before each
 * test and cleaned up after, so the suite is safe to run alongside production data.
 *
 * What we verify:
 *   1. Expired OPEN markets are archived (status → ARCHIVED, freshnessScore → 0)
 *   2. Already-ARCHIVED markets are left untouched by tick()
 *   3. freshness_score is recomputed for OPEN markets that have an expiry
 *   4. RECURRING_PULSE markets spawn a successor after archiving
 *   5. The "successor already exists" guard prevents duplicate spawning
 *   6. An unknown refreshRule does NOT spawn a successor
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { eq, inArray, and } from "drizzle-orm";
import { db, pool, marketsTable } from "@workspace/db";
import { tick } from "./clockWorker.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const createdMarketIds: number[] = [];

/** One second in the past — clearly expired. */
const PAST = new Date(Date.now() - 1000);
/** One hour ago — further in the past. */
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
/** One day in the future. */
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function insertMarket(
  overrides: Partial<typeof marketsTable.$inferInsert>,
): Promise<number> {
  const [market] = await db
    .insert(marketsTable)
    .values({
      title: `_test_cw_${RUN_ID}_${Math.random().toString(36).slice(2)}`,
      question: "Will this test pass?",
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
// 1. Archive expired OPEN markets
// ---------------------------------------------------------------------------

describe("tick() — archiving expired OPEN markets", () => {
  it("sets status to ARCHIVED and freshnessScore to 0 for an expired OPEN market", async () => {
    const id = await insertMarket({ expireAt: PAST });

    await tick();

    const [market] = await db
      .select({ status: marketsTable.status, freshnessScore: marketsTable.freshnessScore })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.status).toBe("ARCHIVED");
    expect(market.freshnessScore).toBe(0);
  });

  it("does NOT touch an OPEN market whose expireAt is in the future", async () => {
    const id = await insertMarket({ expireAt: FUTURE });

    await tick();

    const [market] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.status).toBe("OPEN");
  });

  it("does NOT touch an OPEN market that has no expireAt (EVERGREEN)", async () => {
    const id = await insertMarket({ expireAt: null });

    await tick();

    const [market] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.status).toBe("OPEN");
  });

  it("leaves an already-ARCHIVED market with status ARCHIVED — tick() is idempotent", async () => {
    const id = await insertMarket({ expireAt: PAST, status: "ARCHIVED" });

    // The market is already archived; tick() should not error and should not flip it back.
    await tick();

    const [market] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.status).toBe("ARCHIVED");
  });

  it("archives multiple expired markets in one tick", async () => {
    const id1 = await insertMarket({ expireAt: PAST });
    const id2 = await insertMarket({ expireAt: ONE_HOUR_AGO });

    await tick();

    const markets = await db
      .select({ id: marketsTable.id, status: marketsTable.status })
      .from(marketsTable)
      .where(inArray(marketsTable.id, [id1, id2]));

    expect(markets).toHaveLength(2);
    for (const m of markets) {
      expect(m.status).toBe("ARCHIVED");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Freshness score recomputation
// ---------------------------------------------------------------------------

describe("tick() — freshness score recomputation", () => {
  it("sets freshnessScore to 100 for an OPEN market not yet at publishAt", async () => {
    const id = await insertMarket({
      publishAt: FUTURE, // hasn't launched yet
      expireAt: new Date(FUTURE.getTime() + 7 * 24 * 60 * 60 * 1000),
      freshnessScore: 0, // wrong initial value
    });

    await tick();

    const [market] = await db
      .select({ freshnessScore: marketsTable.freshnessScore })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.freshnessScore).toBe(100);
  });

  it("decrements freshnessScore for a mid-window OPEN market", async () => {
    // Window: 2 hours ago → 2 hours from now. Now is the midpoint → ~50.
    const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const id = await insertMarket({
      publishAt: windowStart,
      expireAt: windowEnd,
      freshnessScore: 0,
    });

    await tick();

    const [market] = await db
      .select({ freshnessScore: marketsTable.freshnessScore })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    // Midpoint of a 4-hour window → ~50 ± tolerance
    expect(market.freshnessScore).toBeGreaterThan(30);
    expect(market.freshnessScore).toBeLessThan(70);
  });

  it("does NOT modify freshnessScore for an EVERGREEN market (no expireAt — skipped by tick)", async () => {
    // tick() only processes markets with isNotNull(expireAt) for freshness recomputation;
    // EVERGREEN markets are intentionally left untouched by the tick loop.
    const id = await insertMarket({
      expireAt: null,
      freshnessScore: 42,
    });

    await tick();

    const [market] = await db
      .select({ freshnessScore: marketsTable.freshnessScore })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    // Tick doesn't touch EVERGREEN markets — score unchanged
    expect(market.freshnessScore).toBe(42);
  });

  it("sets freshnessScore to 100 during the peak window", async () => {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const windowEnd = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours from now
    const peakEnd = new Date(Date.now() + 2 * 60 * 60 * 1000); // peak until 2h from now

    const id = await insertMarket({
      publishAt: windowStart,
      expireAt: windowEnd,
      peakUntil: peakEnd,
      freshnessScore: 0,
    });

    await tick();

    const [market] = await db
      .select({ freshnessScore: marketsTable.freshnessScore })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.freshnessScore).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 3. RECURRING_PULSE successor spawning
// ---------------------------------------------------------------------------

describe("tick() — RECURRING_PULSE successor spawning", () => {
  it("spawns a OPEN successor for a MONTHLY RECURRING_PULSE market after archiving", async () => {
    const title = `_test_cw_recurring_${RUN_ID}`;
    const [parent] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Will this recur?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: PAST,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(parent.id);

    await tick();

    // Find the successor: same title, OPEN status, different id
    const successors = await db
      .select()
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));

    // Track successor for cleanup
    for (const s of successors) {
      if (!createdMarketIds.includes(s.id)) {
        createdMarketIds.push(s.id);
      }
    }

    expect(successors).toHaveLength(1);
    const successor = successors[0];
    expect(successor.clockType).toBe("RECURRING_PULSE");
    expect(successor.refreshRule).toBe("MONTHLY");
    // seriesId must trace back to the root
    expect(successor.seriesId).toBe(parent.id);
    // publishAt must be after the parent's expiry
    expect(successor.publishAt).not.toBeNull();
    expect(successor.publishAt!.getTime()).toBeGreaterThan(PAST.getTime());
  });

  it("spawns a WEEKLY successor with correct date window", async () => {
    const title = `_test_cw_weekly_${RUN_ID}`;
    const parentExpire = PAST;

    const [parent] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Will this recur weekly?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "WEEKLY",
        expireAt: parentExpire,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(parent.id);

    await tick();

    const successors = await db
      .select()
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));

    for (const s of successors) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    expect(successors).toHaveLength(1);
    const s = successors[0];
    // Weekly: publishAt = expireAt + 7 days; expireAt = publishAt + 7 days
    expect(s.publishAt).not.toBeNull();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(s.publishAt!.getTime()).toBeCloseTo(
      parentExpire.getTime() + sevenDaysMs,
      -3, // within ~1 second
    );
  });

  it("does NOT spawn a second successor when one already exists (guard against duplicates)", async () => {
    const title = `_test_cw_nodup_${RUN_ID}`;

    // Insert the parent — already expired
    const [parent] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Duplicate guard?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: PAST,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(parent.id);

    // Insert a successor that already exists
    const [existingSuccessor] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Duplicate guard?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: FUTURE,
        seriesId: parent.id,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(existingSuccessor.id);

    await tick();

    // Only the pre-existing successor should be OPEN
    const openSuccessors = await db
      .select({ id: marketsTable.id })
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));

    // Any new rows from tick() must be cleaned up
    for (const s of openSuccessors) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    expect(openSuccessors).toHaveLength(1);
    expect(openSuccessors[0].id).toBe(existingSuccessor.id);
  });

  it("does NOT spawn a successor for an unknown refreshRule", async () => {
    const title = `_test_cw_unknownrule_${RUN_ID}`;

    const [parent] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Unknown rule?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "QUARTERLY", // not implemented
        expireAt: PAST,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(parent.id);

    await tick();

    // No OPEN market with this title should exist (parent was archived, no successor)
    const openMarkets = await db
      .select({ id: marketsTable.id })
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));

    for (const s of openMarkets) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    expect(openMarkets).toHaveLength(0);

    // Parent must be archived
    const [p] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, parent.id));
    expect(p.status).toBe("ARCHIVED");
  });
});
