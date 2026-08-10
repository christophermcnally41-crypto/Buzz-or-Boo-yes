import crypto from 'crypto';
import {
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  GetCurrentAuthUserResponse,
  LogoutMobileSessionResponse,
} from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import * as oidc from 'openid-client';

// ---------------------------------------------------------------------------
// Server-side mobile auth transaction store.
// Keyed by state; value holds the server-generated nonce and an expiry.
// Entries are consumed atomically at exchange time and pruned on each init.
// ---------------------------------------------------------------------------
interface MobileAuthTx {
  nonce: string;
  expiresAt: number;
}
const mobileAuthTxStore = new Map<string, MobileAuthTx>();
const MOBILE_TX_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneMobileAuthTxStore() {
  const now = Date.now();
  for (const [state, tx] of mobileAuthTxStore) {
    if (tx.expiresAt <= now) mobileAuthTxStore.delete(state);
  }
}

import {
  clearSession,
  createSession,
  deleteSession,
  getOidcConfig,
  getSessionId,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from '../lib/auth';

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host =
    req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost';
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorStatus(
  value: Record<string, unknown>,
): number | string | undefined {
  if (typeof value.status === 'number' || typeof value.status === 'string') {
    return value.status;
  }
  if (
    typeof value.statusCode === 'number' ||
    typeof value.statusCode === 'string'
  ) {
    return value.statusCode;
  }
  return undefined;
}

function getSafeErrorMetadata(error: unknown) {
  if (!isRecord(error)) {
    return { errorName: typeof error };
  }

  const errorStatus = getErrorStatus(error);
  const causeStatus = isRecord(error.cause)
    ? getErrorStatus(error.cause)
    : undefined;

  return {
    errorName: error instanceof Error ? error.name : 'Error',
    errorStatus: errorStatus ?? causeStatus,
  };
}

/**
 * Look up or create a platform user by their Replit OIDC sub (replitId).
 * Returns an AuthUser with id = platform integer user ID as string.
 */
async function upsertUser(claims: Record<string, unknown>) {
  const replitId = claims.sub as string;
  const email = (claims.email as string) || null;
  const firstName = (claims.first_name as string) || null;
  const lastName = (claims.last_name as string) || null;
  const avatarUrl = ((claims.profile_image_url || claims.picture) as string) || null;
  const replitUsername = (claims.username as string) || null;

  // Try to find existing user by replitId
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.replitId, replitId));

  if (existing) {
    // Update mutable profile fields
    const [updated] = await db
      .update(usersTable)
      .set({ email, firstName, lastName, avatarUrl })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return {
      id: updated.id.toString(),
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      profileImageUrl: updated.avatarUrl,
    };
  }

  // Create new platform user. Username must be unique — use Replit username
  // or fall back to a hash of the sub.
  const baseUsername = replitUsername || `user_${replitId.slice(0, 10)}`;
  let username = baseUsername;
  let attempt = 0;

  // Try inserting; on username collision, append a suffix
  while (true) {
    try {
      const [created] = await db
        .insert(usersTable)
        .values({ replitId, username, email, firstName, lastName, avatarUrl })
        .returning();
      return {
        id: created.id.toString(),
        email: created.email,
        firstName: created.firstName,
        lastName: created.lastName,
        profileImageUrl: created.avatarUrl,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('unique') && attempt < 5) {
        attempt++;
        username = `${baseUsername}_${attempt}`;
      } else {
        throw err;
      }
    }
  }
}

router.get('/auth/user', (req: Request, res: Response) => {
  if (req.sessionWasExpired) {
    // A session existed but OIDC token refresh failed — tell the client the
    // session expired so it can show a re-login prompt rather than silently
    // treating the user as anonymous.
    res.status(401).json({ error: 'session_expired' });
    return;
  }
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get('/login', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'login consent',
    state,
    nonce,
  });

  setOidcCookie(res, 'code_verifier', codeVerifier);
  setOidcCookie(res, 'nonce', nonce);
  setOidcCookie(res, 'state', state);
  setOidcCookie(res, 'return_to', returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get('/callback', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState || !nonce) {
    res.redirect('/api/login');
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect('/api/login');
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie('code_verifier', { path: '/' });
  res.clearCookie('nonce', { path: '/' });
  res.clearCookie('state', { path: '/' });
  res.clearCookie('return_to', { path: '/' });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect('/api/login');
    return;
  }

  const authUser = await upsertUser(claims as unknown as Record<string, unknown>);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: authUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      profileImageUrl: authUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get('/logout', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const postLogoutRedirectUrl = new URL(returnTo, `${origin}/`).href;

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUrl,
  });

  res.redirect(endSessionUrl.href);
});

// POST /mobile-auth/init-transaction
// Issues a server-generated state + nonce and stores them for exchange-time
// validation. The client must use the returned values in its authorization
// request so the server can verify them at token exchange.
router.post('/mobile-auth/init-transaction', (_req: Request, res: Response) => {
  pruneMobileAuthTxStore();
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('hex');
  mobileAuthTxStore.set(state, { nonce, expiresAt: Date.now() + MOBILE_TX_TTL_MS });
  res.json({ state, nonce });
});

router.post(
  '/mobile-auth/token-exchange',
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required parameters' });
      return;
    }

    const { code, code_verifier, redirect_uri, state } = parsed.data;

    // Look up and atomically consume the server-issued transaction.
    // This validates that the state was generated by this server and has not
    // expired — preventing authorization-response injection and login-CSRF.
    const tx = mobileAuthTxStore.get(state);
    if (!tx || tx.expiresAt <= Date.now()) {
      mobileAuthTxStore.delete(state);
      res.status(400).json({ error: 'Invalid or expired authorization transaction' });
      return;
    }
    mobileAuthTxStore.delete(state); // Atomic single-use consumption
    const { nonce } = tx;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set('code', code);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('iss', ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: 'No claims in ID token' });
        return;
      }

      const authUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: authUser.id,
          email: authUser.email,
          firstName: authUser.firstName,
          lastName: authUser.lastName,
          profileImageUrl: authUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error(getSafeErrorMetadata(err), 'Mobile token exchange error');
      res.status(500).json({ error: 'Token exchange failed' });
    }
  },
);

router.post('/mobile-auth/logout', async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
