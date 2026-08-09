import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

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

function SectionRow({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: any }) {
  return (
    <View style={[styles.sectionRow, { borderBottomColor: colors.border }]}>
      <Feather name={icon as any} size={16} color={colors.mutedForeground} />
      <Text style={[styles.sectionRowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.sectionRowValue, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 84 + 34 : 80 + insets.bottom;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPadding + 8, paddingBottom: bottomPadding + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>You</Text>
      </View>

      {/* Avatar & name */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.avatarInitial, { color: colors.primary }]}>A</Text>
        </View>
        <Text style={[styles.displayName, { color: colors.foreground }]}>forecaster</Text>
        <View style={[styles.memberBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.memberText, { color: colors.mutedForeground }]}>
            Member since Aug 2026
          </Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatCard value="—" label="Predictions" color={colors.primary} />
        <StatCard value="—" label="Accuracy" color={colors.primary} />
        <StatCard value="—" label="Tokens" color={colors.accent} />
        <StatCard value="—" label="Rank" color={colors.accent} />
      </View>

      {/* Sign in prompt */}
      <View style={[styles.signInCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}>
        <Feather name="user-plus" size={28} color={colors.primary} />
        <Text style={[styles.signInTitle, { color: colors.foreground }]}>
          Create your account
        </Text>
        <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
          Sign up to track your predictions, earn tokens, and climb the rankings.
        </Text>
        <View style={[styles.signInBtn, { backgroundColor: colors.primary }]}>
          <Text style={[styles.signInBtnText, { color: colors.primaryForeground }]}>
            Coming Soon
          </Text>
        </View>
      </View>

      {/* About section */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ABOUT</Text>
        <SectionRow icon="info" label="Version" value="1.0.0" colors={colors} />
        <SectionRow icon="globe" label="Platform" value="AHEAD" colors={colors} />
        <SectionRow
          icon="map-pin"
          label="Focus"
          value="Boston, MA"
          colors={colors}
        />
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
  header: {
    marginBottom: 24,
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
