import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Switch,
  Linking,
  Platform,
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEME_NAMES } from '../context/ThemeContext';
import { usePurchase } from '../context/PurchaseContext';
import { api, getResolvedApiBaseUrl, isFirebaseEmulatorEnabled, setFirebaseEmulatorEnabled } from '../api';
import { ENV, isLocalLikeEnv } from '../config/env';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];
const PAYMENT_METHOD_TYPES = ['upi', 'bank', 'paypal', 'wise', 'swift', 'other'] as const;
type PaymentMethodType = typeof PAYMENT_METHOD_TYPES[number];

interface UserPaymentMethod {
  id: string;
  label: string;
  currency: string;
  type: PaymentMethodType;
  details: string;
  isActive: boolean;
}

interface UserProfile {
  userId: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  tier: 'free' | 'pro';
  internalTester?: boolean;
  capabilities?: {
    multiCurrencySettlement: boolean;
  };
  preferences: {
    notifications: boolean;
    currency: string;
    timezone: string;
  };
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, tier, switchTier, internalTester, refreshProfile } = useAuth();
  const { theme, themeName, setThemeName } = useTheme();
  const c = theme.colors;
  const { isPro, priceString } = usePurchase();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tierSwitching, setTierSwitching] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);
  const [devOptionsUnlocked, setDevOptionsUnlocked] = useState(false);
  const [useFirebaseEmulator, setUseFirebaseEmulator] = useState(false);
  const [activeApiBase, setActiveApiBase] = useState('');

  // Editable fields
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notifications, setNotifications] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<UserPaymentMethod[]>([]);
  const [methodLabel, setMethodLabel] = useState('');
  const [methodCurrency, setMethodCurrency] = useState('USD');
  const [methodType, setMethodType] = useState<PaymentMethodType>('bank');
  const [methodDetails, setMethodDetails] = useState('');
  const [methodsLoading, setMethodsLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get<UserProfile>('/api/users/profile');
      if (data) {
        setProfile(data);
        setDisplayName(data.displayName || '');
        setPhoneNumber(data.phoneNumber || '');
        setCurrency(data.preferences?.currency || 'USD');
        setNotifications(data.preferences?.notifications ?? true);
      }
      const methodsRes = await api.get<UserPaymentMethod[]>('/api/users/payment-methods');
      setPaymentMethods(methodsRes.data || []);
    } catch {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => {
    let mounted = true;
    async function loadDevFlags() {
      if (!isLocalLikeEnv() || !ENV.LOCAL_DEV_OPTIONS_ENABLED) return;
      const [enabled, apiBase] = await Promise.all([
        isFirebaseEmulatorEnabled(),
        getResolvedApiBaseUrl(),
      ]);
      if (!mounted) return;
      setUseFirebaseEmulator(enabled);
      setActiveApiBase(apiBase);
    }
    void loadDevFlags();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/api/users/profile', {
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        preferences: {
          currency,
          notifications,
          timezone: profile?.preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      await refreshProfile();
      Alert.alert('Success', 'Profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    const label = methodLabel.trim();
    const details = methodDetails.trim();
    if (!label || !details) {
      Alert.alert('Missing fields', 'Please enter method label and payment details.');
      return;
    }
    setMethodsLoading(true);
    try {
      const { data } = await api.post<UserPaymentMethod>('/api/users/payment-methods', {
        label,
        currency: methodCurrency,
        type: methodType,
        details,
        isActive: true,
      });
      if (data) setPaymentMethods((prev) => [data, ...prev]);
      setMethodLabel('');
      setMethodDetails('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add payment method');
    } finally {
      setMethodsLoading(false);
    }
  };

  const handleTogglePaymentMethod = async (method: UserPaymentMethod) => {
    try {
      const { data } = await api.put<UserPaymentMethod>(`/api/users/payment-methods/${method.id}`, {
        isActive: !method.isActive,
      });
      if (data) setPaymentMethods((prev) => prev.map((m) => (m.id === data.id ? data : m)));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update payment method');
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    Alert.alert('Delete payment method?', 'This method will no longer be shown to payers.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/users/payment-methods/${methodId}`);
            setPaymentMethods((prev) => prev.filter((m) => m.id !== methodId));
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete payment method');
          }
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const canShowTierSwitch =
    ENV.INTERNAL_FEATURES_ENABLED &&
    (isLocalLikeEnv() || internalTester);
  const canShowHiddenDevOptions = isLocalLikeEnv() && ENV.LOCAL_DEV_OPTIONS_ENABLED;

  const handleSwitchTier = async (next: 'free' | 'pro') => {
    setTierSwitching(true);
    try {
      await switchTier(next);
      Alert.alert('Success', `Switched to ${next.toUpperCase()} tier.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to switch tier');
    } finally {
      setTierSwitching(false);
    }
  };

  const handleVersionTap = () => {
    if (!canShowHiddenDevOptions) return;
    const next = devTapCount + 1;
    if (next >= 7) {
      setDevOptionsUnlocked(true);
      setDevTapCount(0);
      Alert.alert('Developer options unlocked', 'Hidden local tools are now visible.');
      return;
    }
    setDevTapCount(next);
  };

  const handleFirebaseEmulatorToggle = async (enabled: boolean) => {
    try {
      await setFirebaseEmulatorEnabled(enabled);
      const apiBase = await getResolvedApiBaseUrl();
      setUseFirebaseEmulator(enabled);
      setActiveApiBase(apiBase);
      Alert.alert('Developer setting updated', `Firebase Local Emulator Suite ${enabled ? 'enabled' : 'disabled'} for local mode.`);
    } catch {
      Alert.alert('Error', 'Failed to update emulator setting.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data including:\n\n• Profile information\n• All events you created\n• All expenses you added\n• Payment methods\n• Account settings\n\nThis action cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/api/users/account');
              await logout();
              Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleManageSubscription = () => {
    const url = Platform.OS === 'ios' 
      ? 'https://apps.apple.com/account/subscriptions' 
      : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => {
      // Fallback: direct user to platform settings
      if (Platform.OS === 'ios') {
        Linking.openURL('https://support.apple.com/en-us/HT202039');
      } else {
        Linking.openURL('https://support.google.com/googleplay/answer/7018481');
      }
    });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      {/* Profile Info */}
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Profile</Text>
        <Text style={[styles.cardSub, { color: c.muted }]}>{profile?.email || user?.email || ''}</Text>

        <Text style={[styles.label, { color: c.textSecondary }]}>Display Name</Text>
        <TextInput
          testID="profile-display-name-input"
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>Phone Number</Text>
        <TextInput
          testID="profile-phone-input"
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="+1 234 567 8900"
          placeholderTextColor={c.muted}
          keyboardType="phone-pad"
        />
      </View>

      {/* Preferences */}
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Preferences</Text>

        <Text style={[styles.label, { color: c.textSecondary }]}>Default Currency</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {CURRENCIES.map(cur => (
              <TouchableOpacity
                key={cur}
                testID={`profile-currency-${cur}`}
                style={[
                  styles.chip,
                  { borderColor: c.border, backgroundColor: c.surface },
                  currency === cur && { borderColor: c.primary, backgroundColor: c.primary + '15' },
                ]}
                onPress={() => setCurrency(cur)}
              >
                <Text style={[
                  styles.chipText,
                  { color: c.text },
                  currency === cur && { color: c.primary, fontWeight: '600' },
                ]}>{cur}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: c.text }]}>Notifications</Text>
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{ true: c.primary }} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Payment Methods</Text>
        <Text style={[styles.cardSub, { color: c.muted }]}>
          Payers will see matching-currency methods during settlement.
        </Text>

        {paymentMethods.length === 0 ? (
          <View style={[styles.pmEmptyWrap, { borderColor: c.border }]}>
            <Text style={styles.pmEmptyIcon}>💳</Text>
            <Text style={[styles.pmEmptyText, { color: c.muted }]}>No payment methods added yet</Text>
            <Text style={[styles.pmEmptyHint, { color: c.muted }]}>Add methods below so payers can settle with you</Text>
          </View>
        ) : (
          paymentMethods.map((method) => (
            <View key={method.id} style={[styles.pmCard, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <View style={styles.pmCardHeader}>
                <View style={[styles.pmStatusDot, { backgroundColor: method.isActive ? c.success : c.muted + '60' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pmCardLabel, { color: c.text }]}>{method.label}</Text>
                  <Text style={[styles.pmCardType, { color: c.muted }]}>{method.type.toUpperCase()}</Text>
                </View>
                <View style={[styles.pmCurrencyBadge, { backgroundColor: c.primary + '14' }]}>
                  <Text style={[styles.pmCurrencyBadgeText, { color: c.primary }]}>{method.currency}</Text>
                </View>
              </View>
              <Text style={[styles.pmCardDetails, { color: c.textSecondary }]}>{method.details}</Text>
              <View style={styles.pmCardFooter}>
                <TouchableOpacity
                  style={[styles.pmActionBtn, { backgroundColor: method.isActive ? c.warning + '12' : c.success + '12' }]}
                  onPress={() => handleTogglePaymentMethod(method)}
                >
                  <Text style={[styles.pmActionBtnText, { color: method.isActive ? c.warning : c.success }]}>
                    {method.isActive ? 'Disable' : 'Enable'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pmActionBtn, { backgroundColor: c.error + '10' }]}
                  onPress={() => handleDeletePaymentMethod(method.id)}
                >
                  <Text style={[styles.pmActionBtnText, { color: c.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* ── Add New Method Form ── */}
        <View style={[styles.pmFormDivider, { borderColor: c.border }]} />
        <Text style={[styles.pmFormTitle, { color: c.text }]}>Add New Method</Text>

        <Text style={[styles.pmFieldLabel, { color: c.textSecondary }]}>Label</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          value={methodLabel}
          onChangeText={setMethodLabel}
          placeholder="e.g. Personal UPI, HDFC Savings, Wise"
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.pmFieldLabel, { color: c.textSecondary }]}>Currency</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pmChipScroll}>
          <View style={styles.chipRow}>
            {CURRENCIES.map((cur) => (
              <TouchableOpacity
                key={`pm-cur-${cur}`}
                style={[
                  styles.chip,
                  { borderColor: c.border, backgroundColor: c.surface },
                  methodCurrency === cur && { borderColor: c.primary, backgroundColor: c.primary + '15' },
                ]}
                onPress={() => setMethodCurrency(cur)}
              >
                <Text style={[
                  styles.chipText,
                  { color: c.text },
                  methodCurrency === cur && { color: c.primary, fontWeight: '600' },
                ]}>{cur}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.pmFieldLabel, { color: c.textSecondary }]}>Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pmChipScroll}>
          <View style={styles.chipRow}>
            {PAYMENT_METHOD_TYPES.map((typ) => (
              <TouchableOpacity
                key={`pm-type-${typ}`}
                style={[
                  styles.chip,
                  { borderColor: c.border, backgroundColor: c.surface },
                  methodType === typ && { borderColor: c.primary, backgroundColor: c.primary + '15' },
                ]}
                onPress={() => setMethodType(typ)}
              >
                <Text style={[
                  styles.chipText,
                  { color: c.text },
                  methodType === typ && { color: c.primary, fontWeight: '600' },
                ]}>{typ.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.pmFieldLabel, { color: c.textSecondary }]}>Payment Details</Text>
        <TextInput
          style={[styles.input, styles.pmDetailsInput, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          value={methodDetails}
          onChangeText={setMethodDetails}
          placeholder="UPI ID / Account+IFSC / PayPal email / Wise tag..."
          placeholderTextColor={c.muted}
          multiline
        />
        <TouchableOpacity
          style={[styles.pmAddBtn, { backgroundColor: c.primary }, methodsLoading && styles.saveBtnDisabled]}
          onPress={handleAddPaymentMethod}
          disabled={methodsLoading}
        >
          <Text style={styles.pmAddBtnText}>{methodsLoading ? 'Adding...' : '+ Add Payment Method'}</Text>
        </TouchableOpacity>
      </View>

      {/* Pro Upgrade */}
      {!isPro && (
        <TouchableOpacity
          testID="profile-upgrade-pro-button"
          style={[styles.proCard, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}
          onPress={() => navigation.navigate('ProUpgrade')}
          activeOpacity={0.7}
        >
          <Text style={styles.proEmoji}>⭐</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.proTitle, { color: c.primary }]}>Upgrade to Pro</Text>
            <Text style={[styles.proDesc, { color: c.textSecondary }]}>
              Unlimited events, multi-currency &amp; more · {priceString}/year
            </Text>
          </View>
          <Text style={[styles.proArrow, { color: c.primary }]}>›</Text>
        </TouchableOpacity>
      )}
      {isPro && (
        <View style={[styles.proCard, { backgroundColor: c.success + '10', borderColor: c.success + '30' }]}>
          <Text style={styles.proEmoji}>🎉</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.proTitle, { color: c.success }]}>Pro Active</Text>
            <Text style={[styles.proDesc, { color: c.textSecondary }]}>
              You have access to all Pro features
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.manageSubBtn, { borderColor: c.success }]}
            onPress={handleManageSubscription}
          >
            <Text style={[styles.manageSubBtnText, { color: c.success }]}>Manage</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Theme */}
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Theme</Text>
        <View style={styles.chipRow}>
          {THEME_NAMES.map(t => (
            <TouchableOpacity
              key={t.key}
              testID={`profile-theme-${t.key}`}
              style={[
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                themeName === t.key && { borderColor: c.primary, backgroundColor: c.primary + '15' },
              ]}
              onPress={() => setThemeName(t.key)}
            >
              <Text style={[
                styles.chipText,
                { color: c.text },
                themeName === t.key && { color: c.primary, fontWeight: '600' },
              ]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {canShowTierSwitch && (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Internal Tier Switch</Text>
          <Text style={[styles.cardSub, { color: c.muted }]}>Current: {tier.toUpperCase()}</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              testID="profile-tier-free"
              style={[
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                tier === 'free' && { borderColor: c.primary, backgroundColor: c.primary + '15' },
              ]}
              onPress={() => handleSwitchTier('free')}
              disabled={tierSwitching}
            >
              <Text style={[styles.chipText, { color: tier === 'free' ? c.primary : c.text }]}>FREE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="profile-tier-pro"
              style={[
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                tier === 'pro' && { borderColor: c.primary, backgroundColor: c.primary + '15' },
              ]}
              onPress={() => handleSwitchTier('pro')}
              disabled={tierSwitching}
            >
              <Text style={[styles.chipText, { color: tier === 'pro' ? c.primary : c.text }]}>PRO</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {devOptionsUnlocked && canShowHiddenDevOptions && (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Developer (Hidden)</Text>
          <Text style={[styles.cardSub, { color: c.muted }]}>Local-only tooling for Firebase Emulator Suite.</Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: c.text }]}>Use Firebase Emulator</Text>
            <Switch
              testID="profile-firebase-emulator-switch"
              value={useFirebaseEmulator}
              onValueChange={handleFirebaseEmulatorToggle}
              trackColor={{ true: c.primary }}
            />
          </View>
          <Text style={[styles.cardSub, { color: c.muted, marginBottom: 0 }]}>API target: {activeApiBase || 'Loading...'}</Text>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity
        testID="profile-save-button"
        style={[styles.saveBtn, { backgroundColor: c.primary }, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Changes</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity testID="profile-signout-button" style={[styles.signOutBtn, { borderColor: c.error }]} onPress={handleSignOut}>
        <Text style={[styles.signOutText, { color: c.error }]}>Sign Out</Text>
      </TouchableOpacity>

      <TouchableOpacity testID="profile-delete-account-button" style={[styles.deleteAccountBtn, { borderColor: c.error, backgroundColor: c.error + '10' }]} onPress={handleDeleteAccount}>
        <Text style={[styles.deleteAccountText, { color: c.error }]}>Delete Account</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.9}>
        <Text style={[styles.version, { color: c.muted }]}>Traxettle v{ENV.APP_VERSION}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.xs },
  cardSub: { fontSize: fontSizes.sm, marginBottom: spacing.md },
  label: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    borderRadius: radii.sm, borderWidth: 1,
    padding: spacing.md, fontSize: fontSizes.md,
  },
  chipScroll: { marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.full, borderWidth: 1.5,
  },
  chipText: { fontSize: fontSizes.sm },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  toggleLabel: { fontSize: fontSizes.sm },
  emptySmall: { fontSize: fontSizes.xs, marginBottom: spacing.sm },
  // Payment Methods — empty state
  pmEmptyWrap: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: radii.md,
    paddingVertical: spacing.xl, paddingHorizontal: spacing.lg,
    alignItems: 'center', marginBottom: spacing.md,
  },
  pmEmptyIcon: { fontSize: 32, marginBottom: spacing.sm },
  pmEmptyText: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: 4 },
  pmEmptyHint: { fontSize: fontSizes.xs, textAlign: 'center' },
  // Payment Methods — card
  pmCard: {
    borderWidth: 1, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  pmCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pmStatusDot: { width: 8, height: 8, borderRadius: 4 },
  pmCardLabel: { fontSize: fontSizes.sm, fontWeight: '700' },
  pmCardType: { fontSize: fontSizes.xs, marginTop: 1 },
  pmCurrencyBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radii.full,
  },
  pmCurrencyBadgeText: { fontSize: fontSizes.xs, fontWeight: '700' },
  pmCardDetails: {
    fontSize: fontSizes.sm, lineHeight: 20,
    paddingLeft: spacing.sm + 8 + spacing.sm, // align with label after dot
    marginBottom: spacing.sm,
  },
  pmCardFooter: {
    flexDirection: 'row', gap: spacing.sm,
    paddingLeft: spacing.sm + 8 + spacing.sm,
  },
  pmActionBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
  },
  pmActionBtnText: { fontSize: fontSizes.xs, fontWeight: '700' },
  // Payment Methods — add form
  pmFormDivider: {
    borderTopWidth: 1, marginTop: spacing.md, marginBottom: spacing.lg,
  },
  pmFormTitle: { fontSize: fontSizes.md, fontWeight: '700', marginBottom: spacing.sm },
  pmFieldLabel: {
    fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase' as const,
    letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.md,
  },
  pmChipScroll: { marginBottom: spacing.xs },
  pmDetailsInput: { minHeight: 72, textAlignVertical: 'top' as const },
  pmAddBtn: {
    borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center',
    marginTop: spacing.lg,
  },
  pmAddBtnText: { color: '#ffffff', fontSize: fontSizes.sm, fontWeight: '700' },
  saveBtn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center',
    marginBottom: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },
  signOutBtn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center',
    borderWidth: 1.5, marginBottom: spacing.md,
  },
  signOutText: { fontSize: fontSizes.md, fontWeight: '600' },
  deleteAccountBtn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center',
    borderWidth: 1.5, marginBottom: spacing.lg,
  },
  deleteAccountText: { fontSize: fontSizes.md, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: fontSizes.xs, marginTop: spacing.md },

  // Pro upgrade card
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    gap: spacing.md,
  },
  proEmoji: { fontSize: 28 },
  proTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  proDesc: { fontSize: fontSizes.xs, marginTop: 2, lineHeight: 16 },
  proArrow: { fontSize: 24, color: '#3b82f6' },
  manageSubBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radii.full, borderWidth: 1,
  },
  manageSubBtnText: { fontSize: fontSizes.xs, fontWeight: '700' },
});
