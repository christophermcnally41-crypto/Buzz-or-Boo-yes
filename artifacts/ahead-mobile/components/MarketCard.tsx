import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { getMarketColors } from '@/lib/market-colors';
import { getCountdownLabel } from '@/lib/countdown';
import { useGetMarketTally, getTallyRefetchInterval } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';

interface MarketCardProps {
  market: Market;
  isHot?: boolean;
  onPress?: () => void;
  style?: object;
}

const MULTI_CHOICE_COLORS = ['#CFEA3B', '#3ECDE8', '#E87B3E', '#8B5CF6', '#EC4899'];

const CATEGORY_LABELS: Record<string, string> = {
  STYLE: 'Style',
  HOME: 'Home',
  CITY: 'City',
  REAL_ESTATE: 'Real Estate',
  WEATHER: 'Weather',
  CULTURE: 'Culture',
  LOCAL_PULSE: 'Local',
};

export function MarketCard({ market, isHot, onPress, style }: MarketCardProps) {
  const colors = useColors();
  const pair = getMarketColors(market.id);
  const countdown = getCountdownLabel(
    (market as any).clockType as string | undefined,
    (market as any).expireAt as string | null | undefined,
  );

  const { data: tally } = useGetMarketTally(market.id, {
    query: { refetchInterval: getTallyRefetchInterval(market.status) },
  });
  const liveTallyMap = (tally?.tallies ?? {}) as Record<string, number>;
  const liveYesCount = liveTallyMap['YES'] ?? 0;
  const liveNoCount = liveTallyMap['NO'] ?? 0;
  // Use YES+NO sum as denominator to avoid multi-choice tally keys diluting binary percentages
  const liveBinaryTotal = liveYesCount + liveNoCount;
  const yesPercent = liveBinaryTotal > 0
    ? Math.round((liveYesCount / liveBinaryTotal) * 100)
    : (market.yesPercent ?? 50);
  const noPercent = liveBinaryTotal > 0
    ? Math.round((liveNoCount / liveBinaryTotal) * 100)
    : (market.noPercent ?? 50);
  const yesFloor = Math.max(yesPercent, 3);
  const noFloor = Math.max(noPercent, 3);

  const isTheCall = market.marketFormat === 'THE_CALL';
  const isBuzzOrBooCard = market.marketFormat === 'BUZZ_OR_BOO';
  const isMultiChoice = market.marketFormat === 'MULTI_CHOICE';
  const isScheduled = market.status === 'SCHEDULED';
  const isClosed = market.status === 'CLOSED';
  const isResolved = market.status === 'RESOLVED';

  // Parse MULTI_CHOICE contenders for display
  const multiChoiceContenders = (() => {
    if (!isMultiChoice || !market.description) return null;
    try {
      const parsed = JSON.parse(market.description as string) as { contenders?: { key: string; name: string }[] };
      if (Array.isArray(parsed.contenders) && parsed.contenders.length > 0) return parsed.contenders;
    } catch {}
    return null;
  })();

  // Parse THE_CALL options for display
  const theCallOptions = (() => {
    if (!isTheCall || !market.description) return null;
    try {
      const parsed = JSON.parse(market.description as string) as { options?: { key: string; label: string }[] };
      if (Array.isArray(parsed.options) && parsed.options.length > 0) return parsed.options;
    } catch {}
    return null;
  })();

  const formatBadge = () => {
    if (market.marketFormat === 'HOT_OR_NOT') return { icon: 'fire', label: '🔥 Hot or Not' };
    if (market.marketFormat === 'HEAD_TO_HEAD') return { icon: 'sword-cross', label: '⚔️ Head to Head' };
    if (market.marketFormat === 'THE_CALL') return { icon: 'target', label: '🎯 The Call' };
    if (market.marketFormat === 'BUZZ_OR_BOO') return { icon: 'flash', label: '⚡ Buzz or Boo' };
    if (market.marketFormat === 'MULTI_CHOICE') return { icon: 'crown', label: '👑 Buzz Battle' };
    return { icon: 'chart-line', label: '📊 Forecast' };
  };

  // Parse HEAD_TO_HEAD contender names from description JSON
  const h2hData = (() => {
    if (market.marketFormat !== 'HEAD_TO_HEAD' || !market.description) return null;
    try {
      const parsed = JSON.parse(market.description as string);
      if (parsed.entityA && parsed.entityB) return { entityA: parsed.entityA as string, entityB: parsed.entityB as string };
    } catch {}
    return null;
  })();
  const fmt = formatBadge();

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.wrapper, style]}
    >
      <LinearGradient
        colors={[pair.yes + 'E0', pair.no + 'F5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.2 }}
        style={styles.card}
      >
        {/* Top row: badges */}
        <View style={styles.topRow}>
          <View style={[styles.catBadge, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <Text style={styles.catLabel}>
              {CATEGORY_LABELS[market.category] ?? market.category}
            </Text>
          </View>
          {isHot && (
            <View style={[styles.hotBadge]}>
              <MaterialCommunityIcons name="fire" size={13} color="#FF6B35" />
              <Text style={styles.hotLabel}>HOT IN BOSTON</Text>
            </View>
          )}
          {market.status === 'SCHEDULED' && (
            <View style={[styles.fmtBadge, { backgroundColor: 'rgba(245,158,11,0.25)' }]}>
              <MaterialCommunityIcons name="calendar-clock" size={12} color="#f59e0b" />
              <Text style={[styles.fmtLabel, { color: '#f59e0b' }]}>
                {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'Coming Soon'}
              </Text>
            </View>
          )}
          {fmt && !isHot && market.status !== 'SCHEDULED' && (
            <View style={[styles.fmtBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <MaterialCommunityIcons name={fmt.icon as any} size={12} color="#FFFFFF" />
              <Text style={styles.fmtLabel}>{fmt.label}</Text>
            </View>
          )}
        </View>

        {/* Market title */}
        <View style={styles.titleArea}>
          {market.marketFormat === 'HEAD_TO_HEAD' ? (
            <View style={styles.headToHead}>
              <Text style={styles.headOption} numberOfLines={2}>{h2hData?.entityA ?? 'Side A'}</Text>
              <Text style={styles.vsText}>VS</Text>
              <Text style={styles.headOption} numberOfLines={2}>{h2hData?.entityB ?? 'Side B'}</Text>
            </View>
          ) : (
            <Text style={styles.title} numberOfLines={4}>
              {market.question || market.title}
            </Text>
          )}
        </View>

        {/* Resolved outcome banner — shown for RESOLVED markets */}
        {market.status === 'RESOLVED' && market.resolvedOutcome && (
          <View style={{ paddingHorizontal: 2, paddingBottom: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.9)', textAlign: 'center' }}>
              {market.marketFormat === 'HOT_OR_NOT'
                ? (market.resolvedOutcome === 'YES' ? '🔥 HOT won' : '❄️ NOT HOT won')
                : market.marketFormat === 'BUZZ_OR_BOO'
                  ? (market.resolvedOutcome === 'YES' ? '⚡ BUZZ won' : '👎 BOO won')
                  : market.marketFormat === 'HEAD_TO_HEAD'
                    ? `⚔️ ${market.resolvedOutcome === 'YES' ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')} wins`
                    : market.marketFormat === 'MULTI_CHOICE'
                      ? (() => {
                          try {
                            const d = JSON.parse(market.description as string ?? '{}') as { contenders?: { key: string; name: string }[] };
                            const winner = (d.contenders ?? []).find(c => c.key === market.resolvedOutcome);
                            return winner ? `👑 ${winner.name} wins` : `👑 ${market.resolvedOutcome} wins`;
                          } catch { return `👑 ${market.resolvedOutcome} wins`; }
                        })()
                      : market.marketFormat === 'THE_CALL'
                        ? (() => {
                            try {
                              const d = JSON.parse(market.description as string ?? '{}') as { options?: { key: string; label: string }[] };
                              const winner = (d.options ?? []).find(o => o.key === market.resolvedOutcome);
                              return winner ? `🎯 ${winner.label} wins` : `🎯 ${market.resolvedOutcome} wins`;
                            } catch { return `🎯 ${market.resolvedOutcome} wins`; }
                          })()
                        : market.resolvedOutcome === 'YES'
                          ? '✓ YES won'
                          : '✗ NO won'}
            </Text>
          </View>
        )}

        {/* Probability numbers — suppressed for SCHEDULED markets */}
        {isScheduled ? (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' }}>
              🗓 Coming soon — predictions open soon
            </Text>
          </View>
        ) : isTheCall && theCallOptions ? (
          // THE_CALL: show option list with live percentages
          (() => {
            const THE_CALL_COLORS = ['#a3e635', '#38bdf8', '#fb923c', '#f472b6', '#a78bfa', '#34d399'];
            const totalVotes = theCallOptions.reduce((s, o) => s + (liveTallyMap[o.key] ?? 0), 0);
            const sorted = [...theCallOptions].sort((a, b) => (liveTallyMap[b.key] ?? 0) - (liveTallyMap[a.key] ?? 0));
            return (
              <View style={{ paddingVertical: 8, gap: 4 }}>
                {isClosed && !isResolved && (
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4 }}>🔒 Snapshot at close</Text>
                )}
                {totalVotes === 0 && (
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 4 }}>
                    No picks yet — be first to call it
                  </Text>
                )}
                {sorted.slice(0, 3).map((o, i) => {
                  const count = liveTallyMap[o.key] ?? 0;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : null;
                  return (
                    <View key={o.key} style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 11, color: THE_CALL_COLORS[i % THE_CALL_COLORS.length], width: 14, fontFamily: 'Inter_700Bold' }}>
                          {String.fromCharCode(65 + i)}
                        </Text>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter_600SemiBold' }}>{o.label}</Text>
                        {pct !== null ? (
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_400Regular' }}>{pct}%</Text>
                        ) : (
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter_400Regular' }}>—</Text>
                        )}
                      </View>
                      <View style={{ marginLeft: 22, height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ width: pct !== null ? `${Math.max(pct, 2)}%` : '2%', height: '100%', backgroundColor: THE_CALL_COLORS[i % THE_CALL_COLORS.length] + 'cc', borderRadius: 2 }} />
                      </View>
                    </View>
                  );
                })}
                {sorted.length > 3 && (
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter_400Regular', marginLeft: 22 }}>
                    +{sorted.length - 3} more options
                  </Text>
                )}
              </View>
            );
          })()
        ) : isMultiChoice && multiChoiceContenders ? (
          // MULTI_CHOICE: show top contender names sorted by live tally
          (() => {
            const totalVotes = multiChoiceContenders.reduce((s, mc) => s + (liveTallyMap[mc.key] ?? 0), 0);
            const sorted = [...multiChoiceContenders].sort((a, b) => (liveTallyMap[b.key] ?? 0) - (liveTallyMap[a.key] ?? 0));
            return (
              <View style={{ paddingVertical: 8, gap: 4 }}>
                {isClosed && !isResolved && (
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4 }}>🔒 Snapshot at close</Text>
                )}
                {totalVotes === 0 && (
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 4 }}>
                    No votes yet — back the first contender
                  </Text>
                )}
                {sorted.slice(0, 3).map((c, i) => {
                  const count = liveTallyMap[c.key] ?? 0;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : null;
                  return (
                    <View key={c.key} style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', width: 14, fontFamily: 'Inter_400Regular' }}>{i + 1}</Text>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter_600SemiBold' }}>{c.name}</Text>
                        {pct !== null ? (
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_400Regular' }}>{pct}%</Text>
                        ) : (
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter_400Regular' }}>—</Text>
                        )}
                      </View>
                      <View style={{ marginLeft: 22, height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ width: pct !== null ? `${Math.max(pct, 2)}%` : '2%', height: '100%', backgroundColor: MULTI_CHOICE_COLORS[i % MULTI_CHOICE_COLORS.length], borderRadius: 2 }} />
                      </View>
                    </View>
                  );
                })}
                {sorted.length > 3 && (
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter_400Regular' }}>
                    +{sorted.length - 3} more contenders
                  </Text>
                )}
              </View>
            );
          })()
        ) : liveBinaryTotal === 0 && !isResolved && !isClosed && !isScheduled ? (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>
              {isBuzzOrBooCard ? 'No verdicts yet — be first to weigh in'
                : isHotOrNot ? 'No verdicts yet — cast the first call'
                : isHeadToHead ? 'No picks yet — be first to call it'
                : 'No predictions yet — make the first call'}
            </Text>
          </View>
        ) : (
          <>
            {isClosed && !isResolved && (
              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4, paddingTop: 4 }}>🔒 Snapshot at close</Text>
            )}
            <View style={styles.probRow}>
              <View style={styles.probSide}>
                <Text style={[styles.probPercent, isClosed && !isResolved ? { opacity: 0.75 } : {}]}>{Math.round(yesPercent)}%</Text>
                <Text style={styles.probLabel} numberOfLines={1}>
                  {market.marketFormat === 'HOT_OR_NOT' ? 'HOT' : market.marketFormat === 'BUZZ_OR_BOO' ? 'BUZZ' : market.marketFormat === 'HEAD_TO_HEAD' ? (h2hData?.entityA ?? 'Side A') : 'YES'}
                </Text>
              </View>
              <View style={styles.probDivider} />
              <View style={[styles.probSide, styles.probRight]}>
                <Text style={[styles.probPercent, isClosed && !isResolved ? { opacity: 0.75 } : {}]}>{Math.round(noPercent)}%</Text>
                <Text style={styles.probLabel} numberOfLines={1}>
                  {market.marketFormat === 'HOT_OR_NOT' ? 'NOT HOT' : market.marketFormat === 'BUZZ_OR_BOO' ? 'BOO' : market.marketFormat === 'HEAD_TO_HEAD' ? (h2hData?.entityB ?? 'Side B') : 'NO'}
                </Text>
              </View>
            </View>
            <View style={[styles.barTrack, isClosed && !isResolved ? { opacity: 0.75 } : {}]}>
              <View style={[styles.yesBar, { flex: yesFloor }]} />
              <View style={[styles.noBar, { flex: noFloor }]} />
            </View>
            {!isClosed && !isResolved && !isScheduled && liveBinaryTotal > 0 && (() => {
              const margin = Math.abs(Math.round(yesPercent) - Math.round(noPercent));
              const yesLabel = market.marketFormat === 'HOT_OR_NOT' ? '🔥 HOT' : market.marketFormat === 'BUZZ_OR_BOO' ? '⚡ BUZZ' : market.marketFormat === 'HEAD_TO_HEAD' ? (h2hData?.entityA ?? 'Side A') : 'YES';
              const noLabel = market.marketFormat === 'HOT_OR_NOT' ? '❄️ NOT HOT' : market.marketFormat === 'BUZZ_OR_BOO' ? '👎 BOO' : market.marketFormat === 'HEAD_TO_HEAD' ? (h2hData?.entityB ?? 'Side B') : 'NO';
              const leader = yesPercent > noPercent ? yesLabel : noPercent > yesPercent ? noLabel : null;
              return (
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 3 }}>
                  {leader ? `${leader} leads +${margin}pp` : '⚖️ Dead even'}
                </Text>
              );
            })()}
          </>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          {!isScheduled && (
            <>
              <Feather name="users" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.footerText}>
                {liveBinaryTotal > 0 ? liveBinaryTotal : (market.totalPredictions ?? 0)}{' '}
                {isBuzzOrBoo || isHotOrNot ? 'verdicts' : isTheCall ? 'picks' : isMultiChoice ? 'votes' : 'predictions'}
              </Text>
            </>
          )}
          {countdown && !isScheduled && market.status === 'OPEN' && (
            <View style={[styles.countdownBadge, countdown.urgent && styles.countdownUrgent]}>
              <Text style={[styles.countdownText, countdown.urgent && styles.countdownTextUrgent]}>
                ⏱ {countdown.label}
              </Text>
            </View>
          )}
          <View style={styles.footerRight}>
            <Text style={styles.predictCta}>
              {isScheduled
                ? ((market as any).scheduledFor
                    ? `OPENS ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`
                    : 'COMING SOON')
                : market.status === 'RESOLVED' ? 'RESOLVED'
                : market.status !== 'OPEN' ? 'CLOSED'
                : isBuzzOrBoo || isHotOrNot ? 'CAST VERDICT'
                : isTheCall ? 'MAKE PICK'
                : isMultiChoice ? 'BACK ONE'
                : 'PREDICT'}
            </Text>
            <Feather name={market.status === 'RESOLVED' ? 'check-circle' : market.status !== 'OPEN' && !isScheduled ? 'lock' : 'arrow-right'} size={14} color="#FFFFFF" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    padding: 20,
    paddingBottom: 18,
    flex: 1,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  catLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  hotLabel: {
    color: '#CC2200',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fmtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  fmtLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  titleArea: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  headToHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headOption: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  vsText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  probSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  probRight: {
    alignItems: 'flex-end',
  },
  probPercent: {
    color: '#FFFFFF',
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    lineHeight: 44,
    letterSpacing: -1,
  },
  probLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  probDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barTrack: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 14,
  },
  yesBar: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
  noBar: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predictCta: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  countdownBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  countdownUrgent: {
    backgroundColor: 'rgba(232,80,62,0.25)',
  },
  countdownText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  countdownTextUrgent: {
    color: '#E8503E',
  },
});
