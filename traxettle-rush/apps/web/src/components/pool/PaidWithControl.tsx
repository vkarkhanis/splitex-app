'use client';

import React from 'react';
import styled from 'styled-components';
import { Label } from '@traxettle/ui';
import { paidWithOptions } from '@traxettle/shared';
import type { EventFundingModel, ExpenseFundingSource, PaidWithChoice, PoolCycleSummary } from '@traxettle/shared';
import { formatMinor } from './poolFormat';
import { meterCaption } from './PoolMeter';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Options = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
`;

const Option = styled.button<{ $selected: boolean }>`
  text-align: left;
  cursor: pointer;
  border-radius: 10px;
  padding: 10px 12px;
  border: 1.5px solid ${(p) => (p.$selected ? p.theme.colors.primary : p.theme.colors.border)};
  background: ${(p) => (p.$selected ? `${p.theme.colors.primary}10` : p.theme.colors.surface)};
  color: ${(p) => p.theme.colors.text};
  &:hover { border-color: ${(p) => p.theme.colors.primary}; }
  &:focus-visible { outline: 2px solid ${(p) => p.theme.colors.primary}; outline-offset: 2px; }
  strong { display: block; font-size: 13px; }
  span { display: block; font-size: 12px; color: ${(p) => p.theme.colors.muted}; margin-top: 2px; }
`;

const Status = styled.div<{ $tone: 'ok' | 'warn' | 'stop' }>`
  font-size: 12px;
  font-weight: 600;
  color: ${(p) => (p.$tone === 'stop' ? p.theme.colors.error : p.$tone === 'warn' ? p.theme.colors.warning : p.theme.colors.muted)};
`;

/** The person's choice on the form; see `paidWithOptions` and `paidWithPayload` in @traxettle/shared. */
export type PaidWith = PaidWithChoice;

interface Props {
  model: EventFundingModel;
  value: PaidWith;
  onChange: (v: PaidWith) => void;
  summary: PoolCycleSummary | null;
  currency: string;
  noun: string;
  /** The amount being entered, in minor units (for the live projection). */
  amountMinor: number;
  disabled?: boolean;
  /** Listed first and marked "Suggested" (spenders in a sponsor pool: claiming back is risk-free). */
  preferred?: ExpenseFundingSource;
  /** The custodian pays from the pool directly; anyone else says how they paid (§9.3). */
  isCustodian: boolean;
  /** `poolConfig.allowSponsorCardSpends !== false`. */
  allowCardSpends: boolean;
  /** What this person holds of the pool's money now. */
  heldMinor?: number;
  /** They've been handed money this cycle. */
  hasAdvances?: boolean;
  custodianName?: string;
}

/**
 * "Paid with" — first question on the expense form for pool-funded events.
 * Choosing a pool option removes the split UI rather than adding to it.
 * Not rendered at all for split-expenses events.
 */
export function PaidWithControl({ model, value, onChange, summary, currency, noun, amountMinor, disabled, preferred, isCustodian, allowCardSpends, heldMinor, hasAdvances, custodianName }: Props) {
  const options = paidWithOptions({ model, isCustodian, currency, noun, allowCardSpends, heldMinor, hasAdvances, custodianName, preferred });
  const o = summary?.overdraft;
  let status: { tone: 'ok' | 'warn' | 'stop'; text: string } | null = null;
  if (o && value !== 'self') {
    const projected = o.balanceMinor - amountMinor;
    if (o.zone === 'blocked' && o.policy !== 'allow') {
      status = { tone: 'stop', text: `${meterCaption(o, currency)}. If you already paid, you can still record it.` };
    } else if (amountMinor > 0 && o.policy !== 'allow' && projected < o.floorMinor) {
      status = { tone: 'stop', text: `That's more than the ${noun.toLowerCase()} allows (${formatMinor(o.headroomMinor, currency)} available).` };
    } else if (amountMinor > 0 && projected < 0) {
      status = { tone: 'warn', text: `This takes the ${noun.toLowerCase()} ${formatMinor(-projected, currency)} into overdraft.` };
    } else if (o.balanceMinor < 0) {
      status = { tone: 'warn', text: `The ${noun.toLowerCase()} is overdrawn by ${formatMinor(-o.balanceMinor, currency)} · ${formatMinor(o.headroomMinor, currency)} of headroom left` };
    } else {
      status = { tone: 'ok', text: `${formatMinor(o.balanceMinor, currency)} in the ${noun.toLowerCase()}${amountMinor > 0 ? ` · ${formatMinor(projected, currency)} after this` : ''}` };
    }
  }
  // Spending more than they hold is fine: the pool pays them back the difference (§9.3).
  const overHeld = value === 'pool_held' && amountMinor > 0 && amountMinor > Math.max(0, heldMinor || 0);

  return (
    <Wrap data-testid="paid-with">
      <Label id="paid-with-label">Paid with</Label>
      <Options role="radiogroup" aria-labelledby="paid-with-label">
        {options.map((opt) => (
          <Option key={opt.value} type="button" role="radio" aria-checked={value === opt.value} $selected={value === opt.value}
            onClick={() => onChange(opt.value)} disabled={disabled} data-testid={`paid-with-${opt.value}`}>
            <strong>{opt.title}{opt.suggested ? ' · Suggested' : ''}</strong>
            <span>{opt.text}</span>
          </Option>
        ))}
      </Options>
      {status && <Status $tone={status.tone} data-testid="paid-with-status">{status.text}</Status>}
      {overHeld && (
        <Status $tone="warn" data-testid="paid-with-over-held">
          That&apos;s more than you hold. The {noun.toLowerCase()} pays you back the {formatMinor(amountMinor - Math.max(0, heldMinor || 0), currency)} difference.
        </Status>
      )}
    </Wrap>
  );
}

export type SpendTiming = 'paid' | 'asking';

/**
 * Pool spend by anyone but the custodian: already paid with the pool's money, or asking first.
 * Rejecting an already-paid spend means the spender owes it back (design doc §9.2).
 */
export function SpendTimingControl({ value, onChange, noun, disabled }: { value: SpendTiming | null; onChange: (v: SpendTiming) => void; noun: string; disabled?: boolean }) {
  const choices: Array<[SpendTiming, string, string]> = [
    ['paid', `I've already paid with the ${noun.toLowerCase()}'s money`, "If it's not approved, you'll owe it back."],
    ['asking', "I'm asking before I spend", "Spend only once it's approved."],
  ];
  return (
    <Wrap data-testid="spend-timing">
      <Options role="radiogroup" aria-label="Has it been paid?">
        {choices.map(([opt, title, text]) => (
          <Option key={opt} type="button" role="radio" aria-checked={value === opt} $selected={value === opt}
            onClick={() => onChange(opt)} disabled={disabled} data-testid={`spend-timing-${opt}`}>
            <strong>{title}</strong>
            <span>{text}</span>
          </Option>
        ))}
      </Options>
    </Wrap>
  );
}
