import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
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

  const buzzPercent = market.yesPercent ?? 50;
  const booPercent = market.noPercent ?? 50;
  const dominantBuzz = buzzPercent >= booPercent;

  const totalVerdicts = market.totalPredictions ?? 0;

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
        <View
          style={[
            styles.dominantBadge,
            {
              backgroundColor: dominantBuzz ? BUZZ_COLOR + '22' : BOO_COLOR + '22',
              borderColor: dominantBuzz ? BUZZ_COLOR + '66' : BOO_COLOR + '66',
            },
          ]}
        >
          <Text style={[styles.dominantLabel, { color: dominantBuzz ? BUZZ_COLOR : BOO_COLOR }]}>
            {dominantBuzz ? '⚡ BUZZING' : "👎 BOO'D"}
          </Text>
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

      {/* Sentiment split */}
      <View style={styles.sentimentSection}>
        <View style={styles.sentimentLabels}>
          <Text style={[styles.sentimentLabel, { color: BUZZ_COLOR }]}>
            ⚡ {Math.round(buzzPercent)}% BUZZ
          </Text>
          <Text style={[styles.sentimentLabel, { color: BOO_COLOR }]}>
            👎 {Math.round(booPercent)}% BOO
          </Text>
        </View>

        {/* Split bar */}
        <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[styles.barBuzz, { flex: Math.max(buzzPercent, 3) }]}
          />
          <View
            style={[styles.barBoo, { flex: Math.max(booPercent, 3) }]}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          {totalVerdicts} {totalVerdicts === 1 ? 'verdict' : 'verdicts'}
        </Text>
        <Text style={[styles.ctaText, { color: colors.primary }]}>GIVE VERDICT →</Text>
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
});
