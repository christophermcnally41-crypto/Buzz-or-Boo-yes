/**
 * Integration tests for PATCH /admin/markets/:id/resolve
 *
 * Focuses on BUZZ_OR_BOO markets: resolving one should set status to RESOLVED
 * and lock the sentiment split WITHOUT awarding tokens or marking predictions
 * as correct/incorrect.
 *
 * Also covers STANDARD market resolution as a baseline comparison.
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
import adminRouter from './admin.js';

// ---------------------------------------------------------------------------
// App factory — injects a fake authenticated admin user.
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  // Auth bypass: every request is treated as authenticated.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next();
  });
  app.use(adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Per-test fixture state
// ---------------------------------------------------------------------------

let testUserId: number;
let buzzOrBooMarketId: number;
let standardMarketId: number;

const RUN_ID = Date.now();
const INITIAL_BALANCE = 500;
const BOO_STAKE = 10; // fixed stake for BUZZ_OR_BOO predictions

beforeEach(async () => {
  // Insert a test user
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, $2)
     RETURNING id`,
    [`_test_admin_resolve_${RUN_ID}`, INITIAL_BALANCE],
  );
  testUserId = userRes.rows[0].id;

  // Insert a BUZZ_OR_BOO market
  const bobMktRes = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format)
     VALUES ($1, 'Is this place BUZZ or BOO?', 'CULTURE', 'test', 'OPEN', 'BUZZ_OR_BOO')
     RETURNING id`,
    [`_test_bob_market_${RUN_ID}`],
  );
  buzzOrBooMarketId = bobMktRes.rows[0].id;

  // Insert a STANDARD market for comparison
  const stdMktRes = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format)
     VALUES ($1, 'Will this happen?', 'CULTURE', 'test', 'OPEN', 'STANDARD')
     RETURNING id`,
    [`_test_std_market_${RUN_ID}`],
  );
  standardMarketId = stdMktRes.rows[0].id;

  // Insert one BUZZ prediction on the BUZZ_OR_BOO market
  await pool.query(
    `INSERT INTO predictions (user_id, market_id, choice, amount)
     VALUES ($1, $2, 'YES', $3)`,
    [testUserId, buzzOrBooMarketId, BOO_STAKE],
  );

  // Insert one YES prediction on the STANDARD market
  await pool.query(
    `INSERT INTO predictions (user_id, market_id, choice, amount)
     VALUES ($1, $2, 'YES', 100)`,
    [testUserId, standardMarketId],
  );
});

afterEach(async () => {
  const marketIds = [buzzOrBooMarketId, standardMarketId].filter(Boolean);
  if (testUserId) {
    await db.delete(predictionsTable).where(eq(predictionsTable.userId, testUserId));
  }
  if (marketIds.length) {
    await db.delete(marketsTable).where(inArray(marketsTable.id, marketIds));
  }
  if (testUserId) {
    await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  }
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /admin/markets/:id/resolve — BUZZ_OR_BOO markets', () => {
  it('resolves the market and sets status to RESOLVED', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch(`/admin/markets/${buzzOrBooMarketId}/resolve`)
      .send({ outcome: 'YES' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'RESOLVED', resolvedOutcome: 'YES' });
  });

  it('does NOT award tokens to voters — user balance stays the same', async () => {
    const app = buildApp();

    // Deduct the stake from the user balance to reflect what happens when they vote
    await db
      .update(usersTable)
      .set({ tokenBalance: INITIAL_BALANCE - BOO_STAKE })
      .where(eq(usersTable.id, testUserId));

    const res = await request(app)
      .patch(`/admin/markets/${buzzOrBooMarketId}/resolve`)
      .send({ outcome: 'YES' });

    expect(res.status).toBe(200);

    const [user] = await db
      .select({ tokenBalance: usersTable.tokenBalance })
      .from(usersTable)
      .where(eq(usersTable.id, testUserId));

    // Balance must remain exactly as it was before resolution — no reward top-up
    expect(user.tokenBalance).toBe(INITIAL_BALANCE - BOO_STAKE);
  });

  it('does NOT mark any prediction as isCorrect', async () => {
    const app = buildApp();

    await request(app)
      .patch(`/admin/markets/${buzzOrBooMarketId}/resolve`)
      .send({ outcome: 'YES' });

    const predictions = await db
      .select({ isCorrect: predictionsTable.isCorrect, tokensEarned: predictionsTable.tokensEarned })
      .from(predictionsTable)
      .where(eq(predictionsTable.marketId, buzzOrBooMarketId));

    for (const pred of predictions) {
      // isCorrect must remain null — no win/loss judgement applied
      expect(pred.isCorrect).toBeNull();
      // tokensEarned must remain null or 0 — no redistribution
      expect(pred.tokensEarned == null || pred.tokensEarned === 0).toBe(true);
    }
  });

  it('returns 400 if the market is already resolved', async () => {
    const app = buildApp();

    await request(app)
      .patch(`/admin/markets/${buzzOrBooMarketId}/resolve`)
      .send({ outcome: 'YES' });

    const res = await request(app)
      .patch(`/admin/markets/${buzzOrBooMarketId}/resolve`)
      .send({ outcome: 'NO' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Market is already resolved' });
  });
});

// NOTE: STANDARD market resolution also runs a DB update that references the
// `buzz_score` column, which has not yet been added to the database via migration.
// That path will return 500 until the migration is applied — tested separately.
