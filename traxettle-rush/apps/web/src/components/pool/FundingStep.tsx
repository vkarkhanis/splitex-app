'use client';

import React from 'react';
import styled from 'styled-components';
import { Field, Input, Label, Select } from '@traxettle/ui';
import { POOL_PRESET_LABELS } from '@traxettle/shared';
import type { PoolPreset } from '@traxettle/shared';
import { CONTRIBUTOR_PRESETS, FundingChoice, needsTarget, withPreset } from './fundingChoice';
import { currencySymbol } from './poolFormat';

const Section = styled.fieldset`
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 10px;
  padding: 14px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Legend = styled.legend`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textSecondary};
  padding: 0 6px;
`;

const Question = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
`;

const Cards = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$cols || 2}, 1fr);
  gap: 10px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const ChoiceCard = styled.button<{ $selected: boolean }>`
  text-align: left;
  cursor: pointer;
  border-radius: 10px;
  padding: 12px;
  border: 1.5px solid ${(p) => (p.$selected ? p.theme.colors.primary : p.theme.colors.border)};
  background: ${(p) => (p.$selected ? `${p.theme.colors.primary}10` : p.theme.colors.surface)};
  color: ${(p) => p.theme.colors.text};
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: ${(p) => p.theme.colors.primary}; }
  &:focus-visible { outline: 2px solid ${(p) => p.theme.colors.primary}; outline-offset: 2px; }
`;

const CardTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
`;

const CardText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  margin-top: 4px;
  line-height: 1.4;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  line-height: 1.5;
`;

const Advanced = styled.details`
  font-size: 13px;
  summary { cursor: pointer; color: ${(p) => p.theme.colors.primary}; font-weight: 600; }
  > div { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
`;

const Check = styled.label`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  cursor: pointer;
`;

interface Props {
  value: FundingChoice;
  onChange: (next: FundingChoice) => void;
  currency: string;
  disabled?: boolean;
}

const SPLIT_TEXT = 'Everyone pays their own way. Settle up at the end.';
const POOL_TEXT = 'Collect money up front. Spend from the pool.';

/**
 * "How is this event funded?" — split expenses (today's behaviour, default) or
 * a pool. Pool users pick a familiar shape (Kitty, Fund…) instead of policies.
 */
