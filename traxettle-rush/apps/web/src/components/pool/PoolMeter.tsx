'use client';

import React from 'react';
import styled, { css } from 'styled-components';
import { formatMinor, meterCaption, meterGeometry } from '@traxettle/shared';
import type { PoolOverdraftState } from '@traxettle/shared';

export { meterCaption, meterGeometry };

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Track = styled.div`
  position: relative;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: ${(p) => p.theme.colors.surfaceHover};
  border: 1px solid ${(p) => p.theme.colors.border};
`;

const Fill = styled.div<{ $left: number; $width: number; $tone: 'pool' | 'over' | 'blocked' }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${(p) => p.$left}%;
  width: ${(p) => p.$width}%;
  transition: width 0.3s ease;
  ${(p) => p.$tone === 'pool' && css`background: ${p.theme.colors.primary};`}
  ${(p) => p.$tone === 'over' && css`
    background: repeating-linear-gradient(135deg, ${p.theme.colors.warning} 0 6px, ${p.theme.colors.warningBg} 6px 10px);
  `}
  ${(p) => p.$tone === 'blocked' && css`background: ${p.theme.colors.error};`}
`;

const Mark = styled.div<{ $at: number; $dashed?: boolean }>`
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: calc(${(p) => p.$at}% - 1px);
  width: 0;
  border-left: 2px ${(p) => (p.$dashed ? 'dashed' : 'solid')} ${(p) => p.theme.colors.text};
  opacity: 0.55;
`;

const Labels = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: ${(p) => p.theme.colors.muted};
`;

const Caption = styled.div<{ $zone: PoolOverdraftState['zone']; $empty: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => (p.$empty ? p.theme.colors.muted : p.$zone === 'blocked' ? p.theme.colors.error : p.$zone === 'overdrawn' ? p.theme.colors.warning : p.theme.colors.text)};
`;

interface Props {
  overdraft: PoolOverdraftState;
  currency: string;
}

export function PoolMeter({ overdraft, currency }: Props) {
  const g = meterGeometry(overdraft);
  const blocked = overdraft.zone === 'blocked';
  return (
    <Wrap data-testid="pool-meter" data-zone={overdraft.zone}>
      {/* A brand-new pool with nothing in it yet is a normal state, not an alarm. */}
      <Caption $zone={overdraft.zone} $empty={overdraft.baselineMinor === 0 && overdraft.balanceMinor === 0} data-testid="pool-meter-caption">
        {meterCaption(overdraft, currency)}
      </Caption>
      <Track
        role="meter"
        aria-label="Pool balance"
        aria-valuemin={overdraft.floorMinor}
        aria-valuemax={overdraft.baselineMinor}
        aria-valuenow={overdraft.balanceMinor}
        aria-valuetext={meterCaption(overdraft, currency)}
      >
        <Fill $left={0} $width={g.spentPoolPct} $tone={blocked ? 'blocked' : 'pool'} />
        {g.spentOverdraftPct > 0 && <Fill $left={g.poolMarkPct} $width={g.spentOverdraftPct} $tone={blocked ? 'blocked' : 'over'} />}
        {overdraft.toleranceMinor > 0 && <Mark $at={g.poolMarkPct} />}
      </Track>
      {overdraft.toleranceMinor > 0 && (
        <Labels>
          <span>spent</span>
          <span>pool {formatMinor(overdraft.baselineMinor, currency)} ╌ limit {formatMinor(overdraft.baselineMinor + overdraft.toleranceMinor, currency)}</span>
        </Labels>
      )}
    </Wrap>
  );
}
