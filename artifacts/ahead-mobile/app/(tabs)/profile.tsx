import React, { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
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
  onPress?: () => void;
}

function StatCard({ value, label, color, onPress }: StatCardProps) {
  const colors = useColors();
  const inner = (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }, onPress ? { opacity: 1 } : {}]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}{onPress ? ' →' : ''}</Text>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
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

  if (format === 'HEAD_TO_HEAD') {
    try {
      const parsed = JSON.parse(market?.description ?? '{}') as {
        entityA?: string;
        entityB?: string;
      };
      if (raw === 'YES' && parsed.entityA) return `⚔️ ${parsed.entityA}`;
      if (raw === 'NO' && parsed.entityB) return `⚔️ ${parsed.entityB}`;
    } catch {
      // fallthrough
    }
    return raw === 'YES' ? '⚔️ Side A' : raw === 'NO' ? '⚔️ Side B' : raw;
  }

  if (format === 'HOT_OR_NOT') {
    return raw === 'YES' ? '🔥 HOT' : raw === 'NO' ? '❄️ NOT HOT' : raw;
  }

  if (format === 'STANDARD') {
    return raw === 'YES' ? '✓ YES' : raw === 'NO' ? '✗ NO' : raw;
  }

  // Generic YES/NO fallback
  return raw === 'YES' ? '✓ YES' : raw === 'NO' ? '✗ NO' : raw;
}

const BUZZ_COLOR = '#CFEA3B';
const BOO_COLOR = '#E8503E';
const HOT_COLOR = '#f97316';
const NOT_COLOR = '#60a5fa';

/**
 * Returns the color to use for a prediction choice label.
 * BUZZ_OR_BOO: BUZZ_COLOR for YES, BOO_COLOR for NO.
 * HOT_OR_NOT: HOT_COLOR for YES, NOT_COLOR for NO.
 * All other formats: null (use default muted color).
 */
