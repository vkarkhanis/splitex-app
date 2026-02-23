import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { colors, spacing, radii, fontSizes } from '../theme';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../context/AuthContext';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];

export default function CreateEventScreen({ navigation }: any) {
  const { tier, capabilities } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'event' | 'trip'>('event');
  const [currency, setCurrency] = useState('USD');
  const [settlementCurrency, setSettlementCurrency] = useState('');
  const [fxRateMode, setFxRateMode] = useState<'eod' | 'predefined'>('eod');
  const [predefinedFxRate, setPredefinedFxRate] = useState('');
  const [loading, setLoading] = useState(false);

  const needsFx = settlementCurrency && settlementCurrency !== currency;
  const isFxProFeature = needsFx && !capabilities.multiCurrencySettlement;

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Event name is required.');
      return;
    }

    if (isFxProFeature) {
      Alert.alert('Pro Feature', 'Multi-currency settlement requires a Pro subscription. Upgrade to unlock this feature.');
      return;
    }

    setLoading(true);
    try {
      if (tier === 'free') {
        const events = await api.get<any[]>('/api/events');
        const activeOrClosedCount = (events.data || []).filter(
          (evt: any) => evt?.status === 'active' || evt?.status === 'closed'
        ).length;
        if (activeOrClosedCount >= 3) {
          Alert.alert(
            'Free Plan Limit',
            'Free users can have up to 3 active or closed events/trips. Please upgrade to Pro to create more.'
          );
          setLoading(false);
          return;
        }
      }

      const payload: Record<string, any> = {
        name: name.trim(),
        description: description.trim(),
        type,
        startDate: new Date().toISOString(),
        currency,
      };

      if (needsFx) {
        payload.settlementCurrency = settlementCurrency;
        payload.fxRateMode = fxRateMode;
        if (fxRateMode === 'predefined' && predefinedFxRate) {
          const key = `${currency}_${settlementCurrency}`;
          payload.predefinedFxRates = { [key]: parseFloat(predefinedFxRate) };
        }
      }

      const { data } = await api.post('/api/events', payload);
      Alert.alert('Success', `"${name}" created.`);
      navigation.replace('EventDetail', { eventId: data.id, eventName: name });
    } catch (err: any) {
      if (err instanceof ApiRequestError && err.code === 'FEATURE_REQUIRES_PRO') {
        Alert.alert('Pro Feature', 'Multi-currency settlement requires a Pro subscription. Upgrade to unlock this feature.');
        return;
      }
      Alert.alert('Error', err.message || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Create Event</Text>

      <Text style={styles.label}>Event Name</Text>
      <TextInput testID="create-event-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Goa Trip 2025" placeholderTextColor={colors.muted} />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput testID="create-event-description-input" style={styles.input} value={description} onChangeText={setDescription} placeholder="Brief description..." placeholderTextColor={colors.muted} multiline />

      {/* Type */}
      <Text style={styles.label}>Type</Text>
      <View style={styles.chipRow}>
        {(['event', 'trip'] as const).map(t => (
          <TouchableOpacity
            key={t}
            testID={`create-event-type-${t}`}
            style={[styles.chip, type === t && styles.chipActive]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.chipText, type === t && styles.chipTextActive]}>
              {t === 'event' ? 'Event' : 'Trip'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Currency */}
      <Text style={styles.label}>Expense Currency</Text>
      <View style={styles.chipRow}>
        {CURRENCIES.map(c => (
          <TouchableOpacity
            key={c}
            testID={`create-event-currency-${c}`}
            style={[styles.chip, currency === c && styles.chipActive]}
            onPress={() => setCurrency(c)}
          >
            <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Settlement Currency */}
      <Text style={styles.label}>
        Settlement Currency (optional)
        {tier === 'free' && <Text style={styles.proBadge}> PRO</Text>}
      </Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          testID="create-event-settlement-same"
          style={[styles.chip, !settlementCurrency && styles.chipActive]}
          onPress={() => setSettlementCurrency('')}
        >
          <Text style={[styles.chipText, !settlementCurrency && styles.chipTextActive]}>Same</Text>
        </TouchableOpacity>
        {CURRENCIES.filter(c => c !== currency).map(c => (
          <TouchableOpacity
            key={c}
            testID={`create-event-settlement-${c}`}
            style={[styles.chip, settlementCurrency === c && styles.chipActive]}
            onPress={() => setSettlementCurrency(c)}
          >
            <Text style={[styles.chipText, settlementCurrency === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* FX Settings */}
      {needsFx && (
        <View style={styles.fxSection}>
          <Text style={styles.fxTitle}>FX Rate: {currency} → {settlementCurrency}</Text>
          {isFxProFeature && (
            <View style={styles.proWarning}>
              <Text style={styles.proWarningText}>⭐ Multi-currency settlement is a Pro feature</Text>
            </View>
          )}
          <Text style={styles.label}>FX Rate Mode</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              testID="create-event-fx-mode-eod"
              style={[styles.chip, fxRateMode === 'eod' && styles.chipActive]}
              onPress={() => setFxRateMode('eod')}
            >
              <Text style={[styles.chipText, fxRateMode === 'eod' && styles.chipTextActive]}>EOD Rate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="create-event-fx-mode-predefined"
              style={[styles.chip, fxRateMode === 'predefined' && styles.chipActive]}
              onPress={() => setFxRateMode('predefined')}
            >
              <Text style={[styles.chipText, fxRateMode === 'predefined' && styles.chipTextActive]}>Predefined</Text>
            </TouchableOpacity>
          </View>
          {fxRateMode === 'predefined' && (
            <>
              <Text style={styles.label}>1 {currency} = ? {settlementCurrency}</Text>
              <TextInput
                testID="create-event-fx-rate-input"
                style={styles.input}
                value={predefinedFxRate}
                onChangeText={setPredefinedFxRate}
                keyboardType="decimal-pad"
                placeholder="e.g. 83.50"
                placeholderTextColor={colors.muted}
              />
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        testID="create-event-submit-button"
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitBtnText}>Create Event</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  heading: { fontSize: fontSizes.xxl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.lg },
  proBadge: { color: colors.warning, fontWeight: '700', fontSize: fontSizes.xs },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontSize: fontSizes.md, color: colors.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  chipText: { fontSize: fontSizes.sm, color: colors.text },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  fxSection: {
    marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg,
  },
  fxTitle: { fontSize: fontSizes.md, fontWeight: '600', color: colors.text },
  proWarning: {
    backgroundColor: colors.warningBg, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.sm,
  },
  proWarningText: { fontSize: fontSizes.xs, color: colors.warning, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.lg,
    alignItems: 'center', marginTop: spacing.xxl,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.white, fontSize: fontSizes.md, fontWeight: '600' },
});