export function FundingStep({ value, onChange, currency, disabled }: Props) {
  const sym = currencySymbol(currency);
  const set = (patch: Partial<FundingChoice>) => onChange({ ...value, ...patch });
  const preset = value.funder === 'sponsor' ? 'sponsor_budget' : value.preset;

  return (
    <Section data-testid="funding-step" disabled={disabled}>
      <Legend>Funding</Legend>
      <Question id="funding-q1">How is this event funded?</Question>
      <Cards role="radiogroup" aria-labelledby="funding-q1">
        <ChoiceCard type="button" role="radio" aria-checked={value.kind === 'split'} $selected={value.kind === 'split'} onClick={() => set({ kind: 'split' })} data-testid="funding-split">
          <CardTitle>Split expenses</CardTitle>
          <CardText>{SPLIT_TEXT}</CardText>
        </ChoiceCard>
        <ChoiceCard type="button" role="radio" aria-checked={value.kind === 'pool'} $selected={value.kind === 'pool'} onClick={() => set({ kind: 'pool' })} data-testid="funding-pool">
          <CardTitle>Pool money</CardTitle>
          <CardText>{POOL_TEXT}</CardText>
        </ChoiceCard>
      </Cards>

      {value.kind === 'pool' && (
        <>
          <Question id="funding-q2">Who puts money in?</Question>
          <Cards role="radiogroup" aria-labelledby="funding-q2">
            <ChoiceCard type="button" role="radio" aria-checked={value.funder === 'contributors'} $selected={value.funder === 'contributors'}
              onClick={() => onChange(withPreset({ ...value, funder: 'contributors' }, CONTRIBUTOR_PRESETS.includes(value.preset) ? value.preset : 'trip_kitty'))}
              data-testid="funder-contributors">
              <CardTitle>Several of us</CardTitle>
              <CardText>Everyone chips in; anyone can spend from the pool.</CardText>
            </ChoiceCard>
            <ChoiceCard type="button" role="radio" aria-checked={value.funder === 'sponsor'} $selected={value.funder === 'sponsor'}
              onClick={() => onChange(withPreset({ ...value, funder: 'sponsor' }, 'sponsor_budget'))}
              data-testid="funder-sponsor">
              <CardTitle>Just me</CardTitle>
              <CardText>{POOL_PRESET_LABELS.sponsor_budget.tagline}</CardText>
            </ChoiceCard>
          </Cards>

          {value.funder === 'contributors' && (
            <>
              <Question id="funding-q3">What kind of pool?</Question>
              <Cards $cols={2} role="radiogroup" aria-labelledby="funding-q3">
                {CONTRIBUTOR_PRESETS.map((p: PoolPreset) => (
                  <ChoiceCard key={p} type="button" role="radio" aria-checked={value.preset === p} $selected={value.preset === p}
                    onClick={() => onChange(withPreset(value, p))} data-testid={`preset-${p}`}>
                    <CardTitle>{POOL_PRESET_LABELS[p].title}</CardTitle>
                    <CardText>{POOL_PRESET_LABELS[p].tagline}</CardText>
                  </ChoiceCard>
                ))}
              </Cards>
            </>
          )}

          <Row>
            {needsTarget(preset) && (
              <Field>
                <Label htmlFor="pool-target">{preset === 'sponsor_budget' ? `Total budget (${sym.trim()})` : `Amount to collect (${sym.trim()})`}</Label>
                <Input id="pool-target" data-testid="pool-target-input" type="number" min="0" step="any" inputMode="decimal"
                  value={value.targetAmount} onChange={(e) => set({ targetAmount: e.target.value })} placeholder="e.g. 800000" />
              </Field>
            )}
            {preset !== 'sponsor_budget' && (
              <Field>
                <Label htmlFor="pool-per-person">{preset === 'household' || preset === 'club_treasury' ? `Each person, per month (${sym.trim()})` : `Each person puts in (${sym.trim()})`}</Label>
                <Input id="pool-per-person" data-testid="pool-per-person-input" type="number" min="0" step="any" inputMode="decimal"
                  value={value.perPersonAmount} onChange={(e) => set({ perPersonAmount: e.target.value })} placeholder="Optional — set later per person" />
              </Field>
            )}
          </Row>

          <Hint>
            {preset === 'household' && 'Each month you close the cycle; any balance rolls over. When someone moves in or out, the books are squared up for them.'}
            {preset === 'trip_kitty' && 'When the trip ends, leftovers are refunded in proportion to what each person agreed to put in.'}
            {preset === 'club_treasury' && 'Dues can differ per member. The surplus stays in the treasury — nobody is refunded.'}
            {preset === 'target_collection' && 'Spending stays locked until the full amount is collected, so you know when you can book.'}
            {preset === 'sponsor_budget' && 'Spenders you authorise can pay from the budget or claim reimbursements with a receipt. You approve each spend.'}
          </Hint>

          <Advanced>
            <summary>Advanced</summary>
            <div>
              <Field>
                <Label htmlFor="pool-tolerance">Overdraft allowance (% of the pool)</Label>
                <Input id="pool-tolerance" data-testid="pool-tolerance-input" type="number" min="0" max="100"
                  value={value.tolerancePercent} onChange={(e) => set({ tolerancePercent: e.target.value })}
                  disabled={preset === 'target_collection'} />
                <Hint>Spending past the balance is allowed with a warning up to this much, then paused until money is added.</Hint>
              </Field>
              <Field>
                <Label htmlFor="pool-approval">Spends need approval</Label>
                <Select id="pool-approval" data-testid="pool-approval-select" value={value.approval}
                  onChange={(e) => set({ approval: e.target.value as FundingChoice['approval'] })}>
                  <option value="none">Never</option>
                  <option value="above_threshold">Above an amount</option>
                  <option value="always">Always</option>
                </Select>
              </Field>
              {value.approval === 'above_threshold' && (
                <Field>
                  <Label htmlFor="pool-approval-threshold">Approval needed above ({sym.trim()})</Label>
                  <Input id="pool-approval-threshold" type="number" min="0" step="any" value={value.approvalThreshold}
                    onChange={(e) => set({ approvalThreshold: e.target.value })} />
                </Field>
              )}
              {preset !== 'sponsor_budget' && (
                <Check>
                  <input type="checkbox" checked={value.allowPeerExpenses} data-testid="pool-allow-peer"
                    onChange={(e) => set({ allowPeerExpenses: e.target.checked })} />
                  <span>Also allow regular split expenses (people paying their own way) in this event.</span>
                </Check>
              )}
            </div>
          </Advanced>
        </>
      )}
    </Section>
  );
}