function resolveChoiceColor(
  choice: string | null | undefined,
  market: { marketFormat?: string | null } | null | undefined,
): string | null {
  if (market?.marketFormat === 'BUZZ_OR_BOO') {
    return choice === 'YES' ? BUZZ_COLOR : BOO_COLOR;
  }
  if (market?.marketFormat === 'HOT_OR_NOT') {
    return choice === 'YES' ? HOT_COLOR : NOT_COLOR;
  }
  if (market?.marketFormat === 'HEAD_TO_HEAD') {
    return choice === 'YES' ? '#22d3ee' : '#f472b6';
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

function PredictionHistory({ predictions, colors, onNavigate }: { predictions: any[]; colors: any; onNavigate: (id: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? predictions : predictions.slice(0, 5);
  const hasMore = predictions.length > 5;

  if (predictions.length === 0) {
    return (
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PREDICTION HISTORY</Text>
        <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
          <Text style={{ fontSize: 32 }}>🎯</Text>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.foreground }}>No calls yet</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.mutedForeground, textAlign: 'center', maxWidth: 240 }}>Head to the Discover tab and make your first prediction.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
        PREDICTION HISTORY · {predictions.length}{predictions.length >= 50 ? ' (most recent 50)' : ''}
      </Text>
      {visible.map((pred: any) => {
        const isResolved = pred.market?.status === 'RESOLVED';
        const won = isResolved && pred.isCorrect;
        return (
          <TouchableOpacity key={pred.id} style={[styles.predRow, { borderBottomColor: colors.border }]} onPress={() => pred.market?.id ? onNavigate(pred.market.id) : undefined} activeOpacity={pred.market?.id ? 0.7 : 1}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.predFormat, { color: colors.mutedForeground }]}>
                {pred.market?.marketFormat === 'BUZZ_OR_BOO' ? '⚡ Buzz or Boo'
                  : pred.market?.marketFormat === 'THE_CALL' ? '🎯 The Call'
                  : pred.market?.marketFormat === 'MULTI_CHOICE' ? '👑 Buzz Battle'
                  : pred.market?.marketFormat === 'HOT_OR_NOT' ? '🔥 Hot or Not'
                  : pred.market?.marketFormat === 'HEAD_TO_HEAD' ? '⚔️ Head to Head'
                  : '📊 Forecast'}
                {pred.market?.category ? ` · ${pred.market.category.charAt(0).toUpperCase() + pred.market.category.slice(1).toLowerCase().replace(/_/g, ' ')}` : ''}
                {pred.createdAt ? (() => {
                  const ms = Date.now() - new Date(pred.createdAt).getTime();
                  const d = Math.floor(ms / 86400000);
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor(ms / 60000);
                  const label = d >= 1 ? `${d}d ago` : h >= 1 ? `${h}h ago` : m >= 1 ? `${m}m ago` : 'just now';
                  return ` · ${label}`;
                })() : ''}
              </Text>
              <Text style={[styles.predQuestion, { color: colors.foreground }]} numberOfLines={2}>
                {pred.market?.question}
              </Text>
              <Text style={[styles.predChoice, { color: colors.mutedForeground }]}>
                <Text style={{ color: resolveChoiceColor(pred.choice, pred.market) ?? colors.mutedForeground }}>
                  {resolveChoiceLabel(pred.choice, pred.market)}
                </Text>
                {' · '}{(pred.amount ?? 0).toLocaleString()} FP
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              {isResolved ? (
                <>
                  <Feather
                    name={won ? 'check-circle' : 'x-circle'}
                    size={20}
                    color={won ? '#16a34a' : colors.destructive ?? '#dc2626'}
                  />
                  {pred.market?.resolvedOutcome ? (
                    <Text style={{ fontSize: 9, fontWeight: '700', marginTop: 1, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.4 }} numberOfLines={1}>
                      {(() => {
                        const fmt = pred.market?.marketFormat;
                        const outcome = pred.market?.resolvedOutcome;
                        if (fmt === 'HOT_OR_NOT') return outcome === 'YES' ? '🔥 HOT' : '❄️ NOT HOT';
                        if (fmt === 'BUZZ_OR_BOO') return outcome === 'YES' ? '⚡ BUZZ' : '👎 BOO';
                        if (fmt === 'HEAD_TO_HEAD') {
                          try {
                            const d = JSON.parse(pred.market?.description ?? '{}');
                            return outcome === 'YES' ? (d.entityA ?? 'Side A') : (d.entityB ?? 'Side B');
                          } catch { return outcome === 'YES' ? 'Side A' : 'Side B'; }
                        }
                        if (fmt === 'MULTI_CHOICE') {
                          try {
                            const d = JSON.parse(pred.market?.description ?? '{}');
                            if (Array.isArray(d.contenders)) {
                              const c = d.contenders.find((x: {key:string;name:string}) => x.key === outcome);
                              if (c) return `👑 ${c.name}`;
                            }
                          } catch { /* fallthrough */ }
                          return `👑 ${outcome ?? '?'}`;
                        }
                        if (fmt === 'THE_CALL') {
                          try {
                            const d = JSON.parse(pred.market?.description ?? '{}');
                            if (Array.isArray(d.options)) {
                              const o = d.options.find((x: {key:string;label:string}) => x.key === outcome);
                              if (o) return `🏆 ${o.label}`;
                            }
                          } catch { /* fallthrough */ }
                          return `🏆 ${outcome ?? '?'}`;
                        }
                        return outcome === 'YES' ? '✓ YES' : '✗ NO';
                      })()}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 9, fontWeight: '700', marginTop: 1, color: won ? '#16a34a' : colors.destructive ?? '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {won ? `+${(pred.tokensEarned ?? 0).toLocaleString()} FP` : `-${(pred.amount ?? 0).toLocaleString()} FP`}
                  </Text>
                </>
              ) : pred.market?.status === 'CLOSED' ? (
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <View style={[styles.openBadge, { backgroundColor: '#3333' }]}>
                    <Text style={[styles.openBadgeText, { color: colors.mutedForeground }]}>CLOSED</Text>
                  </View>
                  <Text style={{ fontSize: 8, color: colors.mutedForeground, textAlign: 'center', maxWidth: 54, lineHeight: 11 }}>Awaiting resolution</Text>
                </View>
              ) : (
                <View style={[styles.openBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.openBadgeText, { color: colors.mutedForeground }]}>OPEN</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
      {hasMore && (
        <TouchableOpacity
          onPress={() => setShowAll(prev => !prev)}
          style={[styles.showMoreBtn, { borderTopColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.showMoreText, { color: colors.primary }]}>
            {showAll ? 'Show less' : `Show all ${predictions.length} predictions`}
          </Text>
          <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function SignInPrompt({ onLogin, colors }: { onLogin: () => void; colors: any }) {
  return (
    <View style={[styles.signInCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}>
      <Feather name="user-plus" size={28} color={colors.primary} />
      <Text style={[styles.signInTitle, { color: colors.foreground }]}>
        Sign in to get started
      </Text>
      <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
        Track your predictions, earn Forecast Points, and climb the rankings.
      </Text>
      <TouchableOpacity
        style={[styles.signInBtn, { backgroundColor: colors.primary }]}
        onPress={onLogin}
        activeOpacity={0.85}
      >
        <Text style={[styles.signInBtnText, { color: colors.primaryForeground }]}>
          Sign in
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

  const router = useRouter();
  const platformUserId = authUser ? parseInt(authUser.id, 10) : null;
  const { data: platformUser } = useGetMe({
    query: { enabled: isAuthenticated, queryKey: getGetMeQueryKey() },
  });
  const { data: predictions, isLoading: predictionsLoading, refetch: refetchPredictions } = useGetUserPredictions(platformUserId ?? 0, {
    query: {
      enabled: isAuthenticated && !!platformUserId,
      queryKey: getGetUserPredictionsQueryKey(platformUserId ?? 0),
    },
  });

  // Refresh prediction history when screen gains focus (picks up new calls made elsewhere)
  useFocusEffect(useCallback(() => {
    if (isAuthenticated && platformUserId) {
      refetchPredictions();
    }
  }, [isAuthenticated, platformUserId, refetchPredictions]));

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
          <TouchableOpacity onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: logout },
            ]);
          }} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Feather name="log-out" size={16} color={colors.mutedForeground} />
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.mutedForeground }}>Sign out</Text>
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
            {platformUser?.avatarUrl ? (
              <Image
                source={{ uri: platformUser.avatarUrl }}
                style={[styles.avatar, { backgroundColor: colors.muted }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initials}</Text>
              </View>
            )}
            <Text style={[styles.displayName, { color: colors.foreground }]}>{displayName}</Text>
            {platformUser?.rank && (
              <TouchableOpacity
                onPress={() => router.push('/rankings')}
                activeOpacity={0.7}
                style={[styles.memberBadge, { backgroundColor: colors.muted }]}
              >
                <Feather name="award" size={11} color={colors.mutedForeground} style={{ marginRight: 3 }} />
                <Text style={[styles.memberText, { color: colors.mutedForeground }]}>
                  Global Rank #{platformUser.rank} →
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <StatCard
              value={platformUser?.tokenBalance != null ? platformUser.tokenBalance.toLocaleString() : '—'}
              label="Forecast Points"
              color={colors.primary}
            />
            <StatCard
              value={platformUser ? String(platformUser.totalPredictions) : '—'}
              label="Predictions"
              color={colors.primary}
              onPress={() => setActiveTab('calls')}
            />
            {(() => {
              const rawScore = platformUser?.buzzScore != null ? Math.round(platformUser.buzzScore) : null;
              const tier = rawScore == null ? null : rawScore >= 80 ? 'Elite' : rawScore >= 65 ? 'Expert' : 'Developing';
              const isFallback = rawScore == null && platformUser?.overallAccuracy != null;
              const scoreDisplay = rawScore != null ? String(rawScore) : isFallback ? `${Math.round(platformUser!.overallAccuracy! * 100)}%` : '—';
              const label = rawScore != null ? (tier ? `BuzzScore · ${tier}` : 'BuzzScore') : isFallback ? 'Accuracy' : 'BuzzScore';
              return <StatCard value={scoreDisplay} label={label} color={colors.primary} onPress={() => router.push('/rankings')} />;
            })()}
            <StatCard
              value={platformUser?.totalCorrect != null ? String(platformUser.totalCorrect) : '—'}
              label="Correct"
              color={colors.accent}
              onPress={() => setActiveTab('calls')}
            />
            <StatCard
              value={platformUser?.rank ? `#${platformUser.rank}` : 'Unranked'}
              label="Rank"
              color={colors.accent}
              onPress={() => router.push('/rankings')}
            />
          </View>

          {/* Quick actions */}
          <View style={[styles.quickActions, { borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.quickActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/')}
              activeOpacity={0.8}
            >
              <Feather name="zap" size={16} color="#000" />
              <Text style={[styles.quickActionText, { color: '#000' }]}>Make a Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/predict' as any)}
              activeOpacity={0.8}
            >
              <Feather name="search" size={16} color={colors.foreground} />
              <Text style={[styles.quickActionText, { color: colors.foreground }]}>Browse Markets</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => router.push('/rankings')}
              activeOpacity={0.8}
            >
              <Feather name="award" size={16} color={colors.foreground} />
              <Text style={[styles.quickActionText, { color: colors.foreground }]}>Rankings</Text>
            </TouchableOpacity>
          </View>

          {/* Prediction history — show list or empty state */}
          {predictionsLoading && !predictions ? (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PREDICTION HISTORY</Text>
              <View style={{ padding: 16, gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ height: 64, borderRadius: 12, backgroundColor: colors.muted, opacity: 0.5 }} />
                ))}
              </View>
            </View>
          ) : predictions && predictions.length > 0 ? (
            <PredictionHistory predictions={predictions} colors={colors} onNavigate={(id) => router.push(`/market/${id}` as any)} />
          ) : predictions !== undefined && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PREDICTION HISTORY</Text>
              <View style={{ paddingHorizontal: 16, paddingBottom: 20, alignItems: 'center', gap: 12 }}>
                <Feather name="inbox" size={28} color={colors.mutedForeground} style={{ marginTop: 12 }} />
                <Text style={[{ color: colors.mutedForeground, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
                  No predictions yet. Make your first call!
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/' as any)}
                  style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 20 }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' }}>Browse Markets</Text>
                </TouchableOpacity>
              </View>
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
            <StatCard value="—" label="Forecast Points" color={colors.primary} />
            <StatCard value="—" label="Predictions" color={colors.primary} />
            <StatCard value="—" label="BuzzScore" color={colors.primary} />
            <StatCard value="—" label="Correct" color={colors.accent} />
            <StatCard value="—" label="Rank" color={colors.accent} />
          </View>

          <SignInPrompt onLogin={login} colors={colors} />
        </>
      )}

      {/* About section */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ABOUT</Text>
        <SectionRow icon="info" label="Version" value="1.0.0" colors={colors} />
        <SectionRow icon="globe" label="Platform" value="BuzzOrBoo" colors={colors} />
        <SectionRow icon="map-pin" label="Focus" value="Boston, MA" colors={colors} />
      </View>

      {/* How it works */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>HOW IT WORKS</Text>
        <View style={styles.howItWorks}>
          {[
            { icon: 'compass', text: 'Discover markets — Buzz or Boo, The Call, Buzz Battle, and more' },
            { icon: 'trending-up', text: 'Make your call — pick a side, back a contender, or cast a verdict' },
            { icon: 'award', text: 'Earn Forecast Points for accurate predictions' },
            { icon: 'trophy', text: 'Build your BuzzScore and climb the rankings' },
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
  predFormat: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
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
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    borderTopWidth: 0,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  quickActionText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
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
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  showMoreText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
