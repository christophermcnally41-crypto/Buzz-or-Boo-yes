/**
 * Contract tests for leaderboard response schemas and server-side normalization.
 *
 * Primary concern: if the API ever returns `buzzScore` as a 0–1 decimal fraction
 * (e.g. 0.82 instead of 82) due to a schema drift, the display must not silently
 * show "0.82". The `getBuzzScore` helper in `leaderboard.ts` normalizes fractional
 * values before they reach the Zod parse boundary, so these tests exercise that
 * normalization path end-to-end via the route.
 *
 * Secondary concern: `accuracy` must stay in [0, 1]. If it is accidentally stored
 * as a percentage (75 instead of 0.75), it must be converted back to a fraction.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@workspace/db', () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  usersTable: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  gt: vi.fn(),
  and: vi.fn(),
  sql: new Proxy(() => {}, {
    get: () => () => {},
    apply: () => '',
  }),
}));

import * as dbModule from '@workspace/db';
import leaderboardRouter from './leaderboard.js';

const mockDbSelect = dbModule.db.select as MockedFunction<typeof dbModule.db.select>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(leaderboardRouter);
  return app;
}

/** Build a fake DB user row with overridable score fields. */
function makeDbUser(overrides: {
  buzzScore?: number | null;
  overallAccuracy?: number | null;
  totalResolved?: number;
} = {}) {
  return {
    id: 1,
    replitId: 'replit-sub-1',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    tokenBalance: 500,
    totalPredictions: 10,
    totalResolved: overrides.totalResolved ?? 5,
    totalCorrect: 4,
    overallAccuracy: overrides.overallAccuracy ?? 0.75,
    styleAccuracy: null,
    homeAccuracy: null,
    cityAccuracy: null,
    realEstateAccuracy: null,
    weatherAccuracy: null,
    cultureAccuracy: null,
    buzzScore: overrides.buzzScore ?? 75,
    rank: 1,
    lastTopupAt: null,
    createdAt: new Date(),
  };
}

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** Capture the SQL string passed to orderBy so we can assert it uses the
 *  normalized CASE expression rather than raw COALESCE. */
function makeSelectChainCapturingOrder(rows: unknown[], orderSpy: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: orderSpy.mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// ---------------------------------------------------------------------------
// Tests: buzzScore decimal-fraction drift (core failure mode)
// ---------------------------------------------------------------------------
describe('GET /leaderboard — buzzScore normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits buzzScore=75 when the DB row has buzzScore=75 (normal integer storage)', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([makeDbUser({ buzzScore: 75 })]) as never
    );

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].buzzScore).toBe(75);
  });

  it('emits buzzScore=82 when the DB row has buzzScore=0.82 (decimal-fraction drift)', async () => {
    // Simulates the failure mode: schema change wrote buzzScore as a 0–1 fraction.
    // The normalization in getBuzzScore must detect this and scale to 0–100.
    mockDbSelect.mockReturnValue(
      makeSelectChain([makeDbUser({ buzzScore: 0.82 as unknown as number })]) as never
    );

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].buzzScore).toBe(82);
  });

  it('emits buzzScore=0 when the DB row has buzzScore=0', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([makeDbUser({ buzzScore: 0 })]) as never
    );

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].buzzScore).toBe(0);
  });

  it('emits buzzScore=100 when the DB row has buzzScore=100 (boundary)', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([makeDbUser({ buzzScore: 100 })]) as never
    );

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].buzzScore).toBe(100);
  });

  it('emits accuracy within [0,1] when the DB row has overallAccuracy=0.75', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([makeDbUser({ overallAccuracy: 0.75 })]) as never
    );

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].accuracy).toBeGreaterThanOrEqual(0);
    expect(res.body[0].accuracy).toBeLessThanOrEqual(1);
  });

  it('converts accuracy from percentage (75) back to fraction (0.75) when DB drifts', async () => {
    // Schema drift: accuracy accidentally stored as percentage integer.
    mockDbSelect.mockReturnValue(
      makeSelectChain([makeDbUser({ overallAccuracy: 75 })]) as never
    );

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].accuracy).toBeCloseTo(0.75);
  });

  it('normalizes buzzScore=0.82 to 82 and buzzScore=75 stays 75 regardless of DB row order', async () => {
    // Note: actual SQL ordering is validated by rankRefresh.test.ts integration tests
    // which use a real database. This mock test only validates that the response
    // normalization is applied correctly to each row independent of position.
    const userA = { ...makeDbUser({ buzzScore: 75 }), id: 1, username: 'userA' };
    const userB = { ...makeDbUser({ buzzScore: 0.82 as unknown as number }), id: 2, username: 'userB' };

    // DB returns them in arbitrary order (A first); normalization is per-row
    mockDbSelect.mockReturnValue(makeSelectChain([userA, userB]) as never);

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const entryA = res.body.find((e: { user: { username: string } }) => e.user.username === 'userA');
    const entryB = res.body.find((e: { user: { username: string } }) => e.user.username === 'userB');

    // Each row gets its own normalized buzzScore regardless of position
    expect(entryA.buzzScore).toBe(75);
    expect(entryB.buzzScore).toBe(82);  // 0.82 fraction scaled to 82
  });
});

