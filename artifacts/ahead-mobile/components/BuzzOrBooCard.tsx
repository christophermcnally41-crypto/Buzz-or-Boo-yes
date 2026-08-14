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

const BUZZ_COLOR = '#CFEA3B';
const BOO_COLOR = '#E8503E';

interface BuzzOrBooCardProps {
  market: Market;
  onPress?: () => void;
  style?: object;
}

export function BuzzOrBooCard({ market, onPress, style }: BuzzOrBooCardProps) {
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
  const hasVerdicts = tallyTotal > 0 || (market.totalPredictions ?? 0) > 0;
  const buzzPercent = tallyTotal > 0 ? (tallyYes / tallyTotal) * 100 : (hasVerdicts ? (market.yesPercent ?? 50) : 50);
  const booPercent = tallyTotal > 0 ? (tallyNo / tallyTotal) * 100 : (hasVerdicts ? (market.noPercent ?? 50) : 50);
  const buzzCount = tallyTotal > 0 ? tallyYes : 0;
  const booCount = tallyTotal > 0 ? tallyNo : 0;
  const dominantBuzz = buzzPercent >= booPercent;

  const totalVerdicts = tallyTotal > 0 ? tallyTotal : (market.totalPredictions ?? 0);
  const isScheduled = market.status === 'SCHEDULED';

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.wrapper, { backgroundColor: colors.card, borderColor: colors.border }, style]}
    >
      {/* Top row: format label + dominant badge */}
      <View style={styles.topRow}>
        <View style={styles.formatBadge}>
          <Text style={styles.formatLabel}>⚡ BUZZ OR BOO</Text>
        </View>
        {(() => {
          const resolvedOutcome = (market as any).resolvedOutcome as string | null | undefined;
          const isResolved = market.status === 'RESOLVED';
          const isClosed = market.status === 'CLOSED';
          const badgeBg = isScheduled ? '#f59e0b22' : isResolved ? (resolvedOutcome === 'YES' ? BUZZ_COLOR + '22' : BOO_COLOR + '22') : isClosed ? 'rgba(100,100,100,0.15)' : dominantBuzz ? BUZZ_COLOR + '22' : BOO_COLOR + '22';
          const badgeBorder = isScheduled ? '#f59e0b66' : isResolved ? (resolvedOutcome === 'YES' ? BUZZ_COLOR + '66' : BOO_COLOR + '66') : isClosed ? 'rgba(100,100,100,0.3)' : dominantBuzz ? BUZZ_COLOR + '66' : BOO_COLOR + '66';
          const badgeColor = isScheduled ? '#f59e0b' : isResolved ? (resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR) : isClosed ? '#999999' : dominantBuzz ? BUZZ_COLOR : BOO_COLOR;
          const scheduledDate = isScheduled && (market as any).scheduledFor
            ? new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
            : null;
          const badgeText = isScheduled ? (scheduledDate ? `🗓 OPENS ${scheduledDate}` : '🗓 COMING SOON') : isResolved ? (resolvedOutcome === 'YES' ? '⚡ BUZZ WON' : "👎 BOO WON") : isClosed ? '🔒 CLOSED' : dominantBuzz ? '⚡ BUZZING' : "👎 BOO'D";
          return (
            <View style={[styles.dominantBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
              <Text style={[styles.dominantLabel, { color: badgeColor }]}>{badgeText}</Text>
            </View>
          );
        })()}
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

      {/* Sentiment split */}
      {isScheduled ? (
        <View style={[styles.sentimentSection, { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }]}>
          <Text style={{ color: '#f59e0b', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
            {(market as any).scheduledFor
              ? `🗓 Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} — cast your verdict when live`
              : '🗓 Opens soon — cast your verdict when live'}
          </Text>
        </View>
      ) : !hasVerdicts ? (
        <View style={[styles.sentimentSection, { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }]}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
            No verdicts yet — be first to weigh in
          </Text>
        </View>
      ) : (
        <View style={[styles.sentimentSection, market.status === 'CLOSED' && market.status !== 'RESOLVED' ? { opacity: 0.85 } : {}]}>
          {market.status === 'CLOSED' && market.status !== 'RESOLVED' && (
            <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 6 }}>🔒 Snapshot at close</Text>
          )}
          <View style={styles.sentimentLabels}>
            <Text style={[styles.sentimentLabel, { color: BUZZ_COLOR }]}>
              ⚡ {Math.round(buzzPercent)}% BUZZ <Text style={{ fontSize: 9, opacity: 0.55 }}>({buzzCount})</Text>
            </Text>
            <Text style={[styles.sentimentLabel, { color: BOO_COLOR }]}>
              👎 {Math.round(booPercent)}% BOO <Text style={{ fontSize: 9, opacity: 0.55 }}>({booCount})</Text>
            </Text>
          </View>

          {/* Split bar */}
          <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[styles.barBuzz, { flex: Math.max(buzzPercent, 3), opacity: market.status === 'CLOSED' ? 0.75 : 1 }]}
            />
            <View
              style={[styles.barBoo, { flex: Math.max(booPercent, 3), opacity: market.status === 'CLOSED' ? 0.75 : 1 }]}
            />
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        {market.status === 'RESOLVED' && market.resolvedOutcome ? (
          <>
            <Text style={[styles.ctaText, { color: market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR }]}>
              {market.resolvedOutcome === 'YES' ? '⚡ BUZZ won' : '👎 BOO won'}
            </Text>
            {totalVerdicts > 0 && (
              <Text style={[styles.footerText, { color: 'rgba(255,255,255,0.45)', marginLeft: 4 }]}>
                {totalVerdicts} {totalVerdicts === 1 ? 'verdict' : 'verdicts'}
              </Text>
            )}
          </>
        ) : market.status === 'CLOSED' ? (
          <>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {totalVerdicts} {totalVerdicts === 1 ? 'verdict' : 'verdicts'}
            </Text>
            <Text style={[styles.ctaText, { color: colors.mutedForeground }]}>🔒 Awaiting Resolution</Text>
          </>
        ) : isScheduled ? (
          <Text style={[styles.ctaText, { color: '#f59e0b' }]}>🗓 Opens soon — check back</Text>
        ) : (
          <>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {totalVerdicts} {totalVerdicts === 1 ? 'verdict' : 'verdicts'}
            </Text>
            {countdown && (
              <Text style={[styles.countdownText, { color: countdown.urgent ? '#E8503E' : colors.mutedForeground }]}>
                ⏱ {countdown.label}
              </Text>
            )}
            <Text style={[styles.ctaText, { color: colors.primary }]}>GIVE VERDICT →</Text>
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
  sentimentSection: {
    gap: 8,
  },
  sentimentLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sentimentLabel: {
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
  barBuzz: {
    backgroundColor: BUZZ_COLOR,
    borderRadius: 5,
  },
  barBoo: {
    backgroundColor: BOO_COLOR,
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
