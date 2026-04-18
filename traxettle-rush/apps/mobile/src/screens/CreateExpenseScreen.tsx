import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import type { EventParticipant, Group, OnBehalfOfEntry } from '@traxettle/shared';

interface SplitEntry {
  entityId: string;
  entityType: 'user' | 'group';
  name: string;
  selected: boolean;
  amount: number;
  ratio: number;
}

function buildEntities(participants: EventParticipant[], groups: Group[]): SplitEntry[] {
  const groupMemberIds = new Set<string>();
  groups.forEach(g => g.members.forEach(m => groupMemberIds.add(m)));

  const entities: SplitEntry[] = [];
  groups.forEach(g => {
    entities.push({
      entityId: g.id,
      entityType: 'group',
      name: g.name,
      selected: true,
      amount: 0,
      ratio: 1,
    });
  });
  participants.forEach(p => {
    if (!groupMemberIds.has(p.userId)) {
      entities.push({
        entityId: p.userId,
        entityType: 'user',
        name: (p as any).displayName || (p as any).email || p.userId.slice(0, 8),
        selected: true,
        amount: 0,
        ratio: 1,
      });
    }
  });
  return entities;
}

export default function CreateExpenseScreen({ route, navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { eventId, currency } = route.params;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState(currency || 'USD');
  const [splitType, setSplitType] = useState<'equal' | 'ratio' | 'custom'>('equal');
  const [isPrivate, setIsPrivate] = useState(false);
  const [onBehalfOf, setOnBehalfOf] = useState(false);
  const [onBehalfOfEntities, setOnBehalfOfEntities] = useState<OnBehalfOfEntry[]>([]);
  const [entities, setEntities] = useState<SplitEntry[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, gRes] = await Promise.all([
        api.get<EventParticipant[]>(`/api/events/${eventId}/participants`),
        api.get<Group[]>(`/api/groups/event/${eventId}`),
      ]);
      const gData = gRes.data || [];
      setGroups(gData);
      setEntities(buildEntities(pRes.data || [], gData));
      try {
        const profileRes = await api.get('/api/users/profile');
        if (profileRes.data?.userId) setCurrentUserId(profileRes.data.userId);
      } catch { /* ignore */ }
    } catch {
      Alert.alert('Error', 'Failed to load participants');
    } finally {
      setFetchLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Determine the payer's entity ID (group if payer is in a group, else userId)
  const payerEntityId = useMemo(() => {
    if (!currentUserId) return '';
    const payerGroup = groups.find(g => g.members.includes(currentUserId));
    return payerGroup ? payerGroup.id : currentUserId;
  }, [currentUserId, groups]);

  // When onBehalfOf is toggled on, auto-disable the payer's entity in splits
  useEffect(() => {
    if (onBehalfOf && payerEntityId) {
      setEntities(prev => prev.map(e => {
        if (e.entityId === payerEntityId) {
          return { ...e, selected: false, amount: 0, ratio: 0 };
        }
        return e;
      }));
    }
  }, [onBehalfOf, payerEntityId]);

  const selectedEntities = useMemo(() => entities.filter(e => e.selected), [entities]);
  const ratioKey = useMemo(
    () => entities.filter(e => e.selected).map(s => `${s.entityId}:${s.ratio}`).join(','),
    [entities]
  );

  // Recalculate splits on amount/selection/splitType change
  useEffect(() => {
    const amt = parseFloat(amount) || 0;
    const selected = entities.filter(e => e.selected);
    if (amt <= 0 || selected.length === 0) return;

    if (splitType === 'equal') {
      const perEntity = Math.round((amt / selected.length) * 100) / 100;
      const remainder = Math.round((amt - perEntity * selected.length) * 100) / 100;
      let idx = 0;
      setEntities(prev => prev.map(e => {
        if (!e.selected) return { ...e, amount: 0 };
        const a = idx === 0 ? perEntity + remainder : perEntity;
        idx++;
        return { ...e, amount: a, ratio: 1 };
      }));
      return;
    }

    if (splitType === 'ratio') {
      const totalRatio = selected.reduce((sum, s) => sum + s.ratio, 0);
      if (totalRatio > 0) {
        setEntities(prev => prev.map(e => {
          if (!e.selected) return { ...e, amount: 0 };
          return { ...e, amount: Math.round((amt * e.ratio / totalRatio) * 100) / 100 };
        }));
      }
    }
  }, [amount, splitType, entities.length, ratioKey]);

  const toggleEntity = (index: number) => {
    const entity = entities[index];
    if (onBehalfOf && entity && entity.entityId === payerEntityId) return;
    setEntities(prev => prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e));
  };

  const updateEntity = (index: number, patch: Partial<SplitEntry>) => {
    setEntities(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  };

  const toggleOnBehalfOfEntity = (ent: SplitEntry) => {
    const exists = onBehalfOfEntities.some(
      ob => ob.entityId === ent.entityId && ob.entityType === ent.entityType
    );
    if (exists) {
      setOnBehalfOfEntities(prev =>
        prev.filter(ob => !(ob.entityId === ent.entityId && ob.entityType === ent.entityType))
      );
    } else {
      setOnBehalfOfEntities(prev => [
        ...prev,
        { entityId: ent.entityId, entityType: ent.entityType },
      ]);
    }
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!title.trim() || !amt || amt <= 0) {
      Alert.alert('Error', 'Title and a positive amount are required.');
      return;
    }

    const selected = selectedEntities;
    if (selected.length === 0 && !isPrivate) {
      Alert.alert('Error', 'Select at least one entity to split with.');
      return;
    }

    const splitTotal = selected.reduce((sum, s) => sum + s.amount, 0);
    if (!isPrivate && amt > 0 && Math.abs(splitTotal - amt) > 0.01) {
      Alert.alert('Error', `Split amounts (${sym}${splitTotal.toFixed(2)}) must match total amount (${sym}${amt.toFixed(2)}).`);
      return;
    }

    setLoading(true);
    try {
      const splits = isPrivate ? [] : selected.map(e => ({
        entityType: e.entityType,
        entityId: e.entityId,
        amount: e.amount,
        ratio: splitType === 'ratio' ? e.ratio : undefined,
      }));

      const payload: Record<string, any> = {
        eventId,
        title: title.trim(),
        description: description.trim() || undefined,
        amount: amt,
        currency: expCurrency,
        splitType,
        isPrivate,
        splits,
        selectedEntities: selected.map(e => ({
          entityType: e.entityType,
          entityId: e.entityId,
          name: e.name,
        })),
      };

      if (onBehalfOf && onBehalfOfEntities.length > 0) {
        payload.paidOnBehalfOf = onBehalfOfEntities;
      }

      await api.post('/api/expenses', payload);
      Alert.alert('Success', `"${title}" added.`);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return <View style={[styles.center, { backgroundColor: c.background }]}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  const sym = CURRENCY_SYMBOLS[expCurrency] || expCurrency;
  const splitTotal = selectedEntities.reduce((sum, s) => sum + s.amount, 0);
  const expenseAmount = parseFloat(amount) || 0;
  const splitMismatch = !isPrivate && expenseAmount > 0 && selectedEntities.length > 0
    && Math.abs(splitTotal - expenseAmount) > 0.01;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: c.text }]}>Add Expense</Text>

      <Text style={[styles.label, { color: c.textSecondary }]}>Title</Text>
      <TextInput testID="create-expense-title-input" style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]} value={title} onChangeText={setTitle} placeholder="e.g. Dinner" placeholderTextColor={c.muted} />

      <Text style={[styles.label, { color: c.textSecondary }]}>Description (optional)</Text>
      <TextInput testID="create-expense-description-input" style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]} value={description} onChangeText={setDescription} placeholder="Brief note..." placeholderTextColor={c.muted} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Amount ({sym})</Text>
          <TextInput testID="create-expense-amount-input" style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.muted} />
        </View>
      </View>

      {!isPrivate && (
        <>
          <Text style={[styles.label, { color: c.textSecondary }]}>Split Type</Text>
          <View style={styles.splitTypeRow}>
            {(['equal', 'ratio', 'custom'] as const).map(type => (
              <TouchableOpacity
                key={type}
                testID={`create-expense-split-type-${type}`}
                style={[styles.splitTypeBtn, { borderColor: c.border, backgroundColor: c.surface }, splitType === type && { borderColor: c.primary, backgroundColor: c.primary + '14' }]}
                onPress={() => setSplitType(type)}
              >
                <Text style={[styles.splitTypeBtnText, { color: c.textSecondary }, splitType === type && { color: c.primary }]}>
                  {type === 'equal' ? 'Equal' : type === 'ratio' ? 'By Ratio' : 'Custom'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Private toggle */}
      <View style={[styles.toggleRow, { borderBottomColor: c.border }]}>
        <Text style={[styles.toggleLabel, { color: c.text }]}>Private expense</Text>
        <Switch value={isPrivate} onValueChange={(v) => { setIsPrivate(v); if (v) { setOnBehalfOf(false); setOnBehalfOfEntities([]); } }} trackColor={{ true: c.primary }} />
      </View>

      {/* On Behalf Of toggle */}
      {!isPrivate && (
        <>
          <View style={[styles.toggleRow, { borderBottomColor: c.border }]}>
            <Text style={[styles.toggleLabel, { color: c.text }]}>On behalf of (your share = 0)</Text>
            <Switch value={onBehalfOf} onValueChange={(v) => { setOnBehalfOf(v); if (!v) setOnBehalfOfEntities([]); }} trackColor={{ true: c.primary }} />
          </View>

          {onBehalfOf && (
            <View style={[styles.infoBox, { backgroundColor: c.infoBg }]}>
              <Text style={[styles.infoText, { color: c.info }]}>Select who you're paying on behalf of (multiple allowed):</Text>
              {entities
                .filter(ent => ent.entityId !== payerEntityId)
                .map((ent) => {
                  const isOb = onBehalfOfEntities.some(
                    ob => ob.entityId === ent.entityId && ob.entityType === ent.entityType
                  );
                  return (
                    <TouchableOpacity
                      key={ent.entityId}
                      style={[styles.entityChip, { borderColor: c.border, backgroundColor: c.surface }, isOb && { borderColor: c.primary, backgroundColor: c.primary + '15' }]}
                      onPress={() => toggleOnBehalfOfEntity(ent)}
                    >
                      <Text style={[styles.entityChipText, { color: c.text }, isOb && { color: c.primary, fontWeight: '600' }]}>
                        {isOb ? '✓ ' : ''}{ent.entityType === 'group' ? `[G] ${ent.name}` : ent.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          )}
        </>
      )}

      {/* Split entities */}
      {!isPrivate && (
        <>
          <Text style={[styles.label, { color: c.textSecondary }]}>Split between</Text>
          {entities.map((ent, i) => {
            const isPayerEntity = onBehalfOf && ent.entityId === payerEntityId;
            return (
              <TouchableOpacity
                key={ent.entityId}
                testID={`create-expense-split-entity-${ent.entityType}-${ent.entityId}`}
                style={[
                  styles.entityRow, { backgroundColor: c.surface, borderColor: c.border },
                  ent.selected && { borderColor: c.primary, backgroundColor: c.primary + '08' },
                  isPayerEntity && { opacity: 0.45, backgroundColor: c.surface },
                ]}
                onPress={() => toggleEntity(i)}
                disabled={isPayerEntity}
              >
                <View style={[styles.checkbox, { borderColor: c.border }, ent.selected && { backgroundColor: c.primary, borderColor: c.primary }, isPayerEntity && { backgroundColor: c.border, borderColor: c.border }]}>
                  {ent.selected && <Text style={[styles.checkmark, { color: c.white }]}>✓</Text>}
                </View>
                <Text style={[styles.entityName, { color: c.text }, isPayerEntity && { color: c.muted, fontStyle: 'italic' }]} numberOfLines={1}>
                  {ent.entityType === 'group' ? `[Group] ${ent.name}` : ent.name}
                  {isPayerEntity ? ' (You — excluded)' : ''}
                </Text>
                {ent.selected && (
                  <>
                    {splitType === 'ratio' && (
                      <View style={styles.inlineInputWrap}>
                        <TextInput
                          testID={`create-expense-split-ratio-${ent.entityType}-${ent.entityId}`}
                          style={[styles.inlineInput, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
                          value={String(ent.ratio)}
                          onChangeText={(v) => updateEntity(i, { ratio: parseFloat(v) || 0 })}
                          keyboardType="number-pad"
                        />
                        <Text style={[styles.inlineSuffix, { color: c.muted }]}>ratio</Text>
                      </View>
                    )}
                    {splitType === 'custom' && (
                      <View style={styles.inlineInputWrap}>
                        <TextInput
                          testID={`create-expense-split-amount-${ent.entityType}-${ent.entityId}`}
                          style={[styles.inlineInput, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
                          value={String(ent.amount || '')}
                          onChangeText={(v) => updateEntity(i, { amount: parseFloat(v) || 0 })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    )}
                    <Text style={[styles.entityAmount, { color: c.primary }]}>{sym}{ent.amount.toFixed(2)}</Text>
                  </>
                )}
                {isPayerEntity && (
                  <Text style={[styles.entityAmountZero, { color: c.muted }]}>{sym}0.00</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {splitMismatch && (
        <Text style={[styles.errorText, { color: c.error }]}>
          Split amounts ({sym}{splitTotal.toFixed(2)}) do not match total ({sym}{expenseAmount.toFixed(2)}).
        </Text>
      )}

      <TouchableOpacity
        testID="create-expense-submit-button"
        style={[styles.submitBtn, { backgroundColor: c.primary }, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading || splitMismatch}
      >
        {loading ? (
          <ActivityIndicator color={c.white} />
        ) : (
          <Text style={styles.submitBtnText}>Add Expense</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: fontSizes.xxl, fontWeight: '700', marginBottom: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    borderRadius: radii.sm, borderWidth: 1,
    padding: spacing.md, fontSize: fontSizes.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  splitTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  splitTypeBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, alignItems: 'center',
  },
  splitTypeBtnText: { fontSize: fontSizes.sm, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  toggleLabel: { fontSize: fontSizes.sm },
  infoBox: {
    borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.sm, gap: spacing.sm,
  },
  infoText: { fontSize: fontSizes.xs, marginBottom: spacing.xs },
  entityChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.full, borderWidth: 1,
  },
  entityChipText: { fontSize: fontSizes.sm },
  entityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radii.sm, marginBottom: spacing.xs, borderWidth: 1,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  checkmark: { fontSize: 13, fontWeight: '700' },
  entityName: { flex: 1, fontSize: fontSizes.sm },
  entityAmount: { fontSize: fontSizes.sm, fontWeight: '600' },
  entityAmountZero: { fontSize: fontSizes.sm, fontWeight: '600' },
  inlineInputWrap: { width: 86, marginRight: spacing.sm },
  inlineInput: {
    borderRadius: radii.sm, borderWidth: 1,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontSize: fontSizes.sm, textAlign: 'center',
  },
  inlineSuffix: { fontSize: fontSizes.xs, textAlign: 'center', marginTop: 2 },
  errorText: { marginTop: spacing.sm, fontSize: fontSizes.sm, fontWeight: '600' },
  submitBtn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xxl,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },
});
