import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
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
} from '@workspace/api-client-react';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getMarketColors } from '@/lib/market-colors';
import { useAuth } from '@/lib/auth';

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

  const { isAuthenticated, login } = useAuth();

  const marketId = Number(id);
  const pair = getMarketColors(marketId);

  const { data: market, isLoading, error } = useGetMarket(marketId);
  const { data: predictions } = useGetMarketPredictions(marketId);
  const { data: tallyResult } = useGetMarketTally(marketId);
  const { data: myPredictionData } = useGetMarketMyPrediction(marketId);
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
      // THE_CALL uses a fixed 10-token stake; all other formats use 100
      const amount = isCallPick ? 10 : 100;
      mutation.mutate(
        { id: marketId, data: { choice, amount } },
        {
          onSuccess: async () => {
            setVoted(choice);
            setVoting(false);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    [marketId, mutation, voted, voting, isAuthenticated, login],
  );

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
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

  const yesPercent = market.yesPercent ?? 50;
  const noPercent = market.noPercent ?? 50;
  const yesFloor = Math.max(yesPercent, 3);
  const noFloor = Math.max(noPercent, 3);

  const isHotOrNot = market.marketFormat === 'HOT_OR_NOT';
  const isHeadToHead = market.marketFormat === 'HEAD_TO_HEAD';
  const isBuzzOrBoo = market.marketFormat === 'BUZZ_OR_BOO';
  const isTheCall = market.marketFormat === 'THE_CALL';

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

  const yesLabel = isHotOrNot ? 'HOT' : isBuzzOrBoo ? 'BUZZ' : 'YES';
  const noLabel = isHotOrNot ? 'NOT' : isBuzzOrBoo ? 'BOO' : 'NO';

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
          {/* Badges */}
          <View style={styles.badgesRow}>
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
            <View style={[styles.statusBadge, { backgroundColor: market.status === 'OPEN' ? 'rgba(148,194,19,0.3)' : 'rgba(255,255,255,0.15)' }]}>
              <View style={[styles.statusDot, { backgroundColor: market.status === 'OPEN' ? '#94C213' : '#888' }]} />
              <Text style={styles.statusText}>{market.status}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.heroTitle}>{market.question || market.title}</Text>

          {/* Format label */}
          {isHotOrNot && (
            <View style={styles.fmtRow}>
              <MaterialCommunityIcons name="fire" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.fmtText}>Hot or Not</Text>
            </View>
          )}
          {isHeadToHead && (
            <View style={styles.fmtRow}>
              <MaterialCommunityIcons name="sword-cross" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.fmtText}>Head to Head</Text>
            </View>
          )}
          {isBuzzOrBoo && (
            <View style={styles.fmtRow}>
              <Text style={styles.fmtText}>⚡ Buzz or Boo</Text>
            </View>
          )}
          {isTheCall && (
            <View style={styles.fmtRow}>
              <Text style={styles.fmtText}>🎯 The Call</Text>
            </View>
          )}

          {/* THE_CALL: option vote bars */}
          {isTheCall && theCallData ? (
            <View style={styles.callOptions}>
              {theCallData.options.map((o) => {
                const count = theCallTally[o.key] ?? 0;
                const pct = theCallTotal > 0 ? Math.round((count / theCallTotal) * 100) : 0;
                const barFlex = Math.max(pct, 3);
                return (
                  <View key={o.key} style={styles.callOptionRow}>
                    <Text style={styles.callOptionLabel} numberOfLines={1}>{o.label}</Text>
                    <View style={styles.callBarTrack}>
                      <View style={[styles.callBarFill, { flex: barFlex, backgroundColor: THE_CALL_ACCENT }]} />
                      <View style={{ flex: Math.max(100 - barFlex, 3), backgroundColor: 'rgba(255,255,255,0.15)' }} />
                    </View>
                    <Text style={styles.callPct}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          ) : !isTheCall ? (
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
                    { flex: yesFloor, backgroundColor: isBuzzOrBoo ? BUZZ_COLOR : 'rgba(255,255,255,0.9)' },
                  ]}
                />
                <View
                  style={[
                    styles.barNo,
                    { flex: noFloor, backgroundColor: isBuzzOrBoo ? BOO_COLOR : 'rgba(255,255,255,0.3)' },
                  ]}
                />
              </View>
            </>
          ) : null}

          {/* Stats */}
          <View style={styles.statsRow}>
            <Feather name="users" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statText}>{market.totalPredictions} predictions</Text>
            {market.closesAt && (
              <>
                <View style={styles.statDot} />
                <Feather name="clock" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.statText}>
                  Closes {new Date(market.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </>
            )}
          </View>
        </LinearGradient>

        {/* Description — skip raw JSON for THE_CALL (options are shown in the hero) */}
        {market.description && !isTheCall && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
            <Text style={[styles.descText, { color: colors.foreground }]}>{market.description}</Text>
          </View>
        )}
        {/* THE_CALL context / question flavour */}
        {isTheCall && theCallData?.context && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>CONTEXT</Text>
            <Text style={[styles.descText, { color: colors.foreground }]}>{theCallData.context}</Text>
          </View>
        )}

        {/* Resolution source */}
        {market.resolutionSource && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>RESOLVED BY</Text>
            <Text style={[styles.descText, { color: colors.foreground }]}>{market.resolutionSource}</Text>
          </View>
        )}

        {/* Recent predictions */}
        {predictions && predictions.length > 0 && (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>
              {isBuzzOrBoo ? 'RECENT VERDICTS' : isTheCall ? 'RECENT PICKS' : 'RECENT PREDICTIONS'}
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
              } else {
                const isYes = p.choice === 'YES';
                choiceColor = isYes ? pair.yes : pair.no;
                choiceLabel = p.choice;
              }
              return (
                <View key={p.id} style={[styles.predRow, { borderBottomColor: colors.border }]}>
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
                  <Text style={[styles.predMeta, { color: colors.mutedForeground }]}>
                    {p.amount} tokens · {new Date(p.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
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
          {voted ? (
            <View style={styles.votedContainer}>
              <Feather name="check-circle" size={20} color={colors.primary} />
              <Text style={[styles.votedText, { color: colors.foreground }]}>
                {isTheCall
                  ? (() => {
                      const opt = theCallData?.options.find((o) => o.key === voted);
                      return opt ? `🎯 Picked: ${opt.label}` : '🎯 Pick cast!';
                    })()
                  : isBuzzOrBoo
                    ? voted === 'YES'
                      ? '⚡ Buzzed — nice call!'
                      : '👎 Boo\'d — noted!'
                    : `Predicted ${voted} — nice call!`}
              </Text>
            </View>
          ) : isTheCall && theCallData ? (
            /* THE_CALL: vertical stack of option buttons */
            <View style={styles.callButtonColumn}>
              {theCallData.options.map((o) => {
                const count = theCallTally[o.key] ?? 0;
                const pct = theCallTotal > 0 ? Math.round((count / theCallTotal) * 100) : 0;
                return (
                  <TouchableOpacity
                    key={o.key}
                    activeOpacity={0.85}
                    onPress={() => handlePredict(o.key, true)}
                    disabled={voting}
                    style={[styles.callPickBtn, { borderColor: THE_CALL_ACCENT + '66', backgroundColor: THE_CALL_ACCENT + '15' }]}
                  >
                    {voting ? (
                      <ActivityIndicator color={THE_CALL_ACCENT} />
                    ) : (
                      <>
                        <Text style={[styles.callPickLabel, { color: colors.foreground }]} numberOfLines={1}>{o.label}</Text>
                        <Text style={[styles.callPickPct, { color: THE_CALL_ACCENT }]}>{pct}%</Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            /* Standard YES / NO / BUZZ BOO buttons */
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
                      {isBuzzOrBoo ? '⚡ BUZZ' : yesLabel}
                    </Text>
                    <Text
                      style={[
                        styles.predictBtnPct,
                        isBuzzOrBoo && { color: 'rgba(0,0,0,0.6)' },
                      ]}
                    >
                      {Math.round(yesPercent)}%
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
                      {isBuzzOrBoo ? '👎 BOO' : noLabel}
                    </Text>
                    <Text style={styles.predictBtnPct}>{Math.round(noPercent)}%</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
              Market {market.status.toLowerCase()} · Predictions closed
            </Text>
          </View>
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
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 2,
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
  votedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  votedText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
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
