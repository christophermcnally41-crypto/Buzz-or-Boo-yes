import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBlock({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.muted,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function MarketCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.muted }]}>
      <SkeletonBlock width={80} height={22} borderRadius={11} />
      <View style={styles.titleArea}>
        <SkeletonBlock height={28} style={{ marginBottom: 8 }} />
        <SkeletonBlock height={28} width="70%" />
      </View>
      <View style={styles.probRow}>
        <SkeletonBlock width={64} height={44} borderRadius={8} />
        <SkeletonBlock width={64} height={44} borderRadius={8} />
      </View>
      <SkeletonBlock height={4} borderRadius={2} style={{ marginTop: 12 }} />
    </View>
  );
}

export function LeaderboardRowSkeleton() {
  return (
    <View style={styles.leaderRow}>
      <SkeletonBlock width={32} height={32} borderRadius={16} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBlock height={14} width="50%" />
        <SkeletonBlock height={12} width="30%" />
      </View>
      <SkeletonBlock width={48} height={14} borderRadius={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  titleArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  probRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
});
