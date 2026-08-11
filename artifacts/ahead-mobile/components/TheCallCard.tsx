import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useGetMarketTally, getGetMarketTallyQueryKey } from '@workspace/api-client-react';
import type { Market } from '@workspace/api-client-react';

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
  const colors = useColors();
  const data = parseTheCallData(market.description);
  const options = data?.options ?? [];

  const { data: tallyData } = useGetMarketTally(market.id, {
    query: { queryKey: getGetMarketTallyQueryKey(market.id) },
  });

  const optionCounts: Record<string, number> = {};
  for (const o of options) {
    optionCounts[o.key] = tallyData?.tallies?.[o.key] ?? 0;
  }
  const totalVotes = Object.values(optionCounts).reduce((a, b) => a + b, 0);
  const hasRealData = totalVotes > 0;

  const leadingKey = hasRealData
    ? Object.entries(optionCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;
  const leadingOption = options.find((o) => o.key === leadingKey);

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
          <View style={[styles.chip, { backgroundColor: 'rgba(207,234,59,0.15)', borderWidth: 1, borderColor: 'rgba(207,234,59,0.35)' }]}>
            <Text style={[styles.chipText, { color: '#CFEA3B' }]}>🎯 THE CALL</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 'auto' as any }]}>
            <Feather name="users" size={10} color="rgba(255,255,255,0.6)" />
            <Text style={[styles.chipText, { marginLeft: 4 }]}>{market.totalPredictions}</Text>
          </View>
        </View>

        {/* Question */}
        <Text style={styles.question} numberOfLines={3}>
          {market.question || market.title}
        </Text>

        {/* Leading crowd teaser */}
        {hasRealData && leadingOption && (
          <Text style={styles.teaser}>
            Crowd leans{' '}
            <Text style={{ color: '#CFEA3B', fontFamily: 'Inter_700Bold' }}>
              {leadingOption.label}
            </Text>
          </Text>
        )}

        {/* Options with bars */}
        {options.length > 0 && (
          <View style={styles.optionsContainer}>
            {options.slice(0, 5).map((o, i) => {
              const count = optionCounts[o.key] ?? 0;
              const pct = hasRealData
                ? Math.round((count / totalVotes) * 100)
                : Math.floor(100 / options.length);
              const isLeading = o.key === leadingKey && hasRealData;
              const color = OPTION_COLORS[i % OPTION_COLORS.length];

              return (
                <View key={o.key} style={styles.optionRow}>
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: isLeading ? '#FFFFFF' : 'rgba(255,255,255,0.6)' },
                    ]}
                    numberOfLines={1}
                  >
                    {o.label}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: color,
                          opacity: isLeading ? 1 : 0.5,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.pctLabel}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Footer CTA */}
        <View style={styles.footer}>
          <Text style={styles.ctaText}>MAKE YOUR PICK</Text>
          <Feather name="arrow-right" size={13} color="#CFEA3B" />
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
  },
});
