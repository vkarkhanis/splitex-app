'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styled from 'styled-components';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
  Field,
  Input,
  Label,
  Select,
  TextArea,
  useToast,
} from '@traxettle/ui';
import { api } from '../../../../../../utils/api';
import type { EventParticipant, Group, Expense, OnBehalfOfEntry } from '@traxettle/shared';

const Page = styled.div`
  width: 100%;
  max-width: 640px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Buttons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 6px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

const SplitRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  overflow: hidden;
  &:last-child { border-bottom: none; }
`;

const SplitLabel = styled.div`
  flex: 1;
  font-size: 14px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SplitAmount = styled.div`
  width: 110px;
  min-width: 110px;
  max-width: 110px;
  flex-shrink: 0;

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    font-size: 13px;
  }
`;

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.muted};
  margin-top: 8px;
`;

const RadioGroup = styled.div`
  display: flex;
  gap: 16px;
  padding: 4px 0;
`;

const RadioLabel = styled.label<{ $checked?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1.5px solid ${(p) => p.$checked ? p.theme.colors.primary : p.theme.colors.border};
  background: ${(p) => p.$checked ? p.theme.colors.primary + '10' : 'transparent'};
  transition: all 0.15s;
  &:hover { border-color: ${(p) => p.theme.colors.primary}; }
`;

const EntityCheckbox = styled.label<{ $checked?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1.5px solid ${(p) => p.$checked ? p.theme.colors.primary : p.theme.colors.border};
  background: ${(p) => p.$checked ? p.theme.colors.primary + '08' : 'transparent'};
  transition: all 0.15s;
  &:hover { border-color: ${(p) => p.theme.colors.primary}; }
`;

const EntityTag = styled.span<{ $type: 'group' | 'user' }>`
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${(p) => p.$type === 'group' ? p.theme.colors.infoBg : p.theme.colors.successBg};
  color: ${(p) => p.$type === 'group' ? p.theme.colors.info : p.theme.colors.success};
`;

const PrivateToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  padding: 8px 0;
`;

const OnBehalfOfToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  padding: 8px 0;
`;

const OnBehalfOfInfo = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.info};
  background: ${(p) => p.theme.colors.infoBg};
  padding: 8px 12px;
  border-radius: 6px;
  line-height: 1.5;
`;

const EntityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
`;

interface SplitEntry {
  entityType: 'user' | 'group';
  entityId: string;
  name: string;
  amount: number;
  ratio: number;
  selected: boolean;
}

/** Entities available for splitting: groups as single entities + individuals not in any group */
function buildEntities(participants: EventParticipant[], groups: Group[]): SplitEntry[] {
  const usersInGroups = new Set<string>();
  const entities: SplitEntry[] = [];

  for (const g of groups) {
    entities.push({
      entityType: 'group',
      entityId: g.id,
      name: g.name,
      amount: 0,
      ratio: 1,
      selected: false,
    });
    for (const m of g.members) usersInGroups.add(m);
  }

  for (const p of participants) {
    if (!usersInGroups.has(p.userId)) {
      entities.push({
        entityType: 'user',
        entityId: p.userId,
        name: p.displayName || p.email || p.userId,
        amount: 0,
        ratio: 1,
        selected: false,
      });
    }
  }

  return entities;
}

