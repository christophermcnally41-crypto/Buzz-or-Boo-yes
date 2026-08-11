/**
 * Concurrency tests for THE_CALL tally consistency.
 *
 * Scenario: two users submit picks on the same THE_CALL market simultaneously.
 * The server-side GROUP BY tally must reflect exactly both picks — no pick
 * double-counted, none dropped — even when the DB transactions interleave.
 *
 * Uses a real database (same pattern as the-call.integration.test.ts) so the
 * tally endpoint exercises the actual GROUP BY aggregate rather than a mock.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import {
  db,
  pool,
  usersTable,
  marketsTable,
  predictionsTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import predictionsRouter from './predictions.js';
import marketsRouter from './markets.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const THE_CALL_OPTIONS = [
  { key: 'A', label: 'Option Alpha' },
  { key: 'B', label: 'Option Beta' },
  { key: 'C', label: 'Option Gamma' },
];
const THE_CALL_DESCRIPTION = JSON.stringify({
  options: THE_CALL_OPTIONS,
  context: 'Concurrent pick test market',
});
const THE_CALL_STAKE = 10;
const INITIAL_BALANCE = 200;

// Unique run ID prevents row collisions when tests are run in parallel.
const RUN_ID = Date.now();

// Shared state set in beforeEach / cleaned in afterEach.
let userId1: number;
let userId2: number;
let marketId: number;

// ---------------------------------------------------------------------------
// App factory — each user gets its own authenticated Express instance so
// supertest can fire truly concurrent requests from different "sessions".
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
  app.use(marketsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Warm the pool; nothing else required for the real DB.
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Create two independent users.
  const u1 = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, $2) RETURNING id`,
    [`_conc_u1_${RUN_ID}`, INITIAL_BALANCE],
  );
  userId1 = u1.rows[0].id;

  const u2 = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, $2) RETURNING id`,
    [`_conc_u2_${RUN_ID}`, INITIAL_BALANCE],
  );
  userId2 = u2.rows[0].id;

  // Create the THE_CALL market.
  const mkt = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format, description)
     VALUES ($1, 'Concurrent call market?', 'CULTURE', 'test', 'OPEN', 'THE_CALL', $2)
     RETURNING id`,
    [`_conc_market_${RUN_ID}`, THE_CALL_DESCRIPTION],
  );
  marketId = mkt.rows[0].id;
});

afterEach(async () => {
  // Clean up in dependency order.
  await db.delete(predictionsTable).where(eq(predictionsTable.marketId, marketId));
  await db.delete(marketsTable).where(eq(marketsTable.id, marketId));
  await db.delete(usersTable).where(eq(usersTable.id, userId1));
  await db.delete(usersTable).where(eq(usersTable.id, userId2));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('THE_CALL tally — concurrent picks', () => {
  it('tally sums to 2 after two users pick simultaneously', async () => {
    const app1 = buildApp(userId1);
    const app2 = buildApp(userId2);

    // Fire both predictions in parallel — simulates two users clicking at the
    // same time.  Each uses a different app instance (different session user).
    const [res1, res2] = await Promise.all([
      request(app1)
        .post(`/markets/${marketId}/predict`)
        .send({ choice: 'A', amount: THE_CALL_STAKE }),
      request(app2)
        .post(`/markets/${marketId}/predict`)
        .send({ choice: 'B', amount: THE_CALL_STAKE }),
    ]);

    // Both predictions must be accepted.
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    // Now fetch the tally via the read-only market-detail app (either user is fine).
    const tallyRes = await request(app1).get(`/markets/${marketId}/tally`);

    expect(tallyRes.status).toBe(200);

    const tallies: Record<string, number> = tallyRes.body.tallies;

    // The aggregate must account for exactly both picks — no double-count, no drop.
    const total = Object.values(tallies).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(2);

    // Individual bucket accuracy.
    expect(tallies['A']).toBe(1);
    expect(tallies['B']).toBe(1);
  });

  it('tally sums to 2 when both users pick the same option simultaneously', async () => {
    const app1 = buildApp(userId1);
    const app2 = buildApp(userId2);

    const [res1, res2] = await Promise.all([
      request(app1)
        .post(`/markets/${marketId}/predict`)
        .send({ choice: 'C', amount: THE_CALL_STAKE }),
      request(app2)
        .post(`/markets/${marketId}/predict`)
        .send({ choice: 'C', amount: THE_CALL_STAKE }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const tallyRes = await request(app1).get(`/markets/${marketId}/tally`);
    expect(tallyRes.status).toBe(200);

    const tallies: Record<string, number> = tallyRes.body.tallies;
    const total = Object.values(tallies).reduce((sum, n) => sum + n, 0);

    // Both picks land in the same bucket — total must still be 2.
    expect(total).toBe(2);
    expect(tallies['C']).toBe(2);

    // Other options must be absent or zero.
    expect(tallies['A'] ?? 0).toBe(0);
    expect(tallies['B'] ?? 0).toBe(0);
  });

  it('tally reflects only successful picks when one concurrent pick is invalid', async () => {
    const app1 = buildApp(userId1);
    const app2 = buildApp(userId2);

    // User 2 sends an invalid key — should be rejected.
    const [res1, res2] = await Promise.all([
      request(app1)
        .post(`/markets/${marketId}/predict`)
        .send({ choice: 'A', amount: THE_CALL_STAKE }),
      request(app2)
        .post(`/markets/${marketId}/predict`)
        .send({ choice: 'INVALID_KEY', amount: THE_CALL_STAKE }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/Invalid choice/);

    const tallyRes = await request(app1).get(`/markets/${marketId}/tally`);
    expect(tallyRes.status).toBe(200);

    const tallies: Record<string, number> = tallyRes.body.tallies;
    const total = Object.values(tallies).reduce((sum, n) => sum + n, 0);

    // Only the valid pick should be tallied — rejected pick must not appear.
    expect(total).toBe(1);
    expect(tallies['A']).toBe(1);
    expect(tallies['INVALID_KEY'] ?? 0).toBe(0);
  });

  it('tally total equals the number of users who successfully picked', async () => {
    // Create two additional users for a four-way concurrent race.
    const u3 = await pool.query<{ id: number }>(
      `INSERT INTO users (username, token_balance) VALUES ($1, $2) RETURNING id`,
      [`_conc_u3_${RUN_ID}`, INITIAL_BALANCE],
    );
    const u4 = await pool.query<{ id: number }>(
      `INSERT INTO users (username, token_balance) VALUES ($1, $2) RETURNING id`,
      [`_conc_u4_${RUN_ID}`, INITIAL_BALANCE],
    );
    const userId3 = u3.rows[0].id;
    const userId4 = u4.rows[0].id;

    const app1 = buildApp(userId1);
    const app2 = buildApp(userId2);
    const app3 = buildApp(userId3);
    const app4 = buildApp(userId4);

    const picks = await Promise.all([
      request(app1).post(`/markets/${marketId}/predict`).send({ choice: 'A', amount: THE_CALL_STAKE }),
      request(app2).post(`/markets/${marketId}/predict`).send({ choice: 'B', amount: THE_CALL_STAKE }),
      request(app3).post(`/markets/${marketId}/predict`).send({ choice: 'A', amount: THE_CALL_STAKE }),
      request(app4).post(`/markets/${marketId}/predict`).send({ choice: 'C', amount: THE_CALL_STAKE }),
    ]);

    const successCount = picks.filter(r => r.status === 201).length;
    expect(successCount).toBe(4);

    const tallyRes = await request(app1).get(`/markets/${marketId}/tally`);
    expect(tallyRes.status).toBe(200);

    const tallies: Record<string, number> = tallyRes.body.tallies;
    const total = Object.values(tallies).reduce((sum, n) => sum + n, 0);

    // Tally total must match the number of accepted picks exactly.
    expect(total).toBe(successCount);

    // Per-option accuracy: A×2, B×1, C×1.
    expect(tallies['A']).toBe(2);
    expect(tallies['B']).toBe(1);
    expect(tallies['C']).toBe(1);

    // Cleanup extra users.
    await db.delete(predictionsTable).where(eq(predictionsTable.userId, userId3));
    await db.delete(predictionsTable).where(eq(predictionsTable.userId, userId4));
    await db.delete(usersTable).where(eq(usersTable.id, userId3));
    await db.delete(usersTable).where(eq(usersTable.id, userId4));
  });
});
