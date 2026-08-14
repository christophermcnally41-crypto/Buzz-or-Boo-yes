import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  useGetMarket,
  useMakePrediction,
  useGetMarketPredictions,
  useGetMarketTally,
  useGetMarketMyPrediction,
  useGetMe,
  getGetMarketQueryKey,
  getGetMarketPredictionsQueryKey,
  getGetMarketTallyQueryKey,
  getGetMarketMyPredictionQueryKey,
  getGetTrendingMarketsQueryKey,
  getListMarketsQueryKey,
  getGetMeQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getMarketColors } from '@/lib/market-colors';
import { useAuth } from '@/lib/auth';
import { MarketDetailSkeleton } from '@/components/SkeletonLoader';

const CATEGORY_LABELS: Record<string, string> = {
  STYLE: 'Style',
  HOME: 'Home',
  CITY: 'City',
  REAL_ESTATE: 'Real Estate',
  WEATHER: 'Weather',
  CULTURE: 'Culture',
  LOCAL_PULSE: 'Local Pulse',
};

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [voted, setVoted] = useState<string | null>(null); // option key, 'YES', or 'NO'
  const [voting, setVoting] = useState(false);
  const [showAllContenders, setShowAllContenders] = useState(false);

  const { isAuthenticated, login } = useAuth();
  const queryClient = useQueryClient();

  const marketId = Number(id);
  const pair = getMarketColors(marketId);

  const { data: market, isLoading, error, refetch: refetchMarket } = useGetMarket(marketId, {
    query: { refetchInterval: (q: any) => q.state.data?.status === 'OPEN' ? 30_000 : false }
  });

  // Refetch on screen focus so returning from another screen picks up fresh data
  useFocusEffect(useCallback(() => {
    refetchMarket();
  }, [refetchMarket]));

  // ---- Countdown timer ----
  const clockType = useMemo(() => (market as any)?.clockType as string | undefined, [market]);
  const expireAt = useMemo(() => (market as any)?.expireAt as string | null | undefined, [market]);

  const computeCountdown = useCallback(() => {
    if (!clockType || clockType === 'EVERGREEN') return { label: null as string | null, urgent: false };
    if (clockType === 'RECURRING_PULSE') return { label: 'Recurring monthly', urgent: false };
    if (!expireAt) return { label: null as string | null, urgent: false };
    const msLeft = new Date(expireAt).getTime() - Date.now();
    // Freeze at "Closing soon" — never decrement below zero.
    if (msLeft <= 0) return { label: 'Closing soon', urgent: true };
    const totalSecs = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hrs = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    let label: string;
    if (days >= 7) label = `Closes in ${days}d`;
    else if (days >= 1) label = `Closes in ${days}d ${hrs}h`;
    else if (hrs >= 1) label = `Closes in ${hrs}h ${mins}m`;
    else if (mins >= 1) label = `Closes in ${mins}m ${secs}s`;
    else label = `Closes in ${secs}s`;
    return { label, urgent: msLeft < 60 * 60 * 1000 };
  }, [clockType, expireAt]);

  const [countdown, setCountdown] = useState<{ label: string | null; urgent: boolean }>({ label: null, urgent: false });
  // justExpired: true when the market expired while this screen was open
  const [justExpired, setJustExpired] = useState(false);
  const wasCountingRef = useRef(false);

  useEffect(() => {
    const initial = computeCountdown();
    setCountdown(initial);

    if (!clockType || clockType === 'EVERGREEN' || clockType === 'RECURRING_PULSE' || !expireAt) {
      wasCountingRef.current = false;
      return;
    }

    if (initial.label !== 'Closing soon') {
      wasCountingRef.current = true;
    } else {
      // Already expired before this render — no interval needed
      wasCountingRef.current = false;
      return;
    }

    const id = setInterval(() => {
      const next = computeCountdown();
      setCountdown(next);
      if (next.label === 'Closing soon') {
        // Market just expired mid-session — stop the interval and flag it
        if (wasCountingRef.current) {
          setJustExpired(true);
        }
        wasCountingRef.current = false;
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clockType, expireAt, computeCountdown]);
  const { data: predictions } = useGetMarketPredictions(marketId, {
    query: { refetchInterval: market?.status === 'OPEN' ? 15_000 : false }
  });
  const { data: tallyResult } = useGetMarketTally(marketId, {
    query: {
      queryKey: getGetMarketTallyQueryKey(marketId),
      // Poll every 30 s while open so BUZZ_OR_BOO and THE_CALL bars stay live
      refetchInterval: market?.status === 'OPEN' ? 30_000 : false,
    },
  });
  const { data: myPredictionData } = useGetMarketMyPrediction(marketId);
  const { data: platformUser } = useGetMe({
    query: { enabled: isAuthenticated, queryKey: getGetMeQueryKey() }
  });
  const mutation = useMakePrediction();

  // Seed `voted` from the server-authoritative my-prediction endpoint so the
  // Predict button is disabled immediately when a user revisits a market they
  // already voted on — independent of the capped recent-predictions list.
  useEffect(() => {
    if (!myPredictionData?.prediction || voted) return;
    setVoted(myPredictionData.prediction.choice);
  }, [myPredictionData, voted]);

  const handlePredict = useCallback(
    async (choice: string, isCallPick = false) => {
      if (voting || voted) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!isAuthenticated) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          'Sign in to predict',
          'Create your account to make predictions, earn tokens, and climb the rankings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log in', style: 'default', onPress: login },
          ],
        );
        return;
      }

      setVoting(true);
      // Fixed-stake formats (THE_CALL, BUZZ_OR_BOO, HOT_OR_NOT) use 10 FP; all others use 100
      const amount = (isCallPick || isHotOrNot || isBuzzOrBoo) ? 10 : 100;
      mutation.mutate(
        { id: marketId, data: { choice, amount } },
        {
          onSuccess: async () => {
            setVoted(choice);
            setVoting(false);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Refresh sentiment split and prediction lists so bars animate to the new split
            queryClient.invalidateQueries({ queryKey: getGetMarketQueryKey(marketId) });
            queryClient.invalidateQueries({ queryKey: getGetMarketPredictionsQueryKey(marketId) });
            queryClient.invalidateQueries({ queryKey: getGetMarketTallyQueryKey(marketId) });
            queryClient.invalidateQueries({ queryKey: getGetMarketMyPredictionQueryKey(marketId) });
            // Refresh feed bars so the split is up-to-date when the user navigates back
            queryClient.invalidateQueries({ queryKey: getGetTrendingMarketsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
          },
          onError: (err: any) => {
            setVoting(false);
            // ApiError places the parsed JSON body on err.data (not err.response.data)
            const msg = err?.data?.error ?? err?.message ?? 'Failed to submit prediction.';
            Alert.alert('Error', msg);
          },
        },
      );
    },
    [marketId, mutation, voted, voting, isAuthenticated, login, queryClient],
  );

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background, paddingTop: topPadding + 12, justifyContent: 'flex-start', alignItems: 'center' }]}>
        <MarketDetailSkeleton colors={colors} />
      </View>
    );
  }

  if (error || !market) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Market not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.muted }]}>
          <Text style={[styles.backBtnText, { color: colors.foreground }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Derive live percentages from tally when available (all YES/NO-style formats)
  const isBuzzOrBooFormat = market.marketFormat === 'BUZZ_OR_BOO';
  const liveTallyYes = tallyResult?.tallies?.['YES'] ?? 0;
  const liveTallyNo = tallyResult?.tallies?.['NO'] ?? 0;
  const liveTallyTotal = liveTallyYes + liveTallyNo;
  const yesPercent = liveTallyTotal > 0
    ? (liveTallyYes / liveTallyTotal) * 100
    : (market.yesPercent ?? 50);
  const noPercent = liveTallyTotal > 0
    ? (liveTallyNo / liveTallyTotal) * 100
    : (market.noPercent ?? 50);
  const yesFloor = Math.max(yesPercent, 3);
  const noFloor = Math.max(noPercent, 3);

  const isHotOrNot = market.marketFormat === 'HOT_OR_NOT';
  const isHeadToHead = market.marketFormat === 'HEAD_TO_HEAD';
  const isBuzzOrBoo = market.marketFormat === 'BUZZ_OR_BOO';
  const isTheCall = market.marketFormat === 'THE_CALL';
  const isMultiChoice = market.marketFormat === 'MULTI_CHOICE';
  const isBinaryFormat = isBuzzOrBoo || isHotOrNot || isHeadToHead || (!isTheCall && !isMultiChoice);

  const BUZZ_COLOR = '#CFEA3B';
  const BOO_COLOR = '#E8503E';
  const THE_CALL_ACCENT = '#7C5CFC';

  // Parse THE_CALL options from description JSON
  const theCallData = isTheCall ? (() => {
    try {
      const p = JSON.parse(market.description ?? '{}');
      if (Array.isArray(p.options)) return p as { options: { key: string; label: string }[]; context?: string };
      return null;
    } catch { return null; }
  })() : null;

  const theCallTally = tallyResult?.tallies ?? {};
  const theCallTotal = theCallData?.options.reduce((s, o) => s + (theCallTally[o.key] ?? 0), 0) ?? 0;

  // Parse MULTI_CHOICE contenders from description JSON
  const multiChoiceData = isMultiChoice ? (() => {
    try {
      const p = JSON.parse(market.description ?? '{}');
      if (Array.isArray(p.contenders)) return p as { contenders: { key: string; name: string; venue?: string }[]; metric?: string; period?: string };
      return null;
    } catch { return null; }
  })() : null;

  const multiChoiceTally = tallyResult?.tallies ?? {};
  const multiChoiceTotal = multiChoiceData?.contenders.reduce((s, c) => s + (multiChoiceTally[c.key] ?? 0), 0) ?? 0;

  const MULTI_CHOICE_COLORS = ['#CFEA3B', '#3ECDE8', '#E87B3E', '#8B5CF6', '#EC4899'];

  // Parse HEAD_TO_HEAD entity names from description JSON
  const h2hData = isHeadToHead ? (() => {
    try { const p = JSON.parse(market.description ?? '{}'); return p as { entityA?: string; entityB?: string; metric?: string; period?: string }; }
    catch { return null; }
  })() : null;

  const yesLabel = isHotOrNot ? 'HOT' : isBuzzOrBoo ? 'BUZZ' : isHeadToHead && h2hData?.entityA ? h2hData.entityA : 'YES';
  const noLabel = isHotOrNot ? 'NOT HOT' : isBuzzOrBoo ? 'BOO' : isHeadToHead && h2hData?.entityB ? h2hData.entityB : 'NO';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPadding + 60, paddingBottom: bottomPadding + 120 },
        ]}
      >
        {/* Hero card */}
        <LinearGradient
          colors={[pair.yes + 'E5', pair.no + 'F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1.2 }}
          style={styles.heroCard}
        >
          {/* Badges row — status left, share right */}
          <View style={[styles.badgesRow, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              <View style={[styles.catBadge, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                <Text style={styles.catBadgeText}>
                  {CATEGORY_LABELS[market.category] ?? market.category}
                </Text>
              </View>
              {market.category === 'LOCAL_PULSE' && (
                <View style={styles.hotBadge}>
                  <MaterialCommunityIcons name="fire" size={13} color="#CC2200" />
                  <Text style={styles.hotBadgeText}>HOT IN BOSTON</Text>
                </View>
              )}
              {market.status === 'SCHEDULED' ? (
                <View style={[styles.statusBadge, { backgroundColor: 'rgba(245,158,11,0.25)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }]}>
                  <Text style={[styles.statusText, { color: '#f59e0b' }]}>🗓 COMING SOON</Text>
                </View>
              ) : market.status === 'CLOSED' ? (
                <View style={[styles.statusBadge, { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[styles.statusText, { color: 'rgba(255,255,255,0.65)' }]}>🔒 CLOSED</Text>
                </View>
              ) : market.status === 'RESOLVED' ? (
                <View style={[styles.statusBadge, { backgroundColor: 'rgba(207,234,59,0.18)', borderWidth: 1, borderColor: 'rgba(207,234,59,0.35)' }]}>
                  <Text style={[styles.statusText, { color: '#CFEA3B' }]}>✓ RESOLVED</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: 'rgba(148,194,19,0.3)' }]}>
                  <View style={[styles.statusDot, { backgroundColor: '#94C213' }]} />
                  <Text style={styles.statusText}>LIVE</Text>
                </View>
              )}
            </View>
            {/* Share button */}
            <TouchableOpacity
              onPress={() => {
                Share.share({
                  title: market.question || market.title,
                  message: `Check out this market on BuzzOrBoo: ${market.question || market.title}`,
                }).catch(() => {});
              }}
              style={{ padding: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="share-2" size={16} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.heroTitle}>{market.question || market.title}</Text>

          {/* Format label */}
          {isHotOrNot && (() => {
            const resolvedOutcome = (market as any).resolvedOutcome as string | null | undefined;
            const isResolved = market.status === 'RESOLVED';
            return (
              <View>
                <View style={styles.fmtRow}>
                  <MaterialCommunityIcons name="fire" size={16} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.fmtText}>Hot or Not</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: '#F97316', opacity: isResolved && resolvedOutcome === 'NO' ? 0.35 : 1 }}>🔥 HOT</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.5)' }}>vs</Text>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.7)', opacity: isResolved && resolvedOutcome === 'YES' ? 0.35 : 1 }}>❄️ NOT HOT</Text>
                </View>
                {isResolved && resolvedOutcome && (
                  <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: resolvedOutcome === 'YES' ? 'rgba(249,115,22,0.2)' : 'rgba(107,114,128,0.2)', alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: resolvedOutcome === 'YES' ? '#f97316' : '#9ca3af' }}>
                      {resolvedOutcome === 'YES' ? '🔥 HOT wins' : '❄️ NOT wins'}
                    </Text>
                  </View>
                )}
                {market.status === 'CLOSED' && !isResolved && (
                  <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔒 Closed · Awaiting result</Text>
                  </View>
                )}
              </View>
            );
          })()}
          {isHeadToHead && (() => {
            const h2hDesc = (() => {
              try { const p = JSON.parse(market.description ?? '{}'); return p as { entityA?: string; entityB?: string; metric?: string; period?: string }; }
              catch { return null; }
            })();
            const resolvedOutcome = (market as any).resolvedOutcome as string | null | undefined;
            const isResolved = market.status === 'RESOLVED';
            const winner = resolvedOutcome === 'YES' ? (h2hDesc?.entityA ?? 'Side A') : resolvedOutcome === 'NO' ? (h2hDesc?.entityB ?? 'Side B') : null;
            return (
              <View>
                <View style={styles.fmtRow}>
                  <MaterialCommunityIcons name="sword-cross" size={16} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.fmtText}>Head to Head</Text>
                </View>
                {h2hDesc?.entityA && h2hDesc?.entityB && (
                  <View style={{ marginTop: 10, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <Text style={{ color: '#3B82F6', fontFamily: 'Inter_700Bold', fontSize: 15, flex: 1, textAlign: 'right', opacity: isResolved && resolvedOutcome === 'NO' ? 0.35 : 1 }} numberOfLines={2}>{h2hDesc.entityA}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_700Bold', fontSize: 13 }}>vs</Text>
                      <Text style={{ color: '#8B5CF6', fontFamily: 'Inter_700Bold', fontSize: 15, flex: 1, textAlign: 'left', opacity: isResolved && resolvedOutcome === 'YES' ? 0.35 : 1 }} numberOfLines={2}>{h2hDesc.entityB}</Text>
                    </View>
                    {(h2hDesc.metric || h2hDesc.period) ? (
                      <Text style={{ textAlign: 'center', fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.5)', marginTop: 6 }} numberOfLines={1}>
                        📊 {[h2hDesc.metric, h2hDesc.period].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                )}
                {isResolved && winner && (
                  <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(59,130,246,0.18)', alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#60a5fa' }}>
                      🏆 {winner} wins
                    </Text>
                  </View>
                )}
                {market.status === 'CLOSED' && !isResolved && (
                  <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔒 Closed · Awaiting result</Text>
                  </View>
                )}
              </View>
            );
          })()}
          {isBuzzOrBoo && (() => {
            const resolvedOutcome = (market as any).resolvedOutcome as string | null | undefined;
            const isResolved = market.status === 'RESOLVED';
            const isOpen = market.status === 'OPEN';
            return (
              <View>
                <View style={[styles.fmtRow, { justifyContent: 'space-between', alignItems: 'center' }]}>
                  <Text style={styles.fmtText}>⚡ Buzz or Boo</Text>
                  {isOpen && (
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>10 FP · pool split</Text>
                  )}
                </View>
                {isResolved && resolvedOutcome && (
                  <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: resolvedOutcome === 'YES' ? 'rgba(207,234,59,0.18)' : 'rgba(255,60,120,0.18)', alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: resolvedOutcome === 'YES' ? '#CFEA3B' : '#FF3C78' }}>
                      {resolvedOutcome === 'YES' ? '⚡ BUZZ won' : '👎 BOO won'}
                    </Text>
                  </View>
                )}
                {market.status === 'CLOSED' && !isResolved && (
                  <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔒 Closed · Awaiting result</Text>
                  </View>
                )}
              </View>
            );
          })()}
          {isTheCall && (
            <View style={[styles.fmtRow, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <Text style={styles.fmtText}>🎯 The Call</Text>
              {market.status === 'OPEN' && (
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>10 FP · one pick</Text>
              )}
            </View>
          )}
          {isMultiChoice && (
            <View style={[styles.fmtRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Text style={styles.fmtText}>👑 Buzz Battle</Text>
                {market.status === 'OPEN' && (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>pool split · pick a contender</Text>
                )}
              </View>
              {market.status === 'CLOSED' && market.status !== 'RESOLVED' && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔒 Closed · Awaiting result</Text>
                </View>
              )}
            </View>
          )}

          {/* SCHEDULED: "Coming soon" placeholder suppresses all probability bars */}
          {market.status === 'SCHEDULED' && (
            <View style={{ marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: 4, alignItems: 'center' }}>
              <Text style={{ color: '#f59e0b', fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' }}>
                🗓 Opening soon — check back to make your call
              </Text>
              {market.scheduledFor && (
                <Text style={{ color: 'rgba(245,158,11,0.7)', fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                  Opens {new Date(market.scheduledFor).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(market.scheduledFor).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </Text>
              )}
            </View>
          )}

          {/* THE_CALL: option vote bars */}
          {!market.status.startsWith('SCHED') && isTheCall && theCallData ? (
            <View style={styles.callOptions}>
              {theCallData.options.map((o) => {
                const count = theCallTally[o.key] ?? 0;
                const pct = theCallTotal > 0 ? Math.round((count / theCallTotal) * 100) : 0;
                const barFlex = theCallTotal > 0 ? Math.max(pct, 3) : 0;
                const isWinner = market.status === 'RESOLVED' && market.resolvedOutcome === o.key;
                return (
                  <View key={o.key} style={[
                    styles.callOptionRow,
                    isWinner && { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
                  ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={[styles.callOptionLabel, isWinner && { color: '#CFEA3B' }]} numberOfLines={1}>{o.label}</Text>
                      {isWinner && (
                        <View style={{ backgroundColor: '#CFEA3B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: '#000', fontSize: 10, fontFamily: 'Inter_700Bold' }}>WINNER</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.callBarTrack}>
                      {barFlex > 0 && <View style={[styles.callBarFill, { flex: barFlex, backgroundColor: isWinner ? '#CFEA3B' : THE_CALL_ACCENT }]} />}
                      <View style={{ flex: Math.max(100 - barFlex, 3), backgroundColor: 'rgba(255,255,255,0.15)' }} />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.callPct, isWinner && { color: '#CFEA3B' }]}>
                        {theCallTotal > 0 ? `${pct}%` : '—'}
                      </Text>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter_400Regular' }}>
                        {count} {count === 1 ? 'pick' : 'picks'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : !market.status.startsWith('SCHED') && isMultiChoice && multiChoiceData ? (
            <View style={styles.callOptions}>
              {multiChoiceTotal === 0 && market.status !== 'RESOLVED' && (
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingVertical: 6, fontFamily: 'Inter_400Regular' }}>
                  No votes yet — be the first to back a contender
                </Text>
              )}
              {(showAllContenders ? multiChoiceData.contenders : multiChoiceData.contenders.slice(0, 5)).map((c, i) => {
                const count = multiChoiceTally[c.key] ?? 0;
                const pct = multiChoiceTotal > 0 ? Math.round((count / multiChoiceTotal) * 100) : 0;
                const barFlex = multiChoiceTotal > 0 ? Math.max(pct, 3) : 0;
                const color = MULTI_CHOICE_COLORS[i % MULTI_CHOICE_COLORS.length];
                const isWinner = market.status === 'RESOLVED' && market.resolvedOutcome === c.key;
                return (
                  <View key={c.key} style={[
                    styles.callOptionRow,
                    isWinner && { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
                  ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={[styles.callOptionLabel, isWinner && { color: '#CFEA3B' }]} numberOfLines={1}>{c.name}</Text>
                      {isWinner && (
                        <View style={{ backgroundColor: '#CFEA3B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: '#000', fontSize: 10, fontFamily: 'Inter_700Bold' }}>WINNER</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.callBarTrack}>
                      <View style={[styles.callBarFill, { flex: barFlex, backgroundColor: isWinner ? '#CFEA3B' : color }]} />
                      <View style={{ flex: Math.max(100 - barFlex, 3), backgroundColor: 'rgba(255,255,255,0.15)' }} />
                    </View>
                    <Text style={[styles.callPct, isWinner && { color: '#CFEA3B' }]}>
                      {multiChoiceTotal > 0 ? `${pct}%` : '—'}
                    </Text>
                  </View>
                );
              })}
              {multiChoiceData.contenders.length > 5 && (
                <TouchableOpacity
                  onPress={() => setShowAllContenders(v => !v)}
                  style={{ paddingVertical: 6, alignItems: 'center' }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter_600SemiBold' }}>
                    {showAllContenders
                      ? 'Show less ↑'
                      : `+${multiChoiceData.contenders.length - 5} more contender${multiChoiceData.contenders.length - 5 !== 1 ? 's' : ''} ↓`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : !market.status.startsWith('SCHED') && !isTheCall && !isMultiChoice ? (
            (() => {
              const hasVotes = (market.totalPredictions ?? 0) > 0 || buzzTallyTotal > 0;
              if (!hasVotes) {
                const isMktClosed = market.status === 'CLOSED';
                return (
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
                    {isMktClosed
                      ? (isBuzzOrBoo ? 'No verdicts recorded before close.' : isHotOrNot ? 'No verdicts recorded before close.' : 'No predictions recorded before close.')
                      : (isBuzzOrBoo ? 'No verdicts yet — be first to weigh in' : isHotOrNot ? 'No verdicts yet — cast the first call' : 'No predictions yet — make the first call')}
                  </Text>
                );
              }
              return (
                <>
                  {/* Big probability numbers */}
                  <View style={styles.bigProb}>
                    <View style={styles.bigProbSide}>
                      <Text style={styles.bigPct}>{Math.round(yesPercent)}%</Text>
                      <Text style={styles.bigProbLabel}>{yesLabel}</Text>
                    </View>
                    <View style={styles.bigProbDivider} />
                    <View style={[styles.bigProbSide, styles.bigProbRight]}>
                      <Text style={styles.bigPct}>{Math.round(noPercent)}%</Text>
                      <Text style={styles.bigProbLabel}>{noLabel}</Text>
                    </View>
                  </View>

                  {/* Bar */}
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barYes,
                        { flex: yesFloor, backgroundColor: isBuzzOrBoo ? BUZZ_COLOR : isHotOrNot ? '#f97316' : 'rgba(255,255,255,0.9)' },
                      ]}
                    />
                    <View
                      style={[
                        styles.barNo,
                        { flex: noFloor, backgroundColor: isBuzzOrBoo ? BOO_COLOR : isHotOrNot ? '#6b7280' : 'rgba(255,255,255,0.3)' },
                      ]}
                    />
                  </View>

                  {/* Per-side vote counts */}
                  {liveTallyTotal > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular' }}>
                        {liveTallyYes.toLocaleString()} {isBuzzOrBoo ? 'BUZZ' : isHotOrNot ? 'HOT' : 'YES'}
                      </Text>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular' }}>
                        {market.status === 'CLOSED' && market.status !== 'RESOLVED' ? '🔒 at close' : `${liveTallyTotal.toLocaleString()} total ${isBuzzOrBoo ? (liveTallyTotal === 1 ? 'verdict' : 'verdicts') : isHotOrNot ? (liveTallyTotal === 1 ? 'verdict' : 'verdicts') : isHeadToHead ? (liveTallyTotal === 1 ? 'pick' : 'picks') : (liveTallyTotal === 1 ? 'prediction' : 'predictions')}`}
                      </Text>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular' }}>
                        {liveTallyNo.toLocaleString()} {isBuzzOrBoo ? 'BOO' : isHotOrNot ? 'NOT HOT' : 'NO'}
                      </Text>
                    </View>
                  )}
                </>
              );
            })()
          ) : null}

          {/* Stats */}
          <View style={styles.statsRow}>
            {market.status === 'SCHEDULED' ? (
              <>
                <Feather name="calendar" size={13} color="#f59e0b" />
                <Text style={[styles.statText, { color: '#f59e0b' }]}>
                  {market.scheduledFor
                    ? `Opens ${new Date(market.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : market.closesAt
                    ? `Opens before ${new Date(market.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : 'Opening soon'}
                </Text>
              </>
            ) : (
              <>
                <Feather name="users" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.statText}>{(() => { const binaryN = (tally?.totals?.yes ?? 0) + (tally?.totals?.no ?? 0); const n = isMultiChoice ? multiChoiceTotal : (isBinaryFormat && binaryN > 0) ? binaryN : market.totalPredictions; const noun = isBuzzOrBoo || isHotOrNot ? (n === 1 ? 'verdict' : 'verdicts') : isHeadToHead ? (n === 1 ? 'pick' : 'picks') : isTheCall ? (n === 1 ? 'pick' : 'picks') : isMultiChoice ? (n === 1 ? 'vote' : 'votes') : (n === 1 ? 'prediction' : 'predictions'); return `${n} ${noun}`; })()}</Text>
                {market.status === 'CLOSED' ? (
                  <>
                    <View style={styles.statDot} />
                    <Feather name="lock" size={13} color="rgba(255,255,255,0.55)" />
                    <Text style={[styles.statText, { color: 'rgba(255,255,255,0.55)' }]}>
                      {market.closesAt
                        ? `Closed ${new Date(market.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · Awaiting resolution`
                        : 'Closed · Awaiting resolution'}
                    </Text>
                  </>
                ) : countdown.label ? (
                  <>
                    <View style={styles.statDot} />
                    <Feather name="clock" size={13} color={countdown.urgent ? '#FF6B6B' : 'rgba(255,255,255,0.7)'} />
                    <Text style={[styles.statText, countdown.urgent && styles.statTextUrgent]}>
                      {countdown.label}
                    </Text>
                  </>
                ) : market.closesAt ? (
                  <>
                    <View style={styles.statDot} />
                    <Feather name="clock" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.statText}>
                      Closes {new Date(market.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </>
                ) : null}
              </>
            )}
          </View>
        </LinearGradient>

        {/* Refresh nudge — shown when the market expired while this screen was open */}
        {justExpired && market.status === 'OPEN' && (
          <View style={[styles.expiredNudge, { backgroundColor: colors.card, borderColor: 'rgba(245,158,11,0.4)' }]}>
            <Feather name="clock" size={14} color="#F59E0B" />
            <Text style={[styles.expiredNudgeText, { color: colors.foreground }]}>
              This market just closed —{' '}
              <Text style={{ color: '#F59E0B', fontWeight: '700' }}>pull down to refresh</Text>
            </Text>
          </View>
        )}

        {/* Description — skip raw JSON for THE_CALL / MULTI_CHOICE (options are shown in the hero); skip for SCHEDULED (coming soon placeholder shown in hero) */}
        {market.description && !isTheCall && !isMultiChoice && market.status !== 'SCHEDULED' && (() => {
          // For H2H, the description field may be structured JSON — try to extract a human-readable context string
          let descText = market.description;
          if (isHeadToHead) {
            try {
              const parsed = JSON.parse(market.description);
              descText = parsed.context ?? parsed.description ?? parsed.subtitle ?? null;
            } catch {
              // If it's not JSON, use as-is (but skip if it looks like a raw JSON object literal)
              if (market.description.trim().startsWith('{')) descText = null;
            }
          }
          if (!descText) return null;
          return (
            <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
              <Text style={[styles.descText, { color: colors.foreground }]}>{descText}</Text>
            </View>
          );
        })()}
        {/* THE_CALL context */}
        {isTheCall && theCallData?.context && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>CONTEXT</Text>
            <Text style={[styles.descText, { color: colors.foreground }]}>{theCallData.context}</Text>
          </View>
        )}
        {/* MULTI_CHOICE metric / period */}
        {isMultiChoice && multiChoiceData?.metric && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>METRIC</Text>
            <Text style={[styles.descText, { color: colors.foreground }]}>
              {multiChoiceData.metric}{multiChoiceData.period ? ` · ${multiChoiceData.period}` : ''}
            </Text>
          </View>
        )}

        {/* Personalized voted badge — shown whenever the user has a recorded vote */}
        {voted && (() => {
          const resolvedOutcome = (market as any).resolvedOutcome as string | null | undefined;
          const isResolved = market.status === 'RESOLVED';
          const isCorrect = isResolved && resolvedOutcome != null && voted === resolvedOutcome;
          const isWrong = isResolved && resolvedOutcome != null && voted !== resolvedOutcome;
          return (
            <View style={[
              styles.descCard,
              {
                backgroundColor: isCorrect ? '#22C55E18' : isWrong ? '#EF444418' : colors.card,
                borderColor: isCorrect ? '#22C55E50' : isWrong ? '#EF444440' : colors.border,
              },
            ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>YOUR CALL</Text>
                {isCorrect && <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: '#22C55E' }}>✓ CORRECT</Text>}
                {isWrong && <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: '#EF4444' }}>✗ MISSED</Text>}
              </View>
              {/* Stake amount */}
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 6 }}>
                {myPredictionData?.prediction?.amount ?? ((isTheCall || isBuzzOrBoo || isHotOrNot) ? 10 : 100)} FP staked
              </Text>
              <View style={styles.votedBadgeRow}>
                {isBuzzOrBoo ? (
                  <View style={[styles.votedBadge, { backgroundColor: (voted === 'YES' ? BUZZ_COLOR : BOO_COLOR) + '22' }]}>
                    <Text style={[styles.votedBadgeText, { color: voted === 'YES' ? BUZZ_COLOR : BOO_COLOR }]}>
                      {voted === 'YES' ? '⚡ BUZZ' : '👎 BOO'}
                      {liveTallyTotal > 0 && (
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, opacity: 0.75 }}>
                          {' · '}{Math.round(voted === 'YES' ? yesPercent : noPercent)}%
                        </Text>
                      )}
                    </Text>
                  </View>
                ) : isTheCall ? (() => {
                  const tcCount = theCallTally[voted] ?? 0;
                  const tcPct = theCallTotal > 0 ? Math.round((tcCount / theCallTotal) * 100) : null;
                  return (
                    <View style={[styles.votedBadge, { backgroundColor: THE_CALL_ACCENT + '22' }]}>
                      <Text style={[styles.votedBadgeText, { color: THE_CALL_ACCENT }]}>
                        🎯{' '}{theCallData?.options.find(o => o.key === voted)?.label ?? voted}
                        {tcPct != null && (
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, opacity: 0.75 }}>
                            {' · '}{tcPct}%
                          </Text>
                        )}
                      </Text>
                    </View>
                  );
                })() : isMultiChoice ? (() => {
                  const mcCount = multiChoiceTally[voted] ?? 0;
                  const mcPct = multiChoiceTotal > 0 ? Math.round((mcCount / multiChoiceTotal) * 100) : null;
                  return (
                    <View style={[styles.votedBadge, { backgroundColor: pair.yes + '22' }]}>
                      <Text style={[styles.votedBadgeText, { color: pair.yes }]}>
                        👑{' '}{multiChoiceData?.contenders.find(c => c.key === voted)?.name ?? voted}
                        {mcPct != null && (
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, opacity: 0.75 }}>
                            {' · '}{mcPct}%
                          </Text>
                        )}
                      </Text>
                    </View>
                  );
                })() : (
                  <View style={[styles.votedBadge, { backgroundColor: (voted === 'YES' ? pair.yes : pair.no) + '22' }]}>
                    <Text style={[styles.votedBadgeText, { color: voted === 'YES' ? pair.yes : pair.no }]}>
                      {isHotOrNot
                        ? (voted === 'YES' ? '🔥 HOT' : '❄️ NOT HOT')
                        : isHeadToHead
                          ? (voted === 'YES' ? `⚔️ ${h2hData?.entityA ?? 'Side A'}` : `⚔️ ${h2hData?.entityB ?? 'Side B'}`)
                          : (voted === 'YES' ? '✅ YES' : '❌ NO')}
                      {liveTallyTotal > 0 && (
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, opacity: 0.75 }}>
                          {' · '}{Math.round(voted === 'YES' ? yesPercent : noPercent)}%
                        </Text>
                      )}
                    </Text>
                  </View>
                )}
                {isResolved && resolvedOutcome && voted !== resolvedOutcome && (
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                    → {isHotOrNot
                        ? (resolvedOutcome === 'YES' ? '🔥 HOT' : '❄️ NOT HOT')
                        : isBuzzOrBoo
                          ? (resolvedOutcome === 'YES' ? '⚡ BUZZ' : '👎 BOO')
                          : isHeadToHead
                            ? (resolvedOutcome === 'YES' ? `⚔️ ${h2hData?.entityA ?? 'Side A'}` : `⚔️ ${h2hData?.entityB ?? 'Side B'}`)
                            : resolvedOutcome} won
                  </Text>
                )}
              </View>
              {isResolved && (
                <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 6, color: isCorrect ? '#22C55E' : '#EF4444' }}>
                  {isCorrect
                    ? (myPredictionData?.prediction?.tokensEarned != null ? `+${myPredictionData.prediction.tokensEarned} FP earned` : '+FP earned')
                    : `-${myPredictionData?.prediction?.amount ?? ((isTheCall || isBuzzOrBoo || isHotOrNot) ? 10 : 100)} FP lost`}
                </Text>
              )}
              {market.status === 'CLOSED' && !isResolved && (
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 8, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                  ⏳ Awaiting resolution
                </Text>
              )}
            </View>
          );
        })()}

        {/* Resolution source */}
        {market.resolutionSource && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>RESOLVED BY</Text>
            <Text style={[styles.descText, { color: colors.foreground }]}>{market.resolutionSource}</Text>
          </View>
        )}

        {/* Recent predictions */}
        {predictions && predictions.length === 0 && market.status === 'OPEN' && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>
              {isBuzzOrBoo ? 'RECENT VERDICTS' : isTheCall ? 'RECENT PICKS' : isMultiChoice ? 'RECENT VOTES' : 'RECENT PREDICTIONS'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12, fontFamily: 'Inter_400Regular' }}>
              No activity yet — be the first to {isBuzzOrBoo || isHotOrNot ? 'give your verdict' : isTheCall ? 'make your pick' : isMultiChoice ? 'back a contender' : 'make a prediction'}
            </Text>
          </View>
        )}
        {predictions && predictions.length > 0 && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>
              {isBuzzOrBoo || isHotOrNot ? 'RECENT VERDICTS' : isTheCall || isHeadToHead ? 'RECENT PICKS' : isMultiChoice ? 'RECENT VOTES' : 'RECENT PREDICTIONS'}
            </Text>
            {predictions.slice(0, 5).map((p) => {
              let choiceColor: string;
              let choiceLabel: string;
              if (isBuzzOrBoo) {
                const isBuzz = p.choice === 'YES';
                choiceColor = isBuzz ? BUZZ_COLOR : BOO_COLOR;
                choiceLabel = isBuzz ? '⚡ BUZZ' : '👎 BOO';
              } else if (isTheCall) {
                choiceColor = THE_CALL_ACCENT;
                const opt = theCallData?.options.find((o) => o.key === p.choice);
                choiceLabel = opt ? `🎯 ${opt.label}` : `🎯 ${p.choice}`;
              } else if (isMultiChoice) {
                choiceColor = pair.yes;
                const contender = multiChoiceData?.contenders?.find((c: any) => c.key === p.choice);
                choiceLabel = contender ? `👑 ${contender.name}` : `👑 ${p.choice}`;
              } else if (isHotOrNot) {
                const isHot = p.choice === 'YES';
                choiceColor = isHot ? '#FF6B35' : '#4A9EFF';
                choiceLabel = isHot ? '🔥 HOT' : '❄️ NOT HOT';
              } else {
                const isYes = p.choice === 'YES';
                choiceColor = isYes ? pair.yes : pair.no;
                choiceLabel = isYes ? '✅ YES' : '❌ NO';
              }
              const predResolved = market.status === 'RESOLVED' && p.isCorrect != null;
              const predWon = predResolved && p.isCorrect;
              return (
                <View key={p.id} style={[styles.predRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <View
                      style={[
                        styles.predChoiceBadge,
                        { backgroundColor: choiceColor + '33' },
                      ]}
                    >
                      <Text style={[styles.predChoice, { color: choiceColor }]}>
                        {choiceLabel}
                      </Text>
                    </View>
                    {predResolved && (
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: predWon ? '#22C55E' : '#EF4444' }}>
                        {predWon ? '✓' : '✗'}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {predResolved && (
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: predWon ? '#22C55E' : '#EF4444' }}>
                        {predWon ? `+${p.tokensEarned ?? 0}` : `-${p.amount}`} FP
                      </Text>
                    )}
                    <Text style={[styles.predMeta, { color: colors.mutedForeground }]}>
                      {p.amount} FP · {new Date(p.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Related Markets CTA */}
        <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center', paddingVertical: 18 }]}>
          <Text style={[styles.descLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>
            EXPLORE MORE
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/predict')}
            style={{ backgroundColor: '#a3e635', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            <Text style={{ color: '#1a1a1a', fontSize: 13, fontFamily: 'Inter_700Bold' }}>
              Browse all markets →
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sticky pick buttons */}
      {market.status === 'OPEN' && (
        <View
          style={[
            styles.stickyButtons,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: bottomPadding + 16,
            },
          ]}
        >
          {!voted && isAuthenticated && platformUser && (
            <View style={styles.balanceRow}>
              <Feather name="zap" size={12} color={colors.primary} />
              <Text style={[styles.balanceText, { color: colors.mutedForeground }]}>
                {platformUser.tokenBalance.toLocaleString()} FP available
              </Text>
            </View>
          )}
          {voted ? (
            <View style={styles.votedContainer}>
              <View style={styles.votedRow}>
                <Feather name="check-circle" size={20} color={colors.primary} />
                <Text style={[styles.votedText, { color: colors.foreground }]}>
                  {isTheCall
                    ? (() => {
                        const opt = theCallData?.options.find((o) => o.key === voted);
                        return opt ? `🎯 Picked: ${opt.label}` : '🎯 Pick cast!';
                      })()
                    : isMultiChoice
                      ? (() => {
                          const c = multiChoiceData?.contenders.find((x) => x.key === voted);
                          return c ? `👑 Picked: ${c.name}` : '👑 Pick cast!';
                        })()
                    : isBuzzOrBoo
                      ? voted === 'YES'
                        ? '⚡ Buzzed — nice call!'
                        : '👎 Boo\'d — noted!'
                    : isHotOrNot
                      ? voted === 'YES'
                        ? '🔥 HOT — nice call!'
                        : '❄️ NOT HOT — noted!'
                    : isHeadToHead
                      ? `⚔️ ${voted === 'YES' ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')} — you're in!`
                      : `Predicted ${voted} — nice call!`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.shareAfterVoteBtn, { borderColor: colors.border }]}
                onPress={() => router.push('/(tabs)/')}
              >
                <Feather name="arrow-left" size={14} color={colors.mutedForeground} />
                <Text style={[styles.shareAfterVoteText, { color: colors.mutedForeground }]}>Back to discover</Text>
              </TouchableOpacity>
            </View>
          ) : isTheCall && theCallData ? (
            /* THE_CALL: vertical stack of option buttons with proportional bars */
            <View style={styles.callButtonColumn}>
              {theCallData.options.map((o) => {
                const count = theCallTally[o.key] ?? 0;
                const pct = theCallTotal > 0 ? Math.round((count / theCallTotal) * 100) : 0;
                const hasData = theCallTotal > 0;
                return (
                  <TouchableOpacity
                    key={o.key}
                    activeOpacity={0.85}
                    onPress={() => handlePredict(o.key, true)}
                    disabled={voting}
                    style={[styles.callPickBtn, { borderColor: THE_CALL_ACCENT + '66', backgroundColor: THE_CALL_ACCENT + '15', paddingBottom: hasData ? 6 : undefined }]}
                  >
                    {voting ? (
                      <ActivityIndicator color={THE_CALL_ACCENT} />
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <Text style={[styles.callPickLabel, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{o.label}</Text>
                          <Text style={[styles.callPickPct, { color: THE_CALL_ACCENT }]}>{hasData ? `${count} · ${pct}%` : '—'}</Text>
                        </View>
                        {hasData && (
                          <View style={{ height: 3, width: '100%', backgroundColor: 'rgba(124,92,252,0.15)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                            <View style={{ width: `${Math.max(pct, 2)}%`, height: '100%', backgroundColor: THE_CALL_ACCENT, borderRadius: 2 }} />
                          </View>
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : isMultiChoice && multiChoiceData ? (
            /* MULTI_CHOICE: vertical stack of contender buttons */
            <View style={styles.callButtonColumn}>
              {multiChoiceTotal === 0 && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 8 }}>
                  No picks yet — back the first contender!
                </Text>
              )}
              {(showAllContenders ? multiChoiceData.contenders : multiChoiceData.contenders.slice(0, 5)).map((c, i) => {
                const count = multiChoiceTally[c.key] ?? 0;
                const pct = multiChoiceTotal > 0 ? Math.round((count / multiChoiceTotal) * 100) : 0;
                const color = MULTI_CHOICE_COLORS[i % MULTI_CHOICE_COLORS.length];
                return (
                  <TouchableOpacity
                    key={c.key}
                    activeOpacity={0.85}
                    onPress={() => handlePredict(c.key, true)}
                    disabled={voting}
                    style={[styles.callPickBtn, { borderColor: color + '66', backgroundColor: color + '15' }]}
                  >
                    {voting ? (
                      <ActivityIndicator color={color} />
                    ) : (
                      <>
                        <Text style={[styles.callPickLabel, { color: colors.foreground }]} numberOfLines={1}>{c.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.callPickPct, { color: colors.mutedForeground, fontSize: 11 }]}>{count}</Text>
                          <Text style={[styles.callPickPct, { color }]}>{multiChoiceTotal > 0 ? `${pct}%` : '—'}</Text>
                        </View>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
              {multiChoiceData.contenders.length > 5 && (
                <TouchableOpacity
                  onPress={() => setShowAllContenders(v => !v)}
                  style={{ paddingVertical: 6, alignItems: 'center' }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>
                    {showAllContenders
                      ? 'Show less ↑'
                      : `+${multiChoiceData.contenders.length - 5} more contender${multiChoiceData.contenders.length - 5 !== 1 ? 's' : ''} ↓`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Standard YES / NO / BUZZ BOO / H2H buttons */
            <>
            {isBuzzOrBoo && !voted && (
              <View style={{ paddingHorizontal: 4, marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }}>⚡ Cast your verdict</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>10 FP · pool split among winners</Text>
                </View>
                {(market.totalPredictions ?? 0) === 0 && (
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, opacity: 0.65, marginTop: 3, textAlign: 'center' }}>
                    Est. return: <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>~20–50 FP</Text> · varies with the crowd
                  </Text>
                )}
              </View>
            )}
            {isHotOrNot && !voted && (
              <View style={{ paddingHorizontal: 4, marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }}>🔥 Is it hot?</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>10 FP · pool split among winners</Text>
                </View>
                {(market.totalPredictions ?? 0) === 0 && (
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, opacity: 0.65, marginTop: 3, textAlign: 'center' }}>
                    Est. return: <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>~20–50 FP</Text> · varies with the crowd
                  </Text>
                )}
              </View>
            )}
            {isHeadToHead && h2hData && !voted && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }}>⚔️ Pick your side</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>100 FP stake · winner takes pool</Text>
              </View>
            )}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handlePredict('YES')}
                disabled={voting}
                style={[
                  styles.predictBtn,
                  { backgroundColor: isBuzzOrBoo ? '#CFEA3B' : pair.yes },
                ]}
              >
                {voting ? (
                  <ActivityIndicator color={isBuzzOrBoo ? '#1A1A1A' : '#FFFFFF'} />
                ) : (
                  <>
                    {isHotOrNot && <MaterialCommunityIcons name="fire" size={18} color="#FFFFFF" />}
                    <Text
                      style={[
                        styles.predictBtnText,
                        isBuzzOrBoo && { color: '#1A1A1A' },
                      ]}
                    >
                      {isBuzzOrBoo ? '⚡ BUZZ' : isHotOrNot ? '🔥 HOT' : yesLabel}
                    </Text>
                    <Text
                      style={[
                        styles.predictBtnPct,
                        isBuzzOrBoo && { color: 'rgba(0,0,0,0.6)' },
                        (market.totalPredictions ?? 0) === 0 && { opacity: 0.45 },
                      ]}
                    >
                      {(market.totalPredictions ?? 0) > 0 ? `${Math.round(yesPercent)}%` : '—'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handlePredict('NO')}
                disabled={voting}
                style={[
                  styles.predictBtn,
                  { backgroundColor: isBuzzOrBoo ? '#E8503E' : pair.no },
                ]}
              >
                {voting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    {isHotOrNot && <MaterialCommunityIcons name="snowflake" size={18} color="#FFFFFF" />}
                    <Text style={styles.predictBtnText}>
                      {isBuzzOrBoo ? '👎 BOO' : isHotOrNot ? '❄️ NOT HOT' : noLabel}
                    </Text>
                    <Text style={[styles.predictBtnPct, (market.totalPredictions ?? 0) === 0 && { opacity: 0.45 }]}>
                      {(market.totalPredictions ?? 0) > 0 ? `${Math.round(noPercent)}%` : '—'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            </>
          )}
        </View>
      )}

      {market.status !== 'OPEN' && (
        <View
          style={[
            styles.stickyButtons,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: bottomPadding + 16,
            },
          ]}
        >
          <View style={[styles.closedBadge, { backgroundColor: colors.muted }]}>
            <Feather name="lock" size={16} color={colors.mutedForeground} />
            <Text style={[styles.closedText, { color: colors.mutedForeground }]}>
              {(() => {
                const resolvedOutcome = (market as any).resolvedOutcome as string | null | undefined;
                if (market.status === 'RESOLVED' && resolvedOutcome) {
                  const label = isBuzzOrBoo
                    ? (resolvedOutcome === 'YES' ? '⚡ BUZZ won' : '👎 BOO won')
                    : isTheCall
                      ? (() => {
                          const opt = theCallData?.options.find(o => o.key === resolvedOutcome);
                          return opt ? `✓ ${opt.label}` : `✓ ${resolvedOutcome}`;
                        })()
                      : isMultiChoice
                        ? (() => {
                            const c = multiChoiceData?.contenders.find(x => x.key === resolvedOutcome);
                            return c ? `👑 ${c.name}` : `✓ ${resolvedOutcome}`;
                          })()
                        : isHeadToHead
                        ? (() => {
                            const winner = resolvedOutcome === 'YES'
                              ? (h2hData?.entityA ?? 'Side A')
                              : (h2hData?.entityB ?? 'Side B');
                            return `⚔️ ${winner} wins`;
                          })()
                        : isHotOrNot
                        ? (resolvedOutcome === 'YES' ? '🔥 HOT wins' : '❄️ NOT wins')
                        : `✓ ${resolvedOutcome}`;
                  return `${label} · Resolved`;
                }
                if (market.status === 'SCHEDULED') {
                  return '🗓 Coming soon · Predictions open when live';
                }
                return market.status === 'CLOSED' ? 'Predictions closed · Awaiting resolution' : `Market ${market.status.toLowerCase()} · Predictions closed`;
              })()}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.replace('/(tabs)/')}
            style={[styles.backDiscoverBtn, { borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={14} color={colors.mutedForeground} />
            <Text style={[styles.backDiscoverText, { color: colors.mutedForeground }]}>Discover</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 16, gap: 12 },
  heroCard: {
    borderRadius: 22,
    padding: 22,
    gap: 14,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  catBadgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  hotBadgeText: {
    color: '#CC2200',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  fmtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fmtText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  bigProb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  bigProbSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  bigProbRight: {
    alignItems: 'flex-end',
  },
  bigPct: {
    color: '#FFFFFF',
    fontSize: 56,
    fontFamily: 'Inter_700Bold',
    lineHeight: 60,
    letterSpacing: -2,
  },
  bigProbLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bigProbDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barYes: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 3,
  },
  barNo: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  statTextUrgent: {
    color: '#FF6B6B',
    fontFamily: 'Inter_600SemiBold',
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 2,
  },
  expiredNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  expiredNudgeText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    lineHeight: 18,
  },
  descCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  descLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  descText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  predChoiceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  predChoice: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  predMeta: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  stickyButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  balanceText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  votedContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  votedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareAfterVoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareAfterVoteText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  votedText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  votedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  votedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  votedBadgeText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  predictBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 18,
    gap: 8,
  },
  predictBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  predictBtnPct: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  closedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  closedText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  backDiscoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  backDiscoverText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  // THE_CALL hero option bars
  callOptions: {
    gap: 10,
    marginTop: 4,
  },
  callOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callOptionLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    width: 100,
    flexShrink: 0,
  },
  callBarTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  callBarFill: {
    borderRadius: 3,
  },
  callPct: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    width: 36,
    textAlign: 'right',
  },
  // THE_CALL pick buttons column
  callButtonColumn: {
    gap: 8,
  },
  callPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  callPickLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  callPickPct: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 8,
  },
});
