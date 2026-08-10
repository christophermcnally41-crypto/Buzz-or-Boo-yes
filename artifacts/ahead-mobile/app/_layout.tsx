import React, { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import { AuthProvider } from '@/lib/auth';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * Watches for offline → online transitions and invalidates all active queries
 * so data refreshes automatically without any user action.
 *
 * A 1-second debounce prevents duplicate invalidations when the device
 * flickers between states rapidly.
 */
function NetworkReconnectHandler() {
  const client = useQueryClient();
  const { isConnected } = useNetworkStatus();
  const prevConnected = useRef(isConnected);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wasOffline = !prevConnected.current;
    const isNowOnline = isConnected;

    if (wasOffline && isNowOnline) {
      // Clear any pending debounce so rapid flicker doesn't fire twice.
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        client.invalidateQueries();
        debounceRef.current = null;
      }, 1000);
    } else if (!isNowOnline && debounceRef.current !== null) {
      // Went offline again before the debounce fired — cancel it.
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    prevConnected.current = isConnected;
  }, [isConnected, client]);

  return null;
}

// Set base URL so the Expo bundle (outside the web proxy) can reach the API server.
// EXPO_PUBLIC_API_URL explicitly targets the shared-proxy domain where /api is routed
// to the API server artifact. Falls back to EXPO_PUBLIC_DOMAIN for compatibility.
const apiBase =
  process.env.EXPO_PUBLIC_API_URL ?? (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);
if (apiBase) {
  setBaseUrl(apiBase);
}

// Attach the stored bearer token to every API request from the mobile client.
setAuthTokenGetter(() => SecureStore.getItemAsync('auth_session_token'));

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="market/[id]"
        options={{
          headerShown: true,
          headerTitle: '',
          headerTransparent: true,
          headerBackTitle: 'Back',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          {/* Invalidates active queries whenever connectivity is restored */}
          <NetworkReconnectHandler />
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
                {/* Global offline banner — sits above all content, animates in/out */}
                <OfflineBanner />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
