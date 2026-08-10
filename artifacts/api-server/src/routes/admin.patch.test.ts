/**
 * Integration tests for PATCH /admin/markets/:id
 *
 * Covers:
 *  - Unauthenticated requests are rejected with 401
 *  - Scalar fields (title, question, imageUrl, geo) are persisted
 *  - MULTI_CHOICE contender JSON in description is persisted correctly
 *  - Only OPEN markets can be edited (RESOLVED → 400, CLOSED → 400)
 *  - Sending no fields returns 400 ("No fields to update")
 *  - Non-existent market returns 404
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db, pool, marketsTable, predictionsTable, usersTable } from '@workspace/db';
import adminRouter from './admin.js';

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

/**
 * Authenticated admin app — uses the real testUserId (set in beforeEach) so
 * requireAdmin's live DB lookup finds a user with is_admin = true.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).isAuthenticated = () => true;
    (_req as any).user = { id: String(testUserId) };
    next();
  });
  app.use(adminRouter);
  return app;
}

/**
 * Authenticated but non-admin app — uses a user ID that does not exist in
 * the DB so the live isAdmin lookup returns nothing → 403.
 */
function buildNonAdminApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).isAuthenticated = () => true;
    (_req as any).user = { id: '999999999' }; // non-existent → no isAdmin row
    next();
  });
  app.use(adminRouter);
  return app;
}

/** Unauthenticated app — isAuthenticated returns false. */
function buildUnauthApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).isAuthenticated = () => false;
    next();
  });
  app.use(adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
let testUserId: number;
let openMarketId: number;
let resolvedMarketId: number;
let closedMarketId: number;
let multiChoiceMarketId: number;

async function insertMarket(
  suffix: string,
  status: 'OPEN' | 'RESOLVED' | 'CLOSED',
  marketFormat = 'STANDARD',
  description: string | null = null,
): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO markets (title, question, category, subcategory, status, market_format, description)
     VALUES ($1, $2, 'CULTURE', 'test', $3, $4, $5)
     RETURNING id`,
    [`_test_patch_${suffix}_${RUN_ID}`, `Test question for ${suffix}?`, status, marketFormat, description],
  );
  return res.rows[0].id;
}

const insertedIds: number[] = [];

beforeEach(async () => {
  // Create a test admin user — is_admin = true so requireAdmin's DB lookup succeeds
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance, is_admin) VALUES ($1, 500, true) RETURNING id`,
    [`_test_patch_adm_${RUN_ID}_${Date.now()}`],
  );
  testUserId = userRes.rows[0].id;

  openMarketId = await insertMarket('open', 'OPEN');
  resolvedMarketId = await insertMarket('resolved', 'RESOLVED');
  closedMarketId = await insertMarket('closed', 'CLOSED');
  multiChoiceMarketId = await insertMarket(
    'multi',
    'OPEN',
    'MULTI_CHOICE',
    JSON.stringify({
      contenders: [
        { key: 'A', name: 'Alpha', venue: 'Venue A' },
        { key: 'B', name: 'Beta', venue: 'Venue B' },
      ],
    }),
  );
  insertedIds.push(openMarketId, resolvedMarketId, closedMarketId, multiChoiceMarketId);
});

afterEach(async () => {
  // Delete predictions first (FK → markets), then markets, then user
  if (insertedIds.length) {
    await db.delete(predictionsTable).where(inArray(predictionsTable.marketId, [...insertedIds]));
    await db.delete(marketsTable).where(inArray(marketsTable.id, [...insertedIds]));
    insertedIds.length = 0;
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

describe('PATCH /admin/markets/:id — authentication & authorization', () => {
  it('returns 401 when the request is not authenticated', async () => {
    const app = buildUnauthApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ title: 'Hacked title here' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is authenticated but not an admin', async () => {
    const app = buildNonAdminApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ title: 'Sneaky non-admin edit here' });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Admin access required' });
  });

  it('proceeds past auth when the request is an authenticated admin', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ title: 'Updated title that is long enough' });

    expect(res.status).toBe(200);
  });
});

describe('PATCH /admin/markets/:id — scalar field updates', () => {
  it('persists title, question, imageUrl, and geo changes', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({
        title: 'New patched title here',
        question: 'Is this the updated question text?',
        imageUrl: 'https://example.com/img.jpg',
        geo: 'Boston · South End',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'New patched title here',
      question: 'Is this the updated question text?',
      imageUrl: 'https://example.com/img.jpg',
      geo: 'Boston · South End',
      status: 'OPEN',
    });

    // Verify DB row is updated
    const [row] = await db
      .select({ title: marketsTable.title, question: marketsTable.question })
      .from(marketsTable)
      .where(eq(marketsTable.id, openMarketId));

    expect(row.title).toBe('New patched title here');
    expect(row.question).toBe('Is this the updated question text?');
  });

  it('returns 404 for a non-existent market', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/admin/markets/999999999')
      .send({ title: 'Ghost market updated' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when no fields are provided', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'No fields to update' });
  });
});

