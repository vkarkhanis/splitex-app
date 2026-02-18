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
} from 'react-native';
import { colors, spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { api } from '../api';
import type { EventParticipant, Group, OnBehalfOfEntry } from '@splitex/shared';

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

  // Recalculate splits on amount/selection change
  useEffect(() => {
    const amt = parseFloat(amount) || 0;
    const selected = entities.filter(e => e.selected);
    if (amt <= 0 || selected.length === 0 || splitType !== 'equal') return;

    const perEntity = Math.round((amt / selected.length) * 100) / 100;
    const remainder = Math.round((amt - perEntity * selected.length) * 100) / 100;
    let idx = 0;
    setEntities(prev => prev.map(e => {
      if (!e.selected) return { ...e, amount: 0 };
      const a = idx === 0 ? perEntity + remainder : perEntity;
      idx++;
      return { ...e, amount: a };
    }));
  }, [amount, entities.filter(e => e.selected).length, splitType]);

  const toggleEntity = (index: number) => {
    const entity = entities[index];
    if (onBehalfOf && entity && entity.entityId === payerEntityId) return;
    setEntities(prev => prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e));
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

    const selected = entities.filter(e => e.selected);
    if (selected.length === 0 && !isPrivate) {
      Alert.alert('Error', 'Select at least one entity to split with.');
      return;
    }

    setLoading(true);
    try {
      const splits = isPrivate ? [] : selected.map(e => ({
        entityType: e.entityType,
        entityId: e.entityId,
        amount: e.amount,
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
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const sym = CURRENCY_SYMBOLS[expCurrency] || expCurrency;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Add Expense</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Dinner" placeholderTextColor={colors.muted} />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Brief note..." placeholderTextColor={colors.muted} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Amount ({sym})</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} />
        </View>
      </View>

      {/* Private toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Private expense</Text>
        <Switch value={isPrivate} onValueChange={(v) => { setIsPrivate(v); if (v) { setOnBehalfOf(false); setOnBehalfOfEntities([]); } }} trackColor={{ true: colors.primary }} />
      </View>

      {/* On Behalf Of toggle */}
      {!isPrivate && (
        <>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>On behalf of (your share = 0)</Text>
            <Switch value={onBehalfOf} onValueChange={(v) => { setOnBehalfOf(v); if (!v) setOnBehalfOfEntities([]); }} trackColor={{ true: colors.primary }} />
          </View>

          {onBehalfOf && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Select who you're paying on behalf of (multiple allowed):</Text>
              {entities
                .filter(ent => ent.entityId !== payerEntityId)
                .map((ent) => {
                  const isOb = onBehalfOfEntities.some(
                    ob => ob.entityId === ent.entityId && ob.entityType === ent.entityType
                  );
                  return (
                    <TouchableOpacity
                      key={ent.entityId}
                      style={[styles.entityChip, isOb && styles.entityChipActive]}
                      onPress={() => toggleOnBehalfOfEntity(ent)}
                    >
                      <Text style={[styles.entityChipText, isOb && styles.entityChipTextActive]}>
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
          <Text style={styles.label}>Split between</Text>
          {entities.map((ent, i) => {
            const isPayerEntity = onBehalfOf && ent.entityId === payerEntityId;
            return (
              <TouchableOpacity
                key={ent.entityId}
                style={[
                  styles.entityRow,
                  ent.selected && styles.entityRowSelected,
                  isPayerEntity && styles.entityRowDisabled,
                ]}
                onPress={() => toggleEntity(i)}
                disabled={isPayerEntity}
              >
                <View style={[styles.checkbox, ent.selected && styles.checkboxChecked, isPayerEntity && styles.checkboxDisabled]}>
                  {ent.selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.entityName, isPayerEntity && styles.entityNameDisabled]} numberOfLines={1}>
                  {ent.entityType === 'group' ? `[Group] ${ent.name}` : ent.name}
                  {isPayerEntity ? ' (You — excluded)' : ''}
                </Text>
                {ent.selected && (
                  <Text style={styles.entityAmount}>{sym}{ent.amount.toFixed(2)}</Text>
                )}
                {isPayerEntity && (
                  <Text style={styles.entityAmountZero}>{sym}0.00</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitBtnText}>Add Expense</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: fontSizes.xxl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontSize: fontSizes.md, color: colors.text,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  toggleLabel: { fontSize: fontSizes.sm, color: colors.text },
  infoBox: {
    backgroundColor: colors.infoBg, borderRadius: radii.sm, padding: spacing.md,
    marginTop: spacing.sm, gap: spacing.sm,
  },
  infoText: { fontSize: fontSizes.xs, color: colors.info, marginBottom: spacing.xs },
  entityChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  entityChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  entityChipText: { fontSize: fontSizes.sm, color: colors.text },
  entityChipTextActive: { color: colors.primary, fontWeight: '600' },
  entityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.sm,
    marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border,
  },
  entityRowSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  entityRowDisabled: { opacity: 0.45, backgroundColor: colors.surface },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxDisabled: { backgroundColor: colors.border, borderColor: colors.border },
  checkmark: { color: colors.white, fontSize: 13, fontWeight: '700' },
  entityName: { flex: 1, fontSize: fontSizes.sm, color: colors.text },
  entityNameDisabled: { color: colors.muted, fontStyle: 'italic' },
  entityAmount: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.primary },
  entityAmountZero: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.muted },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.lg,
    alignItems: 'center', marginTop: spacing.xxl,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.white, fontSize: fontSizes.md, fontWeight: '600' },
});
