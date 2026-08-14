import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetLeaderboard, useGetMyLeaderboardEntry, useGetPlatformStats, GetLeaderboardCategory } from '@workspace/api-client-react';
import type { LeaderboardEntry } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { LeaderboardRowSkeleton } from '@/components/SkeletonLoader';
import { useAuth } from '@/lib/auth';

const RANK_COLORS: Record<number, string> = {
  1: '#F5C518',
  2: '#A8A9AD',
  3: '#CD7F32',
};

function LeaderboardRow({ entry, isMe, onPress }: { entry: LeaderboardEntry; isMe?: boolean; onPress?: () => void }) {
  const colors = useColors();
  const rankColor = RANK_COLORS[entry.rank] ?? colors.mutedForeground;
  const accuracy = Math.round(entry.accuracy * 100);

  const initials = entry.user.username
    .split(/[\s_-]/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[
      styles.row,
      { backgroundColor: isMe ? colors.primary + '12' : colors.card, borderColor: isMe ? colors.primary + '55' : colors.border },
      isMe && { borderWidth: 1.5 },
    ]}>
      {/* Rank */}
      <View style={[styles.rankCol, { backgroundColor: entry.rank <= 3 ? rankColor + '22' : colors.muted }]}>
        <Text style={[styles.rankNum, { color: entry.rank <= 3 ? rankColor : colors.mutedForeground }]}>
          {entry.rank}
        </Text>
      </View>

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: rankColor + '33' }]}>
        <Text style={[styles.avatarText, { color: entry.rank <= 3 ? rankColor : colors.mutedForeground }]}>
          {initials || '?'}
        </Text>
      </View>

      {/* Name & stats */}
      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>
            {entry.user.username}
          </Text>
          {isMe && (
            <View style={{ backgroundColor: colors.primary + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>YOU</Text>
            </View>
          )}
        </View>
        <Text style={[styles.subStats, { color: colors.mutedForeground }]}>
          {entry.totalCorrect}/{entry.totalPredictions} correct
        </Text>
      </View>

      {/* Score */}
      <View style={styles.accuracyCol}>
        {entry.buzzScore != null && entry.buzzScore > 0 ? (
          <>
            <Text style={[styles.accuracyNum, { color: '#CFEA3B' }]}>
              {Math.round(entry.buzzScore).toLocaleString()}
            </Text>
            <Text style={[styles.accuracyLabel, { color: colors.mutedForeground }]}>BuzzScore</Text>
          </>
        ) : (
          <>
            <Text style={[styles.accuracyNum, { color: accuracy >= 70 ? '#94C213' : colors.foreground }]}>
              {accuracy}%
            </Text>
            <Text style={[styles.accuracyLabel, { color: colors.mutedForeground }]}>accuracy</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const CATEGORY_PILLS: { key: string; label: string }[] = [
  { key: 'OVERALL', label: '🏆 All' },
  { key: 'STYLE', label: '👗 Style' },
  { key: 'CITY', label: '🏙 City' },
  { key: 'CULTURE', label: '🎭 Culture' },
  { key: 'HOME', label: '🏠 Home' },
  { key: 'MOVIES', label: '🎬 Movies' },
  { key: 'BEAUTY', label: '✨ Beauty' },
  { key: 'LOCAL_PULSE', label: '🔥 Local' },
];

export default function RankingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { isAuthenticated } = useAuth();

  const [limit, setLimit] = useState(25);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState<string>('OVERALL');

  const leaderboardParams = category === 'OVERALL'
    ? { limit }
    : { limit, category: category as typeof GetLeaderboardCategory[keyof typeof GetLeaderboardCategory] };

  const { data, refetch, isLoading, isError } = useGetLeaderboard(leaderboardParams, { query: { refetchInterval: 60_000 } });
  const { data: platformStats } = useGetPlatformStats();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Refresh data when tab gains focus
  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const myEntryParams = category === 'OVERALL' ? {} : { category: category as typeof GetLeaderboardCategory[keyof typeof GetLeaderboardCategory] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: myEntryRaw } = useGetMyLeaderboardEntry(
    myEntryParams as {},
    { query: { enabled: isAuthenticated } as any }
  );
  // 204 "no entry" maps to void/undefined at runtime; narrow to a usable type
  const myEntry = (myEntryRaw && typeof myEntryRaw === 'object' ? myEntryRaw : undefined) as LeaderboardEntry | undefined;

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Feather name="award" size={22} color="#F5C518" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Rankings</Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            Top forecasters
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {platformStats?.totalUsers != null && (
            <View style={[styles.statsPill, { backgroundColor: colors.muted }]}>
              <Feather name="users" size={11} color={colors.mutedForeground} />
              <Text style={[styles.statsPillText, { color: colors.foreground }]}>
                {' '}{platformStats.totalUsers.toLocaleString()}
              </Text>
            </View>
          )}
          {platformStats?.openMarkets != null && platformStats.openMarkets > 0 && (
            <View style={[styles.statsPill, { backgroundColor: colors.muted }]}>
              <Feather name="activity" size={11} color={colors.mutedForeground} />
              <Text style={[styles.statsPillText, { color: colors.foreground }]}>
                {' '}{platformStats.openMarkets.toLocaleString()} live
              </Text>
            </View>
          )}
          {platformStats?.totalPredictions != null && (
            <View style={[styles.statsPill, { backgroundColor: colors.muted }]}>
              <Feather name="target" size={11} color={colors.mutedForeground} />
              <Text style={[styles.statsPillText, { color: colors.foreground }]}>
                {' '}{platformStats.totalPredictions.toLocaleString()} calls
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 44, flexShrink: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 8, flexDirection: 'row' }}
      >
        {CATEGORY_PILLS.map((pill) => {
          const isActive = category === pill.key;
          return (
            <TouchableOpacity
              key={pill.key}
              activeOpacity={0.75}
              onPress={() => { setCategory(pill.key); setLimit(25); }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: isActive ? colors.primary : colors.muted,
                borderWidth: isActive ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{
                fontSize: 12,
                fontFamily: 'Inter_600SemiBold',
                color: isActive ? '#000' : colors.mutedForeground,
              }}>
                {pill.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Top-3 podium — shows when at least 1 entry exists */}
      {data && data.length >= 1 && (
        <View style={styles.podium}>
          {/* 2nd — only renders if data[1] exists */}
          {data[1] ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/profile/${data[1].user.id}` as any)} style={[styles.podiumItem, styles.podiumSecond]}>
              <View style={[styles.podiumAvatar, { backgroundColor: '#A8A9AD33' }]}>
                <Text style={[styles.podiumAvatarText, { color: '#A8A9AD' }]}>
                  {(data[1].user.username[0] ?? '').toUpperCase()}
                </Text>
              </View>
              <View style={[styles.podiumBlock, { backgroundColor: '#A8A9AD', height: 60 }]}>
                <Text style={styles.podiumRank}>2</Text>
              </View>
              <Text style={[styles.podiumName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {data[1].user.username}
              </Text>
              {data[1].buzzScore != null && data[1].buzzScore > 0
                ? <Text style={[styles.podiumScore, { color: '#A8A9AD' }]}>{Math.round(data[1].buzzScore).toLocaleString()} BuzzScore</Text>
                : data[1].totalPredictions > 0
                  ? <Text style={[styles.podiumScore, { color: '#A8A9AD' }]}>{Math.round((data[1].totalCorrect / data[1].totalPredictions) * 100)}% accuracy</Text>
                  : null
              }
            </TouchableOpacity>
          ) : <View style={[styles.podiumItem, styles.podiumSecond]} />}

          {/* 1st */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/profile/${data[0].user.id}` as any)} style={[styles.podiumItem, styles.podiumFirst]}>
            <View style={[styles.crownRow]}>
              <Feather name="award" size={18} color="#F5C518" />
            </View>
            <View style={[styles.podiumAvatar, { backgroundColor: '#F5C51833' }]}>
              <Text style={[styles.podiumAvatarText, { color: '#F5C518' }]}>
                {(data[0].user.username[0] ?? '').toUpperCase()}
              </Text>
            </View>
            <View style={[styles.podiumBlock, { backgroundColor: '#F5C518', height: 80 }]}>
              <Text style={styles.podiumRank}>1</Text>
            </View>
            <Text style={[styles.podiumName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
              {data[0].user.username}
            </Text>
            {data[0].buzzScore != null && data[0].buzzScore > 0
              ? <Text style={[styles.podiumScore, { color: '#F5C518' }]}>{Math.round(data[0].buzzScore).toLocaleString()} BuzzScore</Text>
              : data[0].totalPredictions > 0
                ? <Text style={[styles.podiumScore, { color: '#F5C518' }]}>{Math.round((data[0].totalCorrect / data[0].totalPredictions) * 100)}% accuracy</Text>
                : null
            }
          </TouchableOpacity>

          {/* 3rd — only renders if data[2] exists */}
          {data[2] ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/profile/${data[2].user.id}` as any)} style={[styles.podiumItem, styles.podiumThird]}>
              <View style={[styles.podiumAvatar, { backgroundColor: '#CD7F3233' }]}>
                <Text style={[styles.podiumAvatarText, { color: '#CD7F32' }]}>
                  {(data[2].user.username[0] ?? '').toUpperCase()}
                </Text>
              </View>
              <View style={[styles.podiumBlock, { backgroundColor: '#CD7F32', height: 44 }]}>
                <Text style={styles.podiumRank}>3</Text>
              </View>
              <Text style={[styles.podiumName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {data[2].user.username}
              </Text>
              {data[2].buzzScore != null && data[2].buzzScore > 0
                ? <Text style={[styles.podiumScore, { color: '#CD7F32' }]}>{Math.round(data[2].buzzScore).toLocaleString()} BuzzScore</Text>
                : data[2].totalPredictions > 0
                  ? <Text style={[styles.podiumScore, { color: '#CD7F32' }]}>{Math.round((data[2].totalCorrect / data[2].totalPredictions) * 100)}% accuracy</Text>
                  : null
              }
            </TouchableOpacity>
          ) : <View style={[styles.podiumItem, styles.podiumThird]} />}
        </View>
      )}

      {/* My rank card — or "not ranked" nudge (authenticated users only) */}
      {isAuthenticated && (myEntry ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/profile/${myEntry.user.id}` as any)} style={[styles.myRankCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '55' }]}>
          <View style={[styles.myRankBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.myRankBadgeText}>YOU</Text>
          </View>
          <View style={[styles.myRankAvatarWrap, { backgroundColor: colors.primary + '33' }]}>
            <Text style={[styles.myRankAvatarText, { color: colors.primary }]}>
              {myEntry.user.username.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={styles.myRankInfo}>
            <Text style={[styles.myRankUsername, { color: colors.foreground }]} numberOfLines={1}>
              {myEntry.user.username}
            </Text>
            <Text style={[styles.myRankSub, { color: colors.mutedForeground }]}>
              {myEntry.totalCorrect}/{myEntry.totalPredictions} correct
            </Text>
          </View>
          <View style={styles.myRankRight}>
            <Text style={[styles.myRankNum, { color: colors.primary }]}>#{myEntry.rank}</Text>
            {myEntry.buzzScore != null && myEntry.buzzScore > 0 ? (
              <Text style={[styles.myRankAcc, { color: '#CFEA3B' }]}>
                {Math.round(myEntry.buzzScore).toLocaleString()} BS
              </Text>
            ) : (
              <Text style={[styles.myRankAcc, { color: colors.primary }]}>
                {Math.round(myEntry.accuracy * 100)}%
              </Text>
            )}
            <Text style={{ fontSize: 9, color: colors.mutedForeground, marginTop: 2 }}>View profile →</Text>
          </View>
        </TouchableOpacity>
      ) : (
        /* Authenticated user with no ranking entry yet */
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/markets' as any)} style={[styles.myRankCard, { backgroundColor: colors.card, borderColor: colors.border, borderStyle: 'dashed' }]}>
          <View style={[styles.myRankAvatarWrap, { backgroundColor: colors.muted }]}>
            <Text style={[styles.myRankAvatarText, { color: colors.mutedForeground }]}>?</Text>
          </View>
          <View style={styles.myRankInfo}>
            <Text style={[styles.myRankUsername, { color: colors.foreground }]}>Not on the board yet</Text>
            <Text style={[styles.myRankSub, { color: colors.mutedForeground }]}>Make predictions to earn a BuzzScore</Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>Explore →</Text>
        </TouchableOpacity>
      ))}

      {/* Full leaderboard */}
      {isLoading ? (
        <View style={{ paddingHorizontal: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => <LeaderboardRowSkeleton key={i} />)}
        </View>
      ) : isError ? (
        <View style={[styles.empty, { paddingVertical: 48 }]}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Couldn't load rankings</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#F5C518' }}>
            <Text style={{ color: '#000', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data && data.length >= 3 ? data.slice(3) : (data ?? [])}
          keyExtractor={(e) => `${e.rank}`}
          renderItem={({ item }) => <LeaderboardRow entry={item} isMe={item.user.id === myEntry?.user?.id} onPress={() => router.push(`/profile/${item.user.id}` as any)} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (Platform.OS === 'web' ? 84 : 80 + insets.bottom) + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(data?.length)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F5C518"
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Feather name="users" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No forecasters yet
                </Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>
                  Make predictions to be the first on the board
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            data && data.length >= limit ? (
              <TouchableOpacity
                style={[styles.loadMoreBtn, { borderColor: colors.border, opacity: loadingMore ? 0.5 : 1 }]}
                onPress={async () => {
                  setLoadingMore(true);
                  setLimit(l => l + 25);
                  await refetch();
                  setLoadingMore(false);
                }}
                disabled={loadingMore}
              >
                <Text style={[styles.loadMoreText, { color: colors.mutedForeground }]}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Text>
                {!loadingMore && <Feather name="chevron-down" size={14} color={colors.mutedForeground} />}
              </TouchableOpacity>
            ) : null
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
    marginTop: 2,
  },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsPillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  podiumItem: {
    alignItems: 'center',
    flex: 1,
  },
  podiumFirst: { marginBottom: 0 },
  podiumSecond: { marginBottom: 0 },
  podiumThird: { marginBottom: 0 },
  crownRow: {
    marginBottom: 4,
  },
  podiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  podiumAvatarText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  podiumBlock: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRank: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  podiumName: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 6,
    textAlign: 'center',
  },
  podiumScore: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
    textAlign: 'center',
  },
  list: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
    gap: 10,
    paddingRight: 14,
  },
  rankCol: {
    width: 36,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  username: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  subStats: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  accuracyCol: {
    alignItems: 'flex-end',
  },
  accuracyNum: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  accuracyLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  loadMoreText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
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
  myRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 10,
  },
  myRankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  myRankBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  myRankAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myRankAvatarText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  myRankInfo: {
    flex: 1,
    gap: 2,
  },
  myRankUsername: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  myRankSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  myRankRight: {
    alignItems: 'flex-end',
  },
  myRankNum: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  myRankAcc: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
