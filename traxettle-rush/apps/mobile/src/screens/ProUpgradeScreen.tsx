import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { usePurchase } from '../context/PurchaseContext';

const PRO_FEATURES = [
  {
    icon: '�',
    title: 'No Ads — Even in Free',
    desc: 'Traxettle is completely ad-free. No banners, no pop-ups, no interruptions — ever.',
  },
  {
    icon: '�📅',
    title: 'Unlimited Events',
    desc: 'Free plan is limited to 3 events. Go Pro for unlimited events.',
  },
  {
    icon: '💱',
    title: 'Multi-Currency Settlement',
    desc: 'Split expenses across currencies with automatic FX conversion at EOD rates.',
  },
  {
    icon: '📊',
    title: 'Advanced Analytics',
    desc: 'Detailed spending breakdowns, category insights, and export to Excel, PDF & CSV.',
  },
  {
    icon: '⚡',
    title: 'Priority Support',
    desc: 'Get faster responses and early access to new features.',
  },
];

function isIndiaLocale(): boolean {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const normalized = locale.replace('_', '-').toUpperCase();
    return normalized.endsWith('-IN');
  } catch {
    return false;
  }
}

export default function ProUpgradeScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { isPro, purchasing, priceString, handlePurchase, handleRestore } = usePurchase();
  const renewalPrice = isIndiaLocale() ? '₹299' : '$5.99';

  if (isPro) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.heroCard, { backgroundColor: c.primary + '12' }]}>
          <Text style={styles.heroEmoji}>🎉</Text>
          <Text style={[styles.heroTitle, { color: c.primary }]}>You're a Pro!</Text>
          <Text style={[styles.heroSubtitle, { color: c.textSecondary }]}>
            You have access to all Pro features. Thank you for your support!
          </Text>
        </View>

        <View style={styles.featureList}>
          {PRO_FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, { backgroundColor: c.surface }]}>
              <View style={styles.featureIconWrap}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: c.text }]}>{f.title}</Text>
                <Text style={[styles.featureDesc, { color: c.muted }]}>{f.desc}</Text>
              </View>
              <Text style={[styles.checkIcon, { color: c.success }]}>✓</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: c.border }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.outlineBtnText, { color: c.text }]}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={[styles.heroCard, { backgroundColor: c.primary + '10' }]}>
        <Text style={styles.heroEmoji}>⭐</Text>
        <Text style={[styles.heroTitle, { color: c.primary }]}>Upgrade to Pro</Text>
        <Text style={[styles.heroSubtitle, { color: c.textSecondary }]}>
          Unlock powerful features to manage your expenses like a pro.
        </Text>
      </View>

      {/* Price Card */}
      <View style={[styles.priceCard, { backgroundColor: c.surface, borderColor: c.primary + '30' }]}>
        <View style={styles.priceRow}>
          <Text style={[styles.priceAmount, { color: c.text }]}>{priceString}</Text>
          <View style={[styles.lifetimeBadge, { backgroundColor: c.success + '18' }]}>
            <Text style={[styles.lifetimeBadgeText, { color: c.success }]}>/YEAR</Text>
          </View>
        </View>
        <Text style={[styles.priceNote, { color: c.muted }]}>
          Yearly subscription · Cancel anytime · No hidden fees
        </Text>
        <View style={[styles.offerBanner, { backgroundColor: c.warning + '15' }]}>
          <Text style={[styles.offerText, { color: c.warning }]}>
            10% off for your first year. Then renews at {renewalPrice}/year.
          </Text>
        </View>
      </View>

      {/* Features */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>What you get with Pro</Text>
      <View style={styles.featureList}>
        {PRO_FEATURES.map((f, i) => (
          <View key={i} style={[styles.featureRow, { backgroundColor: c.surface }]}>
            <View style={styles.featureIconWrap}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: c.text }]}>{f.title}</Text>
              <Text style={[styles.featureDesc, { color: c.muted }]}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Purchase Button */}
      <TouchableOpacity
        testID="pro-upgrade-purchase-button"
        style={[styles.purchaseBtn, { backgroundColor: c.primary }, purchasing && styles.purchaseBtnDisabled]}
        onPress={handlePurchase}
        disabled={purchasing}
      >
        {purchasing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.purchaseBtnText}>Subscribe for {priceString}/year</Text>
        )}
      </TouchableOpacity>

      {/* Restore */}
      <TouchableOpacity
        testID="pro-upgrade-restore-button"
        style={styles.restoreBtn}
        onPress={handleRestore}
        disabled={purchasing}
      >
        <Text style={[styles.restoreBtnText, { color: c.primary }]}>Restore Purchase</Text>
      </TouchableOpacity>

      {/* Fine print */}
      <Text style={[styles.finePrint, { color: c.muted }]}>
        Payment will be charged to your {'\n'}
        App Store or Google Play account.{'\n'}
        Subscription renews annually. Cancel anytime.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },

  // Hero
  heroCard: {
    borderRadius: radii.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroEmoji: { fontSize: 48, marginBottom: spacing.sm },
  heroTitle: { fontSize: fontSizes.xxxl, fontWeight: '800', marginBottom: spacing.xs },
  heroSubtitle: { fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },

  // Price Card
  priceCard: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  priceAmount: { fontSize: 36, fontWeight: '800' },
  lifetimeBadge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  lifetimeBadgeText: { fontSize: fontSizes.xs, fontWeight: '700' },
  priceNote: { fontSize: fontSizes.sm, marginBottom: spacing.md },
  offerBanner: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  offerText: { fontSize: fontSizes.xs, fontWeight: '600', textAlign: 'center' },

  // Features
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.md },
  featureList: { marginBottom: spacing.xl },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  featureIconWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },
  featureIcon: { fontSize: 22, lineHeight: 24, textAlign: 'center' },
  featureText: { flex: 1 },
  featureTitle: { fontSize: fontSizes.md, fontWeight: '600', marginBottom: 2 },
  featureDesc: { fontSize: fontSizes.xs, lineHeight: 16 },
  checkIcon: { fontSize: 18, fontWeight: '700' },

  // Buttons
  purchaseBtn: {
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  purchaseBtnDisabled: { opacity: 0.6 },
  purchaseBtnText: { color: '#ffffff', fontSize: fontSizes.lg, fontWeight: '700' },
  restoreBtn: { alignItems: 'center', paddingVertical: spacing.md },
  restoreBtnText: { fontSize: fontSizes.sm, fontWeight: '600' },
  outlineBtn: {
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    marginTop: spacing.xl,
  },
  outlineBtnText: { fontSize: fontSizes.md, fontWeight: '600' },

  // Fine print
  finePrint: {
    fontSize: fontSizes.xs,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 16,
  },
});
