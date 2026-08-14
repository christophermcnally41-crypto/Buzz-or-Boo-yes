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

export function MarketDetailSkeleton({ colors }: { colors: { card: string; border: string; muted: string } }) {
  return (
    <View style={{ width: '92%', alignSelf: 'center', gap: 16 }}>
      {/* Hero card */}
      <View style={{ borderRadius: 24, backgroundColor: colors.card, padding: 24, borderWidth: 1, borderColor: colors.border }}>
        <SkeletonBlock width={80} height={16} borderRadius={8} style={{ marginBottom: 14 }} />
        <SkeletonBlock height={28} style={{ marginBottom: 8 }} />
        <SkeletonBlock height={22} width="75%" style={{ marginBottom: 20 }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><SkeletonBlock height={48} borderRadius={16} /></View>
          <View style={{ flex: 1 }}><SkeletonBlock height={48} borderRadius={16} /></View>
        </View>
      </View>
      {/* Stats card */}
      <View style={{ borderRadius: 20, backgroundColor: colors.card, padding: 20, borderWidth: 1, borderColor: colors.border }}>
        <SkeletonBlock height={12} width="40%" style={{ marginBottom: 10 }} />
        <SkeletonBlock height={8} borderRadius={4} />
      </View>
      {/* Action card */}
      <View style={{ borderRadius: 20, backgroundColor: colors.card, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
        <SkeletonBlock height={48} borderRadius={14} />
        <SkeletonBlock height={48} borderRadius={14} />
      </View>
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
