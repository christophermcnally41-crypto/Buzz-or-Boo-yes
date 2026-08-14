import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useListMarkets } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getMarketColors } from '@/lib/market-colors';
import { getCountdownLabel } from '@/lib/countdown';
import { MarketCardSkeleton } from '@/components/SkeletonLoader';

const FORMAT_LABELS: Record<string, { label: string; color: string }> = {
  BUZZ_OR_BOO: { label: '⚡ Buzz or Boo', color: '#CFEA3B' },
  THE_CALL: { label: '🎯 The Call', color: '#7C5CFC' },
  MULTI_CHOICE: { label: '👑 Buzz Battle', color: '#CFEA3B' },
  HOT_OR_NOT: { label: '🔥 Hot or Not', color: '#FF6B35' },
  HEAD_TO_HEAD: { label: '⚔️ Head to Head', color: '#3B82F6' },
  STANDARD: { label: '📊 Forecast', color: '#6B7280' },
};

function LocalMarketRow({ market, onPress }: { market: Market; onPress: () => void }) {
  const colors = useColors();
  const pair = getMarketColors(market.id);
  const yesPercent = market.yesPercent ?? 50;
  const noPercent = market.noPercent ?? 50;
  const yesFloor = Math.max(yesPercent, 3);
  const noFloor = Math.max(noPercent, 3);
  const countdown = getCountdownLabel(market.clockType as string | undefined, market.expireAt as string | null | undefined);
  const fmt = market.marketFormat ? FORMAT_LABELS[market.marketFormat] : null;

  // Parse HEAD_TO_HEAD entity names
  const h2hData = (() => {
    if (market.marketFormat !== 'HEAD_TO_HEAD' || !market.description) return null;
    try {
      const parsed = JSON.parse(market.description as string);
      if (parsed.entityA && parsed.entityB) return { a: parsed.entityA as string, b: parsed.entityB as string };
    } catch {}
    return null;
  })();

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.rowWrapper}>
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Color accent strip */}
        <LinearGradient
          colors={[pair.yes, pair.no]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.accent}
        />
        <View style={styles.rowContent}>
          {/* Format badge + countdown/status row */}
          {(fmt || countdown || market.status === 'RESOLVED' || market.status === 'CLOSED' || market.status === 'SCHEDULED') && (
            <View style={styles.rowBadgeRow}>
              {fmt && (
                <View style={[styles.rowFmtBadge, { backgroundColor: fmt.color + '22' }]}>
                  <Text style={[styles.rowFmtText, { color: fmt.color }]}>{fmt.label}</Text>
                </View>
              )}
              {market.status === 'RESOLVED' ? (
                <View style={[styles.rowFmtBadge, { backgroundColor: '#22C55E22' }]}>
                  <Feather name="check-circle" size={10} color="#22C55E" />
                  <Text style={[styles.rowFmtText, { color: '#22C55E' }]}> Resolved</Text>
                </View>
              ) : market.status === 'CLOSED' ? (
                <View style={[styles.rowFmtBadge, { backgroundColor: colors.muted }]}>
                  <Feather name="lock" size={10} color={colors.mutedForeground} />
                  <Text style={[styles.rowFmtText, { color: colors.mutedForeground }]}> Closed</Text>
                </View>
              ) : market.status === 'SCHEDULED' ? (
                <View style={[styles.rowFmtBadge, { backgroundColor: '#F59E0B22' }]}>
                  <Feather name="calendar" size={10} color="#F59E0B" />
                  <Text style={[styles.rowFmtText, { color: '#F59E0B' }]}> Coming Soon</Text>
                </View>
              ) : countdown ? (
                <View style={[styles.rowFmtBadge, { backgroundColor: countdown.urgent ? '#FF6B6B22' : colors.muted }]}>
                  <Feather name="clock" size={10} color={countdown.urgent ? '#FF6B6B' : colors.mutedForeground} />
                  <Text style={[styles.rowFmtText, { color: countdown.urgent ? '#FF6B6B' : colors.mutedForeground }]}>
                    {countdown.label}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
          {h2hData ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
              <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{h2hData.a}</Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: '700' }}>vs</Text>
              <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1, textAlign: 'right' }]} numberOfLines={1}>{h2hData.b}</Text>
            </View>
          ) : (
            <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={2}>
              {market.question || market.title}
            </Text>
          )}
          <View style={styles.rowMeta}>
            <MaterialCommunityIcons name="fire" size={13} color={colors.accent} />
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {market.subcategory} · {market.totalPredictions} predictions
            </Text>
          </View>

          {/* Mini probability bar */}
          {market.status === 'SCHEDULED' ? (
            <Text style={[styles.miniPct, { color: colors.mutedForeground, fontSize: 10 }]}>
              Opens soon
            </Text>
          ) : (
            <View style={styles.miniBarRow}>
              <Text style={[styles.miniPct, { color: pair.yes }]} numberOfLines={1}>
                {h2hData ? h2hData.a : market.marketFormat === 'BUZZ_OR_BOO' ? `⚡ ${Math.round(yesPercent)}%` : market.marketFormat === 'HOT_OR_NOT' ? `🔥 ${Math.round(yesPercent)}%` : `${Math.round(yesPercent)}%`}
              </Text>
              <View style={[styles.miniBarTrack, { backgroundColor: colors.muted }]}>
                <View style={[styles.miniBarYes, { flex: yesFloor, backgroundColor: pair.yes }]} />
                <View style={[styles.miniBarNo, { flex: noFloor, backgroundColor: pair.no }]} />
              </View>
              <Text style={[styles.miniPct, { color: pair.no }]} numberOfLines={1}>
                {h2hData ? h2hData.b : market.marketFormat === 'BUZZ_OR_BOO' ? `👎 ${Math.round(noPercent)}%` : market.marketFormat === 'HOT_OR_NOT' ? `❄️ ${Math.round(noPercent)}%` : `${Math.round(noPercent)}%`}
              </Text>
            </View>
          )}
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

