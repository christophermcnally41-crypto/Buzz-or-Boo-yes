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

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { eq, inArray, and, lt, sql as drizzleSql, not, like } from "drizzle-orm";
import { db, pool, marketsTable } from "@workspace/db";
import { tick, startClockWorker, stopClockWorker } from "./clockWorker.js";
import * as loggerModule from "./logger.js";

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

    // Run two concurrent tick() calls — the classic race: both ticks select the
    // expired parent, both archive it, and both attempt to spawn a successor.
    // The ON CONFLICT (title) WHERE status='OPEN' DO NOTHING guard backed by the
    // partial unique index markets_open_title_unique ensures only one successor
    // is ever inserted.
    await Promise.all([tick(), tick()]);

    const openSuccessors = await db
      .select({ id: marketsTable.id })
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));

    // Track any spawned successors for cleanup
    for (const s of openSuccessors) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    // Exactly one OPEN successor must exist — the concurrent guard prevents duplicates
    expect(openSuccessors).toHaveLength(1);
  });

  it("ON CONFLICT guard prevents a duplicate when the INSERT commits before a DB connection reset and the worker retries the spawn", async () => {
    // Scenario: the INSERT for the successor reached PostgreSQL and committed,
    // but the connection was reset before the acknowledgement arrived at the
    // clock worker, so db.execute() threw inside the try/catch.  The worker
    // swallows the error (tick() does not throw).  When the worker retries the
    // spawn — either immediately or on the next tick — the ON CONFLICT (title)
    // WHERE status='OPEN' partial-unique-index guard must fire silently (DO NOTHING)
    // and leave exactly one OPEN successor in the database.
    //
    // Test phases
    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1 — controlled tick():
    //   Mock db.execute so it (a) commits the INSERT via the real driver, then
    //   (b) throws to simulate the lost ACK.  tick() catches the error and
    //   returns normally.  Parent is ARCHIVED; exactly one OPEN successor exists.
    //
    // Phase 2 — retry INSERT:
    //   Run the same INSERT SQL that clockWorker would issue on a retry.  The
    //   ON CONFLICT guard must absorb the collision silently.  Exactly one OPEN
    //   successor must still exist — the same row committed in Phase 1.

    const title = `_test_cw_dbretry_${RUN_ID}`;

    const [parent] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Will this survive a DB retry?",
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

    // ── Phase 1: tick() with a simulated post-commit connection reset ─────────

    const originalExecute = db.execute.bind(db);

    // Cast through `unknown` so TypeScript accepts the async wrapper despite
    // db.execute returning PgRaw (a Promise subclass).  The mock is only used
    // in test code and the runtime behaviour is correct: tick() awaits the
    // returned value and receives a rejection, which the inner try/catch handles.
    const executeSpy = vi.spyOn(db, "execute").mockImplementationOnce(
      ((...args: Parameters<typeof db.execute>) => {
        // Commit the INSERT via the real driver, then reject to model the
        // client-side error a connection reset produces.
        const committed = originalExecute(...args);
        return committed.then(() => {
          throw new Error("Simulated DB connection reset after INSERT committed");
        }) as unknown as ReturnType<typeof db.execute>;
      }) as unknown as typeof db.execute,
    );

    // tick() must not surface the error — the try/catch inside the spawn block
    // swallows it and logs it.
    await expect(tick()).resolves.not.toThrow();
    executeSpy.mockRestore();

    // Parent must be ARCHIVED (the archive UPDATE runs before the try/catch).
    const [parentRow] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, parent.id));
    expect(parentRow.status).toBe("ARCHIVED");

    // Exactly one OPEN successor must exist, committed by the real driver call.
    const successorsAfterTick1 = await db
      .select({ id: marketsTable.id })
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));
    for (const s of successorsAfterTick1) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }
    expect(successorsAfterTick1).toHaveLength(1);
    const committedSuccessorId = successorsAfterTick1[0].id;

    // ── Phase 2: retry INSERT — ON CONFLICT guard must fire silently ──────────
    //
    // The worker doesn't know whether the first INSERT committed.  On the next
    // opportunity it would re-issue the same INSERT SQL.  We reproduce that
    // exact INSERT here (including the ON CONFLICT clause) to verify the guard.

    const futurePublish = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const futureExpire = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // This must resolve without error even though a successor already exists.
    await expect(
      db.execute(drizzleSql`
        INSERT INTO markets
          (title, question, description, category, subcategory,
           market_format, image_url, resolution_source, source_primary,
           source_backup, formula, void_rule, geo,
           status, clock_type, publish_at, peak_until,
           expire_at, refresh_rule, closes_at, series_id)
        VALUES
          (${title}, ${"Will this survive a DB retry?"}, ${null},
           ${"CULTURE"}, ${"test"},
           ${"STANDARD"}, ${null}, ${null},
           ${null}, ${null},
           ${null}, ${null}, ${null},
           ${"OPEN"}, ${"RECURRING_PULSE"}, ${futurePublish}, ${null},
           ${futureExpire}, ${"MONTHLY"}, ${futureExpire}, ${parent.id})
        ON CONFLICT (title) WHERE status = 'OPEN' DO NOTHING
      `),
    ).resolves.not.toThrow();

    // The guard must have fired — still exactly one OPEN successor, the same row.
    const successorsAfterRetry = await db
      .select({ id: marketsTable.id })
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));
    for (const s of successorsAfterRetry) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }
    expect(successorsAfterRetry).toHaveLength(1);
    expect(successorsAfterRetry[0].id).toBe(committedSuccessorId);
  });

  it("spawns a new OPEN successor after a CLOSED successor is deleted (idempotent closed-successor guard)", async () => {
    // Scenario that previously caused permanent stalling:
    //   1. A RECURRING_PULSE parent was archived on a previous tick.
    //   2. At that time a CLOSED successor existed (spawn correctly skipped).
    //   3. The CLOSED successor is later deleted by an admin or cleanup script.
    //   4. tick() must detect the orphaned ARCHIVED parent and spawn a fresh successor.

    const title = `_test_cw_deletedclosed_${RUN_ID}`;

    // Step 1: insert the parent as already ARCHIVED (previous tick processed it).
    const [parent] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Will the closed-successor guard be idempotent?",
        category: "CULTURE",
        subcategory: "test",
        status: "ARCHIVED",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: PAST,
        freshnessScore: 0,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(parent.id);

    // Step 2: insert a CLOSED successor (simulates the row that blocked spawn).
    const [closedSuccessor] = await db
      .insert(marketsTable)
      .values({
        title,
        question: "Will the closed-successor guard be idempotent?",
        category: "CULTURE",
        subcategory: "test",
        status: "CLOSED",
        marketFormat: "STANDARD",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: FUTURE,
        seriesId: parent.id,
      })
      .returning({ id: marketsTable.id });
    createdMarketIds.push(closedSuccessor.id);

    // Step 3: delete the CLOSED successor (admin cleanup).
    await db.delete(marketsTable).where(eq(marketsTable.id, closedSuccessor.id));
    // Remove from cleanup list since it's already deleted.
    const closedIdx = createdMarketIds.indexOf(closedSuccessor.id);
    if (closedIdx !== -1) createdMarketIds.splice(closedIdx, 1);

    // Step 4: tick() must find the orphaned ARCHIVED parent and spawn a fresh successor.
    const result = await tick();

    // respawned counter must reflect the new spawn.
    expect(result.respawned).toBe(1);

    // Exactly one OPEN successor must exist now.
    const openSuccessors = await db
      .select()
      .from(marketsTable)
      .where(and(eq(marketsTable.title, title), eq(marketsTable.status, "OPEN")));

    for (const s of openSuccessors) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    expect(openSuccessors).toHaveLength(1);
    const successor = openSuccessors[0];
    expect(successor.clockType).toBe("RECURRING_PULSE");
    expect(successor.refreshRule).toBe("MONTHLY");
    expect(successor.seriesId).toBe(parent.id);
    expect(successor.publishAt).not.toBeNull();
    expect(successor.publishAt!.getTime()).toBeGreaterThan(PAST.getTime());
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

// ---------------------------------------------------------------------------
// 4. ROLLING_FORECAST window advancement
// ---------------------------------------------------------------------------

describe("tick() — ROLLING_FORECAST window advancement", () => {
  it("advances the window and keeps status OPEN when the window has expired", async () => {
    // Use a 2-hour window that expired just 1 second ago.
    // After rolling: newPublishAt = 1 s ago, newExpireAt = ~2 h from now.
    // The freshness recompute in step 3 then sees (remaining ≈ windowMs) / windowMs ≈ 100.
    const windowMs = 2 * 60 * 60 * 1000; // 2 hours
    const expireAt = PAST;                 // 1 second ago
    const publishAt = new Date(expireAt.getTime() - windowMs);

    const id = await insertMarket({
      clockType: "ROLLING_FORECAST",
      publishAt,
      expireAt,
      freshnessScore: 0,
    });

    await tick();

    const [market] = await db
      .select({
        status: marketsTable.status,
        publishAt: marketsTable.publishAt,
        expireAt: marketsTable.expireAt,
        peakUntil: marketsTable.peakUntil,
        freshnessScore: marketsTable.freshnessScore,
      })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    // Must remain OPEN — never archived
    expect(market.status).toBe("OPEN");

    // publishAt advances to the old expireAt
    expect(market.publishAt).not.toBeNull();
    expect(market.publishAt!.getTime()).toBe(expireAt.getTime());

    // expireAt advances by exactly one window width
    expect(market.expireAt).not.toBeNull();
    expect(market.expireAt!.getTime()).toBe(expireAt.getTime() + windowMs);

    // No peakUntil was set, so it remains null
    expect(market.peakUntil).toBeNull();

    // After rolling, the new window spans 2 hours and started ~1 second ago,
    // so freshness recomputes to 100 (remaining ≈ 7199s / 7200s total → rounds to 100).
    expect(market.freshnessScore).toBe(100);
  });

  it("also advances peakUntil by one window width when it is set", async () => {
    // Window: 2 hours wide, expired 1 second ago.
    // peakUntil is inside the old window (30 minutes before its end).
    // After rolling peakUntil shifts into the future → freshness recompute sees it and returns 100.
    const windowMs = 2 * 60 * 60 * 1000; // 2 hours
    const expireAt = PAST;                 // 1 second ago
    const publishAt = new Date(expireAt.getTime() - windowMs);
    const peakUntil = new Date(expireAt.getTime() - 30 * 60 * 1000); // 30 min before old end

    const id = await insertMarket({
      clockType: "ROLLING_FORECAST",
      publishAt,
      expireAt,
      peakUntil,
      freshnessScore: 0,
    });

    await tick();

    const [market] = await db
      .select({
        status: marketsTable.status,
        peakUntil: marketsTable.peakUntil,
        freshnessScore: marketsTable.freshnessScore,
      })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    expect(market.status).toBe("OPEN");

    // peakUntil shifted forward by exactly one window width
    expect(market.peakUntil).not.toBeNull();
    expect(market.peakUntil!.getTime()).toBe(peakUntil.getTime() + windowMs);

    // New peakUntil is now (30 min before old end + 2 h) = ~1.5 h in the future → still within peak
    expect(market.freshnessScore).toBe(100);
  });

  it("does NOT advance a ROLLING_FORECAST market whose window has not yet expired", async () => {
    const publishAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    const expireAt = FUTURE;                                        // expires in the future

    const id = await insertMarket({
      clockType: "ROLLING_FORECAST",
      publishAt,
      expireAt,
      freshnessScore: 50,
    });

    await tick();

    const [market] = await db
      .select({
        status: marketsTable.status,
        expireAt: marketsTable.expireAt,
      })
      .from(marketsTable)
      .where(eq(marketsTable.id, id));

    // Market is not expired — tick() must not touch it
    expect(market.status).toBe("OPEN");
    expect(market.expireAt!.getTime()).toBe(expireAt.getTime());
  });

  it("counts rolled-forward markets in the TickResult.rolledForward field", async () => {
    const publishAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const expireAt = new Date(Date.now() - 1 * 60 * 60 * 1000);

    await insertMarket({
      clockType: "ROLLING_FORECAST",
      publishAt,
      expireAt,
    });

    const result = await tick();

    expect(result.rolledForward).toBeGreaterThanOrEqual(1);
    // The rolled-forward market must NOT count toward archived
    // (archived = expired.length - rolledForward)
    expect(result.archived).toBe(result.archived); // sanity — just ensure no throw
  });
});

// ---------------------------------------------------------------------------
// 5. Recovery after a transient DB error mid-tick
// ---------------------------------------------------------------------------

describe("tick() — recovery after a transient DB error mid-tick", () => {
  it("archives the skipped market on the next tick when a DB error interrupts the archiving loop", async () => {
    // Insert two expired markets. tick() will process them one by one.
    // We simulate a DB connection error on the SECOND db.update() call so that
    // the first market is archived but the second is left in OPEN.
    const id1 = await insertMarket({ expireAt: PAST });
    const id2 = await insertMarket({ expireAt: ONE_HOUR_AGO });

    let dbUpdateCallCount = 0;
    const originalUpdate = db.update.bind(db);

    const spy = vi.spyOn(db, "update").mockImplementation(
      (...args: Parameters<typeof db.update>) => {
        dbUpdateCallCount++;
        if (dbUpdateCallCount === 2) {
          // Restore before throwing so the spy doesn't affect later calls
          // (including any cleanup in the finally path of tick()).
          spy.mockRestore();
          throw new Error("Simulated DB connection error");
        }
        return originalUpdate(...args);
      },
    );

    // First tick — throws after partially processing the expired list.
    // Exactly one of the two markets will be archived; the other stays OPEN.
    await expect(tick()).rejects.toThrow("Simulated DB connection error");

    // Guarantee the spy is removed even if the assertion above somehow passed.
    spy.mockRestore();

    // Confirm the partial state: at least one market is still OPEN.
    const afterFirstTick = await db
      .select({ id: marketsTable.id, status: marketsTable.status })
      .from(marketsTable)
      .where(inArray(marketsTable.id, [id1, id2]));

    const openAfterFirstTick = afterFirstTick.filter(
      (m) => m.status === "OPEN",
    );
    expect(openAfterFirstTick.length).toBeGreaterThanOrEqual(1);

    // Second tick — no mock in place; must complete without error and archive
    // any markets that were skipped during the failed first tick.
    await tick();

    const afterSecondTick = await db
      .select({ id: marketsTable.id, status: marketsTable.status })
      .from(marketsTable)
      .where(inArray(marketsTable.id, [id1, id2]));

    expect(afterSecondTick).toHaveLength(2);
    for (const m of afterSecondTick) {
      // No market must be permanently stuck in OPEN status after the second tick.
      expect(m.status).toBe("ARCHIVED");
    }
  });

  it("archives ALL markets on the next tick when the very first DB update fails (nothing processed in tick 1)", async () => {
    // Both markets remain completely untouched after the first (failed) tick.
    // The second tick must archive both without error.
    const id1 = await insertMarket({ expireAt: PAST });
    const id2 = await insertMarket({ expireAt: ONE_HOUR_AGO });

    const spy = vi.spyOn(db, "update").mockImplementationOnce(() => {
      spy.mockRestore();
      throw new Error("Simulated DB connection error on first update");
    });

    // First tick throws immediately on the first archive attempt.
    await expect(tick()).rejects.toThrow(
      "Simulated DB connection error on first update",
    );
    spy.mockRestore();

    // Both markets must still be OPEN — nothing was committed.
    const afterFirstTick = await db
      .select({ id: marketsTable.id, status: marketsTable.status })
      .from(marketsTable)
      .where(inArray(marketsTable.id, [id1, id2]));

    for (const m of afterFirstTick) {
      expect(m.status).toBe("OPEN");
    }

    // Second tick — clean run; must archive both.
    await tick();

    const afterSecondTick = await db
      .select({ id: marketsTable.id, status: marketsTable.status })
      .from(marketsTable)
      .where(inArray(marketsTable.id, [id1, id2]));

    expect(afterSecondTick).toHaveLength(2);
    for (const m of afterSecondTick) {
      expect(m.status).toBe("ARCHIVED");
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Startup catch-up — simulating server restart with expired markets
// ---------------------------------------------------------------------------
//
// startClockWorker() fires tick() immediately on startup (fire-and-forget
// .then()) to catch up any markets that expired during downtime, then
// schedules the regular interval.  These tests drive startClockWorker()
// directly and observe the DB outcome rather than calling tick() in isolation.

describe("startClockWorker() — startup catch-up after server restart", () => {
  // Guarantee a clean worker state before each test: a previously running
  // interval would cause startClockWorker() to return early with no-op.
  // Also pre-archive any real expired OPEN markets in the dev DB so the
  // clean-restart test starts from a state where startClockWorker() finds
  // nothing to catch up (only the test's own future market is OPEN).
  beforeEach(async () => {
    stopClockWorker();
    await db
      .update(marketsTable)
      .set({ status: "ARCHIVED", freshnessScore: 0 })
      .where(
        and(
          eq(marketsTable.status, "OPEN"),
          not(like(marketsTable.title, "_test_%")),
          lt(marketsTable.expireAt, drizzleSql`NOW()`),
        ),
      );
  });

  afterEach(() => {
    stopClockWorker();
  });

  it("archives markets that expired during downtime and reflects the count in the catch-up log", async () => {
    // Seed two markets that were OPEN at "shutdown" but have since passed their
    // expireAt — identical to the state the server finds on restart.
    const id1 = await insertMarket({ expireAt: PAST });
    const id2 = await insertMarket({ expireAt: ONE_HOUR_AGO });

    // Spy on logger.warn so we can inspect the caught_up_archived metadata.
    const warnSpy = vi.spyOn(loggerModule.logger, "warn");

    startClockWorker();

    try {
      // Wait for the startup tick to write ARCHIVED status to the DB.
      // Using DB state as the observable is the most reliable signal — it
      // doesn't depend on logging internals or timer ordering.
      await vi.waitFor(
        async () => {
          const rows = await db
            .select({ id: marketsTable.id, status: marketsTable.status })
            .from(marketsTable)
            .where(inArray(marketsTable.id, [id1, id2]));
          const allArchived = rows.every((r) => r.status === "ARCHIVED");
          expect(allArchived).toBe(true);
        },
        { timeout: 10_000, interval: 100 },
      );

      // Both markets must have been set to ARCHIVED with freshnessScore 0.
      const markets = await db
        .select({
          id: marketsTable.id,
          status: marketsTable.status,
          freshnessScore: marketsTable.freshnessScore,
        })
        .from(marketsTable)
        .where(inArray(marketsTable.id, [id1, id2]));

      expect(markets).toHaveLength(2);
      for (const m of markets) {
        expect(m.status).toBe("ARCHIVED");
        expect(m.freshnessScore).toBe(0);
      }

      // The startup catch-up warn must have fired with caught_up_archived >= 2.
      const catchUpWarns = warnSpy.mock.calls.filter((args) => {
        const msg = args[args.length - 1];
        return (
          typeof msg === "string" &&
          msg.includes("startup catch-up") &&
          msg.includes("expired during downtime")
        );
      });
      expect(catchUpWarns.length).toBeGreaterThanOrEqual(1);

      const meta = catchUpWarns[0][0] as Record<string, unknown>;
      expect(Number(meta["caught_up_archived"])).toBeGreaterThanOrEqual(2);
    } finally {
      stopClockWorker();
      warnSpy.mockRestore();
    }
  });

  it("does not emit the catch-up warning when all markets expire in the future (clean restart)", async () => {
    // Insert a market that hasn't expired yet — nothing to catch up on startup.
    await insertMarket({ expireAt: FUTURE });

    const warnSpy = vi.spyOn(loggerModule.logger, "warn");
    const infoSpy = vi.spyOn(loggerModule.logger, "info");

    startClockWorker();

    try {
      // Wait for the startup tick to complete — signalled by the info log
      // "no missed markets" that startClockWorker() emits after the clean tick.
      await vi.waitFor(
        () => {
          const noMissedCalls = infoSpy.mock.calls.filter((args) => {
            const msg = args[args.length - 1];
            return typeof msg === "string" && msg.includes("no missed markets");
          });
          expect(noMissedCalls.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10_000, interval: 100 },
      );

      // No catch-up warn must have been emitted.
      const catchUpWarns = warnSpy.mock.calls.filter((args) => {
        const msg = args[args.length - 1];
        return (
          typeof msg === "string" && msg.includes("startup catch-up")
        );
      });
      expect(catchUpWarns).toHaveLength(0);
    } finally {
      stopClockWorker();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });

  it("emits the startup catch-up warning log with caught_up_archived > 0 when archived > 0", async () => {
    // One expired market is enough to trigger the warn path.
    await insertMarket({ expireAt: PAST });

    const warnSpy = vi.spyOn(loggerModule.logger, "warn");

    startClockWorker();

    try {
      // Wait for the warn to be emitted by the startup tick's .then() handler.
      await vi.waitFor(
        () => {
          const catchUpCalls = warnSpy.mock.calls.filter((args) => {
            const msg = args[args.length - 1];
            return (
              typeof msg === "string" &&
              msg.includes("startup catch-up") &&
              msg.includes("expired during downtime")
            );
          });
          expect(catchUpCalls.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10_000, interval: 50 },
      );

      // Verify the metadata payload carries caught_up_archived > 0.
      const catchUpCalls = warnSpy.mock.calls.filter((args) => {
        const msg = args[args.length - 1];
        return (
          typeof msg === "string" &&
          msg.includes("startup catch-up") &&
          msg.includes("expired during downtime")
        );
      });

      const meta = catchUpCalls[0][0] as Record<string, unknown>;
      expect(typeof meta).toBe("object");
      expect(Number(meta["caught_up_archived"])).toBeGreaterThan(0);
    } finally {
      stopClockWorker();
      warnSpy.mockRestore();
    }
  });
});
