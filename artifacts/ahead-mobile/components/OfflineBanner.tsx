import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * Displays a slim banner at the very top of the screen when the device has no
 * network connectivity.  The banner slides in smoothly when offline and slides
 * out automatically when connectivity returns.
 */
export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const { top } = useSafeAreaInsets();

  // Animate between 0 (hidden) and 1 (visible).
  const anim = useRef(new Animated.Value(isConnected ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isConnected ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isConnected, anim]);

  // The banner itself is 36px tall; we translate it up by its own height when
  // hidden so it sits just above the safe-area inset and doesn't push content.
  const BANNER_HEIGHT = 36;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-(BANNER_HEIGHT + top), 0],
  });

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: top, height: BANNER_HEIGHT + top },
        { transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <Text style={styles.icon}>⚡</Text>
        <Text style={styles.text}>You're offline — showing last known data</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#1C1714',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
  },
  icon: {
    fontSize: 12,
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#9E9388',
    letterSpacing: 0.1,
  },
});