export default function LocalPulseScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useListMarkets({
    category: 'LOCAL_PULSE',
    status: 'OPEN',
    limit: 20,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <MaterialCommunityIcons name="fire" size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Local Pulse</Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            What Boston is watching
          </Text>
        </View>
        {data && (
          <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
            {(() => {
              const markets = data.markets ?? [];
              const urgentCount = markets.filter(m => {
                if (!m.expireAt) return false;
                const hoursLeft = (new Date(m.expireAt).getTime() - Date.now()) / (1000 * 60 * 60);
                return hoursLeft > 0 && hoursLeft <= 6;
              }).length;
              return (
                <Text style={[styles.countPillText, { color: colors.foreground }]}>
                  {markets.length} active{urgentCount > 0 ? ` · 🔥 ${urgentCount} closing` : ''}
                </Text>
              );
            })()}
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ height: 140, marginHorizontal: 16, marginBottom: 12 }}>
              <MarketCardSkeleton />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={data?.markets ?? []}
          keyExtractor={(m) => `${m.id}`}
          renderItem={({ item }) => (
            <LocalMarketRow
              market={item}
              onPress={() => router.push(`/market/${item.id}`)}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (Platform.OS === 'web' ? 84 : 80 + insets.bottom) + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(data?.markets?.length)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="map-marker-off" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No open markets right now
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                New local markets drop regularly — check back soon
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/predict')}
                style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 9, backgroundColor: colors.accent, borderRadius: 20 }}
              >
                <Text style={{ color: '#000', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Browse all markets →</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  screenSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countPillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  skeletonList: { paddingTop: 8 },
  rowBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  rowFmtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rowFmtText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  rowWrapper: { marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingRight: 14,
    gap: 12,
  },
  accent: {
    width: 5,
    alignSelf: 'stretch',
  },
  rowContent: {
    flex: 1,
    paddingVertical: 14,
    gap: 6,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  miniBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  miniBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  miniBarYes: { borderRadius: 2 },
  miniBarNo: { borderRadius: 2 },
  miniPct: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    width: 32,
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
});
