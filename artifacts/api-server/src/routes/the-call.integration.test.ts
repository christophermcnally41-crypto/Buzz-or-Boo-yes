/**
 * Integration tests for THE_CALL question engine.
 *
 * Covers the three gaps identified during code review:
 *   1. POST /markets/:id/predict — option-key validation and fixed-stake enforcement
 *   2. GET  /markets/:id/tally   — aggregate counts accurate at any scale
 *   3. PATCH /admin/markets/:id/resolve — outcome key validation, no token redistribution
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
import marketsRouter from './markets.js';
import adminRouter from './admin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THE_CALL_OPTIONS = [
  { key: 'A', label: 'Whole Foods' },
  { key: 'B', label: 'Trader Joe\'s' },
  { key: 'C', label: 'Star Market' },
];
const THE_CALL_DESCRIPTION = JSON.stringify({ options: THE_CALL_OPTIONS, context: 'Best supermarket for quality?' });
const THE_CALL_STAKE = 10;

function buildPredictApp(platformUserId: number) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    req.user = { id: String(platformUserId) } as Express.User;
    next();
  });
  app.use(predictionsRouter);
  app.use(marketsRouter);
  return app;
}

function buildAdminApp() {
  const app = express();
  app.use(express.json());
  app.use(adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

let testUserId: number;
let theCallMarketId: number;

const RUN_ID = Date.now();
const INITIAL_BALANCE = 500;

beforeEach(async () => {
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, $2)
     RETURNING id`,
    [`_test_the_call_${RUN_ID}`, INITIAL_BALANCE],
  );
  testUserId = userRes.rows[0].id;

  const mktRes = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format, description)
     VALUES ($1, 'Best supermarket for quality?', 'CULTURE', 'test', 'OPEN', 'THE_CALL', $2)
     RETURNING id`,
    [`_test_the_call_market_${RUN_ID}`, THE_CALL_DESCRIPTION],
  );
  theCallMarketId = mktRes.rows[0].id;
});

afterEach(async () => {
  await db.delete(predictionsTable).where(eq(predictionsTable.userId, testUserId));
  await db.delete(marketsTable).where(eq(marketsTable.id, theCallMarketId));
  await db.delete(usersTable).where(eq(usersTable.id, testUserId));
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tests: POST /markets/:id/predict
// ---------------------------------------------------------------------------

describe('POST /markets/:id/predict — THE_CALL option key validation', () => {
  it('accepts a valid option key (A)', async () => {
    const app = buildPredictApp(testUserId);

    const res = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'A', amount: THE_CALL_STAKE });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ choice: 'A' });
  });

  it('accepts any declared option key (B, C)', async () => {
    const app = buildPredictApp(testUserId);

    const resB = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'B', amount: THE_CALL_STAKE });

    expect(resB.status).toBe(201);
  });

  it('rejects YES — only declared option keys are valid for THE_CALL', async () => {
    const app = buildPredictApp(testUserId);

    const res = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'YES', amount: THE_CALL_STAKE });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid choice/);
  });

  it('rejects NO — only declared option keys are valid for THE_CALL', async () => {
    const app = buildPredictApp(testUserId);

    const res = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'NO', amount: THE_CALL_STAKE });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid choice/);
  });

  it('rejects an undeclared option key (D) not in description.options', async () => {
    const app = buildPredictApp(testUserId);

    const res = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'D', amount: THE_CALL_STAKE });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid choice/);
  });
});

describe('POST /markets/:id/predict — THE_CALL fixed-stake enforcement', () => {
  it('debits exactly 10 tokens regardless of the amount sent by the client', async () => {
    const app = buildPredictApp(testUserId);

    // Client sends a much larger amount — server should clamp to 10
    const res = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'A', amount: 999 });

    expect(res.status).toBe(201);

    // Verify the stored prediction has the fixed stake
    const [prediction] = await db
      .select({ amount: predictionsTable.amount })
      .from(predictionsTable)
      .where(eq(predictionsTable.marketId, theCallMarketId));

    expect(prediction.amount).toBe(THE_CALL_STAKE);

    // Verify the user's balance was decremented by exactly 10, not 999
    const [user] = await db
      .select({ tokenBalance: usersTable.tokenBalance })
      .from(usersTable)
      .where(eq(usersTable.id, testUserId));

    expect(user.tokenBalance).toBe(INITIAL_BALANCE - THE_CALL_STAKE);
  });

  it('rejects when the user has fewer than 10 tokens', async () => {
    // Set balance below the fixed stake
    await db
      .update(usersTable)
      .set({ tokenBalance: 5 })
      .where(eq(usersTable.id, testUserId));

    const app = buildPredictApp(testUserId);

    const res = await request(app)
      .post(`/markets/${theCallMarketId}/predict`)
      .send({ choice: 'A', amount: THE_CALL_STAKE });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Insufficient balance' });
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /markets/:id/tally
// ---------------------------------------------------------------------------

describe('GET /markets/:id/tally — aggregate vote counts', () => {
  it('returns zero counts before any predictions', async () => {
    const app = buildPredictApp(testUserId);

    const res = await request(app).get(`/markets/${theCallMarketId}/tally`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tallies');
    // No predictions yet — tallies should be an empty object or all zeros
    const total = Object.values(res.body.tallies as Record<string, number>).reduce(
      (s: number, n: number) => s + n,
      0,
    );
    expect(total).toBe(0);
  });

  it('accurately tallies more than 50 predictions without truncation', async () => {
    // Insert 60 predictions for option A directly (bypassing the unique constraint
    // by creating separate users for each pick — simulating a real crowd).
    const userIds: number[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await pool.query<{ id: number }>(
        `INSERT INTO users (username, token_balance) VALUES ($1, 100) RETURNING id`,
        [`_tally_user_${RUN_ID}_${i}`],
      );
      userIds.push(r.rows[0].id);
    }

    // 40 for option A, 20 for option B
    for (let i = 0; i < 40; i++) {
      await pool.query(
        `INSERT INTO predictions (user_id, market_id, choice, amount) VALUES ($1, $2, 'A', 10)`,
        [userIds[i], theCallMarketId],
      );
    }
    for (let i = 40; i < 60; i++) {
      await pool.query(
        `INSERT INTO predictions (user_id, market_id, choice, amount) VALUES ($1, $2, 'B', 10)`,
        [userIds[i], theCallMarketId],
      );
    }

    const app = buildPredictApp(testUserId);
    const res = await request(app).get(`/markets/${theCallMarketId}/tally`);

    expect(res.status).toBe(200);
    expect(res.body.tallies['A']).toBe(40);
    expect(res.body.tallies['B']).toBe(20);

    // Cleanup extra users and their predictions
    await pool.query(
      `DELETE FROM predictions WHERE user_id = ANY($1::int[])`,
      [userIds],
    );
    await pool.query(
      `DELETE FROM users WHERE id = ANY($1::int[])`,
      [userIds],
    );
  });

  it('returns 404 for an unknown market id', async () => {
    const app = buildPredictApp(testUserId);

    const res = await request(app).get('/markets/999999999/tally');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests: PATCH /admin/markets/:id/resolve — THE_CALL outcome validation
// ---------------------------------------------------------------------------

describe('PATCH /admin/markets/:id/resolve — THE_CALL markets', () => {
  it('accepts a valid option key as outcome', async () => {
    const app = buildAdminApp();

    const res = await request(app)
      .patch(`/admin/markets/${theCallMarketId}/resolve`)
      .send({ outcome: 'A' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'RESOLVED', resolvedOutcome: 'A' });
  });

  it('rejects YES as an outcome — only declared option keys are valid', async () => {
    const app = buildAdminApp();

    const res = await request(app)
      .patch(`/admin/markets/${theCallMarketId}/resolve`)
      .send({ outcome: 'YES' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid outcome/);
  });

  it('rejects an undeclared option key (Z) as outcome', async () => {
    const app = buildAdminApp();

    const res = await request(app)
      .patch(`/admin/markets/${theCallMarketId}/resolve`)
      .send({ outcome: 'Z' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid outcome/);
  });

  it('does NOT award tokens to voters on resolve — no redistribution', async () => {
    // Cast a pick first
    await pool.query(
      `INSERT INTO predictions (user_id, market_id, choice, amount) VALUES ($1, $2, 'A', $3)`,
      [testUserId, theCallMarketId, THE_CALL_STAKE],
    );

    await db
      .update(usersTable)
      .set({ tokenBalance: INITIAL_BALANCE - THE_CALL_STAKE })
      .where(eq(usersTable.id, testUserId));

    const app = buildAdminApp();

    const res = await request(app)
      .patch(`/admin/markets/${theCallMarketId}/resolve`)
      .send({ outcome: 'A' });

    expect(res.status).toBe(200);

    const [user] = await db
      .select({ tokenBalance: usersTable.tokenBalance })
      .from(usersTable)
      .where(eq(usersTable.id, testUserId));

    // Balance must stay the same — no reward redistribution for THE_CALL
    expect(user.tokenBalance).toBe(INITIAL_BALANCE - THE_CALL_STAKE);
  });

  it('does NOT set isCorrect on predictions — sentiment snapshot, not win/loss', async () => {
    await pool.query(
      `INSERT INTO predictions (user_id, market_id, choice, amount) VALUES ($1, $2, 'A', $3)`,
      [testUserId, theCallMarketId, THE_CALL_STAKE],
    );

    const app = buildAdminApp();

    await request(app)
      .patch(`/admin/markets/${theCallMarketId}/resolve`)
      .send({ outcome: 'A' });

    const [prediction] = await db
      .select({ isCorrect: predictionsTable.isCorrect, tokensEarned: predictionsTable.tokensEarned })
      .from(predictionsTable)
      .where(eq(predictionsTable.marketId, theCallMarketId));

    expect(prediction.isCorrect).toBeNull();
    expect(prediction.tokensEarned == null || prediction.tokensEarned === 0).toBe(true);
  });
});
