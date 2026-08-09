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
import { MarketCardSkeleton } from '@/components/SkeletonLoader';

function LocalMarketRow({ market, onPress }: { market: Market; onPress: () => void }) {
  const colors = useColors();
  const pair = getMarketColors(market.id);
  const yesPercent = market.yesPercent ?? 50;
  const noPercent = market.noPercent ?? 50;
  const yesFloor = Math.max(yesPercent, 3);
  const noFloor = Math.max(noPercent, 3);

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
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={2}>
            {market.question || market.title}
          </Text>
          <View style={styles.rowMeta}>
            <MaterialCommunityIcons name="fire" size={13} color={colors.accent} />
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {market.subcategory} · {market.totalPredictions} predictions
            </Text>
          </View>

          {/* Mini probability bar */}
          <View style={styles.miniBarRow}>
            <Text style={[styles.miniPct, { color: pair.yes }]}>{Math.round(yesPercent)}%</Text>
            <View style={[styles.miniBarTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.miniBarYes, { flex: yesFloor, backgroundColor: pair.yes }]} />
              <View style={[styles.miniBarNo, { flex: noFloor, backgroundColor: pair.no }]} />
            </View>
            <Text style={[styles.miniPct, { color: pair.no }]}>{Math.round(noPercent)}%</Text>
          </View>
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
        <View>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Local Pulse</Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            What Boston is watching
          </Text>
        </View>
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
                No local markets right now
              </Text>
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
  list: { paddingHorizontal: 16, paddingTop: 4 },
  skeletonList: { paddingTop: 8 },
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