export default function EditExpensePage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const expenseId = params.expenseId as string;
  const router = useRouter();
  const { push: pushToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    currency: 'USD',
    splitType: 'equal' as 'equal' | 'ratio' | 'custom',
    isPrivate: false,
    onBehalfOf: false,
    onBehalfOfEntities: [] as OnBehalfOfEntry[],
  });

  const [currentUserId, setCurrentUserId] = useState<string>('');

  const [entities, setEntities] = useState<SplitEntry[]>([]);

  const fetchData = useCallback(async () => {
    setFetchLoading(true);
    try {
      const [pRes, gRes, expRes] = await Promise.all([
        api.get<EventParticipant[]>(`/api/events/${eventId}/participants`),
        api.get<Group[]>(`/api/groups/event/${eventId}`),
        api.get<Expense>(`/api/expenses/${expenseId}`),
      ]);
      const pData = pRes.data || [];
      const gData = gRes.data || [];
      const expense = expRes.data;
      setParticipants(pData);
      setGroups(gData);

      // Fetch current user
      try {
        const profileRes = await api.get('/api/users/profile');
        if (profileRes.data?.userId) setCurrentUserId(profileRes.data.userId);
      } catch { /* ignore */ }

      if (expense) {
        const obEntries: OnBehalfOfEntry[] = Array.isArray(expense.paidOnBehalfOf)
          ? expense.paidOnBehalfOf
          : [];
        setForm({
          title: expense.title,
          description: expense.description || '',
          amount: String(expense.amount),
          currency: expense.currency,
          splitType: expense.splitType,
          isPrivate: expense.isPrivate,
          onBehalfOf: obEntries.length > 0,
          onBehalfOfEntities: obEntries,
        });

        // Build entities and mark the ones that were in the original splits as selected
        const builtEntities = buildEntities(pData, gData);
        const splitMap = new Map<string, { amount: number; ratio: number }>();
        for (const s of (expense.splits || [])) {
          splitMap.set(s.entityId, { amount: s.amount, ratio: s.ratio || 1 });
        }

        const hydratedEntities = builtEntities.map(e => {
          const existing = splitMap.get(e.entityId);
          if (existing) {
            return { ...e, selected: true, amount: existing.amount, ratio: existing.ratio };
          }
          return e;
        });
        setEntities(hydratedEntities);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load expense data');
    } finally {
      setFetchLoading(false);
    }
  }, [eventId, expenseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Determine the payer's entity ID (group if payer is in a group, else userId)
  const payerEntityId = useMemo(() => {
    if (!currentUserId) return '';
    const payerGroup = groups.find(g => g.members.includes(currentUserId));
    return payerGroup ? payerGroup.id : currentUserId;
  }, [currentUserId, groups]);

  // When onBehalfOf is toggled on, auto-disable the payer's entity in splits
  useEffect(() => {
    if (form.onBehalfOf && payerEntityId) {
      setEntities(prev => prev.map(e => {
        if (e.entityId === payerEntityId) {
          return { ...e, selected: false, amount: 0, ratio: 0 };
        }
        return e;
      }));
    }
  }, [form.onBehalfOf, payerEntityId]);

  const selectedEntities = useMemo(() => entities.filter(e => e.selected), [entities]);

  const ratioKey = useMemo(
    () => selectedEntities.map(s => `${s.entityId}:${s.ratio}`).join(','),
    [selectedEntities]
  );

  // Recalculate split amounts when amount, splitType, selection, or ratios change
  useEffect(() => {
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0 || selectedEntities.length === 0) return;

    if (form.splitType === 'equal') {
      const perEntity = Math.round((amount / selectedEntities.length) * 100) / 100;
      const remainder = Math.round((amount - perEntity * selectedEntities.length) * 100) / 100;
      setEntities(prev => {
        let idx = 0;
        return prev.map(s => {
          if (!s.selected) return { ...s, amount: 0 };
          const amt = idx === 0 ? perEntity + remainder : perEntity;
          idx++;
          return { ...s, amount: amt, ratio: 1 };
        });
      });
    } else if (form.splitType === 'ratio') {
      const totalRatio = selectedEntities.reduce((sum, s) => sum + s.ratio, 0);
      if (totalRatio > 0) {
        setEntities(prev => prev.map(s => {
          if (!s.selected) return { ...s, amount: 0 };
          return { ...s, amount: Math.round((amount * s.ratio / totalRatio) * 100) / 100 };
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.amount, form.splitType, selectedEntities.length, ratioKey]);

  const toggleEntity = (index: number) => {
    // Prevent toggling the payer's entity when onBehalfOf is active
    const entity = entities[index];
    if (form.onBehalfOf && entity && entity.entityId === payerEntityId) return;
    setEntities(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const updateEntity = (index: number, patch: Partial<SplitEntry>) => {
    setEntities(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const updateForm = (patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  // Validate that split amounts sum to the total expense amount
  const splitTotal = useMemo(() => {
    if (form.isPrivate) return parseFloat(form.amount) || 0;
    return selectedEntities.reduce((sum, s) => sum + s.amount, 0);
  }, [form.isPrivate, form.amount, selectedEntities]);

  const expenseAmount = parseFloat(form.amount) || 0;
  const splitMismatch = !form.isPrivate && expenseAmount > 0 && selectedEntities.length > 0
    && Math.abs(splitTotal - expenseAmount) > 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || !amount || amount <= 0) {
      setError('Title and a positive amount are required.');
      return;
    }

    const selected = entities.filter(s => s.selected);
    if (selected.length === 0 && !form.isPrivate) {
      setError('Select at least one group or individual to split with.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const splits = form.isPrivate ? [] : selected.map(s => ({
        entityType: s.entityType,
        entityId: s.entityId,
        amount: s.amount,
        ratio: form.splitType === 'ratio' ? s.ratio : undefined,
      }));

      const payload: Record<string, any> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        amount,
        currency: form.currency,
        splitType: form.splitType,
        isPrivate: form.isPrivate,
        splits,
        selectedEntities: selected.map(s => ({
          entityType: s.entityType,
          entityId: s.entityId,
          name: s.name,
        })),
      };

      // On behalf of
      if (form.onBehalfOf && form.onBehalfOfEntities.length > 0) {
        payload.paidOnBehalfOf = form.onBehalfOfEntities;
      } else {
        payload.paidOnBehalfOf = null;
      }

      await api.put(`/api/expenses/${expenseId}`, payload);

      pushToast({ type: 'success', title: 'Expense Updated', message: `"${form.title}" has been updated.` });
      router.push(`/events/${eventId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update expense');
      pushToast({ type: 'error', title: 'Error', message: err.message || 'Failed to update expense' });
    } finally {
      setLoading(false);
    }
  };

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥',
  };
  const sym = currencySymbols[form.currency] || form.currency;

  if (fetchLoading) {
    return (
      <Page>
        <Card>
          <CardBody>
            <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading expense...</div>
          </CardBody>
        </Card>
      </Page>
    );
  }

  return (
    <Page data-testid="edit-expense-page">
      <Card>
        <CardHeader>
          <CardTitle>Edit Expense</CardTitle>
          <CardSubtitle>Update the expense details.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <Form onSubmit={handleSubmit} data-testid="edit-expense-form">
            <Field>
              <Label htmlFor="expense-title">Title</Label>
              <Input
                id="expense-title"
                data-testid="expense-title-input"
                placeholder="e.g. Hotel booking"
                value={form.title}
                onChange={(e) => updateForm({ title: e.target.value })}
                disabled={loading}
                $hasError={Boolean(error) && !form.title}
              />
            </Field>

            <Field>
              <Label htmlFor="expense-description">Description (optional)</Label>
              <TextArea
                id="expense-description"
                data-testid="expense-description-input"
                placeholder="Details about this expense..."
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                disabled={loading}
              />
            </Field>

            <Row>
              <Field>
                <Label htmlFor="expense-amount">Amount</Label>
                <Input
                  id="expense-amount"
                  data-testid="expense-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => updateForm({ amount: e.target.value })}
                  disabled={loading}
                  $hasError={Boolean(error) && !form.amount}
                />
              </Field>

              <Field>
                <Label htmlFor="expense-currency">Currency</Label>
                <Select
                  id="expense-currency"
                  data-testid="expense-currency-select"
                  value={form.currency}
                  onChange={(e) => updateForm({ currency: e.target.value })}
                  disabled={loading}
                >
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                  <option value="INR">₹ INR</option>
                  <option value="JPY">¥ JPY</option>
                </Select>
              </Field>
            </Row>

            {/* Private expense toggle */}
            <PrivateToggle>
              <input
                type="checkbox"
                checked={form.isPrivate}
                onChange={(e) => updateForm({ isPrivate: e.target.checked, onBehalfOf: false })}
                disabled={loading}
                data-testid="expense-private-toggle"
              />
              <span>Private expense (only visible to you, not shared with anyone)</span>
            </PrivateToggle>

            {/* On Behalf Of toggle */}
            {!form.isPrivate && (
              <>
                <OnBehalfOfToggle>
                  <input
                    type="checkbox"
                    checked={form.onBehalfOf}
                    onChange={(e) => updateForm({ onBehalfOf: e.target.checked, onBehalfOfEntities: [] })}
                    disabled={loading}
                    data-testid="expense-on-behalf-toggle"
                  />
                  <span>On behalf of (you fronted money for others — your share is zero)</span>
                </OnBehalfOfToggle>

                {form.onBehalfOf && (
                  <>
                    <Field>
                      <Label>On behalf of which groups or individuals?</Label>
                      <EntityList>
                        {entities
                          .filter(ent => ent.entityId !== payerEntityId)
                          .map(ent => {
                            const isSelected = form.onBehalfOfEntities.some(
                              ob => ob.entityId === ent.entityId && ob.entityType === ent.entityType
                            );
                            return (
                              <EntityCheckbox
                                key={`ob-${ent.entityType}-${ent.entityId}`}
                                $checked={isSelected}
                                data-testid={`on-behalf-entity-${ent.entityId}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const entry: OnBehalfOfEntry = { entityId: ent.entityId, entityType: ent.entityType };
                                    if (isSelected) {
                                      updateForm({
                                        onBehalfOfEntities: form.onBehalfOfEntities.filter(
                                          ob => !(ob.entityId === ent.entityId && ob.entityType === ent.entityType)
                                        ),
                                      });
                                    } else {
                                      updateForm({
                                        onBehalfOfEntities: [...form.onBehalfOfEntities, entry],
                                      });
                                    }
                                  }}
                                  disabled={loading}
                                />
                                <EntityTag $type={ent.entityType}>
                                  {ent.entityType === 'group' ? 'Group' : 'Individual'}
                                </EntityTag>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ent.name}
                                </span>
                              </EntityCheckbox>
                            );
                          })}
                      </EntityList>
                    </Field>
                    <OnBehalfOfInfo>
                      You are paying on behalf of the selected entities. Your share of this expense will be zero — the full amount will be split among the other entities below (excluding you).
                    </OnBehalfOfInfo>
                  </>
                )}
              </>
            )}

            {!form.isPrivate && (
              <>
                {/* Split type as radio buttons */}
                <Field>
                  <Label>Split Type</Label>
                  <RadioGroup>
                    {(['equal', 'ratio', 'custom'] as const).map(type => (
                      <RadioLabel key={type} $checked={form.splitType === type}>
                        <input
                          type="radio"
                          name="splitType"
                          value={type}
                          checked={form.splitType === type}
                          onChange={() => updateForm({ splitType: type })}
                          disabled={loading}
                          data-testid={`split-type-${type}`}
                        />
                        {type === 'equal' ? 'Equal' : type === 'ratio' ? 'By Ratio' : 'Custom'}
                      </RadioLabel>
                    ))}
                  </RadioGroup>
                </Field>

                {/* Entity selection */}
                <SectionTitle>Split With (select groups &amp; individuals)</SectionTitle>
                <EntityList>
                  {entities.map((entity, index) => {
                    const isPayerEntity = form.onBehalfOf && entity.entityId === payerEntityId;
                    return (
                      <EntityCheckbox
                        key={`${entity.entityType}-${entity.entityId}`}
                        $checked={entity.selected}
                        data-testid={`entity-checkbox-${index}`}
                        style={isPayerEntity ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={entity.selected}
                          onChange={() => toggleEntity(index)}
                          disabled={loading || isPayerEntity}
                        />
                        <EntityTag $type={entity.entityType}>
                          {entity.entityType === 'group' ? 'Group' : 'Individual'}
                        </EntityTag>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entity.name}
                          {isPayerEntity && ' (You — excluded)'}
                        </span>
                        {entity.entityType === 'group' && (
                          <span style={{ fontSize: 11, color: 'inherit', opacity: 0.6 }}>
                            ({groups.find(g => g.id === entity.entityId)?.members.length || 0} members)
                          </span>
                        )}
                      </EntityCheckbox>
                    );
                  })}
                </EntityList>

                {/* Split details for selected entities */}
                <SectionTitle>Split Amounts</SectionTitle>
                {selectedEntities.map((split) => {
                  const idx = entities.findIndex(e => e.entityType === split.entityType && e.entityId === split.entityId);
                  return (
                    <SplitRow key={`${split.entityType}-${split.entityId}`} data-testid={`split-row-${idx}`}>
                      <SplitLabel>
                        <EntityTag $type={split.entityType} style={{ marginRight: 6 }}>
                          {split.entityType === 'group' ? 'G' : 'I'}
                        </EntityTag>
                        {split.name}
                      </SplitLabel>
                      {form.splitType === 'ratio' && (
                        <>
                          <SplitAmount>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={split.ratio}
                              onChange={(e) => updateEntity(idx, { ratio: parseFloat(e.target.value) || 0 })}
                              disabled={loading}
                              data-testid={`split-ratio-${idx}`}
                            />
                          </SplitAmount>
                          <SplitAmount>
                            <Input type="text" value={`${sym}${split.amount.toFixed(2)}`} disabled data-testid={`split-amount-${idx}`} />
                          </SplitAmount>
                        </>
                      )}
                      {form.splitType === 'custom' && (
                        <SplitAmount>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={split.amount}
                            onChange={(e) => updateEntity(idx, { amount: parseFloat(e.target.value) || 0 })}
                            disabled={loading}
                            data-testid={`split-amount-${idx}`}
                          />
                        </SplitAmount>
                      )}
                      {form.splitType === 'equal' && (
                        <SplitAmount>
                          <Input type="text" value={`${sym}${split.amount.toFixed(2)}`} disabled data-testid={`split-amount-${idx}`} />
                        </SplitAmount>
                      )}
                    </SplitRow>
                  );
                })}
              </>
            )}

            {splitMismatch && (
              <ErrorText data-testid="split-mismatch-error">
                Split amounts ({sym}{splitTotal.toFixed(2)}) do not match the total expense ({sym}{expenseAmount.toFixed(2)}). Difference: {sym}{Math.abs(splitTotal - expenseAmount).toFixed(2)}
              </ErrorText>
            )}

            {error && <ErrorText data-testid="edit-expense-error">{error}</ErrorText>}

            <Buttons>
              <Button type="button" $variant="outline" onClick={() => router.back()} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                $variant="primary"
                disabled={loading || !form.title.trim() || !form.amount || splitMismatch}
                data-testid="edit-expense-submit"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </Buttons>
          </Form>
        </CardBody>
      </Card>
    </Page>
  );
}
