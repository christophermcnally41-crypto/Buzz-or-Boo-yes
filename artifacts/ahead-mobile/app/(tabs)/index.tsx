import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useListMarkets } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';
import { MarketCard } from '@/components/MarketCard';
import { BuzzOrBooCard } from '@/components/BuzzOrBooCard';
import { MarketCardSkeleton } from '@/components/SkeletonLoader';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;
const CARD_HEIGHT = 420;

interface CardItem {
  market: Market;
  isHot: boolean;
}

export default function DiscoverScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // HOT IN BOSTON: most-predicted LOCAL_PULSE market
  const { data: localPulseData, refetch: refetchLocal } = useListMarkets({
    category: 'LOCAL_PULSE',
    status: 'OPEN',
    limit: 3,
  });

  // General open markets
  const { data: marketsData, refetch: refetchMarkets } = useListMarkets({
    status: 'OPEN',
    limit: 30,
  });

  const hotCard = localPulseData?.markets?.[0];
  const otherMarkets = (marketsData?.markets ?? []).filter(
    (m) => m.category !== 'LOCAL_PULSE',
  );

  const cards: CardItem[] = [
    ...(hotCard ? [{ market: hotCard, isHot: true }] : []),
    ...otherMarkets.map((m) => ({ market: m, isHot: false })),
  ];

  const isLoading = !localPulseData && !marketsData;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLocal(), refetchMarkets()]);
    setRefreshing(false);
  }, [refetchLocal, refetchMarkets]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: any[] }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index ?? 0);
      }
    },
    [],
  );

  const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const renderCard = ({ item }: { item: CardItem }) => (
    <View style={styles.cardSlot}>
      {item.market.marketFormat === 'BUZZ_OR_BOO' ? (
        <BuzzOrBooCard
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating header */}
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View>
          <Text style={[styles.brand, { color: colors.primary }]}>AHEAD</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onRefresh}
        >
          <Feather name="refresh-cw" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Card feed */}
      {isLoading ? (
        <View style={styles.skeletonContainer}>
          <View style={[styles.cardSlot]}>
            <MarketCardSkeleton />
          </View>
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No open markets yet
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={cards}
          keyExtractor={(item) => `${item.market.id}-${item.isHot}`}
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
          {cards.slice(0, Math.min(cards.length, 10)).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === activeIndex ? colors.primary : colors.border,
                  width: i === activeIndex ? 20 : 6,
                },
              ]}
            />
          ))}
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
