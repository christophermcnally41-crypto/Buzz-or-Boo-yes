import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

/**
 * Returns whether the device currently has network connectivity.
 *
 * - Checks state once on mount.
 * - Subscribes to `expo-network`'s change listener so the value updates
 *   automatically when the device goes offline or comes back online.
 */
export function useNetworkStatus(): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // Initial check — don't wait for the first change event.
    Network.getNetworkStateAsync().then((state) => {
      setIsConnected(state.isConnected ?? true);
    });

    // Subscribe to changes so the banner appears / disappears in real time.
    const subscription = Network.addNetworkStateListener((state) => {
      setIsConnected(state.isConnected ?? true);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return { isConnected };
}