// ---------------------------------------------------------------------------
// Tests: Zod schema rejects values that slip past normalization
// ---------------------------------------------------------------------------
import { GetLeaderboardResponse, GetMyLeaderboardEntryResponse } from '@workspace/api-zod';

const baseUser = {
  id: 1,
  username: 'testuser',
  email: null,
  avatarUrl: null,
  tokenBalance: 100,
  totalPredictions: 10,
  totalResolved: 5,
  totalCorrect: 4,
  overallAccuracy: null,
  styleAccuracy: null,
  homeAccuracy: null,
  cityAccuracy: null,
  realEstateAccuracy: null,
  weatherAccuracy: null,
  cultureAccuracy: null,
  buzzScore: null,
  rank: null,
  lastTopupAt: null,
  createdAt: new Date().toISOString(),
};

function makeEntry(overrides: { accuracy?: number; buzzScore?: number }) {
  return {
    rank: 1,
    user: baseUser,
    accuracy: overrides.accuracy ?? 0.75,
    buzzScore: overrides.buzzScore,
    totalPredictions: 10,
    totalCorrect: 4,
  };
}

describe('GetLeaderboardResponse Zod schema — range enforcement', () => {
  it('accepts valid entry: buzzScore=82, accuracy=0.82', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: 0.82, buzzScore: 82 })])
    ).not.toThrow();
  });

  it('accepts boundary values: buzzScore=0, accuracy=0', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: 0, buzzScore: 0 })])
    ).not.toThrow();
  });

  it('accepts boundary values: buzzScore=100, accuracy=1', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: 1, buzzScore: 100 })])
    ).not.toThrow();
  });

  it('rejects buzzScore above 100 (e.g. 101)', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: 0.75, buzzScore: 101 })])
    ).toThrow();
  });

  it('rejects buzzScore below 0', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: 0.75, buzzScore: -1 })])
    ).toThrow();
  });

  it('rejects accuracy above 1 (e.g. 75 passed as percentage instead of fraction)', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: 75, buzzScore: 75 })])
    ).toThrow();
  });

  it('rejects accuracy below 0', () => {
    expect(() =>
      GetLeaderboardResponse.parse([makeEntry({ accuracy: -0.1, buzzScore: 50 })])
    ).toThrow();
  });
});

describe('GetMyLeaderboardEntryResponse Zod schema — range enforcement', () => {
  it('accepts a valid entry', () => {
    expect(() =>
      GetMyLeaderboardEntryResponse.parse(makeEntry({ accuracy: 0.6, buzzScore: 60 }))
    ).not.toThrow();
  });

  it('rejects buzzScore above 100', () => {
    expect(() =>
      GetMyLeaderboardEntryResponse.parse(makeEntry({ accuracy: 0.6, buzzScore: 150 }))
    ).toThrow();
  });

  it('rejects accuracy above 1', () => {
    expect(() =>
      GetMyLeaderboardEntryResponse.parse(makeEntry({ accuracy: 60, buzzScore: 60 }))
    ).toThrow();
  });
});
