import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { getCountdownLabel } from '@/lib/countdown';
import { useGetMarketTally, getGetMarketTallyQueryKey } from '@workspace/api-client-react';
import { getTallyRefetchInterval } from '@/lib/tally-poll';
import type { Market } from '@workspace/api-client-react';

const HOT_COLOR = '#F97316';  // orange-500
const NOT_COLOR = '#60A5FA';  // blue-400

interface HotOrNotCardProps {
  market: Market;
  onPress?: () => void;
  style?: object;
}

export function HotOrNotCard({ market, onPress, style }: HotOrNotCardProps) {
  const colors = useColors();
  const countdown = getCountdownLabel(
    (market as any).clockType as string | undefined,
    (market as any).expireAt as string | null | undefined,
  );

  // Poll for live tallies every 30 s while the market is OPEN
  const { data: tallyData } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: getTallyRefetchInterval(market.status),
    },
  });

  // Derive live percentages from tally; fall back to market props only when tally has real data
  const tallyYes = tallyData?.tallies?.['YES'] ?? 0;
  const tallyNo = tallyData?.tallies?.['NO'] ?? 0;
  const tallyTotal = tallyYes + tallyNo;
  const hasVotes = tallyTotal > 0 || (market.totalPredictions ?? 0) > 0;
  const hotPercent = tallyTotal > 0 ? (tallyYes / tallyTotal) * 100 : (hasVotes ? (market.yesPercent ?? 50) : 50);
  const notPercent = tallyTotal > 0 ? (tallyNo / tallyTotal) * 100 : (hasVotes ? (market.noPercent ?? 50) : 50);
  const hotCount = tallyTotal > 0 ? tallyYes : 0;
  const notCount = tallyTotal > 0 ? tallyNo : 0;
  const dominantHot = hotPercent >= notPercent;

  const totalVotes = tallyTotal > 0 ? tallyTotal : (market.totalPredictions ?? 0);
  const isScheduled = market.status === 'SCHEDULED';
  const isResolved = market.status === 'RESOLVED';
  const isClosed = market.status === 'CLOSED';

  // Top badge
  const badgeBg = isScheduled
    ? '#f59e0b22'
    : isResolved
      ? ((market as any).resolvedOutcome === 'YES' ? HOT_COLOR + '22' : NOT_COLOR + '22')
      : isClosed
        ? 'rgba(100,100,100,0.15)'
        : dominantHot ? HOT_COLOR + '22' : NOT_COLOR + '22';
  const badgeBorder = isScheduled
    ? '#f59e0b66'
    : isResolved
      ? ((market as any).resolvedOutcome === 'YES' ? HOT_COLOR + '66' : NOT_COLOR + '66')
      : isClosed
        ? 'rgba(100,100,100,0.3)'
        : dominantHot ? HOT_COLOR + '66' : NOT_COLOR + '66';
  const badgeColor = isScheduled
    ? '#f59e0b'
    : isResolved
      ? ((market as any).resolvedOutcome === 'YES' ? HOT_COLOR : NOT_COLOR)
      : isClosed
        ? '#999999'
        : dominantHot ? HOT_COLOR : NOT_COLOR;
  const scheduledDate = isScheduled && (market as any).scheduledFor
    ? new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
    : null;
  const badgeText = isScheduled
    ? (scheduledDate ? `🗓 OPENS ${scheduledDate}` : '🗓 COMING SOON')
    : isResolved
      ? ((market as any).resolvedOutcome === 'YES' ? '🔥 HOT WINS' : '❄️ NOT WINS')
      : isClosed
        ? '🔒 CLOSED'
        : dominantHot ? '🔥 RUNNING HOT' : '❄️ NOT FEELING IT';

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.wrapper, { backgroundColor: colors.card, borderColor: colors.border }, style]}
    >
      {/* Top row: format label + dominant badge */}
      <View style={styles.topRow}>
        <View style={styles.formatBadge}>
          <Text style={styles.formatLabel}>🔥 HOT OR NOT</Text>
        </View>
        <View style={[styles.dominantBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
          <Text style={[styles.dominantLabel, { color: badgeColor }]}>{badgeText}</Text>
        </View>
      </View>

      {/* Subject name — big and editorial */}
      <Text style={[styles.subject, { color: colors.foreground }]} numberOfLines={3}>
        {market.title}
      </Text>

      {/* Question subtext if different from title */}
      {market.question && market.question !== market.title && (
        <Text style={[styles.question, { color: colors.mutedForeground }]} numberOfLines={2}>
          {market.question}
        </Text>
      )}

      {/* Vote split */}
      {isScheduled ? (
        <View style={[styles.voteSection, { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }]}>
          <Text style={{ color: '#f59e0b', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
            {(market as any).scheduledFor
              ? `🗓 Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} — vote when live`
              : '🗓 Opens soon — vote when live'}
          </Text>
        </View>
      ) : !hasVotes ? (
        <View style={[styles.voteSection, { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }]}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
            No votes yet — be first to weigh in
          </Text>
        </View>
      ) : (
        <View style={[styles.voteSection, isClosed && !isResolved ? { opacity: 0.85 } : {}]}>
          {isClosed && !isResolved && (
            <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 6 }}>
              🔒 Snapshot at close
            </Text>
          )}
          <View style={styles.voteLabels}>
            <Text style={[styles.voteLabel, { color: HOT_COLOR }]}>
              🔥 {Math.round(hotPercent)}% HOT <Text style={{ fontSize: 9, opacity: 0.55 }}>({hotCount})</Text>
            </Text>
            <Text style={[styles.voteLabel, { color: NOT_COLOR }]}>
              ❄️ {Math.round(notPercent)}% NOT <Text style={{ fontSize: 9, opacity: 0.55 }}>({notCount})</Text>
            </Text>
          </View>

          {/* Split bar */}
          <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.barHot, { flex: Math.max(hotPercent, 3), opacity: isClosed ? 0.75 : 1 }]} />
            <View style={[styles.barNot, { flex: Math.max(notPercent, 3), opacity: isClosed ? 0.75 : 1 }]} />
          </View>
          {!isClosed && !isResolved && !isScheduled && (() => {
            const margin = Math.abs(Math.round(hotPercent) - Math.round(notPercent));
            const leader = hotPercent > notPercent ? '🔥 HOT' : notPercent > hotPercent ? '❄️ NOT' : null;
            return (
              <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 }}>
                {leader ? `${leader} leads +${margin}pp` : '⚖️ Dead even'}
              </Text>
            );
          })()}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        {isResolved && (market as any).resolvedOutcome ? (
          <>
            <Text style={[styles.ctaText, { color: (market as any).resolvedOutcome === 'YES' ? HOT_COLOR : NOT_COLOR }]}>
              {(market as any).resolvedOutcome === 'YES' ? '🔥 HOT won' : '❄️ NOT won'}
            </Text>
            {totalVotes > 0 && (
              <Text style={[styles.footerText, { color: 'rgba(255,255,255,0.45)', marginLeft: 4 }]}>
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
              </Text>
            )}
          </>
        ) : isClosed ? (
          <>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </Text>
            <Text style={[styles.ctaText, { color: colors.mutedForeground }]}>🔒 Awaiting Resolution</Text>
          </>
        ) : isScheduled ? (
          <Text style={[styles.ctaText, { color: '#f59e0b' }]}>🗓 Opens soon — check back</Text>
        ) : (
          <>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </Text>
            {countdown && (
              <Text style={[styles.countdownText, { color: countdown.urgent ? NOT_COLOR : colors.mutedForeground }]}>
                ⏱ {countdown.label}
              </Text>
            )}
            <Text style={[styles.ctaText, { color: colors.primary }]}>CAST VOTE →</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  formatBadge: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  formatLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)',
  },
  dominantBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  dominantLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  subject: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  question: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginTop: -4,
  },
  voteSection: {
    gap: 8,
  },
  voteLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  voteLabel: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barHot: {
    backgroundColor: HOT_COLOR,
    borderRadius: 5,
  },
  barNot: {
    backgroundColor: NOT_COLOR,
    borderRadius: 5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  ctaText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  countdownText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
});
