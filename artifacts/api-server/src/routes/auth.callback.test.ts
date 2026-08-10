/**
 * Tests for the OIDC /callback route.
 *
 * Covers:
 *  1. Missing state cookie → redirects to /api/login (login-CSRF guard).
 *  2. Missing code_verifier cookie → redirects to /api/login (PKCE guard).
 *  3. Missing nonce cookie → redirects to /api/login (nonce guard).
 *     Without this check, expectedNonce would be undefined, potentially
 *     disabling nonce validation in the OIDC library.
 *  4. authorizationCodeGrant throws (mismatched / replayed state, tampered
 *     code) → redirects to /api/login — no session created.
 *  5. Replay attack: authorization code submitted a second time is rejected
 *     by the token endpoint (single-use enforcement) — no second session.
 *  6. Successful callback → createSession called, sid cookie written.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
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
const mockGetOidcConfig       = authLib.getOidcConfig       as MockedFunction<typeof authLib.getOidcConfig>;
const mockCreateSession       = authLib.createSession       as MockedFunction<typeof authLib.createSession>;
const mockAuthorizationCodeGrant = oidc.authorizationCodeGrant as MockedFunction<typeof oidc.authorizationCodeGrant>;
const mockDbSelect = dbModule.db.select as MockedFunction<typeof dbModule.db.select>;
const mockDbUpdate = dbModule.db.update as MockedFunction<typeof dbModule.db.update>;

// ---------------------------------------------------------------------------
// Helpers — build chainable Drizzle-like query builder mocks.
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

// ---------------------------------------------------------------------------
// Test application factory.
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(authRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Shared fixtures.
// ---------------------------------------------------------------------------

/** A minimal platform user row returned from the DB. */
const dbUser = {
  id: 7,
  replitId: 'replit-sub-123',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
};

