import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  useGetUser,
  useGetUserPredictions,
} from '@workspace/api-client-react';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const userId = parseInt(id ?? '0', 10);

  const { data: user, isLoading: loadingUser, isError: errorUser } = useGetUser(userId, {
    query: { enabled: userId > 0 },
  });

  const { data: predictionsData, isLoading: loadingPreds } = useGetUserPredictions(userId, {
    query: { enabled: userId > 0 && !!user },
  });

  const predictions = predictionsData?.predictions ?? [];

  if (!userId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Invalid profile.</Text>
        </View>
      </View>
    );
  }

  if (loadingUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (errorUser || !user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>🔍</Text>
          <Text style={[styles.errorText, { color: colors.foreground }]}>Profile not found</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>This forecaster may no longer exist.</Text>
        </View>
      </View>
    );
  }

  const initials = (user.username ?? '?').slice(0, 2).toUpperCase();
  const accuracy = user.totalPredictions && user.totalPredictions > 0
    ? Math.round(((user.totalCorrect ?? 0) / user.totalPredictions) * 100)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Forecaster</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.profileHero}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '33' }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
          </View>
          <Text style={[styles.username, { color: colors.foreground }]}>{user.username}</Text>
          {user.rank && (
            <View style={[styles.rankBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '50' }]}>
              <Text style={[styles.rankText, { color: colors.primary }]}>#{user.rank} on the leaderboard</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={[styles.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{user.totalPredictions ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Predictions</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#CFEA3B' }]}>{accuracy != null ? `${accuracy}%` : '—'}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Accuracy</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.accent }]}>{user.forecastPoints ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>FP</Text>
          </View>
        </View>

        {/* Prediction history */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent Calls
            {predictions.length > 0 && (
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}> · {predictions.length}</Text>
            )}
          </Text>

          {loadingPreds ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : predictions.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>🔮</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No predictions yet</Text>
            </View>
          ) : (
            predictions.slice(0, 20).map((pred) => {
              const isResolved = pred.market?.status === 'RESOLVED';
              const won = isResolved && pred.isCorrect;
              const lost = isResolved && !pred.isCorrect;
              return (
                <TouchableOpacity
                  key={pred.id}
                  onPress={() => pred.market?.id && router.push(`/market/${pred.market.id}` as any)}
                  activeOpacity={0.75}
                  style={[
                    styles.predCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: won ? '#22c55e44' : lost ? colors.destructive + '33' : colors.border,
                    },
                  ]}
                >
                  <View style={styles.predMain}>
                    <Text style={[styles.predQuestion, { color: colors.foreground }]} numberOfLines={2}>
                      {pred.market?.title ?? pred.market?.question ?? 'Market'}
                    </Text>
                    <View style={styles.predMeta}>
                      <Text style={[styles.predChoice, { color: colors.primary }]}>
                        {pred.choice}
                      </Text>
                      {isResolved && (
                        <Text style={[styles.predResult, { color: won ? '#22c55e' : colors.destructive }]}>
                          {won ? '✓ Correct' : '✗ Wrong'}
                        </Text>
                      )}
                      {!isResolved && (
                        <Text style={[styles.predPending, { color: colors.mutedForeground }]}>
                          Pending
                        </Text>
                      )}
                    </View>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  backBtn: { padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  errorText: { fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  errorSub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  profileHero: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800' },
  username: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  rankBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  rankText: { fontSize: 13, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 20,
    marginBottom: 24,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  section: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  sectionCount: { fontSize: 14, fontWeight: '500' },
  emptyCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, fontWeight: '600' },
  predCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  predMain: { flex: 1, gap: 6 },
  predQuestion: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  predMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  predChoice: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  predResult: { fontSize: 12, fontWeight: '700' },
  predPending: { fontSize: 12, fontWeight: '600' },
});
