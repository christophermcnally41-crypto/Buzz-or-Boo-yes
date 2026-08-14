import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useGetMarketTally, getGetMarketTallyQueryKey } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';
import { getCountdownLabel } from '@/lib/countdown';
import { getTallyRefetchInterval } from '@/lib/tally-poll';

interface TheCallOption {
  key: string;
  label: string;
}

interface TheCallData {
  options: TheCallOption[];
  context?: string;
}

function parseTheCallData(description: string | null | undefined): TheCallData | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (Array.isArray(parsed.options)) return parsed as TheCallData;
    return null;
  } catch {
    return null;
  }
}

const OPTION_COLORS = [
  '#CFEA3B',
  '#3ECDE8',
  '#E87B3E',
  '#8B5CF6',
  '#EC4899',
  '#22D3EE',
];

interface TheCallCardProps {
  market: Market;
  rank?: number;
  onPress?: () => void;
  style?: object;
}

export function TheCallCard({ market, rank, onPress, style }: TheCallCardProps) {
  const countdown = getCountdownLabel(
    (market as any).clockType as string | undefined,
    (market as any).expireAt as string | null | undefined,
  );
  const isScheduled = market.status === 'SCHEDULED';
  const data = parseTheCallData(market.description);
  const options = data?.options ?? [];

  const { data: tallyData } = useGetMarketTally(market.id, {
    query: { queryKey: getGetMarketTallyQueryKey(market.id), refetchInterval: getTallyRefetchInterval(market.status) },
  });

  const optionCounts: Record<string, number> = {};
  for (const o of options) {
    optionCounts[o.key] = tallyData?.tallies?.[o.key] ?? 0;
  }
  const totalVotes = Object.values(optionCounts).reduce((a, b) => a + b, 0);
  const hasRealData = totalVotes > 0;

  const sortedEntries = hasRealData
    ? Object.entries(optionCounts).sort((a, b) => b[1] - a[1])
    : [];
  const leadingKey = sortedEntries[0]?.[0] ?? null;
  const leadingOption = options.find((o) => o.key === leadingKey);
  const runnerUpKey = sortedEntries[1]?.[1] && sortedEntries[1][1] > 0 ? sortedEntries[1][0] : null;
  const runnerUpOption = runnerUpKey ? options.find((o) => o.key === runnerUpKey) : null;
  const runnerUpPct = runnerUpKey && totalVotes > 0 ? Math.round(((optionCounts[runnerUpKey] ?? 0) / totalVotes) * 100) : null;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.wrapper, style]}
    >
      <LinearGradient
        colors={['#1A1A2E', '#16213E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Top row */}
        <View style={styles.topRow}>
          {rank !== undefined && (
            <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Text style={styles.chipText}>#{rank}</Text>
            </View>
          )}
          {isScheduled ? (
            <View style={[styles.chip, { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.40)' }]}>
              <Text style={[styles.chipText, { color: '#f59e0b' }]}>
                {(market as any).scheduledFor
                  ? `🗓 OPENS ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`
                  : '🗓 COMING SOON'}
              </Text>
            </View>
          ) : market.status === 'RESOLVED' ? (
            <View style={[styles.chip, { backgroundColor: 'rgba(207,234,59,0.15)', borderWidth: 1, borderColor: 'rgba(207,234,59,0.35)' }]}>
              <Text style={[styles.chipText, { color: '#CFEA3B' }]}>🏆 WINNER LOCKED</Text>
            </View>
          ) : market.status === 'CLOSED' ? (
            <>
              <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }]}>
                <Text style={[styles.chipText, { color: 'rgba(255,255,255,0.5)' }]}>🔒 CLOSED</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: 'rgba(207,234,59,0.08)', marginLeft: 4 }]}>
                <Text style={[styles.chipText, { color: 'rgba(207,234,59,0.6)' }]}>🎯 THE CALL</Text>
              </View>
            </>
          ) : (
            <View style={[styles.chip, { backgroundColor: 'rgba(207,234,59,0.15)', borderWidth: 1, borderColor: 'rgba(207,234,59,0.35)' }]}>
              <Text style={[styles.chipText, { color: '#CFEA3B' }]}>🎯 THE CALL</Text>
            </View>
          )}
          <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 'auto' as any }]}>
            <Feather name="users" size={10} color="rgba(255,255,255,0.6)" />
            <Text style={[styles.chipText, { marginLeft: 4 }]}>{market.totalPredictions}</Text>
          </View>
        </View>

        {/* Question */}
        <Text style={styles.question} numberOfLines={3}>
          {market.question || market.title}
        </Text>

        {/* Resolved winner banner */}
        {market.status === 'RESOLVED' && market.resolvedOutcome && (() => {
          const winner = options.find(o => o.key === market.resolvedOutcome);
          return winner ? (
            <View style={styles.winnerBanner}>
              <Text style={styles.winnerText}>✓ Winner: {winner.label}</Text>
            </View>
          ) : null;
        })()}

        {/* Leading crowd teaser (only when not resolved and not scheduled) */}
        {market.status !== 'RESOLVED' && market.status !== 'SCHEDULED' && hasRealData && leadingOption && (
          <>
            <Text style={styles.teaser}>
              {market.status === 'CLOSED' ? 'Ahead at close — ' : 'Crowd leans '}
              <Text style={{ color: '#CFEA3B', fontFamily: 'Inter_700Bold' }}>
                {leadingOption.label}
              </Text>
            </Text>
            {runnerUpOption && runnerUpPct != null && market.status !== 'CLOSED' && (
              <Text style={[styles.teaser, { fontSize: 10, opacity: 0.5, marginTop: 1 }]}>
                Runner-up: {runnerUpOption.label} · {runnerUpPct}%
              </Text>
            )}
          </>
        )}

        {/* Scheduled disabled options preview */}
        {options.length > 0 && isScheduled && (
          <View style={[styles.optionsContainer, { opacity: 0.4 }]}>
            {options.slice(0, 4).map((o, i) => {
              const color = OPTION_COLORS[i % OPTION_COLORS.length];
              return (
                <View key={o.key} style={styles.optionRow}>
                  <Text style={[styles.optionLabel, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>{o.label}</Text>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: '0%', backgroundColor: color }]} /></View>
                  <Text style={styles.pctLabel}>—</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Options with bars — suppress for SCHEDULED */}
        {options.length > 0 && !isScheduled && (
          <View style={styles.optionsContainer}>
            {market.status === 'CLOSED' && market.status !== 'RESOLVED' && hasRealData && (
              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 6 }}>🔒 Snapshot at close</Text>
            )}
            {options.slice(0, 5).map((o, i) => {
              const count = optionCounts[o.key] ?? 0;
              const pct = hasRealData
                ? Math.round((count / totalVotes) * 100)
                : 0;
              const isResolved = market.status === 'RESOLVED';
              const isWinner = isResolved && o.key === market.resolvedOutcome;
              const isLeading = !isResolved && o.key === leadingKey && hasRealData;
              const color = OPTION_COLORS[i % OPTION_COLORS.length];
              const rowOpacity = isResolved && !isWinner ? 0.45 : 1;

              return (
                <View key={o.key} style={[styles.optionRow, { opacity: rowOpacity }]}>
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: isWinner ? '#CFEA3B' : isLeading ? '#FFFFFF' : 'rgba(255,255,255,0.6)' },
                    ]}
                    numberOfLines={1}
                  >
                    {isWinner ? '🏆 ' : ''}{o.label}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: hasRealData ? `${pct}%` : '0%',
                          backgroundColor: isWinner ? '#CFEA3B' : color,
                          opacity: isLeading ? 1 : isResolved ? (isWinner ? 1 : 0.5) : 0.5,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.pctLabel, isWinner && { color: '#CFEA3B' }]}>{hasRealData ? `${pct}%` : '—'}</Text>
                </View>
              );
            })}
            {options.length > 5 && (
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 }}>
                +{options.length - 5} more option{options.length - 5 > 1 ? 's' : ''} — open to see all
              </Text>
            )}
          </View>
        )}

        {/* Footer CTA */}
        <View style={styles.footer}>
          {isScheduled ? (
            <Text style={[styles.ctaText, { color: '#f59e0b' }]}>
              {(market as any).scheduledFor
                ? `🗓 Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — check back`
                : '🗓 Opens soon — check back'}
            </Text>
          ) : market.status === 'RESOLVED' ? (
            <>
              <Text style={[styles.ctaText, { color: '#CFEA3B' }]}>🏆 WINNER LOCKED</Text>
              {hasRealData && (
                <Text style={[styles.countdownText, { color: 'rgba(255,255,255,0.5)', marginLeft: 4 }]}>
                  {totalVotes} {totalVotes === 1 ? 'pick' : 'picks'}
                </Text>
              )}
            </>
          ) : market.status !== 'OPEN' ? (
            <>
              <Text style={[styles.ctaText, { color: 'rgba(255,255,255,0.55)' }]}>🔒 CLOSED</Text>
              {hasRealData ? (
                <Text style={[styles.countdownText, { color: 'rgba(255,255,255,0.4)', marginLeft: 4 }]}>
                  {totalVotes} {totalVotes === 1 ? 'pick' : 'picks'}
                </Text>
              ) : null}
              <Text style={[styles.countdownText, { color: 'rgba(255,255,255,0.35)', marginLeft: hasRealData ? 4 : 0 }]}>
                · Awaiting resolution
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.ctaText}>MAKE YOUR PICK</Text>
              <Feather name="arrow-right" size={13} color="#CFEA3B" />
              {hasRealData && (
                <Text style={[styles.countdownText, { color: 'rgba(255,255,255,0.5)', marginLeft: 4 }]}>
                  {totalVotes} {totalVotes === 1 ? 'pick' : 'picks'}
                </Text>
              )}
              {countdown && (
                <Text style={[styles.countdownText, countdown.urgent && { color: '#E8503E' }, { marginLeft: hasRealData ? 0 : undefined }]}>
                  ⏱ {countdown.label}
                </Text>
              )}
            </>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
  },
  card: {
    padding: 18,
    gap: 12,
  },
  winnerBanner: {
    backgroundColor: 'rgba(207,234,59,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(207,234,59,0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  winnerText: {
    color: '#CFEA3B',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  question: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  teaser: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
  },
  optionsContainer: {
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    width: 90,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  pctLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    width: 30,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctaText: {
    color: '#CFEA3B',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    flex: 1,
  },
  countdownText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
});
