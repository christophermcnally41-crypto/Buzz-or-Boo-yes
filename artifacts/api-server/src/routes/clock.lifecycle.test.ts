/**
 * Integration tests for the question clock lifecycle (Market Bible v0.5 §40).
 *
 * Uses a REAL PostgreSQL connection (no mocks). Fixtures are inserted before
 * each test and cleaned up after, so this suite is safe alongside production data.
 *
 * Covers:
 *  1. GET /markets/:id returns 404 for a market whose publish_at is in the future
 *  2. POST /markets/:id/predict rejects bets on pre-published (scheduled) markets
 *  3. POST /markets/:id/predict rejects bets on ARCHIVED markets
 *  4. clockWorker.tick() archives expired OPEN markets
 *  5. clockWorker.tick() advances a ROLLING_FORECAST window without archiving
 *  6. clockWorker.tick() spawns a RECURRING_PULSE successor after archiving
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db, pool, usersTable, marketsTable, predictionsTable } from '@workspace/db';
import marketsRouter from './markets.js';
import predictionsRouter from './predictions.js';
import { tick } from '../lib/clockWorker.js';

// ─── App factory ─────────────────────────────────────────────────────────────

function buildApp(platformUserId?: number) {
  const app = express();
  app.use(express.json());

  if (platformUserId !== undefined) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.isAuthenticated = (() => true) as Request['isAuthenticated'];
      req.user = { id: String(platformUserId) } as Express.User;
      next();
    });
  } else {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.isAuthenticated = (() => false) as Request['isAuthenticated'];
      next();
    });
  }

  app.use(marketsRouter);
  app.use(predictionsRouter);
  return app;
}

// ─── Shared fixture state ─────────────────────────────────────────────────────

const RUN_ID = Date.now();
let testUserId: number;
const createdMarketIds: number[] = [];

beforeEach(async () => {
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance)
     VALUES ($1, 500)
     RETURNING id`,
    [`_test_clock_${RUN_ID}`],
  );
  testUserId = userRes.rows[0].id;
});

afterEach(async () => {
  if (createdMarketIds.length > 0) {
    await db
      .delete(predictionsTable)
      .where(inArray(predictionsTable.marketId, [...createdMarketIds]));
    await db
      .delete(marketsTable)
      .where(inArray(marketsTable.id, [...createdMarketIds]));
    createdMarketIds.length = 0;
  }
  if (testUserId) {
    await db.delete(predictionsTable).where(eq(predictionsTable.userId, testUserId));
    await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  }
});

afterAll(async () => {
  await pool.end();
});

// ─── Helper: insert a raw market row ─────────────────────────────────────────

async function insertMarket(overrides: Record<string, unknown> = {}): Promise<number> {
  const defaults = {
    title: `_test_clock_market_${RUN_ID}_${Math.random()}`,
    question: 'Test question?',
    category: 'CULTURE',
    subcategory: 'test',
    status: 'OPEN',
    market_format: 'STANDARD',
    clock_type: 'EVERGREEN',
  };
  const merged = { ...defaults, ...overrides };
  const keys = Object.keys(merged);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = Object.values(merged);

  const res = await pool.query<{ id: number }>(
    `INSERT INTO markets (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  );
  const id = res.rows[0].id;
  createdMarketIds.push(id);
  return id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Clock lifecycle — hard expiry gate (independent of worker)', () => {
  it('GET /markets/:id returns 404 for an expired OPEN market before the worker runs', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'NOW',
      expire_at: pastExpiry,
      status: 'OPEN', // worker has NOT archived it yet
    });

    const app = buildApp();
    const res = await request(app).get(`/markets/${marketId}`);
    expect(res.status).toBe(404);
  });

  it('POST /markets/:id/predict rejects bets on an expired OPEN market before the worker runs', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'SEASONAL',
      expire_at: pastExpiry,
      status: 'OPEN', // worker has NOT archived it yet
    });

    const app = buildApp(testUserId);
    const res = await request(app)
      .post(`/markets/${marketId}/predict`)
      .send({ choice: 'YES', amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Market has expired and is no longer accepting predictions' });
  });

  it('GET /markets/:id still returns 200 for an OPEN market with a future expire_at', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'SEASONAL',
      expire_at: futureExpiry,
    });

    const app = buildApp();
    const res = await request(app).get(`/markets/${marketId}`);
    expect(res.status).toBe(200);
  });
});

describe('Clock lifecycle — listing/trending expiry filtering', () => {
  it('GET /markets omits an expired-but-not-yet-archived OPEN market', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'NOW',
      expire_at: pastExpiry,
      status: 'OPEN', // worker has NOT archived it yet
    });

    const app = buildApp();
    const res = await request(app).get('/markets');
    expect(res.status).toBe(200);
    const ids = (res.body.markets ?? []).map((m: { id: number }) => m.id);
    expect(ids).not.toContain(marketId);
  });

  it('GET /markets/trending omits an expired-but-not-yet-archived OPEN market', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'NOW',
      expire_at: pastExpiry,
      status: 'OPEN',
    });

    const app = buildApp();
    const res = await request(app).get('/markets/trending');
    expect(res.status).toBe(200);
    const ids = (res.body.markets ?? []).map((m: { id: number }) => m.id);
    expect(ids).not.toContain(marketId);
  });

  it('GET /markets includes an OPEN market with a future expire_at', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'SEASONAL',
      expire_at: futureExpiry,
    });

    const app = buildApp();
    const res = await request(app).get('/markets');
    expect(res.status).toBe(200);
    const ids = (res.body.markets ?? []).map((m: { id: number }) => m.id);
    expect(ids).toContain(marketId);
  });
});

describe('Clock lifecycle — scheduled market visibility', () => {
  it('GET /markets/:id returns 404 for a market with a future publish_at', async () => {
    const futurePublishAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const marketId = await insertMarket({ publish_at: futurePublishAt });

    const app = buildApp();
    const res = await request(app).get(`/markets/${marketId}`);
    expect(res.status).toBe(404);
  });

  it('GET /markets/:id returns 200 for a market with a past publish_at', async () => {
    const pastPublishAt = new Date(Date.now() - 60 * 1000).toISOString();
    const marketId = await insertMarket({ publish_at: pastPublishAt });

    const app = buildApp();
    const res = await request(app).get(`/markets/${marketId}`);
    expect(res.status).toBe(200);
  });
});

describe('Clock lifecycle — prediction eligibility', () => {
  it('POST /markets/:id/predict rejects bets on a scheduled (pre-published) market', async () => {
    const futurePublishAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const marketId = await insertMarket({ publish_at: futurePublishAt });

    const app = buildApp(testUserId);
    const res = await request(app)
      .post(`/markets/${marketId}/predict`)
      .send({ choice: 'YES', amount: 10 });

    expect(res.status).toBe(404);
  });

  it('POST /markets/:id/predict rejects bets on ARCHIVED markets', async () => {
    const marketId = await insertMarket({ status: 'ARCHIVED' });

    const app = buildApp(testUserId);
    const res = await request(app)
      .post(`/markets/${marketId}/predict`)
      .send({ choice: 'YES', amount: 10 });

    // status !== OPEN → "Market is not open for predictions"
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Market is not open for predictions' });
  });
});

describe('clockWorker.tick() — expiry archival', () => {
  it('archives an OPEN market whose expire_at is in the past', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'NOW',
      expire_at: pastExpiry,
    });

    await tick();

    const [market] = await db
      .select({ status: marketsTable.status, freshnessScore: marketsTable.freshnessScore })
      .from(marketsTable)
      .where(eq(marketsTable.id, marketId));

    expect(market.status).toBe('ARCHIVED');
    expect(market.freshnessScore).toBe(0);
  });

  it('does not archive an OPEN market whose expire_at is in the future', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const marketId = await insertMarket({
      clock_type: 'SEASONAL',
      expire_at: futureExpiry,
    });

    await tick();

    const [market] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, marketId));

    expect(market.status).toBe('OPEN');
  });

  it('does not archive EVERGREEN markets (no expire_at)', async () => {
    const marketId = await insertMarket({ clock_type: 'EVERGREEN' });

    await tick();

    const [market] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, marketId));

    expect(market.status).toBe('OPEN');
  });
});

describe('clockWorker.tick() — ROLLING_FORECAST window advancement', () => {
  it('advances the window forward instead of archiving', async () => {
    const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
    const windowEnd = new Date(Date.now() - 60 * 1000); // 1 min ago (expired)
    const expectedNewExpire = new Date(windowEnd.getTime() + (windowEnd.getTime() - windowStart.getTime()));

    const marketId = await insertMarket({
      clock_type: 'ROLLING_FORECAST',
      publish_at: windowStart.toISOString(),
      expire_at: windowEnd.toISOString(),
    });

    await tick();

    const [market] = await db
      .select({
        status: marketsTable.status,
        publishAt: marketsTable.publishAt,
        expireAt: marketsTable.expireAt,
        freshnessScore: marketsTable.freshnessScore,
      })
      .from(marketsTable)
      .where(eq(marketsTable.id, marketId));

    // Must stay OPEN — only the window advances
    expect(market.status).toBe('OPEN');
    expect(market.freshnessScore).toBe(100);

    // New publish_at should be the old expire_at
    expect(market.publishAt?.getTime()).toBeCloseTo(windowEnd.getTime(), -3);

    // New expire_at should be old_expire + window_duration
    expect(market.expireAt?.getTime()).toBeCloseTo(expectedNewExpire.getTime(), -3);
  });
});

describe('clockWorker.tick() — RECURRING_PULSE successor spawning', () => {
  it('spawns a successor edition after archiving a RECURRING_PULSE market', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const title = `_test_recurring_${RUN_ID}`;
    const marketId = await insertMarket({
      title,
      clock_type: 'RECURRING_PULSE',
      expire_at: pastExpiry,
      refresh_rule: 'MONTHLY',
    });

    await tick();

    // Original market should be ARCHIVED
    const [original] = await db
      .select({ status: marketsTable.status })
      .from(marketsTable)
      .where(eq(marketsTable.id, marketId));

    expect(original.status).toBe('ARCHIVED');

    // A successor with the same title and OPEN status should exist
    const successors = await db
      .select({ id: marketsTable.id, status: marketsTable.status, seriesId: marketsTable.seriesId })
      .from(marketsTable)
      .where(eq(marketsTable.title, title));

    // Track successor for cleanup
    for (const s of successors) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    const openSuccessor = successors.find((s) => s.status === 'OPEN');
    expect(openSuccessor).toBeDefined();
    // Successor must link back to the root market in the series
    expect(openSuccessor?.seriesId).toBe(marketId);
  });

  it('does not spawn a duplicate successor if one already exists', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const title = `_test_recurring_no_dup_${RUN_ID}`;

    const marketId = await insertMarket({
      title,
      clock_type: 'RECURRING_PULSE',
      expire_at: pastExpiry,
      refresh_rule: 'MONTHLY',
      status: 'ARCHIVED', // already archived
    });

    // Pre-create an open successor so the guard should skip spawning
    const existingSuccessorId = await insertMarket({ title, status: 'OPEN', clock_type: 'RECURRING_PULSE' });

    await tick();

    const openSuccessors = await db
      .select({ id: marketsTable.id })
      .from(marketsTable)
      .where(eq(marketsTable.title, title));

    // Track all for cleanup
    for (const s of openSuccessors) {
      if (!createdMarketIds.includes(s.id)) createdMarketIds.push(s.id);
    }

    // Should still only be exactly one OPEN successor
    const open = openSuccessors.filter((s) => s.id === existingSuccessorId);
    expect(open.length).toBe(1);

    // No additional rows spawned
    const total = openSuccessors.length;
    expect(total).toBe(2); // the original archived + the one open we created
  });
});
