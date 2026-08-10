/**
 * Tests for the /login route's open-redirect guard (getSafeReturnTo).
 *
 * Covers:
 *  1. returnTo=https://evil.com is rejected — return_to cookie falls back to /
 *  2. returnTo=//evil.com is rejected — return_to cookie falls back to /
 *  3. returnTo=/dashboard is accepted — return_to cookie contains /dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import authRouter from './auth.js';

const mockGetOidcConfig = authLib.getOidcConfig as ReturnType<typeof vi.fn>;

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
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Extracts the value of a named cookie from a Set-Cookie header array.
 * Returns undefined when the cookie is not present.
 */
function extractCookieValue(
  setCookieHeader: string | string[] | undefined,
  name: string,
): string | undefined {
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  const entry = cookies.find((c) => c.startsWith(`${name}=`));
  if (!entry) return undefined;

  // Cookie string format: "name=value; Path=/; ..."
  return decodeURIComponent(entry.split(';')[0].slice(name.length + 1));
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('GET /login — returnTo open-redirect guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOidcConfig.mockResolvedValue({} as Awaited<ReturnType<typeof authLib.getOidcConfig>>);
  });

  // -------------------------------------------------------------------------
  // 1. Absolute URL with scheme — must be rejected.
  // -------------------------------------------------------------------------
  it('rejects returnTo=https://evil.com and stores / in the return_to cookie', async () => {
    const res = await request(buildApp())
      .get('/login?returnTo=https%3A%2F%2Fevil.com');

    // The route should still perform the login redirect.
    expect(res.status).toBe(302);

    const returnToCookie = extractCookieValue(
      res.headers['set-cookie'] as string | string[] | undefined,
      'return_to',
    );
    expect(returnToCookie).toBe('/');
  });

  // -------------------------------------------------------------------------
  // 2. Protocol-relative URL — must be rejected.
  // -------------------------------------------------------------------------
  it('rejects returnTo=//evil.com and stores / in the return_to cookie', async () => {
    const res = await request(buildApp())
      .get('/login?returnTo=%2F%2Fevil.com');

    expect(res.status).toBe(302);

    const returnToCookie = extractCookieValue(
      res.headers['set-cookie'] as string | string[] | undefined,
      'return_to',
    );
    expect(returnToCookie).toBe('/');
  });

  // -------------------------------------------------------------------------
  // 3. Backslash-prefixed path — must be rejected.
  //    Browsers normalize /\evil.com as a network-path reference and navigate
  //    to https://evil.com/, so any path containing a backslash is unsafe.
  // -------------------------------------------------------------------------
  it('rejects returnTo=/\\evil.com and stores / in the return_to cookie', async () => {
    // Send the raw backslash-prefixed value; Express decodes it before routing.
    const res = await request(buildApp())
      .get('/login?returnTo=%2F%5Cevil.com');

    expect(res.status).toBe(302);

    const returnToCookie = extractCookieValue(
      res.headers['set-cookie'] as string | string[] | undefined,
      'return_to',
    );
    expect(returnToCookie).toBe('/');
  });

  // -------------------------------------------------------------------------
  // 4. Safe relative path — must be accepted unchanged.
  // -------------------------------------------------------------------------
  it('accepts returnTo=/dashboard and stores /dashboard in the return_to cookie', async () => {
    const res = await request(buildApp())
      .get('/login?returnTo=%2Fdashboard');

    expect(res.status).toBe(302);

    const returnToCookie = extractCookieValue(
      res.headers['set-cookie'] as string | string[] | undefined,
      'return_to',
    );
    expect(returnToCookie).toBe('/dashboard');
  });
});
