import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetTrendingMarkets, useGetPlatformStats } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';
import { getMarketColors } from '@/lib/market-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { MarketCardSkeleton } from '@/components/SkeletonLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BUZZ_COLOR = '#CFEA3B';
const BOO_COLOR = '#E8503E';

function TrendingCard({ market, rank, onPress }: { market: Market; rank: number; onPress: () => void }) {
  const colors = useColors();
  const pair = getMarketColors(market.id);
  const isBuzzOrBoo = market.marketFormat === 'BUZZ_OR_BOO';
  const yesPercent = market.yesPercent ?? 50;
  const noPercent = market.noPercent ?? 50;
  const buzzPercent = yesPercent;
  const booPercent = noPercent;

  if (isBuzzOrBoo) {
    const dominantBuzz = buzzPercent >= booPercent;
    const totalVerdicts = market.totalPredictions ?? 0;

    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
        <LinearGradient
          colors={['#1A1A1A', '#2A2A2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.trendCard}
        >
          <View style={styles.trendTop}>
            <View style={[styles.rankBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={styles.rankText}>#{rank}</Text>
            </View>
            <View style={[styles.catChip, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={styles.catText}>⚡ BUZZ OR BOO</Text>
            </View>
            <View
              style={[
                styles.catChip,
                {
                  backgroundColor: dominantBuzz ? BUZZ_COLOR + '22' : BOO_COLOR + '22',
                  borderWidth: 1,
                  borderColor: dominantBuzz ? BUZZ_COLOR + '66' : BOO_COLOR + '66',
                },
              ]}
            >
              <Text style={[styles.catText, { color: dominantBuzz ? BUZZ_COLOR : BOO_COLOR }]}>
                {dominantBuzz ? '⚡ BUZZING' : "👎 BOO'D"}
              </Text>
            </View>
          </View>

          <Text style={styles.trendTitle} numberOfLines={3}>
            {market.title}
          </Text>

          <View style={styles.buzzBottom}>
            <View style={styles.buzzStat}>
              <Text style={[styles.trendStatNum, { color: BUZZ_COLOR }]}>{Math.round(buzzPercent)}%</Text>
              <Text style={[styles.trendStatLabel, { color: BUZZ_COLOR + 'BB' }]}>⚡ BUZZ</Text>
            </View>
            <View style={[styles.miniBar, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <View style={[styles.miniBarFill, { flex: Math.max(buzzPercent, 3), backgroundColor: BUZZ_COLOR }]} />
              <View style={[styles.miniBarFill, { flex: Math.max(booPercent, 3), backgroundColor: BOO_COLOR }]} />
            </View>
            <View style={[styles.trendStat, styles.trendStatRight]}>
              <Text style={[styles.trendStatNum, { color: BOO_COLOR }]}>{Math.round(booPercent)}%</Text>
              <Text style={[styles.trendStatLabel, { color: BOO_COLOR + 'BB' }]}>👎 BOO</Text>
            </View>
          </View>

          <View style={styles.trendFooter}>
            <Feather name="zap" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.trendFooterText}>
              {totalVerdicts} {totalVerdicts === 1 ? 'verdict' : 'verdicts'}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
      <LinearGradient
        colors={[pair.yes + 'CC', pair.no + 'DD']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.trendCard}
      >
        <View style={styles.trendTop}>
          <View style={[styles.rankBadge, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <Text style={styles.rankText}>#{rank}</Text>
          </View>
          <View style={[styles.catChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.catText}>{market.category.replace('_', ' ')}</Text>
          </View>
        </View>

        <Text style={styles.trendTitle} numberOfLines={3}>
          {market.question || market.title}
        </Text>

        <View style={styles.trendBottom}>
          <View style={styles.trendStat}>
            <Text style={styles.trendStatNum}>{Math.round(yesPercent)}%</Text>
            <Text style={styles.trendStatLabel}>YES</Text>
          </View>
          <View style={[styles.miniBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <View style={[styles.miniBarFill, { flex: Math.max(yesPercent, 3), backgroundColor: 'rgba(255,255,255,0.9)' }]} />
            <View style={{ flex: Math.max(noPercent, 3) }} />
          </View>
          <View style={[styles.trendStat, styles.trendStatRight]}>
            <Text style={styles.trendStatNum}>{Math.round(noPercent)}%</Text>
            <Text style={styles.trendStatLabel}>NO</Text>
          </View>
        </View>

        <View style={styles.trendFooter}>
          <Feather name="zap" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={styles.trendFooterText}>{market.totalPredictions} predictions</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function PredictScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: trendingData, refetch: refetchTrending, isLoading } = useGetTrendingMarkets({ limit: 15 });
  const { data: stats } = useGetPlatformStats();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchTrending();
    setRefreshing(false);
  }, [refetchTrending]);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Trending</Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            Most active right now
          </Text>
        </View>
        {stats && (
          <View style={[styles.statPill, { backgroundColor: colors.muted }]}>
            <Text style={[styles.statPillText, { color: colors.foreground }]}>
              {stats.openMarkets} open
            </Text>
          </View>
        )}
      </View>

      {/* Platform stats banner */}
      {stats && (
        <View style={[styles.statsBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {stats.totalPredictions.toLocaleString()}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Predictions</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {stats.totalMarkets}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Markets</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {stats.totalUsers.toLocaleString()}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Forecasters</Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.skeletonList}>
          {[0, 1].map((i) => (
            <View key={i} style={{ height: 200, marginHorizontal: 16, marginBottom: 12 }}>
              <MarketCardSkeleton />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={trendingData?.markets ?? []}
          keyExtractor={(m) => `${m.id}`}
          renderItem={({ item, index }) => (
            <TrendingCard
              market={item}
              rank={index + 1}
              onPress={() => router.push(`/market/${item.id}`)}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (Platform.OS === 'web' ? 84 : 80 + insets.bottom) + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(trendingData?.markets?.length)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="trending-up" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No trending markets yet
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
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  screenSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  statPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statPillText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  statsBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    paddingVertical: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
  list: { paddingHorizontal: 16 },
  skeletonList: {},
  trendCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    gap: 10,
  },
  trendTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rankText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  catText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.3,
  },
  trendTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    lineHeight: 24,
  },
  trendBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buzzBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buzzStat: {
    alignItems: 'flex-start',
    minWidth: 44,
  },
  trendStat: {
    alignItems: 'flex-start',
    minWidth: 44,
  },
  trendStatRight: {
    alignItems: 'flex-end',
  },
  trendStatNum: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    lineHeight: 22,
  },
  trendStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  miniBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  miniBarFill: {
    borderRadius: 2,
  },
  trendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trendFooterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
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
