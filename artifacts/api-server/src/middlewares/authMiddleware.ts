import type { AuthUser } from '@workspace/api-zod';
import { type NextFunction, type Request, type Response } from 'express';
import * as oidc from 'openid-client';

import {
  clearSession,
  createSession,
  deleteSession,
  getOidcConfig,
  getSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  updateSession,
  type SessionData,
} from '../lib/auth';

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
      /**
       * Set to true by authMiddleware when a session was found but the OIDC
       * token refresh failed (session expired, not merely absent).  Routes can
       * use this to return 401 instead of 200+null so clients can distinguish
       * "never logged in" from "was logged in but session expired".
       */
      sessionWasExpired?: boolean;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

function isBearerRequest(req: Request): boolean {
  return req.headers.authorization?.startsWith('Bearer ') ?? false;
}

/**
 * Refreshes expired OIDC tokens.
 *
 * - Browser cookie callers: rotates the session ID (delete old record, create
 *   new one, set new cookie) to prevent a stolen old cookie being replayed.
 * - Mobile Bearer callers: updates the existing session record in-place so the
 *   stored token remains valid — the mobile app cannot receive a new token
 *   value mid-request.
 *
 * Returns the refreshed SessionData on success, or null when the refresh token
 * is missing / invalid.
 */
async function refreshIfExpired(
  req: Request,
  res: Response,
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);

    const refreshed: SessionData = {
      ...session,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? session.refresh_token,
      expires_at: tokens.expiresIn()
        ? now + tokens.expiresIn()!
        : session.expires_at,
    };

    if (isBearerRequest(req)) {
      // Mobile: keep the same SID so the stored token stays valid.
      await updateSession(sid, refreshed);
    } else {
      // Browser: rotate the session ID to prevent old-cookie replay.
      const newSid = await createSession(refreshed);
      await deleteSession(sid);
      res.cookie(SESSION_COOKIE, newSid, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL,
      });
    }

    return refreshed;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request['isAuthenticated'];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(req, res, sid, session);
  if (!refreshed) {
    // Session existed but tokens could not be refreshed — this is an expiry,
    // not an anonymous request.  Flag it so routes can return 401.
    req.sessionWasExpired = true;
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = refreshed.user;
  next();
}
