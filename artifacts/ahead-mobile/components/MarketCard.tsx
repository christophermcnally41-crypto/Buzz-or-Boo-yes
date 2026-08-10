import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { getMarketColors } from '@/lib/market-colors';
import type { Market } from '@workspace/api-client-react';

interface MarketCardProps {
  market: Market;
  isHot?: boolean;
  onPress?: () => void;
  style?: object;
}

const CATEGORY_LABELS: Record<string, string> = {
  STYLE: 'Style',
  HOME: 'Home',
  CITY: 'City',
  REAL_ESTATE: 'Real Estate',
  WEATHER: 'Weather',
  CULTURE: 'Culture',
  LOCAL_PULSE: 'Local',
};

export function MarketCard({ market, isHot, onPress, style }: MarketCardProps) {
  const colors = useColors();
  const pair = getMarketColors(market.id);

  const yesPercent = market.yesPercent ?? 50;
  const noPercent = market.noPercent ?? 50;
  const yesFloor = Math.max(yesPercent, 3);
  const noFloor = Math.max(noPercent, 3);

  const isTheCall = market.marketFormat === 'THE_CALL';
  const isBuzzOrBooCard = market.marketFormat === 'BUZZ_OR_BOO';

  const formatBadge = () => {
    if (market.marketFormat === 'HOT_OR_NOT') return { icon: 'fire', label: 'Hot or Not' };
    if (market.marketFormat === 'HEAD_TO_HEAD') return { icon: 'sword-cross', label: 'Head to Head' };
    if (market.marketFormat === 'THE_CALL') return { icon: 'target', label: '🎯 The Call' };
    if (market.marketFormat === 'BUZZ_OR_BOO') return { icon: 'flash', label: '⚡ Buzz or Boo' };
    return null;
  };
  const fmt = formatBadge();

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.wrapper, style]}
    >
      <LinearGradient
        colors={[pair.yes + 'E0', pair.no + 'F5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.2 }}
        style={styles.card}
      >
        {/* Top row: badges */}
        <View style={styles.topRow}>
          <View style={[styles.catBadge, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <Text style={styles.catLabel}>
              {CATEGORY_LABELS[market.category] ?? market.category}
            </Text>
          </View>
          {isHot && (
            <View style={[styles.hotBadge]}>
              <MaterialCommunityIcons name="fire" size={13} color="#FF6B35" />
              <Text style={styles.hotLabel}>HOT IN BOSTON</Text>
            </View>
          )}
          {fmt && !isHot && (
            <View style={[styles.fmtBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <MaterialCommunityIcons name={fmt.icon as any} size={12} color="#FFFFFF" />
              <Text style={styles.fmtLabel}>{fmt.label}</Text>
            </View>
          )}
        </View>

        {/* Market title */}
        <View style={styles.titleArea}>
          {market.marketFormat === 'HEAD_TO_HEAD' ? (
            <View style={styles.headToHead}>
              <Text style={styles.headOption} numberOfLines={2}>YES</Text>
              <Text style={styles.vsText}>VS</Text>
              <Text style={styles.headOption} numberOfLines={2}>NO</Text>
            </View>
          ) : (
            <Text style={styles.title} numberOfLines={4}>
              {market.question || market.title}
            </Text>
          )}
        </View>

        {/* Probability numbers */}
        <View style={styles.probRow}>
          <View style={styles.probSide}>
            <Text style={styles.probPercent}>{Math.round(yesPercent)}%</Text>
            <Text style={styles.probLabel}>
              {market.marketFormat === 'HOT_OR_NOT' ? 'HOT' : 'YES'}
            </Text>
          </View>
          <View style={styles.probDivider} />
          <View style={[styles.probSide, styles.probRight]}>
            <Text style={styles.probPercent}>{Math.round(noPercent)}%</Text>
            <Text style={styles.probLabel}>
              {market.marketFormat === 'HOT_OR_NOT' ? 'NOT' : 'NO'}
            </Text>
          </View>
        </View>

        {/* Probability bar */}
        <View style={styles.barTrack}>
          <View style={[styles.yesBar, { flex: yesFloor }]} />
          <View style={[styles.noBar, { flex: noFloor }]} />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Feather name="users" size={12} color="rgba(255,255,255,0.7)" />
          <Text style={styles.footerText}>{market.totalPredictions} predictions</Text>
          <View style={styles.footerRight}>
            <Text style={styles.predictCta}>PREDICT</Text>
            <Feather name="arrow-right" size={14} color="#FFFFFF" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    padding: 20,
    paddingBottom: 18,
    flex: 1,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  catLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  hotLabel: {
    color: '#CC2200',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fmtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  fmtLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  titleArea: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  headToHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headOption: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  vsText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  probSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  probRight: {
    alignItems: 'flex-end',
  },
  probPercent: {
    color: '#FFFFFF',
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    lineHeight: 44,
    letterSpacing: -1,
  },
  probLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  probDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barTrack: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 14,
  },
  yesBar: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
  noBar: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predictCta: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
});
