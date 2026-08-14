import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Dimensions,
  RefreshControl,
  Platform,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useListMarkets } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';
import { MarketCard } from '@/components/MarketCard';
import { BuzzOrBooCard } from '@/components/BuzzOrBooCard';
import { HotOrNotCard } from '@/components/HotOrNotCard';
import { TheCallCard } from '@/components/TheCallCard';
import { MarketCardSkeleton } from '@/components/SkeletonLoader';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;
const CARD_HEIGHT = 420;

interface MarketCardItem {
  market: Market;
  isHot: boolean;
}
interface DividerItem {
  divider: true;
  label: string;
}
type CardItem = MarketCardItem | DividerItem;

export default function DiscoverScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<string | null>(null);

  // HOT IN BOSTON: most-predicted LOCAL_PULSE market
  const { data: localPulseData, refetch: refetchLocal, isError: localError } = useListMarkets({
    category: 'LOCAL_PULSE',
    status: 'OPEN',
    limit: 3,
  }, { query: { refetchInterval: 30_000 } });

  // General open markets — pass formatFilter to server when set (reduces overfetch)
  const { data: marketsData, refetch: refetchMarkets, isError: marketsError } = useListMarkets({
    status: 'OPEN',
    limit: 30,
    ...(formatFilter ? { format: formatFilter as any } : {}),
  }, { query: { refetchInterval: 30_000 } });

  // Upcoming (SCHEDULED) markets — shown as a mini preview strip
  const { data: upcomingData, refetch: refetchUpcoming } = useListMarkets({
    status: 'SCHEDULED',
    limit: 3,
  }, { query: { refetchInterval: 60_000 } });
  const upcomingMarkets = upcomingData?.markets ?? [];

  const hotCard = localPulseData?.markets?.[0];
  const otherMarkets = (marketsData?.markets ?? [])
    .filter((m) => m.category !== 'LOCAL_PULSE')
    .sort((a, b) => {
      // Sort markets closing within 24 hours first (ascending by expiry)
      const now = Date.now();
      const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
      const aExp = a.expireAt ? new Date(a.expireAt).getTime() : Infinity;
      const bExp = b.expireAt ? new Date(b.expireAt).getTime() : Infinity;
      const aUrgent = aExp - now < TWENTY_FOUR_H && aExp > now;
      const bUrgent = bExp - now < TWENTY_FOUR_H && bExp > now;
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      if (aUrgent && bUrgent) return aExp - bExp; // sooner first
      return 0;
    });

  const searchQ = search.toLowerCase().trim();
  const filterMarket = (m: Market) => {
    if (formatFilter && m.marketFormat !== formatFilter) return false;
    return !searchQ || m.question.toLowerCase().includes(searchQ) || (m.category ?? '').toLowerCase().includes(searchQ);
  };

  const filteredHot = hotCard && filterMarket(hotCard) ? hotCard : undefined;
  const filteredOther = otherMarkets.filter(filterMarket);
  const filteredUpcoming = upcomingMarkets.filter(filterMarket);

  const cards: CardItem[] = [
    ...(filteredHot ? [{ market: filteredHot, isHot: true }] : []),
    ...(filteredOther.length > 0 ? [{ divider: true, label: 'LIVE NOW' }] : []),
    ...filteredOther.map((m) => ({ market: m, isHot: false })),
    ...(filteredUpcoming.length > 0 ? [{ divider: true, label: 'COMING UP' }] : []),
    ...filteredUpcoming.map((m) => ({ market: m, isHot: false })),
  ];

  const isLoading = !localPulseData && !marketsData && !localError && !marketsError;
  const isError = localError || marketsError;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLocal(), refetchMarkets(), refetchUpcoming()]);
    setRefreshing(false);
  }, [refetchLocal, refetchMarkets, refetchUpcoming]);

  // Silently refresh feed data whenever this tab comes back into focus
  useFocusEffect(
    useCallback(() => {
      refetchLocal();
      refetchMarkets();
      refetchUpcoming();
    }, [refetchLocal, refetchMarkets, refetchUpcoming]),
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: any[] }) => {
      // Skip divider items — only update activeIndex when a real market card is visible
      const firstReal = viewableItems.find(
        (v) => v.item && !('divider' in v.item)
      );
      if (firstReal != null) {
        setActiveIndex(firstReal.index ?? 0);
      }
    },
    [],
  );

  const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  // Precompute THE_CALL rank per card index (rank among THE_CALL cards only)
  const theCallRankMap = useMemo(() => {
    const map: Record<number, number> = {};
    let rank = 0;
    cards.forEach((c, i) => {
      if (!('divider' in c) && c.market.marketFormat === 'THE_CALL') {
        map[i] = ++rank;
      }
    });
    return map;
  }, [cards]);

  const renderCard = ({ item, index }: { item: CardItem; index: number }) => {
    if ('divider' in item) {
      return (
        <View style={styles.cardSlot}>
          <View style={{ justifyContent: 'flex-end', height: '100%', paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 2, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{item.label}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.cardSlot}>
        {item.market.marketFormat === 'BUZZ_OR_BOO' ? (
          <BuzzOrBooCard
            market={item.market}
            style={styles.card}
            onPress={() => router.push(`/market/${item.market.id}`)}
          />
        ) : item.market.marketFormat === 'THE_CALL' ? (
          <TheCallCard
            market={item.market}
            rank={theCallRankMap[index] ?? 1}
            style={styles.card}
            onPress={() => router.push(`/market/${item.market.id}`)}
          />
        ) : item.market.marketFormat === 'HOT_OR_NOT' ? (
          <HotOrNotCard
            market={item.market}
            style={styles.card}
            onPress={() => router.push(`/market/${item.market.id}`)}
          />
        ) : (
          <MarketCard
            market={item.market}
            isHot={item.isHot}
            style={styles.card}
            onPress={() => router.push(`/market/${item.market.id}`)}
          />
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating header */}
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View>
          <Text style={[styles.brand, { color: colors.primary }]}>AHEAD</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {(() => {
              const h = new Date().getHours();
              const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
              const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return `${greeting} · ${dateStr}`;
            })()}
          </Text>
        </View>
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onRefresh}
        >
          <Feather name="refresh-cw" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: CARD_MARGIN, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, gap: 6 }}>
          <Feather name="search" size={14} color="rgba(255,255,255,0.45)" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search markets…"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ flex: 1, color: '#fff', fontSize: 13, fontFamily: 'Inter_400Regular' }}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Format filter pills */}
      {(() => {
        const FORMAT_PILLS: { key: string | null; label: string }[] = [
          { key: null, label: 'All' },
          { key: 'BUZZ_OR_BOO', label: '⚡ Buzz or Boo' },
          { key: 'THE_CALL', label: '🎯 The Call' },
          { key: 'MULTI_CHOICE', label: '👑 Buzz Battle' },
          { key: 'HOT_OR_NOT', label: '🔥 Hot or Not' },
          { key: 'HEAD_TO_HEAD', label: '⚔️ Head to Head' },
          { key: 'STANDARD', label: '📊 Forecast' },
        ];
        return (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: CARD_MARGIN, paddingBottom: 10, gap: 8, flexDirection: 'row' }}
          >
            {FORMAT_PILLS.map((pill) => {
              const active = formatFilter === pill.key;
              return (
                <TouchableOpacity
                  key={pill.key ?? 'all'}
                  onPress={() => setFormatFilter(active ? null : pill.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${pill.label} format filter${active ? ', selected' : ''}`}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 13,
                    borderRadius: 20,
                    backgroundColor: active ? 'rgba(207,234,59,1)' : 'rgba(255,255,255,0.09)',
                    borderWidth: 1,
                    borderColor: active ? 'rgba(207,234,59,0.9)' : 'rgba(255,255,255,0.15)',
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontFamily: 'Inter_600SemiBold',
                    color: active ? '#000' : 'rgba(255,255,255,0.75)',
                  }}>
                    {pill.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        );
      })()}

      {/* Card feed */}
      {isLoading ? (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.cardSlot]}>
              <MarketCardSkeleton />
            </View>
          ))}
        </View>
      ) : isError ? (
        <View style={styles.empty}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Couldn't load markets
          </Text>
          <TouchableOpacity onPress={() => { refetchLocal(); refetchMarkets(); refetchUpcoming(); }} style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.empty}>
          <Feather name={(search || formatFilter) ? "search" : "inbox"} size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {(search || formatFilter) ? 'No markets match your filter' : 'No open markets yet'}
          </Text>
          {(search || formatFilter) ? (
            <TouchableOpacity
              onPress={() => { setSearch(''); setFormatFilter(null); }}
              style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.primary }}
            >
              <Text style={{ color: '#000', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Clear filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={cards}
          keyExtractor={(item) => 'divider' in item ? `divider-${item.label}` : `${item.market.id}-${item.isHot}`}
          renderItem={renderCard}
          horizontal
          pagingEnabled={false}
          snapToInterval={CARD_WIDTH + CARD_MARGIN}
          snapToAlignment="center"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPadding + 80 },
          ]}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          scrollEnabled={!!cards.length}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* Pagination dots */}
      {cards.length > 0 && (
        <View
          style={[
            styles.dots,
            { bottom: (Platform.OS === 'web' ? 84 : 80 + insets.bottom) + 8 },
          ]}
        >
          {(() => {
            // Only count real market cards (not dividers) for dots; cap at 10
            const marketIndices = cards
              .map((c, i) => ('divider' in c ? null : i))
              .filter((i): i is number => i !== null)
              .slice(0, 10);
            return marketIndices.map((cardIdx, dotIdx) => (
              <View
                key={dotIdx}
                style={[
                  styles.dot,
                  {
                    backgroundColor: cardIdx === activeIndex ? colors.primary : colors.border,
                    width: cardIdx === activeIndex ? 20 : 6,
                  },
                ]}
              />
            ));
          })()}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    lineHeight: 32,
  },
  date: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: CARD_MARGIN,
    gap: CARD_MARGIN,
    alignItems: 'center',
  },
  cardSlot: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  card: {
    flex: 1,
  },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: CARD_MARGIN,
    paddingTop: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