/**
 * Creates a minimal TokenEndpointResponse-like object for the oidc mock.
 * `claims()` returns a valid ID-token claims set.
 */
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

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('GET /callback — OIDC authorization code exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOidcConfig.mockResolvedValue({} as Awaited<ReturnType<typeof authLib.getOidcConfig>>);
    mockCreateSession.mockResolvedValue('new-sid-abc');
  });

  // -------------------------------------------------------------------------
  // 1. Missing state cookie → redirect (login-CSRF / state guard).
  // -------------------------------------------------------------------------
  it('redirects to /api/login and does not exchange tokens when the state cookie is absent', async () => {
    // Only code_verifier is present — state cookie is missing.
    const res = await request(buildApp())
      .get('/callback?code=some-code&state=some-state')
      .set('Cookie', 'code_verifier=some-verifier');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/login');

    // No token exchange or session should have occurred.
    expect(mockAuthorizationCodeGrant).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Missing code_verifier cookie → redirect (PKCE guard).
  // -------------------------------------------------------------------------
  it('redirects to /api/login and does not exchange tokens when the code_verifier cookie is absent', async () => {
    // Only state is present — code_verifier cookie is missing.
    const res = await request(buildApp())
      .get('/callback?code=some-code&state=some-state')
      .set('Cookie', 'state=expected-state');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/login');

    expect(mockAuthorizationCodeGrant).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Missing nonce cookie → redirect before any token exchange.
  //    Without this guard, expectedNonce would be undefined, which can
  //    disable nonce validation in the OIDC library and allow a hijacker to
  //    replay a token response without being caught.
  // -------------------------------------------------------------------------
  it('redirects to /api/login and does not exchange tokens when the nonce cookie is absent', async () => {
    // code_verifier and state are present — only nonce is missing.
    const res = await request(buildApp())
      .get('/callback?code=some-code&state=some-state')
      .set('Cookie', 'code_verifier=some-verifier; state=expected-state');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/login');

    // No token exchange or session should have occurred.
    expect(mockAuthorizationCodeGrant).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. authorizationCodeGrant throws → redirect, no session created.
  //    This covers: mismatched state, replayed authorization code, tampered
  //    code_verifier, nonce mismatch, and any other OIDC validation failure.
  // -------------------------------------------------------------------------
  it('redirects to /api/login and does not create a session when authorizationCodeGrant rejects', async () => {
    mockAuthorizationCodeGrant.mockRejectedValue(new Error('state mismatch'));

    const res = await request(buildApp())
      .get('/callback?code=replayed-code&state=wrong-state')
      .set('Cookie', 'code_verifier=cv; state=expected-state; nonce=nn');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/login');

    // authorizationCodeGrant was called (all cookies were present) but it threw.
    expect(mockAuthorizationCodeGrant).toHaveBeenCalledOnce();

    // No session must have been created despite the attempt.
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Replay attack: same authorization code submitted a second time must
  //    not produce a second session.
  //
  //    Authorization codes are single-use at the token endpoint. The OIDC
  //    library (openid-client) surfaces this as a thrown error on the second
  //    authorizationCodeGrant call. This test models that provider-side
  //    enforcement: the mock rejects on the second invocation exactly as the
  //    real token endpoint would, and verifies the callback handler translates
  //    that rejection into no new session.
  // -------------------------------------------------------------------------
  it('does not create a second session when the same authorization code is replayed', async () => {
    // First exchange: code is accepted by the token endpoint.
    // Second exchange: token endpoint rejects — code already consumed.
    mockAuthorizationCodeGrant
      .mockResolvedValueOnce(makeTokenResponse() as never)
      .mockRejectedValueOnce(new Error('authorization_code_reuse'));

    mockDbSelect.mockReturnValue(makeSelectChain([dbUser]) as never);
    mockDbUpdate.mockReturnValue(makeUpdateChain([dbUser]) as never);

    const app = buildApp();
    const cookies = 'code_verifier=cv-value; state=correct-state; nonce=nn-value';

    // First callback — legitimate use.
    const res1 = await request(app)
      .get('/callback?code=auth-code-123&state=correct-state')
      .set('Cookie', cookies);
    expect(res1.status).toBe(302);
    // One session was created for the legitimate exchange.
    expect(mockCreateSession).toHaveBeenCalledTimes(1);

    // Second callback — replay attempt with the same code.
    const res2 = await request(app)
      .get('/callback?code=auth-code-123&state=correct-state')
      .set('Cookie', cookies);
    expect(res2.status).toBe(302);
    expect(res2.headers.location).toBe('/api/login');

    // The token endpoint was reached twice — the second attempt got through the
    // cookie checks and actually tried to exchange, but the provider rejected it.
    expect(mockAuthorizationCodeGrant).toHaveBeenCalledTimes(2);

    // No additional session must have been created on the replay attempt.
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 6. Happy path: valid cookies + valid code → session created, sid set.
  // -------------------------------------------------------------------------
  it('creates a session and sets the sid cookie when all OIDC checks pass', async () => {
    mockAuthorizationCodeGrant.mockResolvedValue(makeTokenResponse() as never);
    // upsertUser: existing user found → update path.
    mockDbSelect.mockReturnValue(makeSelectChain([dbUser]) as never);
    mockDbUpdate.mockReturnValue(makeUpdateChain([dbUser]) as never);

    const res = await request(buildApp())
      .get('/callback?code=valid-code&state=correct-state&iss=https%3A%2F%2Freplit.com%2Foidc')
      .set('Cookie', 'code_verifier=cv-value; state=correct-state; nonce=nn-value; return_to=%2Fdashboard');

    // Should redirect to the return_to path, not back to /api/login.
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toBe('/api/login');

    // authorizationCodeGrant must have been called with the cookies we supplied.
    expect(mockAuthorizationCodeGrant).toHaveBeenCalledOnce();
    expect(mockAuthorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        pkceCodeVerifier: 'cv-value',
        expectedState: 'correct-state',
        expectedNonce: 'nn-value',
        idTokenExpected: true,
      }),
    );

    // createSession must have been called with the token data from the exchange.
    expect(mockCreateSession).toHaveBeenCalledOnce();
    const sessionData: authLib.SessionData = mockCreateSession.mock.calls[0][0];
    expect(sessionData.access_token).toBe('access-token-xyz');
    expect(sessionData.refresh_token).toBe('refresh-token-xyz');
    expect(sessionData.user.email).toBe('test@example.com');

    // The response must set the sid cookie containing the new session ID.
    const setCookieHeader = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const sidCookie = cookies.find((c) => c.startsWith('sid='));
    expect(sidCookie).toBeDefined();
    expect(sidCookie).toContain('sid=new-sid-abc');
  });
});
