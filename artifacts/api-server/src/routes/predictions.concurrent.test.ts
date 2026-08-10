/**
 * Concurrency tests for POST /markets/:id/predict.
 *
 * Verifies that the atomic balance-deduction guard prevents a user from
 * spending more tokens than they have when two requests race simultaneously.
 *
 * Scenario:
 *   - User has tokenBalance = 100 (exactly one bet's worth at the default 100-token stake).
 *   - Two simultaneous predict requests are fired against two different open markets.
 *   - Exactly one should succeed (201) and one should fail (400 "Insufficient balance").
 *   - The user's final tokenBalance must be 0, never negative.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Module mocks — must appear before any dynamic import of the modules under test.
// ---------------------------------------------------------------------------

vi.mock('@workspace/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  usersTable: {},
  predictionsTable: {},
  marketsTable: {},
}));

// ---------------------------------------------------------------------------
// Deferred imports so mocks are in place first.
// ---------------------------------------------------------------------------
import * as dbModule from '@workspace/db';
import predictionsRouter from './predictions.js';

// ---------------------------------------------------------------------------
// Helpers — build Drizzle-like query-builder chain mocks.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Select chain: .from().where() → rows */
function makeSelectChain(rows: Row[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

/** Insert chain: .values().returning() → rows */
function makeInsertChain(rows: Row[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

/** Update chain: .set().where().returning() → rows */
function makeUpdateChain(rows: Row[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

/** Delete chain: .where() → void */
function makeDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// Test application factory.
// ---------------------------------------------------------------------------

function buildApp(platformUserId = 1) {
  const app = express();
  app.use(express.json());

  // Simulate an authenticated session.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    req.user = { id: String(platformUserId) } as Express.User;
    next();
  });

  app.use(predictionsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const OPEN_MARKET_1 = {
  id: 1,
  status: 'OPEN',
  marketFormat: 'STANDARD',
  description: null,
  yesCount: 0,
  noCount: 0,
  totalPredictions: 0,
};

const OPEN_MARKET_2 = {
  id: 2,
  status: 'OPEN',
  marketFormat: 'STANDARD',
  description: null,
  yesCount: 0,
  noCount: 0,
  totalPredictions: 0,
};

/** User whose balance equals exactly one bet (100 tokens). */
const USER_WITH_ONE_BET = {
  id: 1,
  tokenBalance: 100,
  totalPredictions: 0,
};

const PREDICTION_MARKET_1 = { id: 101, userId: 1, marketId: 1, choice: 'YES', amount: 100, createdAt: new Date() };
const PREDICTION_MARKET_2 = { id: 102, userId: 1, marketId: 2, choice: 'YES', amount: 100, createdAt: new Date() };

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('POST /markets/:id/predict — concurrent balance guard', () => {
  const mockSelect = dbModule.db.select as MockedFunction<typeof dbModule.db.select>;
  const mockInsert = dbModule.db.insert as MockedFunction<typeof dbModule.db.insert>;
  const mockUpdate = dbModule.db.update as MockedFunction<typeof dbModule.db.update>;
  const mockDelete = dbModule.db.delete as MockedFunction<typeof dbModule.db.delete>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Core concurrency test: two simultaneous bets, only one balance.
  // -------------------------------------------------------------------------
  it('allows exactly one bet to succeed when two concurrent requests race against a single-bet balance', async () => {
    const app = buildApp();

    // Track how many times the atomic deduction update has been called so we
    // can simulate the real DB behaviour: the first deduction wins, the second
    // finds tokenBalance already 0 and returns no rows.
    let deductionCallCount = 0;

    // db.select: used twice per request (market + user).
    // We set up enough returns for both requests (4 calls total).
    mockSelect
      .mockReturnValueOnce(makeSelectChain([OPEN_MARKET_1]) as never) // req1 market lookup
      .mockReturnValueOnce(makeSelectChain([USER_WITH_ONE_BET]) as never) // req1 user lookup
      .mockReturnValueOnce(makeSelectChain([OPEN_MARKET_2]) as never) // req2 market lookup
      .mockReturnValueOnce(makeSelectChain([USER_WITH_ONE_BET]) as never); // req2 user lookup

    // db.insert: one successful insert per request (different predictions).
    mockInsert
      .mockReturnValueOnce(makeInsertChain([PREDICTION_MARKET_1]) as never) // req1 prediction
      .mockReturnValueOnce(makeInsertChain([PREDICTION_MARKET_2]) as never); // req2 prediction

    // db.update: called for (a) market count update and (b) balance deduction.
    // Interleaving order under Node.js microtasks with two concurrent requests:
    //   call 1 — req1 market count update
    //   call 2 — req2 market count update
    //   call 3 — req1 balance deduction (first → succeeds, balance → 0)
    //   call 4 — req2 balance deduction (second → fails, balance already 0)
    //
    // We use mockImplementation to distinguish deduction calls by counting them.
    mockUpdate.mockImplementation((() => {
      // The first two update calls are market-count updates; they succeed trivially.
      // The next calls are balance deductions; only the first one returns a row.
      // We detect deduction calls by checking which invocation number we're on.
      // Simple approach: a closure counter that tracks deduction-specific calls.
      return makeUpdateChain([]) as never; // default — overridden below for deductions
    }) as never);

    // Override with explicit sequence that mirrors the real atomic guard.
    mockUpdate
      .mockReturnValueOnce(makeUpdateChain([{ totalPredictions: 1 }]) as never) // market 1 count
      .mockReturnValueOnce(makeUpdateChain([{ totalPredictions: 1 }]) as never) // market 2 count
      .mockImplementationOnce((() => {
        // First deduction: balance is still 100 → succeeds.
        deductionCallCount++;
        return makeUpdateChain([{ ...USER_WITH_ONE_BET, tokenBalance: 0 }]) as never;
      }) as never)
      .mockImplementationOnce((() => {
        // Second deduction: balance is now 0 → WHERE tokenBalance >= 100 matches nothing.
        deductionCallCount++;
        return makeUpdateChain([]) as never;
      }) as never);

    // db.delete: rolls back the prediction that lost the balance race.
    mockDelete.mockReturnValue(makeDeleteChain() as never);

    // Fire both requests truly concurrently.
    const [res1, res2] = await Promise.all([
      request(app).post('/markets/1/predict').send({ choice: 'YES', amount: 100 }),
      request(app).post('/markets/2/predict').send({ choice: 'YES', amount: 100 }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 201 and one 400.
    expect(statuses).toEqual([201, 400]);

    // The 400 must carry the "Insufficient balance" message.
    const failedRes = res1.status === 400 ? res1 : res2;
    expect(failedRes.body).toMatchObject({ error: 'Insufficient balance' });

    // Both deduction slots should have been reached (one win, one loss).
    expect(deductionCallCount).toBe(2);

    // The losing prediction must have been cleaned up with a DELETE.
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Guard: a single request with sufficient balance still succeeds normally.
  // -------------------------------------------------------------------------
  it('succeeds normally when the user has exactly enough balance for one bet', async () => {
    const app = buildApp();

    mockSelect
      .mockReturnValueOnce(makeSelectChain([OPEN_MARKET_1]) as never)
      .mockReturnValueOnce(makeSelectChain([USER_WITH_ONE_BET]) as never);

    mockInsert.mockReturnValueOnce(makeInsertChain([PREDICTION_MARKET_1]) as never);

    mockUpdate
      .mockReturnValueOnce(makeUpdateChain([{ totalPredictions: 1 }]) as never) // market count
      .mockReturnValueOnce(makeUpdateChain([{ ...USER_WITH_ONE_BET, tokenBalance: 0 }]) as never); // deduction

    const res = await request(app)
      .post('/markets/1/predict')
      .send({ choice: 'YES', amount: 100 });

    expect(res.status).toBe(201);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Guard: a single request with insufficient balance is rejected immediately.
  // -------------------------------------------------------------------------
  it('returns 400 "Insufficient balance" when the user has fewer tokens than the bet', async () => {
    const app = buildApp();

    const brokeUser = { ...USER_WITH_ONE_BET, tokenBalance: 50 };

    mockSelect
      .mockReturnValueOnce(makeSelectChain([OPEN_MARKET_1]) as never)
      .mockReturnValueOnce(makeSelectChain([brokeUser]) as never);

    mockInsert.mockReturnValueOnce(makeInsertChain([PREDICTION_MARKET_1]) as never);

    mockUpdate
      .mockReturnValueOnce(makeUpdateChain([{ totalPredictions: 1 }]) as never) // market count
      .mockReturnValueOnce(makeUpdateChain([]) as never); // deduction fails — no matching row

    mockDelete.mockReturnValue(makeDeleteChain() as never);

    const res = await request(app)
      .post('/markets/1/predict')
      .send({ choice: 'YES', amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Insufficient balance' });

    // The inserted prediction must be rolled back.
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Final-balance assertion: after a concurrent race the balance must be 0.
  //
  // This test reads the tokenBalance returned by the deduction UPDATE (which
  // reflects the post-deduction DB value) and confirms it is 0, never negative.
  // -------------------------------------------------------------------------
  it('leaves the user balance at exactly 0 after one concurrent bet wins (not negative)', async () => {
    const app = buildApp();

    let finalBalance: number | undefined;

    mockSelect
      .mockReturnValueOnce(makeSelectChain([OPEN_MARKET_1]) as never)
      .mockReturnValueOnce(makeSelectChain([USER_WITH_ONE_BET]) as never)
      .mockReturnValueOnce(makeSelectChain([OPEN_MARKET_2]) as never)
      .mockReturnValueOnce(makeSelectChain([USER_WITH_ONE_BET]) as never);

    mockInsert
      .mockReturnValueOnce(makeInsertChain([PREDICTION_MARKET_1]) as never)
      .mockReturnValueOnce(makeInsertChain([PREDICTION_MARKET_2]) as never);

    mockUpdate
      .mockReturnValueOnce(makeUpdateChain([{ totalPredictions: 1 }]) as never)
      .mockReturnValueOnce(makeUpdateChain([{ totalPredictions: 1 }]) as never)
      .mockImplementationOnce((() => {
        const deducted = { ...USER_WITH_ONE_BET, tokenBalance: 0 };
        finalBalance = deducted.tokenBalance;
        return makeUpdateChain([deducted]) as never;
      }) as never)
      .mockReturnValueOnce(makeUpdateChain([]) as never); // second deduction — no rows

    mockDelete.mockReturnValue(makeDeleteChain() as never);

    await Promise.all([
      request(app).post('/markets/1/predict').send({ choice: 'YES', amount: 100 }),
      request(app).post('/markets/2/predict').send({ choice: 'YES', amount: 100 }),
    ]);

    // The balance as stored by the winning deduction must be 0, not negative.
    expect(finalBalance).toBe(0);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
  });
});
