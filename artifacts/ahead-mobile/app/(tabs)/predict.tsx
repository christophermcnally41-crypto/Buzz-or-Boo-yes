import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  Platform,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetTrendingMarkets, useGetPlatformStats, useGetMarketTally, getTallyRefetchInterval } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';
import { getMarketColors } from '@/lib/market-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { MarketCardSkeleton } from '@/components/SkeletonLoader';
import { TheCallCard } from '@/components/TheCallCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BUZZ_COLOR = '#CFEA3B';
const BOO_COLOR = '#E8503E';

function TrendingCard({ market, rank, onPress }: { market: Market; rank: number; onPress: () => void }) {
  const colors = useColors();
  const pair = getMarketColors(market.id);
  const isBuzzOrBoo = market.marketFormat === 'BUZZ_OR_BOO';
  const isTheCall = market.marketFormat === 'THE_CALL';

  // Live tally polling for open markets
  const { data: tally } = useGetMarketTally(market.id, {
    query: { refetchInterval: getTallyRefetchInterval(market.status) },
  });
  const liveTallyMap = (tally?.tallies ?? {}) as Record<string, number>;
  const liveYesCount = liveTallyMap['YES'] ?? 0;
  const liveNoCount = liveTallyMap['NO'] ?? 0;
  const liveTotalCount = liveYesCount + liveNoCount;
  const yesPercent = liveTotalCount > 0
    ? Math.round((liveYesCount / liveTotalCount) * 100)
    : (market.yesPercent ?? 50);
  const noPercent = liveTotalCount > 0
    ? Math.round((liveNoCount / liveTotalCount) * 100)
    : (market.noPercent ?? 50);
  const buzzPercent = yesPercent;
  const booPercent = noPercent;

  const isScheduled = market.status === 'SCHEDULED';

  if (isTheCall) {
    return <TheCallCard market={market} rank={rank} onPress={onPress} />;
  }

  if (isBuzzOrBoo) {
    const dominantBuzz = buzzPercent >= booPercent;
    // Use live tally total when available, fall back to stored count
    const totalVerdicts = liveTotalCount > 0 ? liveTotalCount : (market.totalPredictions ?? 0);

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
            {isScheduled ? (
              <View style={[styles.catChip, { backgroundColor: '#F59E0B22', borderWidth: 1, borderColor: '#F59E0B66' }]}>
                <Text style={[styles.catText, { color: '#F59E0B' }]}>🗓 Coming Soon</Text>
              </View>
            ) : market.status === 'RESOLVED' ? (
              <View style={[styles.catChip, { backgroundColor: (market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR) + '22', borderWidth: 1, borderColor: (market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR) + '66' }]}>
                <Text style={[styles.catText, { color: market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR }]}>
                  {market.resolvedOutcome === 'YES' ? '⚡ BUZZ WON' : '👎 BOO WON'}
                </Text>
              </View>
            ) : market.status === 'CLOSED' ? (
              <View style={[styles.catChip, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }]}>
                <Text style={[styles.catText, { color: 'rgba(255,255,255,0.5)' }]}>🔒 CLOSED</Text>
              </View>
            ) : totalVerdicts === 0 ? (
              <View style={[styles.catChip, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={[styles.catText, { color: 'rgba(255,255,255,0.4)' }]}>No verdicts yet</Text>
              </View>
            ) : (
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
            )}
          </View>

          <Text style={styles.trendTitle} numberOfLines={3}>
            {market.title}
          </Text>

          {isScheduled ? (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>
                Opens soon — check back to cast your verdict
              </Text>
            </View>
          ) : totalVerdicts === 0 ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                No verdicts yet — be first to weigh in
              </Text>
            </View>
          ) : (
            <>
              {market.status === 'CLOSED' && market.status !== 'RESOLVED' && totalVerdicts > 0 && (
                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4 }}>🔒 Snapshot at close</Text>
              )}
              <View style={[styles.buzzBottom, market.status === 'CLOSED' ? { opacity: 0.75 } : {}]}>
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
            </>
          )}

          <View style={styles.trendFooter}>
            <Feather name="zap" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.trendFooterText}>
              {totalVerdicts} {totalVerdicts === 1 ? 'verdict' : 'verdicts'}
            </Text>
            {market.closesAt && (() => {
              const msLeft = new Date(market.closesAt).getTime() - Date.now();
              const hoursLeft = msLeft / (1000 * 60 * 60);
              if (hoursLeft > 0 && hoursLeft <= 24) {
                return (
                  <View style={{ marginLeft: 'auto' as any, backgroundColor: '#EF4444AA', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700', letterSpacing: 0.5 }}>
                      {hoursLeft < 1 ? `${Math.ceil(msLeft / 60000)}m left` : `${Math.ceil(hoursLeft)}h left`}
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
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
          {isScheduled ? (
            <View style={[styles.catChip, { backgroundColor: '#F59E0B22', borderWidth: 1, borderColor: '#F59E0B66' }]}>
              <Text style={[styles.catText, { color: '#F59E0B' }]}>🗓 COMING SOON</Text>
            </View>
          ) : market.status === 'RESOLVED' ? (
            <View style={[styles.catChip, { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)' }]}>
              <Text style={[styles.catText, { color: '#22C55E' }]}>✓ RESOLVED</Text>
            </View>
          ) : market.status === 'CLOSED' ? (
            <View style={[styles.catChip, { backgroundColor: 'rgba(150,150,150,0.15)', borderWidth: 1, borderColor: 'rgba(150,150,150,0.4)' }]}>
              <Text style={[styles.catText, { color: '#999' }]}>🔒 CLOSED</Text>
            </View>
          ) : market.marketFormat === 'MULTI_CHOICE' ? (
            <View style={[styles.catChip, { backgroundColor: 'rgba(207,234,59,0.15)', borderWidth: 1, borderColor: 'rgba(207,234,59,0.4)' }]}>
              <Text style={[styles.catText, { color: '#CFEA3B' }]}>👑 BUZZ BATTLE</Text>
            </View>
          ) : market.marketFormat === 'HOT_OR_NOT' ? (
            <View style={[styles.catChip, { backgroundColor: 'rgba(239,115,60,0.15)', borderWidth: 1, borderColor: 'rgba(239,115,60,0.4)' }]}>
              <Text style={[styles.catText, { color: '#EF733C' }]}>🔥 HOT OR NOT</Text>
            </View>
          ) : market.marketFormat === 'HEAD_TO_HEAD' ? (
            <View style={[styles.catChip, { backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)' }]}>
              <Text style={[styles.catText, { color: '#3B82F6' }]}>⚔️ HEAD TO HEAD</Text>
            </View>
          ) : (
            <View style={[styles.catChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.catText}>{market.category.replace(/_/g, ' ')}</Text>
            </View>
          )}
        </View>

        {(() => {
          // For HEAD_TO_HEAD, parse entity names for display
          const h2hNames = market.marketFormat === 'HEAD_TO_HEAD' && market.description
            ? (() => { try { const p = JSON.parse(market.description as string); return p.entityA && p.entityB ? { a: p.entityA as string, b: p.entityB as string } : null; } catch { return null; } })()
            : null;
          const mcDesc = market.marketFormat === 'MULTI_CHOICE' && market.description
            ? (() => { try { return JSON.parse(market.description as string); } catch { return null; } })()
            : null;
          const titleText = h2hNames
            ? `${h2hNames.a} vs ${h2hNames.b}`
            : mcDesc?.contenders?.length
            ? (mcDesc.question || market.question || market.title)
            : (market.question || market.title);
          return (
            <Text style={styles.trendTitle} numberOfLines={3}>{titleText}</Text>
          );
        })()}

        {isScheduled ? (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>
              🗓 Coming soon — check back when it opens
            </Text>
          </View>
        ) : (() => {
          const h2hNames = market.marketFormat === 'HEAD_TO_HEAD' && market.description
            ? (() => { try { const p = JSON.parse(market.description as string); return p.entityA && p.entityB ? { a: p.entityA as string, b: p.entityB as string } : null; } catch { return null; } })()
            : null;
          const mcContenders = market.marketFormat === 'MULTI_CHOICE' && market.description
            ? (() => { try { const p = JSON.parse(market.description as string); return Array.isArray(p.contenders) && p.contenders.length >= 2 ? p.contenders as { key: string; name: string }[] : null; } catch { return null; } })()
            : null;
          const yesLabel = market.marketFormat === 'HOT_OR_NOT' ? '🔥 HOT' : market.marketFormat === 'BUZZ_OR_BOO' ? '⚡ BUZZ' : h2hNames ? h2hNames.a : mcContenders ? mcContenders[0].name : 'YES';
          const noLabel = market.marketFormat === 'HOT_OR_NOT' ? '❄️ NOT' : market.marketFormat === 'BUZZ_OR_BOO' ? '👎 BOO' : h2hNames ? h2hNames.b : mcContenders ? (mcContenders[1]?.name ?? 'Other') : 'NO';
          const hasData = liveTotalCount > 0 || (market.totalPredictions ?? 0) > 0;
          if (!hasData) {
            return (
              <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                  No votes yet — be first to call it
                </Text>
              </View>
            );
          }
          return (
            <View style={styles.trendBottom}>
              <View style={styles.trendStat}>
                <Text style={styles.trendStatNum}>{Math.round(yesPercent)}%</Text>
                <Text style={styles.trendStatLabel} numberOfLines={1}>{yesLabel}</Text>
              </View>
              <View style={[styles.miniBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <View style={[styles.miniBarFill, { flex: Math.max(yesPercent, 3), backgroundColor: 'rgba(255,255,255,0.9)' }]} />
                <View style={{ flex: Math.max(noPercent, 3) }} />
              </View>
              <View style={[styles.trendStat, styles.trendStatRight]}>
                <Text style={styles.trendStatNum}>{Math.round(noPercent)}%</Text>
                <Text style={styles.trendStatLabel} numberOfLines={1}>{noLabel}</Text>
              </View>
            </View>
          );
        })()}

        {(() => {
          const mcCountFull = market.marketFormat === 'MULTI_CHOICE' && market.description
            ? (() => { try { const p = JSON.parse(market.description as string); return Array.isArray(p.contenders) ? (p.contenders as { key: string }[]).length : 0; } catch { return 0; } })()
            : 0;
          return mcCountFull > 2 ? (
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter_400Regular', marginBottom: 4 }}>
              +{mcCountFull - 2} more contender{mcCountFull - 2 !== 1 ? 's' : ''} — open to see all
            </Text>
          ) : null;
        })()}
        <View style={styles.trendFooter}>
          <Feather name="zap" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={styles.trendFooterText}>{liveTotalCount > 0 ? liveTotalCount : market.totalPredictions} {market.marketFormat === 'BUZZ_OR_BOO' || market.marketFormat === 'HOT_OR_NOT' ? 'verdicts' : market.marketFormat === 'THE_CALL' ? 'picks' : 'predictions'}</Text>
          {market.closesAt && (() => {
            const msLeft = new Date(market.closesAt).getTime() - Date.now();
            const hoursLeft = msLeft / (1000 * 60 * 60);
            if (hoursLeft > 0 && hoursLeft <= 24) {
              return (
                <View style={{ marginLeft: 'auto' as any, backgroundColor: '#EF4444AA', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700', letterSpacing: 0.5 }}>
                    {hoursLeft < 1 ? `${Math.ceil(msLeft / 60000)}m left` : `${Math.ceil(hoursLeft)}h left`}
                  </Text>
                </View>
              );
            }
            return null;
          })()}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const FORMAT_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'BUZZ_OR_BOO', label: '⚡ Buzz or Boo' },
  { key: 'THE_CALL', label: '🎯 The Call' },
  { key: 'HOT_OR_NOT', label: '🔥 Hot or Not' },
  { key: 'MULTI_CHOICE', label: '👑 Buzz Battle' },
  { key: 'HEAD_TO_HEAD', label: '⚔️ Head to Head' },
  { key: 'STANDARD', label: '📊 Forecast' },
] as const;

export default function PredictScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [formatFilter, setFormatFilter] = useState<string>('ALL');

  const { data: trendingData, refetch: refetchTrending, isLoading } = useGetTrendingMarkets({ limit: 30 });
  const { data: stats } = useGetPlatformStats();

  const filteredMarkets = formatFilter === 'ALL'
    ? (trendingData?.markets ?? [])
    : (trendingData?.markets ?? []).filter(m => m.marketFormat === formatFilter);

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
            {formatFilter
              ? FORMAT_FILTERS.find(f => f.key === formatFilter)?.label ?? 'Most active right now'
              : 'Most active right now'}
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

      {/* Format filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FORMAT_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterPill,
              {
                backgroundColor: formatFilter === f.key ? colors.primary : colors.muted,
                borderColor: formatFilter === f.key ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setFormatFilter(f.key)}
          >
            <Text style={[styles.filterPillText, { color: formatFilter === f.key ? '#000' : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtered market count */}
      {!isLoading && filteredMarkets.length > 0 && formatFilter !== 'ALL' && (
        <View style={[styles.countBadgeRow, { paddingHorizontal: 16, paddingBottom: 4 }]}>
          <Text style={[styles.countBadgeText, { color: colors.mutedForeground }]}>
            {filteredMarkets.length} {
              formatFilter === 'BUZZ_OR_BOO' ? 'Buzz or Boo' :
              formatFilter === 'THE_CALL' ? 'The Call' :
              formatFilter === 'MULTI_CHOICE' ? 'Buzz Battle' :
              formatFilter === 'HOT_OR_NOT' ? 'Hot or Not' :
              formatFilter === 'HEAD_TO_HEAD' ? 'Head to Head' :
              formatFilter === 'STANDARD' ? 'Forecast' : 'Market'
            } {filteredMarkets.length === 1 ? 'market' : 'markets'} active
          </Text>
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
          data={filteredMarkets}
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
          scrollEnabled={filteredMarkets.length > 0}
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
                {formatFilter === 'ALL' ? 'No trending markets yet' : `No ${FORMAT_FILTERS.find(f => f.key === formatFilter)?.label ?? ''} markets trending`}
              </Text>
              {formatFilter !== 'ALL' && (
                <TouchableOpacity
                  style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                  onPress={() => setFormatFilter('ALL')}
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: '600' }}>Show all formats</Text>
                </TouchableOpacity>
              )}
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
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
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
  countBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
