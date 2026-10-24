'use client';

import React from 'react';
import styled from 'styled-components';
import { Label } from '@traxettle/ui';
import { allowedFundingSources } from '@traxettle/shared';
import type { EventFundingModel, ExpenseFundingSource, PoolCycleSummary } from '@traxettle/shared';
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

export type PaidWith = ExpenseFundingSource;

const COPY: Record<ExpenseFundingSource, { title: string; text: string }> = {
  pool: { title: 'Pool funds', text: 'Paid from the pool (card, cash or account).' },
  pool_reimbursement: { title: 'My money — claim it back', text: 'You paid; the pool reimburses you.' },
  self: { title: 'My money — split it', text: 'A regular split between people.' },
};

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
}

/**
 * "Paid with" — first question on the expense form for pool-funded events.
 * Choosing a pool option removes the split UI rather than adding to it.
 * Not rendered at all for split-expenses events.
 */
export function PaidWithControl({ model, value, onChange, summary, currency, noun, amountMinor, disabled }: Props) {
  const options = allowedFundingSources(model);
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

  return (
    <Wrap data-testid="paid-with">
      <Label id="paid-with-label">Paid with</Label>
      <Options role="radiogroup" aria-labelledby="paid-with-label">
        {options.map((opt) => (
          <Option key={opt} type="button" role="radio" aria-checked={value === opt} $selected={value === opt}
            onClick={() => onChange(opt)} disabled={disabled} data-testid={`paid-with-${opt}`}>
            <strong>{COPY[opt].title}</strong>
            <span>{COPY[opt].text}</span>
          </Option>
        ))}
      </Options>
      {status && <Status $tone={status.tone} data-testid="paid-with-status">{status.text}</Status>}
    </Wrap>
  );
}
