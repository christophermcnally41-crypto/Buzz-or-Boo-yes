/**
 * Tests for the mobile OIDC auth routes:
 *   POST /mobile-auth/init-transaction
 *   POST /mobile-auth/token-exchange
 *
 * Covers:
 *  1. Unknown state → 400 (authorization-response injection / login-CSRF guard).
 *  2. Expired transaction (TTL elapsed) → 400 (replay guard).
 *  3. Valid exchange → 200 with Bearer token, createSession called once.
 *  4. oidc.authorizationCodeGrant throws (tampered code / PKCE failure) → 500,
 *     no session created.
 *  5. Single-use enforcement: the same state cannot be reused after a
 *     successful exchange.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// ---------------------------------------------------------------------------
// Module mocks — must appear before any dynamic import of the modules under test.
// ---------------------------------------------------------------------------

vi.mock('../lib/auth.js', () => ({
  SESSION_COOKIE: 'sid',
  SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
  ISSUER_URL: 'https://replit.com/oidc',
  getOidcConfig: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  clearSession: vi.fn(),
  getSessionId: vi.fn(),
}));

vi.mock('openid-client', () => ({
  authorizationCodeGrant: vi.fn(),
  buildAuthorizationUrl: vi.fn(() => new URL('https://replit.com/oidc/auth')),
  buildEndSessionUrl: vi.fn(() => new URL('https://replit.com/oidc/end')),
  randomState: vi.fn(() => 'random-state'),
  randomNonce: vi.fn(() => 'random-nonce'),
  randomPKCECodeVerifier: vi.fn(() => 'random-verifier'),
  calculatePKCECodeChallenge: vi.fn(async () => 'random-challenge'),
}));

vi.mock('@workspace/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
  usersTable: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Deferred imports so mocks are in place first.
// ---------------------------------------------------------------------------
import * as authLib from '../lib/auth.js';
import * as oidc from 'openid-client';
import * as dbModule from '@workspace/db';
import authRouter from './auth.js';

// Typed aliases for mocked functions.
const mockGetOidcConfig = authLib.getOidcConfig as MockedFunction<typeof authLib.getOidcConfig>;
const mockCreateSession = authLib.createSession as MockedFunction<typeof authLib.createSession>;
const mockAuthorizationCodeGrant = oidc.authorizationCodeGrant as MockedFunction<typeof oidc.authorizationCodeGrant>;
const mockDbSelect = dbModule.db.select as MockedFunction<typeof dbModule.db.select>;
const mockDbUpdate = dbModule.db.update as MockedFunction<typeof dbModule.db.update>;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function makeSelectChain(rows: Record<string, unknown>[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

function makeUpdateChain(rows: Record<string, unknown>[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  // Attach a no-op req.log so the error handler in auth.ts doesn't throw.
  app.use((_req, _res, next) => {
    (_req as express.Request & { log: { error: () => void } }).log = { error: () => {} };
    next();
  });
  app.use(authRouter);
  return app;
}

/** Minimal platform user row returned from the DB. */
const dbUser = {
  id: 7,
  replitId: 'replit-sub-123',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
};