describe('PATCH /admin/markets/:id — field validation', () => {
  it('returns 400 for a non-ISO closesAt date string', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ closesAt: 'next Friday at noon' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid imageUrl', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ imageUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('accepts null closesAt to clear the close date', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ closesAt: null });

    expect(res.status).toBe(200);
    expect(res.body.closesAt).toBeNull();
  });

  it('accepts null imageUrl to clear the image', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${openMarketId}`)
      .send({ imageUrl: null });

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeNull();
  });
});

describe('PATCH /admin/markets/:id — contender key integrity', () => {
  it('rejects a description update that removes a contender key with existing votes', async () => {
    const app = buildApp();

    // Cast a prediction for contender A on the multi-choice market
    await pool.query(
      `INSERT INTO predictions (user_id, market_id, choice, amount)
       VALUES ($1, $2, 'A', 10)
       ON CONFLICT DO NOTHING`,
      [testUserId, multiChoiceMarketId],
    );

    // Attempt to patch description without contender A — should be rejected
    const descWithoutA = JSON.stringify({
      contenders: [
        { key: 'B', name: 'Beta Renamed', venue: '' },
        { key: 'C', name: 'Gamma New', venue: '' },
      ],
    });
    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ description: descWithoutA });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/A/); // mentions the removed key
  });

  it('allows renaming a contender label when the key is preserved', async () => {
    const app = buildApp();

    // Cast a prediction for contender B
    await pool.query(
      `INSERT INTO predictions (user_id, market_id, choice, amount)
       VALUES ($1, $2, 'B', 10)
       ON CONFLICT DO NOTHING`,
      [testUserId, multiChoiceMarketId],
    );

    // Rename contender B's label but keep both A and B keys present
    const descRenamed = JSON.stringify({
      contenders: [
        { key: 'A', name: 'Alpha Unchanged', venue: 'Venue A' },
        { key: 'B', name: 'Beta RENAMED Label', venue: 'Venue B' },
      ],
    });
    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ description: descRenamed });

    expect(res.status).toBe(200);
    const updated = JSON.parse(res.body.description ?? '{}');
    expect(updated.contenders[1].name).toBe('Beta RENAMED Label');
  });

  it('allows adding a new contender when existing voted keys are preserved', async () => {
    const app = buildApp();

    // Cast a prediction for contender A
    await pool.query(
      `INSERT INTO predictions (user_id, market_id, choice, amount)
       VALUES ($1, $2, 'A', 10)
       ON CONFLICT DO NOTHING`,
      [testUserId, multiChoiceMarketId],
    );

    // Add contender C while keeping A and B
    const descWithNewC = JSON.stringify({
      contenders: [
        { key: 'A', name: 'Alpha', venue: 'Venue A' },
        { key: 'B', name: 'Beta', venue: 'Venue B' },
        { key: 'C', name: 'Gamma NEW', venue: '' },
      ],
    });
    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ description: descWithNewC });

    expect(res.status).toBe(200);
  });

  it('allows patching description freely when no predictions exist', async () => {
    const app = buildApp();
    // No predictions on this market — can remove contenders freely
    const descOnlyA = JSON.stringify({ contenders: [{ key: 'A', name: 'Only Alpha' }] });
    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ description: descOnlyA });

    expect(res.status).toBe(200);
  });

  it('rejects description: null on a voted choice-keyed market (would wipe key-to-label mapping)', async () => {
    const app = buildApp();

    // Cast a prediction for contender A
    await pool.query(
      `INSERT INTO predictions (user_id, market_id, choice, amount)
       VALUES ($1, $2, 'A', 10)
       ON CONFLICT DO NOTHING`,
      [testUserId, multiChoiceMarketId],
    );

    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ description: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot clear description/i);
  });
});

describe('PATCH /admin/markets/:id — lifecycle enforcement', () => {
  it('returns 400 when the market is RESOLVED', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${resolvedMarketId}`)
      .send({ title: 'Trying to edit a resolved market' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Only OPEN markets can be edited' });
  });

  it('returns 400 when the market is CLOSED', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/admin/markets/${closedMarketId}`)
      .send({ title: 'Trying to edit a closed market' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Only OPEN markets can be edited' });
  });
});

describe('PATCH /admin/markets/:id — MULTI_CHOICE contender update', () => {
  it('persists renamed contenders in description JSON', async () => {
    const app = buildApp();
    const updatedDescription = JSON.stringify({
      contenders: [
        { key: 'A', name: 'Alpha Renamed', venue: 'New Venue A' },
        { key: 'B', name: 'Beta Renamed', venue: 'New Venue B' },
        { key: 'C', name: 'Gamma New', venue: '' },
      ],
    });

    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ description: updatedDescription });

    expect(res.status).toBe(200);

    // Verify DB description is updated
    const [row] = await db
      .select({ description: marketsTable.description })
      .from(marketsTable)
      .where(eq(marketsTable.id, multiChoiceMarketId));

    const parsed = JSON.parse(row.description ?? '{}');
    expect(parsed.contenders).toHaveLength(3);
    expect(parsed.contenders[0].name).toBe('Alpha Renamed');
    expect(parsed.contenders[2].name).toBe('Gamma New');
  });

  it('marketFormat is not changed by a PATCH', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch(`/admin/markets/${multiChoiceMarketId}`)
      .send({ title: 'Updated title for multi-choice' });

    expect(res.status).toBe(200);
    expect(res.body.marketFormat).toBe('MULTI_CHOICE');
  });
});
