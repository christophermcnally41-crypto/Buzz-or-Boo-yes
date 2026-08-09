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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetLeaderboard } from '@workspace/api-client-react';
import type { LeaderboardEntry } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { LeaderboardRowSkeleton } from '@/components/SkeletonLoader';

const RANK_COLORS: Record<number, string> = {
  1: '#F5C518',
  2: '#A8A9AD',
  3: '#CD7F32',
};

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const colors = useColors();
  const rankColor = RANK_COLORS[entry.rank] ?? colors.mutedForeground;
  const accuracy = Math.round(entry.accuracy * 100);

  const initials = entry.user.username
    .split(/[\s_-]/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
        <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>
          {entry.user.username}
        </Text>
        <Text style={[styles.subStats, { color: colors.mutedForeground }]}>
          {entry.totalCorrect}/{entry.totalPredictions} correct
        </Text>
      </View>

      {/* Accuracy */}
      <View style={styles.accuracyCol}>
        <Text style={[styles.accuracyNum, { color: accuracy >= 70 ? '#94C213' : colors.foreground }]}>
          {accuracy}%
        </Text>
        <Text style={[styles.accuracyLabel, { color: colors.mutedForeground }]}>accuracy</Text>
      </View>
    </View>
  );
}

export default function RankingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useGetLeaderboard({ limit: 25 });

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
        <Feather name="award" size={22} color="#F5C518" />
        <View>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Rankings</Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            Top forecasters
          </Text>
        </View>
      </View>

      {/* Top-3 podium */}
      {data && data.length >= 3 && (
        <View style={styles.podium}>
          {/* 2nd */}
          <View style={[styles.podiumItem, styles.podiumSecond]}>
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
          </View>

          {/* 1st */}
          <View style={[styles.podiumItem, styles.podiumFirst]}>
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
          </View>

          {/* 3rd */}
          <View style={[styles.podiumItem, styles.podiumThird]}>
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
          </View>
        </View>
      )}

      {/* Full leaderboard */}
      {isLoading ? (
        <View style={{ paddingHorizontal: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => <LeaderboardRowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={data?.slice(3) ?? []}
          keyExtractor={(e) => `${e.rank}`}
          renderItem={({ item }) => <LeaderboardRow entry={item} />}
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
              </View>
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
