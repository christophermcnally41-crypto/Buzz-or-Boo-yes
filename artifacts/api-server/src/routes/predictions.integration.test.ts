/**
 * Integration test for POST /markets/:id/predict — balance-guard under concurrency.
 *
 * Uses a REAL PostgreSQL connection (no mocks). Test fixtures are inserted before
 * each test and deleted after, so this suite is safe to run alongside production data.
 *
 * What we verify:
 *   1. Two simultaneous predict requests for the same user whose balance equals
 *      exactly one bet (100 tokens) produce exactly one 201 and one 400.
 *   2. The 400 body contains { error: "Insufficient balance" }.
 *   3. After both requests settle the user's tokenBalance in the DB is 0, never negative.
 *   4. Exactly one prediction row survives (the losing one is rolled back).
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { eq, inArray } from 'drizzle-orm';
import {
  db,
  pool,
  usersTable,
  marketsTable,
  predictionsTable,
} from '@workspace/db';
import predictionsRouter from './predictions.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default stake when no amount is supplied (matches the route default). */
const BET_AMOUNT = 100;

// ---------------------------------------------------------------------------
// App factory — bypasses real auth, injects the test user's platform ID.
// ---------------------------------------------------------------------------

function buildApp(platformUserId: number) {
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    req.user = { id: String(platformUserId) } as Express.User;
    next();
  });

  app.use(predictionsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Per-test fixture state
// ---------------------------------------------------------------------------

let testUserId: number;
let marketId1: number;
let marketId2: number;

/** Unique suffix so parallel test runs in CI don't collide. */
const RUN_ID = Date.now();

beforeEach(async () => {
  // Use raw SQL for fixture creation so we only touch the columns that actually
  // exist in the DB. The drizzle schema may be ahead of applied migrations
  // (e.g. buzz_score, last_topup_at are in schema.ts but not yet in the DB),
  // and drizzle's INSERT enumerates every column in the schema definition.
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, $2)
     RETURNING id`,
    [`_test_concurrent_${RUN_ID}`, BET_AMOUNT],
  );
  testUserId = userRes.rows[0].id;

  // Two separate open markets so both concurrent requests can each insert a
  // prediction (different marketId), allowing the balance-deduction race to be
  // the deciding factor — not the unique-index on (userId, marketId).
  const mktRes = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format)
     VALUES
       ($1, 'Test question A?', 'CULTURE', 'test', 'OPEN', 'STANDARD'),
       ($2, 'Test question B?', 'CULTURE', 'test', 'OPEN', 'STANDARD')
     RETURNING id`,
    [`_test_market_A_${RUN_ID}`, `_test_market_B_${RUN_ID}`],
  );
  marketId1 = mktRes.rows[0].id;
  marketId2 = mktRes.rows[1].id;
});

afterEach(async () => {
  // Remove test predictions, then markets, then the user.
  // Order matters: FK constraints predictions→markets and predictions→users.
  if (testUserId) {
    await db
      .delete(predictionsTable)
      .where(eq(predictionsTable.userId, testUserId));
  }
  if (marketId1 || marketId2) {
    const ids = [marketId1, marketId2].filter(Boolean);
    await db.delete(marketsTable).where(inArray(marketsTable.id, ids));
  }
  if (testUserId) {
    await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  }
});

