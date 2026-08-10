/**
 * Integration tests for authMiddleware — session rotation and expiry flows.
 *
 * Covers:
 *  1. Expired OIDC token + valid refresh token → new SID cookie issued,
 *     old SID deleted from the sessions store.
 *  2. Expired OIDC token + missing refresh token → session cleared, 401.
 *  3. Expired OIDC token + refresh throws (invalid token) → session cleared, 401.
 *  4. Bearer (mobile) path: expired token refreshed in-place via updateSession,
 *     no cookie rotation.
 *  5. Non-expired session: no refresh triggered, user attached normally.
 *  6. Unknown SID (no session row): clearSession called, request continues unauthenticated.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';

// ---------------------------------------------------------------------------
// Module mocks — must appear before any dynamic import of the modules under test.
// ---------------------------------------------------------------------------

vi.mock('../lib/auth.js', () => ({
  SESSION_COOKIE: 'sid',
  SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
  getSessionId: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
  clearSession: vi.fn(),
  getOidcConfig: vi.fn(),
}));

vi.mock('openid-client', () => ({
  refreshTokenGrant: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Deferred imports so mocks are in place first.
// ---------------------------------------------------------------------------
import * as authLib from '../lib/auth.js';
import * as oidc from 'openid-client';
import { authMiddleware } from './authMiddleware.js';

// Typed aliases for mocked functions.
const mockGetSessionId = authLib.getSessionId as MockedFunction<typeof authLib.getSessionId>;
const mockGetSession   = authLib.getSession   as MockedFunction<typeof authLib.getSession>;
const mockCreateSession = authLib.createSession as MockedFunction<typeof authLib.createSession>;
const mockDeleteSession  = authLib.deleteSession  as MockedFunction<typeof authLib.deleteSession>;
const mockUpdateSession  = authLib.updateSession  as MockedFunction<typeof authLib.updateSession>;
const mockClearSession   = authLib.clearSession   as MockedFunction<typeof authLib.clearSession>;
const mockGetOidcConfig  = authLib.getOidcConfig  as MockedFunction<typeof authLib.getOidcConfig>;
const mockRefreshTokenGrant = oidc.refreshTokenGrant as MockedFunction<typeof oidc.refreshTokenGrant>;

// ---------------------------------------------------------------------------
// Test application factory.
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(authMiddleware);

  // /api/auth/user mirrors the real route: 401 on expired, user or null otherwise.
  app.get('/api/auth/user', (req: Request, res: Response) => {
    if (req.sessionWasExpired) {
      res.status(401).json({ error: 'session_expired' });
      return;
    }
    res.json({ user: req.isAuthenticated() ? req.user : null });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Shared fixtures.
// ---------------------------------------------------------------------------

const PAST_EXPIRES_AT = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

const mockUser = {
  id: '42',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Example',
  profileImageUrl: null,
  isAdmin: false,
};

const expiredSession: authLib.SessionData = {
  user: mockUser,
  access_token: 'old-access-token',
  refresh_token: 'valid-refresh-token',
  expires_at: PAST_EXPIRES_AT,
};

const freshSession: authLib.SessionData = {
  user: mockUser,
  access_token: 'fresh-access-token',
  refresh_token: 'valid-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
};

/** Creates a minimal TokenEndpointResponse-like object for the oidc mock. */
function makeTokenResponse(overrides: { access_token?: string; refresh_token?: string; expiresIn?: number | null } = {}) {
  const {
    access_token = 'new-access-token',
    refresh_token = 'new-refresh-token',
    expiresIn = 3600,
  } = overrides;

  return {
    access_token,
    refresh_token,
    expiresIn: () => expiresIn,
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('authMiddleware — session rotation and expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: not a Bearer request (cookie-based browser caller).
    mockGetSessionId.mockReturnValue('old-sid');
    mockGetOidcConfig.mockResolvedValue({} as ReturnType<typeof authLib.getOidcConfig> extends Promise<infer T> ? T : never);
    mockCreateSession.mockResolvedValue('new-sid');
    mockDeleteSession.mockResolvedValue(undefined);
    mockUpdateSession.mockResolvedValue(undefined);
    mockClearSession.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // 1. Happy path: expired token is refreshed, session is rotated.
  // -------------------------------------------------------------------------
  it('rotates session ID when access token is expired and refresh succeeds (browser)', async () => {
    mockGetSession.mockResolvedValue(expiredSession);
    mockRefreshTokenGrant.mockResolvedValue(makeTokenResponse() as never);

    const res = await request(buildApp())
      .get('/api/auth/user')
      .set('Cookie', 'sid=old-sid');

    // User is attached — request succeeded.
    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe('42');

    // Old SID must have been deleted.
    expect(mockDeleteSession).toHaveBeenCalledWith('old-sid');

    // A new session must have been created with the refreshed tokens.
    expect(mockCreateSession).toHaveBeenCalledOnce();
    const createdWith: authLib.SessionData = mockCreateSession.mock.calls[0][0];
    expect(createdWith.access_token).toBe('new-access-token');
    expect(createdWith.refresh_token).toBe('new-refresh-token');

    // Response must set the new SID cookie.
    const setCookieHeader = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
    const sidCookie = cookies.find((c) => c.startsWith('sid='));
    expect(sidCookie).toBeDefined();
    expect(sidCookie).toContain('sid=new-sid');

    // updateSession must NOT have been called — rotation uses create+delete.
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Missing refresh token → session cleared, 401 with session_expired.
  // -------------------------------------------------------------------------
  it('clears session and returns 401 when refresh token is absent', async () => {
    const sessionWithoutRefresh: authLib.SessionData = {
      ...expiredSession,
      refresh_token: undefined,
    };
    mockGetSession.mockResolvedValue(sessionWithoutRefresh);

    const res = await request(buildApp())
      .get('/api/auth/user')
      .set('Cookie', 'sid=old-sid');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('session_expired');

    // Session must be torn down.
    expect(mockClearSession).toHaveBeenCalledWith(expect.anything(), 'old-sid');

    // No new session must have been created.
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Invalid refresh token (OIDC throws) → session cleared, 401.
  // -------------------------------------------------------------------------
  it('clears session and returns 401 when OIDC refresh throws', async () => {
    mockGetSession.mockResolvedValue(expiredSession);
    mockRefreshTokenGrant.mockRejectedValue(new Error('invalid_grant'));

    const res = await request(buildApp())
      .get('/api/auth/user')
      .set('Cookie', 'sid=old-sid');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('session_expired');

    expect(mockClearSession).toHaveBeenCalledWith(expect.anything(), 'old-sid');
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Mobile Bearer path: updateSession in-place, no cookie rotation.
  // -------------------------------------------------------------------------
  it('updates session in-place for Bearer (mobile) callers — no cookie set', async () => {
    // Simulate Bearer auth: getSessionId returns the SID from the Authorization header.
    mockGetSession.mockResolvedValue(expiredSession);
    mockRefreshTokenGrant.mockResolvedValue(makeTokenResponse() as never);

    const res = await request(buildApp())
      .get('/api/auth/user')
      .set('Authorization', 'Bearer old-sid'); // Bearer triggers mobile path

    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe('42');

    // In-place update, not rotate.
    expect(mockUpdateSession).toHaveBeenCalledWith('old-sid', expect.objectContaining({
      access_token: 'new-access-token',
    }));
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();

    // No set-cookie header — mobile clients keep using the same Bearer token.
    const setCookieHeader = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
    expect(cookies.every((c: string) => !c.startsWith('sid='))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Non-expired session: no refresh triggered.
  // -------------------------------------------------------------------------
  it('attaches user without refreshing when token is still valid', async () => {
    mockGetSession.mockResolvedValue(freshSession);

    const res = await request(buildApp())
      .get('/api/auth/user')
      .set('Cookie', 'sid=old-sid');

    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe('42');

    expect(mockRefreshTokenGrant).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. No session row for the given SID → clearSession, request continues.
  // -------------------------------------------------------------------------
  it('clears cookie and continues unauthenticated when SID has no session row', async () => {
    // getSessionId is mocked (beforeEach) to return 'old-sid'; getSession returns null.
    mockGetSession.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/auth/user')
      .set('Cookie', 'sid=old-sid');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();

    // clearSession must have been called with the SID that had no backing row.
    expect(mockClearSession).toHaveBeenCalledWith(expect.anything(), 'old-sid');
  });

  // -------------------------------------------------------------------------
  // 7. No SID at all → anonymous request, no DB lookups.
  // -------------------------------------------------------------------------
  it('does nothing when no session cookie or Bearer token is present', async () => {
    mockGetSessionId.mockReturnValue(undefined);

    const res = await request(buildApp()).get('/api/auth/user');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockClearSession).not.toHaveBeenCalled();
  });
});
