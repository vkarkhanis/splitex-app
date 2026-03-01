import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface FeatureCard {
  icon: string;
  title: string;
  desc: string;
  tag?: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: '👥',
    title: 'Groups & Group-Level Splitting',
    desc: 'Create groups within an event (e.g. "Family", "Couple") and split expenses at the group level. Every member of a group sees identical shares — no manual math.',
    tag: 'USP',
  },
  {
    icon: '💱',
    title: 'Multi-Currency Settlement',
    desc: 'Add expenses in any currency. Traxettle auto-converts amounts using end-of-day FX rates and settles everything in your chosen settlement currency.',
    tag: 'USP',
  },
  {
    icon: '🚫',
    title: 'Completely Ad-Free',
    desc: 'No banners, no pop-ups, no interruptions — ever. Traxettle is 100% ad-free, even on the Free plan.',
    tag: 'USP',
  },
  {
    icon: '📊',
    title: 'Smart Split Types',
    desc: 'Split expenses equally, by ratio, by custom amounts, or on behalf of specific people. Choose the method that fits each expense.',
  },
  {
    icon: '🔒',
    title: 'Private Expenses',
    desc: 'Mark an expense as private so only you can see it. Great for personal purchases during a shared trip.',
  },
  {
    icon: '💳',
    title: 'Payment Methods',
    desc: 'Add your UPI, bank account, PayPal, or Wise details. Payers automatically see your matching-currency methods during settlement.',
  },
  {
    icon: '📩',
    title: 'Invite by Email',
    desc: 'Invite friends to events via email. They join with one tap — no need to share codes or links.',
  },
  {
    icon: '🔄',
    title: 'Real-Time Sync',
    desc: 'All changes sync instantly across devices. Add an expense on your phone and everyone sees it immediately.',
  },
  {
    icon: '📦',
    title: 'Event Lifecycle',
    desc: 'Events move through Active → Settled → Closed stages. Once settled, balances are locked. Close events when fully paid to archive them.',
  },
  {
    icon: '📈',
    title: 'Advanced Analytics (Pro)',
    desc: 'Get detailed spending breakdowns, category insights, and export your data to Excel, PDF, or CSV.',
    tag: 'PRO',
  },
  {
    icon: '⚡',
    title: 'Priority Support (Pro)',
    desc: 'Pro members get faster responses and early access to new features.',
    tag: 'PRO',
  },
];

const TIPS = [
  'Tap your avatar on the Dashboard to access Profile, Invitations, Closed Events, and more.',
  'Use Groups to avoid splitting individually — great for families or couples sharing a single share.',
  'Settlement currency can differ from expense currency. Traxettle handles the conversion.',
  'Mark expenses as "On Behalf" when one person pays for specific others.',
  'Pull down on any list to refresh data from the server.',
];

export default function HelpScreen() {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🧾</Text>
        <Text style={[styles.heroTitle, { color: c.text }]}>Welcome to Traxettle</Text>
        <Text style={[styles.heroSub, { color: c.textSecondary }]}>
          The smartest way to split expenses with friends, family, and groups — across currencies, without ads.
        </Text>
      </View>

      {/* Features */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>Features</Text>
      {FEATURES.map((f, i) => (
        <View key={i} style={[styles.featureCard, { backgroundColor: c.surface, shadowColor: c.black }]}>
          <View style={styles.featureHeader}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: c.text }]}>{f.title}</Text>
            </View>
            {f.tag && (
              <View style={[
                styles.featureTag,
                { backgroundColor: f.tag === 'USP' ? c.primary + '15' : c.warning + '18' },
              ]}>
                <Text style={[
                  styles.featureTagText,
                  { color: f.tag === 'USP' ? c.primary : c.warning },
                ]}>{f.tag}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.featureDesc, { color: c.textSecondary }]}>{f.desc}</Text>
        </View>
      ))}

      {/* Tips */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: spacing.xl }]}>Quick Tips</Text>
      {TIPS.map((tip, i) => (
        <View key={i} style={[styles.tipRow, { borderLeftColor: c.primary }]}>
          <Text style={[styles.tipText, { color: c.textSecondary }]}>{tip}</Text>
        </View>
      ))}

      <View style={{ height: spacing.xxxl * 2 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl },
  hero: { alignItems: 'center', marginBottom: spacing.xl, paddingTop: spacing.md },
  heroIcon: { fontSize: 48, marginBottom: spacing.md },
  heroTitle: { fontSize: fontSizes.xxl, fontWeight: '800', marginBottom: spacing.xs },
  heroSub: { fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.lg },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.md },
  featureCard: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  featureIcon: { fontSize: 24 },
  featureTitle: { fontSize: fontSizes.sm, fontWeight: '700' },
  featureTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  featureTagText: { fontSize: fontSizes.xs, fontWeight: '800' },
  featureDesc: { fontSize: fontSizes.sm, lineHeight: 20, paddingLeft: 24 + spacing.sm },
  tipRow: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  tipText: { fontSize: fontSizes.sm, lineHeight: 20 },
});