afterAll(async () => {
  // Release the pg connection pool so Vitest can exit cleanly.
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /markets/:id/predict — concurrent balance guard (integration)', () => {
  // -------------------------------------------------------------------------
  // Core concurrency test
  // -------------------------------------------------------------------------
  it('lets exactly one of two simultaneous bets succeed when balance covers only one bet', async () => {
    const app = buildApp(testUserId);

    // Fire both requests in parallel — Node.js event loop interleaves them at
    // each await point, which is the concurrency mode the atomic guard must survive.
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/markets/${marketId1}/predict`)
        .send({ choice: 'YES', amount: BET_AMOUNT }),
      request(app)
        .post(`/markets/${marketId2}/predict`)
        .send({ choice: 'YES', amount: BET_AMOUNT }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 201 (accepted) and one 400 (rejected).
    expect(statuses).toEqual([201, 400]);

    // The failing request must carry the correct error.
    const failedRes = res1.status === 400 ? res1 : res2;
    expect(failedRes.body).toMatchObject({ error: 'Insufficient balance' });
  });

  // -------------------------------------------------------------------------
  // Persisted balance must be 0, never negative.
  // -------------------------------------------------------------------------
  it('leaves the user tokenBalance at exactly 0 in the database — never negative', async () => {
    const app = buildApp(testUserId);

    await Promise.all([
      request(app)
        .post(`/markets/${marketId1}/predict`)
        .send({ choice: 'YES', amount: BET_AMOUNT }),
      request(app)
        .post(`/markets/${marketId2}/predict`)
        .send({ choice: 'YES', amount: BET_AMOUNT }),
    ]);

    // Read the actual persisted balance from the database.
    const [user] = await db
      .select({ tokenBalance: usersTable.tokenBalance })
      .from(usersTable)
      .where(eq(usersTable.id, testUserId));

    expect(user).toBeDefined();
    expect(user.tokenBalance).toBe(0);
    expect(user.tokenBalance).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // Exactly one prediction row survives — the loser's is rolled back.
  // -------------------------------------------------------------------------
  it('leaves exactly one surviving prediction row after the concurrent race', async () => {
    const app = buildApp(testUserId);

    await Promise.all([
      request(app)
        .post(`/markets/${marketId1}/predict`)
        .send({ choice: 'YES', amount: BET_AMOUNT }),
      request(app)
        .post(`/markets/${marketId2}/predict`)
        .send({ choice: 'YES', amount: BET_AMOUNT }),
    ]);

    const surviving = await db
      .select({ id: predictionsTable.id })
      .from(predictionsTable)
      .where(eq(predictionsTable.userId, testUserId));

    // Exactly one prediction should remain; the other must have been deleted.
    expect(surviving).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Baseline: a single request with sufficient balance still succeeds normally.
  // -------------------------------------------------------------------------
  it('accepts a single bet when the user has exactly enough balance', async () => {
    const app = buildApp(testUserId);

    const res = await request(app)
      .post(`/markets/${marketId1}/predict`)
      .send({ choice: 'YES', amount: BET_AMOUNT });

    expect(res.status).toBe(201);

    // Verify the balance was decremented all the way to 0.
    const [user] = await db
      .select({ tokenBalance: usersTable.tokenBalance })
      .from(usersTable)
      .where(eq(usersTable.id, testUserId));

    expect(user.tokenBalance).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Baseline: request with insufficient balance returns 400 immediately.
  // -------------------------------------------------------------------------
  it('rejects a bet when the user has fewer tokens than the stake', async () => {
    // Set user balance to something smaller than one bet.
    await db
      .update(usersTable)
      .set({ tokenBalance: 50 })
      .where(eq(usersTable.id, testUserId));

    const app = buildApp(testUserId);

    const res = await request(app)
      .post(`/markets/${marketId1}/predict`)
      .send({ choice: 'YES', amount: BET_AMOUNT });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Insufficient balance' });

    // Balance must be unchanged.
    const [user] = await db
      .select({ tokenBalance: usersTable.tokenBalance })
      .from(usersTable)
      .where(eq(usersTable.id, testUserId));

    expect(user.tokenBalance).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Rollback consistency: market counts must NOT drift when a bet is rejected.
  //
  // This is the direct regression test for the original bug: the market count
  // update and the balance deduction run inside one DB transaction, so a
  // failed deduction (insufficient balance) rolls back the count increment too.
  // -------------------------------------------------------------------------
  it('leaves market counts unchanged when a bet is rejected for insufficient balance', async () => {
    // Give the user less than one bet's worth.
    await db
      .update(usersTable)
      .set({ tokenBalance: 50 })
      .where(eq(usersTable.id, testUserId));

    const app = buildApp(testUserId);

    const res = await request(app)
      .post(`/markets/${marketId1}/predict`)
      .send({ choice: 'YES', amount: BET_AMOUNT });

    expect(res.status).toBe(400);

    // All three market-count columns must still be at their initial values.
    const [market] = await db
      .select({
        yesCount: marketsTable.yesCount,
        noCount: marketsTable.noCount,
        totalPredictions: marketsTable.totalPredictions,
      })
      .from(marketsTable)
      .where(eq(marketsTable.id, marketId1));

    expect(market).toBeDefined();
    expect(market.yesCount).toBe(0);
    expect(market.noCount).toBe(0);
    expect(market.totalPredictions).toBe(0);
  });
});
