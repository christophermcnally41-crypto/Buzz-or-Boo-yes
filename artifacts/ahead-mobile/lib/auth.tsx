import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const AUTH_TOKEN_KEY = 'auth_session_token';
const ISSUER_URL =
  process.env.EXPO_PUBLIC_ISSUER_URL ?? 'https://replit.com/oidc';

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
});

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return '';
}

function getClientId(): string {
  return process.env.EXPO_PUBLIC_REPL_ID || '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Discover OIDC endpoints once at mount.
  const discovery = AuthSession.useAutoDiscovery(ISSUER_URL);
  const redirectUri = AuthSession.makeRedirectUri();

  const fetchUser = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.user) {
        setUser(data.user);
      } else {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async () => {
    if (!discovery) {
      console.error('OIDC discovery not ready');
      return;
    }

    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      console.error('API base URL is not configured.');
      return;
    }

    try {
      // Step 1: Request server-generated state + nonce.
      // The server stores {state → nonce} and will validate them at exchange
      // time, preventing authorization-response injection and login-CSRF.
      const initRes = await fetch(`${apiBase}/api/mobile-auth/init-transaction`, {
        method: 'POST',
      });
      if (!initRes.ok) {
        console.error('Failed to initialize auth transaction:', initRes.status);
        return;
      }
      const { state, nonce } = await initRes.json() as { state: string; nonce: string };

      // Step 2: Build an AuthRequest with the server-issued state so
      // expo-auth-session uses it (no auto-generated state override).
      const request = new AuthSession.AuthRequest({
        clientId: getClientId(),
        scopes: ['openid', 'email', 'profile', 'offline_access'],
        redirectUri,
        state,
        extraParams: { nonce },
      });

      // Step 3: Present the authorization prompt.
      const result = await request.promptAsync(discovery);

      if (result.type !== 'success') {
        return; // user cancelled or error
      }

      // Step 4: Exchange the code. The server looks up the nonce by state —
      // we do NOT send nonce here; the server-side record is the trusted source.
      setIsLoading(true);
      const { code } = result.params;
      const exchangeRes = await fetch(`${apiBase}/api/mobile-auth/token-exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: request.codeVerifier,
          redirect_uri: redirectUri,
          state,
        }),
      });

      if (!exchangeRes.ok) {
        console.error('Token exchange failed:', exchangeRes.status);
        setIsLoading(false);
        return;
      }

      const data = await exchangeRes.json();
      if (data.token) {
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, data.token);
        await fetchUser();
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setIsLoading(false);
    }
  }, [discovery, redirectUri, fetchUser]);

  const logout = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (token) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/mobile-auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
    } finally {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
