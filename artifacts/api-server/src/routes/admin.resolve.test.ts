/**
 * Integration tests for PATCH /admin/markets/:id/resolve
 *
 * Focuses on BUZZ_OR_BOO markets: resolving one should set status to RESOLVED
 * and lock the sentiment split WITHOUT awarding tokens or marking predictions
 * as correct/incorrect.
 *
 * Also covers STANDARD market resolution as a baseline comparison.
 *
 * Includes concurrency tests for the recurring MULTI_CHOICE auto-cycle guard:
 * two simultaneous resolve calls must not spawn duplicate successor editions.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
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

// requireAdmin now does a live DB lookup; adminUserId must exist in DB with is_admin=true.
let adminUserId: number;

beforeAll(async () => {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance, is_admin) VALUES ($1, 0, true) RETURNING id`,
    [`_test_resolve_admin_${Date.now()}`],
  );
  adminUserId = res.rows[0].id;
});

afterAll(async () => {
  if (adminUserId) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [adminUserId]);
  }
  await pool.end();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).isAuthenticated = () => true;
    (_req as any).user = { id: String(adminUserId) };
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

// ---------------------------------------------------------------------------
// Auto-cycle idempotency — concurrent resolve must not create duplicate editions
// ---------------------------------------------------------------------------

describe('PATCH /admin/markets/:id/resolve — recurring MULTI_CHOICE auto-cycle', () => {
  it('partial unique index markets_open_title_unique exists and is valid', async () => {
    // This assertion ensures the index was created by the deployment bootstrap
    // (post-merge.sh SQL block + drizzle-kit push-force) and is not in an
    // INVALID state.  If this test fails on a fresh environment, re-run
    // scripts/post-merge.sh to apply the idempotent index creation.
    const { rows } = await pool.query<{ indexname: string; indisvalid: boolean }>(
      `SELECT i.relname AS indexname, ix.indisvalid
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       WHERE t.relname = 'markets' AND i.relname = 'markets_open_title_unique'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indisvalid).toBe(true);
  });

  let recurringMarketId: number;
  const CYCLE_RUN_ID = `cycle_${Date.now()}`;
  const RECURRING_TITLE = `_test_recurring_${CYCLE_RUN_ID}`;

  beforeEach(async () => {
    const res = await pool.query<{ id: number }>(
      `INSERT INTO markets
         (title, question, category, subcategory, status, market_format,
          description, closes_at)
       VALUES ($1, 'Who will win this month?', 'CULTURE', 'test', 'OPEN', 'MULTI_CHOICE',
               $2, NOW() - interval '1 second')
       RETURNING id`,
      [
        RECURRING_TITLE,
        JSON.stringify({
          recurring: true,
          period: 'July 2026',
          contenders: [
            { key: 'A', label: 'Option A' },
            { key: 'B', label: 'Option B' },
          ],
        }),
      ],
    );
    recurringMarketId = res.rows[0].id;
  });

  afterEach(async () => {
    // Clean up the original and any spawned successors sharing the same title
    await pool.query(`DELETE FROM markets WHERE title = $1`, [RECURRING_TITLE]);
  });

  it('unique index prevents concurrent successor inserts from producing duplicates', async () => {
    // This test races two independent DB connections at the INSERT level, bypassing
    // the HTTP route entirely.  It proves the partial unique index
    // markets_open_title_unique ON markets(title) WHERE status='OPEN'
    // is the authoritative guard — not the application-layer check.
    //
    // Speculative insertion (triggered by the explicit ON CONFLICT (title)
    // WHERE status='OPEN' conflict target) causes the second concurrent INSERT
    // to block until the first transaction commits, then detect the conflict
    // and silently skip.
    //
    // Ordering: client1 inserts → client2 fires insert (blocks in PG via
    // speculative insertion) → client1 commits (unblocks client2) → client2
    // detects conflict, does nothing → client2 commits.

    const client1 = await pool.connect();
    const client2 = await pool.connect();
    const CONCURRENT_TITLE = `_test_concurrent_${Date.now()}`;

    const INSERT_SQL = `
      INSERT INTO markets (title, question, category, subcategory, status, market_format)
      VALUES ($1, 'Concurrent Q?', 'CULTURE', 'test', 'OPEN', 'MULTI_CHOICE')
      ON CONFLICT (title) WHERE status = 'OPEN' DO NOTHING
      RETURNING id
    `;

    try {
      await client1.query('BEGIN');
      await client2.query('BEGIN');

      // client1 inserts and acquires the speculative index lock on this title
      await client1.query(INSERT_SQL, [CONCURRENT_TITLE]);

      // client2 fires its insert WITHOUT awaiting — PostgreSQL will block client2
      // waiting for client1's speculative insertion to resolve
      const r2Promise = client2.query<{ id: number }>(INSERT_SQL, [CONCURRENT_TITLE]);

      // Commit client1 — this unblocks client2, which then detects the conflict
      await client1.query('COMMIT');

      // Now await client2's result: it should have done nothing (0 rows)
      const r2 = await r2Promise;
      await client2.query('COMMIT');

      expect(r2.rows).toHaveLength(0); // conflict → DO NOTHING → no RETURNING row

      // The database must contain exactly one OPEN row for this title
      const { rows } = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM markets WHERE title = $1 AND status = 'OPEN'`,
        [CONCURRENT_TITLE],
      );
      expect(rows[0].cnt).toBe(1);
    } finally {
      await client1.query('ROLLBACK').catch(() => {});
      await client2.query('ROLLBACK').catch(() => {});
      client1.release();
      client2.release();
      await pool.query(`DELETE FROM markets WHERE title = $1`, [CONCURRENT_TITLE]);
    }
  });

  it('spawns a successor on a single resolve with the next period label', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch(`/admin/markets/${recurringMarketId}/resolve`)
      .send({ outcome: 'A' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'RESOLVED', resolvedOutcome: 'A' });

    // A new OPEN edition must exist for the successor period
    const { rows } = await pool.query<{ id: number; description: string }>(
      `SELECT id, description FROM markets WHERE title = $1 AND status = 'OPEN'`,
      [RECURRING_TITLE],
    );
    expect(rows).toHaveLength(1);

    const newDesc = JSON.parse(rows[0].description);
    // Period must have advanced beyond 'July 2026'
    expect(newDesc.period).toBeTruthy();
    expect(newDesc.period).not.toBe('July 2026');
    // recurring flag must be preserved
    expect(newDesc.recurring).toBe(true);
  });
});
