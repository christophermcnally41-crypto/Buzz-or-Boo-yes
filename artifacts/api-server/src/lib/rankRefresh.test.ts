/**
 * Integration tests for refreshLeaderboardRanks()
 *
 * Shared ordering contract:
 *   PRIMARY:   COALESCE(buzz_score, 0) DESC
 *   TIEBREAKER: id ASC (lower id wins)
 *
 * This is the same contract used by GET /leaderboard (orderBy clause) and
 * GET /leaderboard/me (count-based rank). All three surfaces must agree.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool, usersTable, marketsTable, predictionsTable } from "@workspace/db";
import { refreshLeaderboardRanks } from "./rankRefresh.js";
import leaderboardRouter from "../routes/leaderboard.js";
import adminRouter from "../routes/admin.js";

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

function buildLeaderboardApp(authenticatedUserId?: number) {
  const app = express();
  app.use(express.json());
  if (authenticatedUserId !== undefined) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: String(authenticatedUserId) };
      next();
    });
  }
  app.use(leaderboardRouter);
  return app;
}

function buildAdminApp() {
  const app = express();
  app.use(express.json());
  app.use(adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const createdUserIds: number[] = [];
const createdMarketIds: number[] = [];

async function insertUser(suffix: string, buzzScore: number | null, totalResolved: number) {
  const [user] = await db
    .insert(usersTable)
    .values({
      username: `_test_rankrefresh_${suffix}_${RUN_ID}`,
      tokenBalance: 0,
      totalResolved,
      buzzScore,
    })
    .returning({ id: usersTable.id });
  createdUserIds.push(user.id);
  return user.id;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
  createdUserIds.length = 0;
  createdMarketIds.length = 0;
});

afterEach(async () => {
  if (createdMarketIds.length > 0) {
    await db.delete(predictionsTable).where(
      inArray(predictionsTable.marketId, createdMarketIds)
    );
    await db.delete(marketsTable).where(inArray(marketsTable.id, createdMarketIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(predictionsTable).where(inArray(predictionsTable.userId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Unit tests — rankRefresh function itself
// ---------------------------------------------------------------------------

describe("refreshLeaderboardRanks()", () => {
  it("assigns rank 1 to the user with the highest buzzScore", async () => {
    const highId = await insertUser("high", 90, 5);
    const lowId = await insertUser("low", 40, 3);

    await refreshLeaderboardRanks();

    const [high] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, highId));
    const [low] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, lowId));

    expect(high.rank).toBe(1);
    expect(low.rank).toBeGreaterThan(1);
  });

  it("assigns sequential distinct ranks when two users share the same buzzScore (id tiebreaker)", async () => {
    const firstId = await insertUser("tieA", 75, 4);
    const secondId = await insertUser("tieB", 75, 4);

    // Serial PK always increments — firstId < secondId
    expect(firstId).toBeLessThan(secondId);

    await refreshLeaderboardRanks();

    const [first] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, firstId));
    const [second] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, secondId));

    // Lower id wins the tiebreak → lower rank number
    expect(first.rank).not.toBeNull();
    expect(second.rank).not.toBeNull();
    expect(first.rank!).toBeLessThan(second.rank!);
    expect(second.rank! - first.rank!).toBe(1); // consecutive — no gaps
  });

  it("does NOT assign a rank to users with totalResolved === 0", async () => {
    const unrankedId = await insertUser("unranked", null, 0);

    await refreshLeaderboardRanks();

    const [unranked] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, unrankedId));
    expect(unranked.rank).toBeNull();
  });

  it("stored ranks match the sequential leaderboard order", async () => {
    const aId = await insertUser("scoreA", 80, 10); // rank 2
    const bId = await insertUser("scoreB", 60, 8);  // rank 3
    const cId = await insertUser("scoreC", 100, 12); // rank 1

    await refreshLeaderboardRanks();

    const rows = await db
      .select({ id: usersTable.id, rank: usersTable.rank })
      .from(usersTable)
      .where(inArray(usersTable.id, [aId, bId, cId]));

    const byId = Object.fromEntries(rows.map((r) => [r.id, r.rank]));

    // C (100) > A (80) > B (60) → rank order C < A < B
    expect(byId[cId]).toBeLessThan(byId[aId]!);
    expect(byId[aId]!).toBeLessThan(byId[bId]!);
  });
});

// ---------------------------------------------------------------------------
// Endpoint-level contract tests — stored rank agrees with GET /leaderboard
// ---------------------------------------------------------------------------

describe("stored rank vs GET /leaderboard consistency", () => {
  it("stored rank matches position in leaderboard response for distinct scores", async () => {
    const aId = await insertUser("lb_distA", 70, 3);
    const bId = await insertUser("lb_distB", 50, 2);
    const cId = await insertUser("lb_distC", 90, 4);

    await refreshLeaderboardRanks();

    const app = buildLeaderboardApp();
    const res = await request(app).get("/leaderboard?limit=100");
    expect(res.status).toBe(200);

    // Find our test users in the response
    const entries: Array<{ rank: number; user: { id: number } }> = res.body;
    const byId = Object.fromEntries(
      entries
        .filter((e) => [aId, bId, cId].includes(e.user.id))
        .map((e) => [e.user.id, e.rank])
    );

    // Stored rank must equal the rank returned by the endpoint
    const [storedA] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, aId));
    const [storedB] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, bId));
    const [storedC] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, cId));

    expect(storedC.rank).toBe(byId[cId]); // highest score → rank 1 among our 3
    expect(storedA.rank).toBe(byId[aId]);
    expect(storedB.rank).toBe(byId[bId]);
  });

  it("stored rank matches /leaderboard/me rank for tied scores (tiebreaker: id ASC)", async () => {
    // Two users with exactly the same score; lowerIdUser should be ranked above higherIdUser
    const lowerIdUser = await insertUser("tied_lo", 60, 5);
    const higherIdUser = await insertUser("tied_hi", 60, 5);
    expect(lowerIdUser).toBeLessThan(higherIdUser);

    await refreshLeaderboardRanks();

    // Check /leaderboard/me for higherIdUser — it should agree with stored rank
    const appForHigher = buildLeaderboardApp(higherIdUser);
    const meRes = await request(appForHigher).get("/leaderboard/me");
    expect(meRes.status).toBe(200);

    const [storedHigher] = await db.select({ rank: usersTable.rank }).from(usersTable).where(eq(usersTable.id, higherIdUser));

    // The /me rank must match the stored rank
    expect(meRes.body.rank).toBe(storedHigher.rank);

    // And the lower-id user must rank higher (lower number)
    const appForLower = buildLeaderboardApp(lowerIdUser);
    const meResLower = await request(appForLower).get("/leaderboard/me");
    expect(meResLower.status).toBe(200);
    expect(meResLower.body.rank).toBeLessThan(meRes.body.rank);
  });
});
