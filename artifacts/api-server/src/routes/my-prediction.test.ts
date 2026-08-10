/**
 * Integration tests for GET /markets/:id/my-prediction
 *
 * Uses a real PostgreSQL connection (no mocks). Fixtures are inserted before
 * each test and cleaned up after, so this suite is safe alongside production data.
 *
 * What we verify:
 *   1. Unauthenticated request returns 200 { prediction: null }
 *   2. Authenticated user with no prediction returns 200 { prediction: null }
 *   3. Authenticated user who has predicted returns 200 with their prediction
 *   4. Only the requesting user's prediction is returned (not another user's)
 *   5. Invalid market id returns 400
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
import marketsRouter from './markets.js';

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

function buildAuthApp(platformUserId: number) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    req.user = { id: String(platformUserId) } as Express.User;
    next();
  });
  app.use(marketsRouter);
  return app;
}

function buildAnonApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => false) as Request['isAuthenticated'];
    next();
  });
  app.use(marketsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let userId1: number;
let userId2: number;
let marketId: number;

const RUN_ID = Date.now();

beforeEach(async () => {
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, 200), ($2, 200)
     RETURNING id`,
    [`_test_mypred_u1_${RUN_ID}`, `_test_mypred_u2_${RUN_ID}`],
  );
  userId1 = userRes.rows[0].id;
  userId2 = userRes.rows[1].id;

  const mktRes = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format)
     VALUES ($1, 'Will this test pass?', 'CULTURE', 'test', 'OPEN', 'STANDARD')
     RETURNING id`,
    [`_test_mypred_mkt_${RUN_ID}`],
  );
  marketId = mktRes.rows[0].id;
});

afterEach(async () => {
  const userIds = [userId1, userId2].filter(Boolean);
  if (userIds.length) {
    await db.delete(predictionsTable).where(
      eq(predictionsTable.marketId, marketId),
    );
    await db.delete(marketsTable).where(eq(marketsTable.id, marketId));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /markets/:id/my-prediction', () => {
  it('returns { prediction: null } for unauthenticated requests without an error', async () => {
    const app = buildAnonApp();
    const res = await request(app).get(`/markets/${marketId}/my-prediction`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ prediction: null });
  });

  it('returns { prediction: null } when the authenticated user has not predicted', async () => {
    const app = buildAuthApp(userId1);
    const res = await request(app).get(`/markets/${marketId}/my-prediction`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ prediction: null });
  });

  it('returns the user\'s own prediction when they have predicted', async () => {
    // Insert a prediction directly so we don't depend on the predict route
    await db.insert(predictionsTable).values({
      userId: userId1,
      marketId,
      choice: 'YES',
      amount: 100,
    });

    const app = buildAuthApp(userId1);
    const res = await request(app).get(`/markets/${marketId}/my-prediction`);

    expect(res.status).toBe(200);
    expect(res.body.prediction).toMatchObject({
      userId: userId1,
      marketId,
      choice: 'YES',
      amount: 100,
    });
    expect(typeof res.body.prediction.createdAt).toBe('string');
  });

  it('never returns another user\'s prediction', async () => {
    // User 2 predicts; user 1 queries — must get null
    await db.insert(predictionsTable).values({
      userId: userId2,
      marketId,
      choice: 'NO',
      amount: 100,
    });

    const app = buildAuthApp(userId1);
    const res = await request(app).get(`/markets/${marketId}/my-prediction`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ prediction: null });
  });

  it('returns 400 for an invalid market id', async () => {
    const app = buildAuthApp(userId1);
    const res = await request(app).get('/markets/not-a-number/my-prediction');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});
