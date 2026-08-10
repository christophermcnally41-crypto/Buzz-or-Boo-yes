/**
 * Unit tests for the daily top-up logic in GET /users/me.
 *
 * Covers:
 *  1. Balance below threshold, no prior top-up → topped up to TOPUP_TARGET (500).
 *  2. Balance exactly at threshold (500) → NOT topped up.
 *  3. Balance below threshold, last top-up < 24 h ago → NOT topped up again.
 *  4. Balance below threshold, last top-up ≥ 24 h ago → topped up again.
 *  5. Top-up sets balance to TOPUP_TARGET, not incremented on top of existing balance.
 *  6. Top-up is idempotent: two rapid calls within 24 h → only the first tops up.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Module mocks — must appear before any dynamic import of the modules under test.
// ---------------------------------------------------------------------------

// We mock the whole @workspace/db module so no real DB is touched.
vi.mock('@workspace/db', () => {
  return {
    db: {
      select: vi.fn(),
      update: vi.fn(),
    },
    usersTable: {},
    predictionsTable: {},
    marketsTable: {},
  };
});

// ---------------------------------------------------------------------------
// Deferred imports so mocks are in place first.
// ---------------------------------------------------------------------------
import * as dbModule from '@workspace/db';
import usersRouter from './users.js';

// ---------------------------------------------------------------------------
// Helpers — build a chainable Drizzle-like query builder mock.
// ---------------------------------------------------------------------------

type SelectRow = Record<string, unknown>;

/** Returns a mock chain whose terminal `.where()` resolves to `rows`. */
function makeSelectChain(rows: SelectRow[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

/** Returns a mock chain whose terminal `.returning()` resolves to `rows`. */
function makeUpdateChain(rows: SelectRow[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Test application factory.
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Express app that:
 *  - Injects `isAuthenticated` / `user` onto `req` (simulating authMiddleware).
 *  - Mounts the real users router.
 */
function buildApp(platformUserId = 1) {
  const app = express();
  app.use(express.json());

  // Simulate a fully authenticated session.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    req.user = { id: String(platformUserId) } as Express.User;
    next();
  });

  app.use(usersRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Shared user fixture factory.
// ---------------------------------------------------------------------------

const NOW = new Date('2026-01-15T12:00:00.000Z');

function makeUser(overrides: Partial<{
  tokenBalance: number;
  lastTopupAt: Date | null;
}> = {}) {
  return {
    id: 1,
    replitId: 'replit-abc',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    tokenBalance: 200,
    lastTopupAt: null,
    totalPredictions: 0,
    totalResolved: 0,
    totalCorrect: 0,
    overallAccuracy: null,
    styleAccuracy: null,
    homeAccuracy: null,
    cityAccuracy: null,
    realEstateAccuracy: null,
    weatherAccuracy: null,
    cultureAccuracy: null,
    rank: null,
    createdAt: new Date('2025-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('GET /users/me — daily top-up logic', () => {
  const mockSelect = dbModule.db.select as MockedFunction<typeof dbModule.db.select>;
  const mockUpdate = dbModule.db.update as MockedFunction<typeof dbModule.db.update>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Below threshold, no prior top-up → topped up to 500.
  // -------------------------------------------------------------------------
  it('tops up a user below threshold who has never been topped up before', async () => {
    const user = makeUser({ tokenBalance: 200, lastTopupAt: null });
    const toppedUpUser = { ...user, tokenBalance: 500, lastTopupAt: NOW };

    mockSelect.mockReturnValue(makeSelectChain([user]) as never);
    mockUpdate.mockReturnValue(makeUpdateChain([toppedUpUser]) as never);

    const res = await request(buildApp()).get('/users/me');

    expect(res.status).toBe(200);
    expect(res.body.tokenBalance).toBe(500);

    // Verify that an UPDATE was issued with both the new balance and the new timestamp.
    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateChain = mockUpdate.mock.results[0].value;
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tokenBalance: 500, lastTopupAt: NOW }),
    );
  });

  // -------------------------------------------------------------------------
  // 2. Balance exactly at threshold (500) → NOT topped up.
  // -------------------------------------------------------------------------
  it('does NOT top up a user whose balance is exactly at the threshold (500)', async () => {
    const user = makeUser({ tokenBalance: 500, lastTopupAt: null });

    mockSelect.mockReturnValue(makeSelectChain([user]) as never);

    const res = await request(buildApp()).get('/users/me');

    expect(res.status).toBe(200);
    expect(res.body.tokenBalance).toBe(500);

    // No UPDATE should have been issued.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Balance below threshold, last top-up < 24 h ago → NOT topped up again.
  // -------------------------------------------------------------------------
  it('does NOT top up again when fewer than 24 h have elapsed since the last top-up', async () => {
    const twelveHoursAgo = new Date(NOW.getTime() - 12 * 60 * 60 * 1000);
    const user = makeUser({ tokenBalance: 100, lastTopupAt: twelveHoursAgo });

    mockSelect.mockReturnValue(makeSelectChain([user]) as never);

    const res = await request(buildApp()).get('/users/me');

    expect(res.status).toBe(200);
    // Balance should remain unchanged.
    expect(res.body.tokenBalance).toBe(100);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Balance below threshold, last top-up ≥ 24 h ago → topped up again.
  // -------------------------------------------------------------------------
  it('tops up again once at least 24 h have elapsed since the last top-up', async () => {
    const twentyFiveHoursAgo = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
    const user = makeUser({ tokenBalance: 300, lastTopupAt: twentyFiveHoursAgo });
    const toppedUpUser = { ...user, tokenBalance: 500, lastTopupAt: NOW };

    mockSelect.mockReturnValue(makeSelectChain([user]) as never);
    mockUpdate.mockReturnValue(makeUpdateChain([toppedUpUser]) as never);

    const res = await request(buildApp()).get('/users/me');

    expect(res.status).toBe(200);
    expect(res.body.tokenBalance).toBe(500);
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 5. Top-up sets balance to TOPUP_TARGET (500), not incremented additively.
  // -------------------------------------------------------------------------
  it('sets the balance to exactly 500 rather than adding to existing balance', async () => {
    // A user with 499 tokens should get exactly 500, not 999.
    const user = makeUser({ tokenBalance: 499, lastTopupAt: null });
    const toppedUpUser = { ...user, tokenBalance: 500, lastTopupAt: NOW };

    mockSelect.mockReturnValue(makeSelectChain([user]) as never);
    mockUpdate.mockReturnValue(makeUpdateChain([toppedUpUser]) as never);

    const res = await request(buildApp()).get('/users/me');

    expect(res.status).toBe(200);
    expect(res.body.tokenBalance).toBe(500);

    const updateChain = mockUpdate.mock.results[0].value;
    // Must be a SET to 500 (not an increment), and must persist lastTopupAt.
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tokenBalance: 500, lastTopupAt: NOW }),
    );
  });

  // -------------------------------------------------------------------------
  // 6. Exactly 24 h boundary: elapsed = TOPUP_INTERVAL_MS → IS eligible.
  // -------------------------------------------------------------------------
  it('tops up when elapsed time equals exactly 24 h (boundary is inclusive)', async () => {
    const exactlyOneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const user = makeUser({ tokenBalance: 1, lastTopupAt: exactlyOneDayAgo });
    const toppedUpUser = { ...user, tokenBalance: 500, lastTopupAt: NOW };

    mockSelect.mockReturnValue(makeSelectChain([user]) as never);
    mockUpdate.mockReturnValue(makeUpdateChain([toppedUpUser]) as never);

    const res = await request(buildApp()).get('/users/me');

    expect(res.status).toBe(200);
    expect(res.body.tokenBalance).toBe(500);
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 7. Idempotency: second call within 24 h does not top up again, even when
  //    the user has spent coins back below 500.
  //
  //    This specifically tests the lastTopupAt timestamp gate — NOT the balance
  //    threshold. The second read deliberately has tokenBalance=100 (below 500)
  //    so that the balance threshold alone would allow a top-up. Only the
  //    persisted lastTopupAt value should block it.
  // -------------------------------------------------------------------------
  it('does not top up on a second call within 24 h even after the user spends coins below 500', async () => {
    // First call: user is at 200 FP with no prior top-up → gets topped up.
    const userBefore = makeUser({ tokenBalance: 200, lastTopupAt: null });
    const userAfterTopup = { ...userBefore, tokenBalance: 500, lastTopupAt: NOW };

    // Advance time by 1 hour for the second call — still within the 24 h window.
    const oneHourLater = new Date(NOW.getTime() + 60 * 60 * 1000);

    // Second call: user spent coins and is back at 100 FP, but lastTopupAt was
    // written to the DB during the first top-up — this is what must block the
    // second top-up.
    const userAfterSpend = { ...userAfterTopup, tokenBalance: 100, lastTopupAt: NOW };

    mockSelect
      .mockReturnValueOnce(makeSelectChain([userBefore]) as never)    // first GET
      .mockReturnValueOnce(makeSelectChain([userAfterSpend]) as never); // second GET
    mockUpdate.mockReturnValue(makeUpdateChain([userAfterTopup]) as never);

    const app = buildApp();

    const res1 = await request(app).get('/users/me');
    expect(res1.status).toBe(200);
    expect(res1.body.tokenBalance).toBe(500);
    // First top-up: both tokenBalance and lastTopupAt must be persisted.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const firstUpdateChain = mockUpdate.mock.results[0].value;
    expect(firstUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tokenBalance: 500, lastTopupAt: NOW }),
    );

    // Advance time by 1 hour — still within the 24 h window.
    vi.setSystemTime(oneHourLater);

    // Second call: balance is below 500 but lastTopupAt is recent.
    const res2 = await request(app).get('/users/me');
    expect(res2.status).toBe(200);
    expect(res2.body.tokenBalance).toBe(100); // user keeps their spent-down balance

    // The 24 h timestamp gate must have blocked the second UPDATE.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
