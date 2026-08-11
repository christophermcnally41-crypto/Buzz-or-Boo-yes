import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  useGetMe,
  useGetUserPredictions,
  getGetMeQueryKey,
  getGetUserPredictionsQueryKey,
} from '@workspace/api-client-react';

interface StatCardProps {
  value: string;
  label: string;
  color: string;
}

function StatCard({ value, label, color }: StatCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

/**
 * Resolve a raw prediction choice key to a human-readable label.
 *
 * - BUZZ_OR_BOO: YES → "⚡ BUZZ", anything else → "👎 BOO"
 * - MULTI_CHOICE: parse description.contenders[{ key, name }], show contender name
 * - THE_CALL: parse description.options[{ key, label }], show option label
 * - Everything else: return the raw choice key
 *
 * Both MULTI_CHOICE and THE_CALL fall back to the raw key if the description
 * can't be parsed or the key isn't found.
 */
function resolveChoiceLabel(
  choice: string | null | undefined,
  market: { marketFormat?: string | null; description?: string | null } | null | undefined,
): string {
  const raw = choice ?? '';
  const format = market?.marketFormat ?? '';

  if (format === 'BUZZ_OR_BOO') {
    return raw === 'YES' ? '⚡ BUZZ' : '👎 BOO';
  }

  if (format === 'MULTI_CHOICE') {
    try {
      const parsed = JSON.parse(market?.description ?? '{}') as {
        contenders?: { key: string; name: string }[];
      };
      if (Array.isArray(parsed.contenders)) {
        const contender = parsed.contenders.find((c) => c.key === raw);
        if (contender) return contender.name;
      }
    } catch {
      // fallthrough to raw key
    }
    return raw;
  }

  if (format === 'THE_CALL') {
    try {
      const parsed = JSON.parse(market?.description ?? '{}') as {
        options?: { key: string; label: string }[];
      };
      if (Array.isArray(parsed.options)) {
        const opt = parsed.options.find((o) => o.key === raw);
        if (opt) return `🎯 ${opt.label}`;
      }
    } catch {
      // fallthrough to raw key
    }
    return `🎯 ${raw}`;
  }

  return raw;
}

const BUZZ_COLOR = '#CFEA3B';
const BOO_COLOR = '#E8503E';

/**
 * Returns the color to use for a prediction choice label.
 * BUZZ_OR_BOO: BUZZ_COLOR for YES, BOO_COLOR for everything else.
 * All other formats: null (use default muted color).
 */
function resolveChoiceColor(
  choice: string | null | undefined,
  market: { marketFormat?: string | null } | null | undefined,
): string | null {
  if (market?.marketFormat === 'BUZZ_OR_BOO') {
    return choice === 'YES' ? BUZZ_COLOR : BOO_COLOR;
  }
  return null;
}

function SectionRow({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: any }) {
  return (
    <View style={[styles.sectionRow, { borderBottomColor: colors.border }]}>
      <Feather name={icon as any} size={16} color={colors.mutedForeground} />
      <Text style={[styles.sectionRowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.sectionRowValue, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

function SignInPrompt({ onLogin, colors }: { onLogin: () => void; colors: any }) {
  return (
    <View style={[styles.signInCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}>
      <Feather name="user-plus" size={28} color={colors.primary} />
      <Text style={[styles.signInTitle, { color: colors.foreground }]}>
        Create your account
      </Text>
      <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
        Sign up to track your predictions, earn tokens, and climb the rankings.
      </Text>
      <TouchableOpacity
        style={[styles.signInBtn, { backgroundColor: colors.primary }]}
        onPress={onLogin}
        activeOpacity={0.85}
      >
        <Text style={[styles.signInBtnText, { color: colors.primaryForeground }]}>
          Log in
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 84 + 34 : 80 + insets.bottom;

  const { user: authUser, isLoading: authLoading, isAuthenticated, login, logout } = useAuth();

  const platformUserId = authUser ? parseInt(authUser.id, 10) : null;
  const { data: platformUser } = useGetMe({
    query: { enabled: isAuthenticated, queryKey: getGetMeQueryKey() },
  });
  const { data: predictions } = useGetUserPredictions(platformUserId ?? 0, {
    query: {
      enabled: isAuthenticated && !!platformUserId,
      queryKey: getGetUserPredictionsQueryKey(platformUserId ?? 0),
    },
  });

  const initials = platformUser?.username
    ? platformUser.username.slice(0, 2).toUpperCase()
    : authUser?.firstName
      ? authUser.firstName.slice(0, 2).toUpperCase()
      : 'A';

  const displayName = platformUser?.username ?? authUser?.firstName ?? 'forecaster';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPadding + 8, paddingBottom: bottomPadding + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>You</Text>
        {isAuthenticated && (
          <TouchableOpacity onPress={logout} activeOpacity={0.7}>
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {authLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isAuthenticated ? (
        <>
          {/* Avatar & name */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initials}</Text>
            </View>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{displayName}</Text>
            {platformUser?.rank && (
              <View style={[styles.memberBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.memberText, { color: colors.mutedForeground }]}>
                  Global Rank #{platformUser.rank}
                </Text>
              </View>
            )}
          </View>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <StatCard
              value={platformUser ? String(platformUser.totalPredictions) : '—'}
              label="Predictions"
              color={colors.primary}
            />
            <StatCard
              value={platformUser?.overallAccuracy ? `${platformUser.overallAccuracy.toFixed(1)}%` : '—'}
              label="Accuracy"
              color={colors.primary}
            />
            <StatCard
              value={platformUser ? platformUser.tokenBalance.toLocaleString() : '—'}
              label="Tokens"
              color={colors.accent}
            />
            <StatCard
              value={platformUser?.rank ? `#${platformUser.rank}` : '—'}
              label="Rank"
              color={colors.accent}
            />
          </View>

          {/* Recent predictions */}
          {predictions && predictions.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>RECENT PREDICTIONS</Text>
              {predictions.slice(0, 5).map((pred) => {
                const isResolved = pred.market?.status === 'RESOLVED';
                const won = isResolved && pred.isCorrect;
                return (
                  <View key={pred.id} style={[styles.predRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.predQuestion, { color: colors.foreground }]} numberOfLines={2}>
                        {pred.market?.question}
                      </Text>
                      <Text style={[styles.predChoice, { color: colors.mutedForeground }]}>
                        <Text style={{ color: resolveChoiceColor(pred.choice, pred.market) ?? colors.mutedForeground }}>
                          {resolveChoiceLabel(pred.choice, pred.market)}
                        </Text>
                        {' · '}{pred.amount.toLocaleString()} FP
                      </Text>
                    </View>
                    <View>
                      {isResolved ? (
                        <Feather
                          name={won ? 'check-circle' : 'x-circle'}
                          size={20}
                          color={won ? '#16a34a' : colors.destructive ?? '#dc2626'}
                        />
                      ) : (
                        <View style={[styles.openBadge, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.openBadgeText, { color: colors.mutedForeground }]}>OPEN</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          {/* Placeholder avatar for unauthenticated state */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>A</Text>
            </View>
            <Text style={[styles.displayName, { color: colors.foreground }]}>forecaster</Text>
          </View>

          {/* Stats grid (empty) */}
          <View style={styles.statsGrid}>
            <StatCard value="—" label="Predictions" color={colors.primary} />
            <StatCard value="—" label="Accuracy" color={colors.primary} />
            <StatCard value="—" label="Tokens" color={colors.accent} />
            <StatCard value="—" label="Rank" color={colors.accent} />
          </View>

          <SignInPrompt onLogin={login} colors={colors} />
        </>
      )}

      {/* About section */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ABOUT</Text>
        <SectionRow icon="info" label="Version" value="1.0.0" colors={colors} />
        <SectionRow icon="globe" label="Platform" value="AHEAD" colors={colors} />
        <SectionRow icon="map-pin" label="Focus" value="Boston, MA" colors={colors} />
      </View>

      {/* How it works */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>HOW IT WORKS</Text>
        <View style={styles.howItWorks}>
          {[
            { icon: 'compass', text: 'Browse market cards in Discover' },
            { icon: 'trending-up', text: 'Make YES or NO predictions' },
            { icon: 'award', text: 'Earn tokens for accurate calls' },
            { icon: 'trophy', text: 'Climb the rankings leaderboard' },
          ].map((step, i) => (
            <View key={i} style={styles.howRow}>
              <View style={[styles.stepNum, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.stepNumText, { color: colors.primary }]}>{i + 1}</Text>
              </View>
              <Feather name={step.icon as any} size={16} color={colors.mutedForeground} />
              <Text style={[styles.howText, { color: colors.foreground }]}>{step.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  header: {
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarInitial: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
  },
  displayName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  memberBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  memberText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signInCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  signInTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  signInSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  signInBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  predQuestion: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    marginBottom: 3,
  },
  predChoice: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  openBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  openBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionRowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  sectionRowValue: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  howItWorks: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 14,
  },
  howRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  howText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
