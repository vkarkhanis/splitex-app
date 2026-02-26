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
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEME_NAMES } from '../context/ThemeContext';
import { usePurchase } from '../context/PurchaseContext';
import { api, getResolvedApiBaseUrl, isFirebaseEmulatorEnabled, setFirebaseEmulatorEnabled } from '../api';
import { ENV, isLocalLikeEnv } from '../config/env';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];

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
  const { user, logout, tier, switchTier, internalTester } = useAuth();
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
      Alert.alert('Success', 'Profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
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
  saveBtn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center',
    marginBottom: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },
  signOutBtn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center',
    borderWidth: 1.5, marginBottom: spacing.lg,
  },
  signOutText: { fontSize: fontSizes.md, fontWeight: '600' },
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
  proArrow: { fontSize: 28, fontWeight: '300' },
});