/** Minimal TokenEndpointResponse-like object for the oidc mock. */
function makeTokenResponse() {
  return {
    access_token: 'access-token-xyz',
    refresh_token: 'refresh-token-xyz',
    expiresIn: () => 3600,
    claims: () => ({
      sub: 'replit-sub-123',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  };
}

/** Valid body for a token-exchange request (state filled in per-test). */
function makeExchangeBody(state: string) {
  return {
    code: 'auth-code-abc',
    code_verifier: 'verifier-xyz',
    redirect_uri: 'https://expo.dev/callback',
    state,
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('POST /mobile-auth/token-exchange — mobile OIDC token exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOidcConfig.mockResolvedValue({} as Awaited<ReturnType<typeof authLib.getOidcConfig>>);
    mockCreateSession.mockResolvedValue('mobile-sid-001');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Unknown state — not issued by this server.
  // -------------------------------------------------------------------------
  it('returns 400 and does not exchange tokens when the state is unknown', async () => {
    const res = await request(buildApp())
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody('totally-unknown-state-value'));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Invalid or expired') });

    expect(mockAuthorizationCodeGrant).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Expired transaction — TTL has elapsed since init-transaction.
  // -------------------------------------------------------------------------
  it('returns 400 and does not exchange tokens when the transaction TTL has expired', async () => {
    vi.useFakeTimers();

    const app = buildApp();

    // Obtain a real server-issued state.
    const initRes = await request(app).post('/mobile-auth/init-transaction');
    expect(initRes.status).toBe(200);
    const { state } = initRes.body as { state: string; nonce: string };

    // Advance time past the 5-minute TTL.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const res = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Invalid or expired') });

    expect(mockAuthorizationCodeGrant).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Happy path: valid state + valid code → Bearer token returned.
  // -------------------------------------------------------------------------
  it('returns 200 with a Bearer token and calls createSession when all checks pass', async () => {
    const app = buildApp();

    // Step 1: obtain a server-issued state & nonce.
    const initRes = await request(app).post('/mobile-auth/init-transaction');
    expect(initRes.status).toBe(200);
    const { state } = initRes.body as { state: string; nonce: string };

    // Step 2: mock a successful OIDC grant.
    mockAuthorizationCodeGrant.mockResolvedValue(makeTokenResponse() as never);
    mockDbSelect.mockReturnValue(makeSelectChain([dbUser]) as never);
    mockDbUpdate.mockReturnValue(makeUpdateChain([dbUser]) as never);

    // Step 3: exchange the code.
    const res = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token: 'mobile-sid-001' });

    // authorizationCodeGrant must have been called with the server-issued nonce.
    expect(mockAuthorizationCodeGrant).toHaveBeenCalledOnce();
    expect(mockAuthorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ searchParams: expect.anything() }),
      expect.objectContaining({
        pkceCodeVerifier: 'verifier-xyz',
        expectedState: state,
        idTokenExpected: true,
      }),
    );

    // createSession must have been called with the token data.
    expect(mockCreateSession).toHaveBeenCalledOnce();
    const sessionData = mockCreateSession.mock.calls[0][0] as authLib.SessionData;
    expect(sessionData.access_token).toBe('access-token-xyz');
    expect(sessionData.user.email).toBe('test@example.com');
  });

  // -------------------------------------------------------------------------
  // 4. authorizationCodeGrant throws (tampered code / PKCE failure / nonce
  //    mismatch) — the server must NOT create a session.
  // -------------------------------------------------------------------------
  it('returns 500 and does not create a session when authorizationCodeGrant rejects', async () => {
    const app = buildApp();

    const initRes = await request(app).post('/mobile-auth/init-transaction');
    const { state } = initRes.body as { state: string };

    mockAuthorizationCodeGrant.mockRejectedValue(new Error('pkce_verification_failed'));

    const res = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));

    expect(res.status).toBe(500);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4b. Provider-side code replay — the OIDC provider rejects the authorization
  //     code because it was already used (e.g. "invalid_grant" / "code already
  //     redeemed"). The state is legitimately fresh, but authorizationCodeGrant
  //     throws. The server must return 500 and must NOT create a session.
  // -------------------------------------------------------------------------
  it('returns 500 and does not create a session when the provider rejects an already-used authorization code', async () => {
    const app = buildApp();

    // Obtain a fresh, server-issued state — this state is valid and unexpired.
    const initRes = await request(app).post('/mobile-auth/init-transaction');
    expect(initRes.status).toBe(200);
    const { state } = initRes.body as { state: string };

    // Simulate the OIDC provider rejecting the code as already redeemed.
    mockAuthorizationCodeGrant.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }),
    );

    const res = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));

    // Server must propagate the failure cleanly — non-200, no session.
    expect(res.status).toBe(500);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5a. Null claims — authorizationCodeGrant succeeds but claims() returns null.
  //     The route must return 401 and must not call createSession.
  // -------------------------------------------------------------------------
  it('returns 401 and does not create a session when claims() returns null', async () => {
    const app = buildApp();

    const initRes = await request(app).post('/mobile-auth/init-transaction');
    expect(initRes.status).toBe(200);
    const { state } = initRes.body as { state: string };

    // Token response whose claims() returns null — simulates a missing/malformed ID token.
    mockAuthorizationCodeGrant.mockResolvedValue({
      access_token: 'access-token-xyz',
      refresh_token: 'refresh-token-xyz',
      expiresIn: () => 3600,
      claims: () => null,
    } as never);

    const res = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.stringContaining('No claims') });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Single-use: the same state cannot be reused after a successful exchange.
  // -------------------------------------------------------------------------
  it('returns 400 on a second exchange attempt with the same state', async () => {
    const app = buildApp();

    const initRes = await request(app).post('/mobile-auth/init-transaction');
    const { state } = initRes.body as { state: string };

    mockAuthorizationCodeGrant.mockResolvedValue(makeTokenResponse() as never);
    mockDbSelect.mockReturnValue(makeSelectChain([dbUser]) as never);
    mockDbUpdate.mockReturnValue(makeUpdateChain([dbUser]) as never);

    // First exchange — succeeds.
    const res1 = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));
    expect(res1.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);

    // Second exchange — same state must be rejected (already consumed).
    const res2 = await request(app)
      .post('/mobile-auth/token-exchange')
      .send(makeExchangeBody(state));
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject({ error: expect.stringContaining('Invalid or expired') });

    // No additional session must have been created.
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });
});
