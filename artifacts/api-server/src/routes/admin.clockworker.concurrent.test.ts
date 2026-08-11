/**
 * Cross-path concurrency: clock worker tick() vs admin resolve
 *
 * Verifies that when tick() and PATCH /admin/markets/:id/resolve process the
 * same RECURRING_PULSE + MULTI_CHOICE market with `recurring: true` at the
 * same time, only ONE successor edition is ever inserted — regardless of
 * whether the clock worker or the admin route wins the race.
 *
 * Background
 * ----------
 * Two separate code paths can spawn a successor for a recurring market:
 *
 *   1. clockWorker.tick() — archives expired RECURRING_PULSE markets then
 *      runs INSERT … ON CONFLICT (title) WHERE status='OPEN' DO NOTHING.
 *
 *   2. admin resolve route — resolves a MULTI_CHOICE market whose description
 *      carries `recurring: true`, then runs the same INSERT … ON CONFLICT.
 *
 * A market that has both clockType=RECURRING_PULSE AND marketFormat=MULTI_CHOICE
 * with recurring=true can be touched by BOTH paths in the same instant.
 * Because both paths use the partial-unique-index guard on (title) WHERE
 * status='OPEN', only one INSERT succeeds; the second is silently skipped.
 *
 * This test proves that guarantee holds end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, usersTable, marketsTable } from "@workspace/db";
import adminRouter from "./admin.js";
import { tick } from "../lib/clockWorker.js";

// ---------------------------------------------------------------------------
// Shared admin user — requireAdmin does a live DB lookup on every request.
// ---------------------------------------------------------------------------

let adminUserId: number;

beforeAll(async () => {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO users (username, token_balance, is_admin)
     VALUES ($1, 0, true)
     RETURNING id`,
    [`_test_cw_admin_concurrent_${Date.now()}`],
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
  // Inject a fake authenticated admin user so requireAdmin passes
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).isAuthenticated = () => true;
    (_req as any).user = { id: String(adminUserId) };
    next();
  });
  app.use(adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helper — one second in the past (expired market)
// ---------------------------------------------------------------------------
const PAST = new Date(Date.now() - 1_000);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cross-path concurrency: clockWorker.tick() vs admin resolve", () => {
  /**
   * Partial unique index sanity check — must exist and be VALID before the
   * concurrent INSERT test can rely on it.  If this fails on a fresh env,
   * re-run scripts/post-merge.sh to apply the idempotent index creation.
   */
  it("markets_open_title_unique partial index exists and is valid", async () => {
    const { rows } = await pool.query<{ indexname: string; indisvalid: boolean }>(
      `SELECT i.relname AS indexname, ix.indisvalid
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       WHERE t.relname = 'markets'
         AND i.relname = 'markets_open_title_unique'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indisvalid).toBe(true);
  });

  /**
   * Main race test.
   *
   * Scenario:
   *   - A RECURRING_PULSE + MULTI_CHOICE market with `recurring: true` has
   *     just expired (expireAt is 1 second in the past).
   *   - tick() and an admin resolve request are fired simultaneously.
   *   - tick() archives the market and attempts to INSERT a successor.
   *   - The admin route resolves the market to RESOLVED and attempts the same INSERT.
   *   - The partial unique index ensures exactly one INSERT commits; the other
   *     is silently skipped via ON CONFLICT … DO NOTHING.
   *
   * Expected result: exactly ONE OPEN successor row with the same title.
   */
  it("tick() and admin resolve racing on the same market spawn at most one successor", async () => {
    const RUN_ID = Date.now();
    const TITLE = `_test_cw_admin_race_${RUN_ID}`;

    // Insert the parent market: expired, RECURRING_PULSE clock, MULTI_CHOICE
    // format, recurring=true — the combination that triggers both code paths.
    const [parent] = await db
      .insert(marketsTable)
      .values({
        title: TITLE,
        question: "Will this recur?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "MULTI_CHOICE",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: PAST,
        closesAt: PAST,
        description: JSON.stringify({
          recurring: true,
          period: "July 2026",
          contenders: [
            { key: "A", label: "Option A" },
            { key: "B", label: "Option B" },
          ],
        }),
      })
      .returning({ id: marketsTable.id });

    const parentId = parent.id;

    try {
      const app = buildApp();

      // Fire both concurrently — do NOT await sequentially.
      // tick() will archive the market + try to INSERT successor.
      // The admin resolve will resolve it to RESOLVED + try the same INSERT.
      // The DB-level ON CONFLICT guard must ensure only one successor lands.
      const [tickResult, resolveRes] = await Promise.all([
        tick(),
        request(app)
          .patch(`/admin/markets/${parentId}/resolve`)
          .send({ outcome: "A" }),
      ]);

      // At least one of the two paths must have succeeded in processing the market.
      // tick() result: archived or scored something — it ran without throwing.
      expect(tickResult).toBeDefined();
      // resolveRes: either 200 (resolved successfully) or 400 (already archived
      // when the admin request ran).  Both are acceptable — the important
      // assertion is the successor count below.
      expect([200, 400]).toContain(resolveRes.status);

      // The definitive assertion: exactly ONE OPEN successor with this title.
      const successors = await db
        .select({ id: marketsTable.id, status: marketsTable.status })
        .from(marketsTable)
        .where(and(eq(marketsTable.title, TITLE), eq(marketsTable.status, "OPEN")));

      expect(successors).toHaveLength(1);
    } finally {
      // Clean up parent + any spawned successors
      await pool.query(`DELETE FROM markets WHERE title = $1`, [TITLE]);
    }
  });

  /**
   * Sanity: a single tick() on a RECURRING_PULSE market still spawns exactly
   * one successor without racing (baseline for the cross-path test above).
   */
  it("tick() alone spawns exactly one successor for an expired RECURRING_PULSE market", async () => {
    const RUN_ID = Date.now();
    const TITLE = `_test_cw_solo_${RUN_ID}`;

    const [parent] = await db
      .insert(marketsTable)
      .values({
        title: TITLE,
        question: "Solo recur?",
        category: "CULTURE",
        subcategory: "test",
        status: "OPEN",
        marketFormat: "MULTI_CHOICE",
        clockType: "RECURRING_PULSE",
        refreshRule: "MONTHLY",
        expireAt: PAST,
        closesAt: PAST,
        description: JSON.stringify({
          recurring: true,
          period: "July 2026",
          contenders: [
            { key: "A", label: "A" },
            { key: "B", label: "B" },
          ],
        }),
      })
      .returning({ id: marketsTable.id });

    try {
      await tick();

      // Parent must be archived
      const [p] = await db
        .select({ status: marketsTable.status })
        .from(marketsTable)
        .where(eq(marketsTable.id, parent.id));
      expect(p.status).toBe("ARCHIVED");

      // Exactly one OPEN successor
      const successors = await db
        .select({ id: marketsTable.id })
        .from(marketsTable)
        .where(and(eq(marketsTable.title, TITLE), eq(marketsTable.status, "OPEN")));
      expect(successors).toHaveLength(1);
    } finally {
      await pool.query(`DELETE FROM markets WHERE title = $1`, [TITLE]);
    }
  });
});
