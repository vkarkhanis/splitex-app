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
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../context/AuthContext';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];

export default function CreateEventScreen({ navigation }: any) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { tier, capabilities } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'event' | 'trip'>('event');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [pickerDay, setPickerDay] = useState(new Date().getDate());
  const [currency, setCurrency] = useState('USD');
  const [settlementCurrency, setSettlementCurrency] = useState('');
  const [fxRateMode, setFxRateMode] = useState<'eod' | 'predefined'>('eod');
  const [predefinedFxRate, setPredefinedFxRate] = useState('');
  const [loading, setLoading] = useState(false);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const formatDisplayDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

  const openPicker = (target: 'start' | 'end') => {
    const d = target === 'start' ? startDate : (endDate || startDate);
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth());
    setPickerDay(d.getDate());
    setPickerTarget(target);
  };

  const confirmPicker = () => {
    const maxDay = daysInMonth(pickerYear, pickerMonth);
    const safeDay = Math.min(pickerDay, maxDay);
    const selected = new Date(pickerYear, pickerMonth, safeDay);
    if (pickerTarget === 'start') {
      setStartDate(selected);
      if (endDate && selected > endDate) setEndDate(null);
    } else {
      setEndDate(selected);
    }
    setPickerTarget(null);
  };

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

    if (needsFx && fxRateMode === 'predefined') {
      const parsed = Number(predefinedFxRate);
      if (!predefinedFxRate || !Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert('Error', `Enter a valid predefined FX rate for ${currency} → ${settlementCurrency}.`);
        return;
      }
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
        startDate: startDate.toISOString(),
        endDate: endDate ? endDate.toISOString() : undefined,
        currency,
      };

      if (needsFx) {
        payload.settlementCurrency = settlementCurrency;
        payload.fxRateMode = fxRateMode;
        if (fxRateMode === 'predefined' && predefinedFxRate) {
          const key = `${currency}_${settlementCurrency}`;
          payload.predefinedFxRates = { [key]: Number(predefinedFxRate) };
        }
      }

      const { data } = await api.post('/api/events', payload);
      const createdEventId = (data as any)?.id || (data as any)?.eventId || (data as any)?.event?.id;
      if (!createdEventId) {
        throw new Error('Event creation response was incomplete. Please refresh and check your events list.');
      }
      Alert.alert('Success', `"${name}" created.`);
      navigation.replace('EventDetail', { eventId: createdEventId, eventName: name });
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: colors.text }]}>Create Event</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Event Name</Text>
      <TextInput testID="create-event-name-input" style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={name} onChangeText={setName} placeholder="e.g. Goa Trip 2025" placeholderTextColor={colors.muted} />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Description (optional)</Text>
      <TextInput testID="create-event-description-input" style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={description} onChangeText={setDescription} placeholder="Brief description..." placeholderTextColor={colors.muted} multiline />

      {/* Dates */}
      <View style={styles.dateRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Start Date</Text>
          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openPicker('start')}
          >
            <Text style={[styles.dateBtnText, { color: colors.text }]}>
              {formatDisplayDate(startDate)}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>End Date (optional)</Text>
          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openPicker('end')}
          >
            <Text style={[styles.dateBtnText, { color: endDate ? colors.text : colors.muted }]}>
              {endDate ? formatDisplayDate(endDate) : 'Not set'}
            </Text>
          </TouchableOpacity>
          {endDate && (
            <TouchableOpacity onPress={() => setEndDate(null)}>
              <Text style={[styles.clearDateText, { color: colors.error }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Type */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
      <View style={styles.chipRow}>
        {(['event', 'trip'] as const).map(t => (
          <TouchableOpacity
            key={t}
            testID={`create-event-type-${t}`}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, type === t && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.chipText, { color: colors.text }, type === t && { color: colors.primary, fontWeight: '600' }]}>
              {t === 'event' ? 'Event' : 'Trip'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Currency */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>Expense Currency</Text>
      <View style={styles.chipRow}>
        {CURRENCIES.map(cur => (
          <TouchableOpacity
            key={cur}
            testID={`create-event-currency-${cur}`}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, currency === cur && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
            onPress={() => setCurrency(cur)}
          >
            <Text style={[styles.chipText, { color: colors.text }, currency === cur && { color: colors.primary, fontWeight: '600' }]}>{cur}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Settlement Currency */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Settlement Currency (optional)
        {tier === 'free' && <Text style={[styles.proBadge, { color: colors.warning }]}> PRO</Text>}
      </Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          testID="create-event-settlement-same"
          style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, !settlementCurrency && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
          onPress={() => setSettlementCurrency('')}
        >
          <Text style={[styles.chipText, { color: colors.text }, !settlementCurrency && { color: colors.primary, fontWeight: '600' }]}>Same</Text>
        </TouchableOpacity>
        {CURRENCIES.filter(cur => cur !== currency).map(cur => (
          <TouchableOpacity
            key={cur}
            testID={`create-event-settlement-${cur}`}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, settlementCurrency === cur && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
            onPress={() => setSettlementCurrency(cur)}
          >
            <Text style={[styles.chipText, { color: colors.text }, settlementCurrency === cur && { color: colors.primary, fontWeight: '600' }]}>{cur}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* FX Settings */}
      {needsFx && (
        <View style={[styles.fxSection, { borderColor: colors.border }]}>
          <Text style={[styles.fxTitle, { color: colors.text }]}>FX Rate: {currency} → {settlementCurrency}</Text>
          {isFxProFeature && (
            <View style={[styles.proWarning, { backgroundColor: colors.warningBg }]}>
              <Text style={[styles.proWarningText, { color: colors.warning }]}>⭐ Multi-currency settlement is a Pro feature</Text>
            </View>
          )}
          <Text style={[styles.label, { color: colors.textSecondary }]}>FX Rate Mode</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              testID="create-event-fx-mode-eod"
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, fxRateMode === 'eod' && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
              onPress={() => setFxRateMode('eod')}
            >
              <Text style={[styles.chipText, { color: colors.text }, fxRateMode === 'eod' && { color: colors.primary, fontWeight: '600' }]}>EOD Rate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="create-event-fx-mode-predefined"
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, fxRateMode === 'predefined' && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
              onPress={() => setFxRateMode('predefined')}
            >
              <Text style={[styles.chipText, { color: colors.text }, fxRateMode === 'predefined' && { color: colors.primary, fontWeight: '600' }]}>Predefined</Text>
            </TouchableOpacity>
          </View>
          {fxRateMode === 'predefined' && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>1 {currency} = ? {settlementCurrency}</Text>
              <TextInput
                testID="create-event-fx-rate-input"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
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
        style={[styles.submitBtn, { backgroundColor: colors.primary }, loading && styles.submitBtnDisabled]}
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

    {/* Date Picker Modal */}
    <Modal visible={pickerTarget !== null} transparent animationType="fade" onRequestClose={() => setPickerTarget(null)}>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>
            {pickerTarget === 'start' ? 'Start Date' : 'End Date'}
          </Text>

          {/* Month selector */}
          <Text style={[styles.pickerSectionLabel, { color: colors.textSecondary }]}>Month</Text>
          <View style={styles.pickerChipRow}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={m}
                style={[styles.pickerChip, { borderColor: colors.border, backgroundColor: colors.background }, pickerMonth === i && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                onPress={() => setPickerMonth(i)}
              >
                <Text style={[styles.pickerChipText, { color: colors.text }, pickerMonth === i && { color: colors.primary, fontWeight: '700' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Year selector */}
          <Text style={[styles.pickerSectionLabel, { color: colors.textSecondary }]}>Year</Text>
          <View style={styles.pickerChipRow}>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map(y => (
              <TouchableOpacity
                key={y}
                style={[styles.pickerChip, { borderColor: colors.border, backgroundColor: colors.background }, pickerYear === y && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                onPress={() => setPickerYear(y)}
              >
                <Text style={[styles.pickerChipText, { color: colors.text }, pickerYear === y && { color: colors.primary, fontWeight: '700' }]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Day selector */}
          <Text style={[styles.pickerSectionLabel, { color: colors.textSecondary }]}>Day</Text>
          <View style={styles.pickerChipRow}>
            {Array.from({ length: daysInMonth(pickerYear, pickerMonth) }, (_, i) => i + 1).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.pickerDayChip, { borderColor: colors.border, backgroundColor: colors.background }, pickerDay === d && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                onPress={() => setPickerDay(d)}
              >
                <Text style={[styles.pickerDayText, { color: colors.text }, pickerDay === d && { color: colors.primary, fontWeight: '700' }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.pickerActions}>
            <TouchableOpacity style={[styles.pickerCancelBtn, { borderColor: colors.border }]} onPress={() => setPickerTarget(null)}>
              <Text style={[styles.pickerBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pickerConfirmBtn, { backgroundColor: colors.primary }]} onPress={confirmPicker}>
              <Text style={[styles.pickerBtnText, { color: '#fff' }]}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  heading: { fontSize: fontSizes.xxl, fontWeight: '700', marginBottom: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.lg },
  proBadge: { fontWeight: '700', fontSize: fontSizes.xs },
  input: {
    borderRadius: radii.sm, borderWidth: 1,
    padding: spacing.md, fontSize: fontSizes.md,
  },
  dateRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  dateBtn: {
    borderRadius: radii.sm, borderWidth: 1,
    padding: spacing.md, justifyContent: 'center',
  },
  dateBtnText: { fontSize: fontSizes.md },
  clearDateText: { fontSize: fontSizes.xs, marginTop: spacing.xs, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.full, borderWidth: 1.5,
  },
  chipText: { fontSize: fontSizes.sm },
  fxSection: {
    marginTop: spacing.lg, borderWidth: 1,
    borderRadius: radii.md, padding: spacing.lg,
  },
  fxTitle: { fontSize: fontSizes.md, fontWeight: '600' },
  proWarning: {
    borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.sm,
  },
  proWarningText: { fontSize: fontSizes.xs, fontWeight: '600' },
  submitBtn: {
    borderRadius: radii.md, padding: spacing.lg,
    alignItems: 'center', marginTop: spacing.xxl,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },

  // Date Picker Modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  pickerContainer: {
    width: '100%', maxHeight: '80%',
    borderRadius: radii.md, padding: spacing.lg,
  },
  pickerTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.md },
  pickerSectionLabel: { fontSize: fontSizes.xs, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  pickerChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pickerChip: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radii.sm, borderWidth: 1.5,
  },
  pickerChipText: { fontSize: fontSizes.xs },
  pickerDayChip: {
    width: 38, height: 38, justifyContent: 'center', alignItems: 'center',
    borderRadius: radii.sm, borderWidth: 1.5,
  },
  pickerDayText: { fontSize: fontSizes.sm, textAlign: 'center' },
  pickerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  pickerCancelBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radii.sm, borderWidth: 1,
  },
  pickerConfirmBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  pickerBtnText: { fontSize: fontSizes.sm, fontWeight: '600' },
});
