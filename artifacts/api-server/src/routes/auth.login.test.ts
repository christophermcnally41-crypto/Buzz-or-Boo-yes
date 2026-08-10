/**
 * Tests for the OIDC /login route.
 *
 * Covers:
 *  1. GET /login redirects to the OIDC authorization URL (302).
 *  2. All four httpOnly cookies — state, nonce, code_verifier, return_to —
 *     are set on the response.
 *  3. return_to defaults to "/" when no (or an unsafe) returnTo query param is given.
 *  4. A safe returnTo query param is stored verbatim in the return_to cookie.
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
  buildAuthorizationUrl: vi.fn(
    () => new URL('https://replit.com/oidc/auth?response_type=code'),
  ),
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
import authRouter from './auth.js';

const mockGetOidcConfig = authLib.getOidcConfig as MockedFunction<
  typeof authLib.getOidcConfig
>;

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
// Helper: parse Set-Cookie headers into a map of name → full cookie string.
// ---------------------------------------------------------------------------
function parseCookies(res: request.Response): Map<string, string> {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const raw = Array.isArray(header) ? header : header ? [header] : [];
  const map = new Map<string, string>();
  for (const c of raw) {
    const name = c.split('=')[0];
    map.set(name, c);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('GET /login — OIDC authorization redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOidcConfig.mockResolvedValue(
      {} as Awaited<ReturnType<typeof authLib.getOidcConfig>>,
    );
  });

  // -------------------------------------------------------------------------
  // 1. Redirect to the OIDC authorization URL.
  // -------------------------------------------------------------------------
  it('responds with a 302 redirect to the OIDC authorization URL', async () => {
    const res = await request(buildApp()).get('/login');

    expect(res.status).toBe(302);
    // The Location header should point to the mocked authorization URL.
    expect(res.headers.location).toContain('replit.com/oidc/auth');
  });

  // -------------------------------------------------------------------------
  // 2. All four OIDC cookies are set as httpOnly.
  // -------------------------------------------------------------------------
  it('sets state, nonce, code_verifier, and return_to cookies as httpOnly', async () => {
    const res = await request(buildApp()).get('/login');

    const cookies = parseCookies(res);

    // Every required cookie must be present.
    expect(cookies.has('state'), 'state cookie missing').toBe(true);
    expect(cookies.has('nonce'), 'nonce cookie missing').toBe(true);
    expect(cookies.has('code_verifier'), 'code_verifier cookie missing').toBe(true);
    expect(cookies.has('return_to'), 'return_to cookie missing').toBe(true);

    // Every cookie must carry the HttpOnly flag.
    for (const [name, value] of cookies) {
      expect(value.toLowerCase(), `${name} cookie is not HttpOnly`).toContain(
        'httponly',
      );
    }
  });

  // -------------------------------------------------------------------------
  // 3. Cookies carry the values produced by the mocked openid-client helpers.
  // -------------------------------------------------------------------------
  it('stores the random state, nonce, and code_verifier values in their respective cookies', async () => {
    const res = await request(buildApp()).get('/login');

    const cookies = parseCookies(res);

    expect(cookies.get('state')).toContain('random-state');
    expect(cookies.get('nonce')).toContain('random-nonce');
    expect(cookies.get('code_verifier')).toContain('random-verifier');
  });

  // -------------------------------------------------------------------------
  // 4. return_to defaults to "/" when no returnTo query param is supplied.
  // -------------------------------------------------------------------------
  it('sets return_to to "/" when no returnTo query parameter is provided', async () => {
    const res = await request(buildApp()).get('/login');

    const cookies = parseCookies(res);
    // Cookie value segment is URL-encoded; "/" encodes to "%2F" or stays "/"
    expect(cookies.get('return_to')).toMatch(/return_to=%2F|return_to=\//);
  });

  // -------------------------------------------------------------------------
  // 5. A safe (path-only) returnTo param is stored verbatim in return_to.
  // -------------------------------------------------------------------------
  it('stores a safe returnTo path in the return_to cookie', async () => {
    const res = await request(buildApp()).get('/login?returnTo=%2Fdashboard');

    const cookies = parseCookies(res);
    // The cookie should contain the encoded or decoded path.
    expect(cookies.get('return_to')).toMatch(
      /return_to=%2Fdashboard|return_to=\/dashboard/,
    );
  });

  // -------------------------------------------------------------------------
  // 6. An unsafe returnTo (absolute URL) falls back to "/".
  // -------------------------------------------------------------------------
  it('ignores an unsafe returnTo (absolute URL) and falls back to "/"', async () => {
    const res = await request(buildApp()).get(
      '/login?returnTo=https%3A%2F%2Fevil.example.com',
    );

    const cookies = parseCookies(res);
    // Must not contain the external URL.
    expect(cookies.get('return_to')).not.toContain('evil.example.com');
    // Must fall back to "/".
    expect(cookies.get('return_to')).toMatch(/return_to=%2F|return_to=\//);
  });
});
