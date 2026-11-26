'use client';

import React from 'react';
import styled from 'styled-components';
import { Badge } from '@traxettle/ui';
import type { PoolConfig, PoolCycleSummary } from '@traxettle/shared';
import { formatMinor, poolNoun } from './poolFormat';

const Wrap = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Bar = styled.div`
  height: 6px;
  border-radius: 999px;
  background: ${(p) => p.theme.colors.surfaceHover};
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number; $tone: 'ok' | 'warn' | 'stop' }>`
  height: 100%;
  width: ${(p) => p.$pct}%;
  background: ${(p) => (p.$tone === 'stop' ? p.theme.colors.error : p.$tone === 'warn' ? p.theme.colors.warning : p.theme.colors.success)};
`;

const Line = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.textSecondary};
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

/** Remaining share of the pool, for the tile's thin bar (0–100). */
export function remainingPct(summary: PoolCycleSummary): number {
  const base = summary.overdraft.baselineMinor;
  if (base <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((summary.overdraft.balanceMinor / base) * 100)));
}

interface Props {
  summary: PoolCycleSummary;
  config: PoolConfig;
  currency: string;
}

/**
 * Dashboard tile line for a pool event: what's left, and a chip when someone
 * needs to act (overdrawn, paused, contributions outstanding, claims waiting).
 */
export function PoolTileStatus({ summary, config, currency }: Props) {
  const o = summary.overdraft;
  const tone = o.zone === 'blocked' ? 'stop' : o.zone === 'overdrawn' ? 'warn' : 'ok';
  const outstanding = summary.arrears.reduce((s, a) => s + a.outstandingMinor, 0);
  const noun = poolNoun(config);
  return (
    <Wrap data-testid="pool-tile-status">
      <Bar><Fill $pct={remainingPct(summary)} $tone={tone} /></Bar>
      <Line>
        <span>
          {o.zone === 'overdrawn'
            ? `${noun} overdrawn by ${formatMinor(-o.balanceMinor, currency)}`
            : `${formatMinor(Math.max(0, o.balanceMinor), currency)} left of ${formatMinor(o.baselineMinor, currency)}`}
        </span>
        {o.zone === 'blocked' && o.baselineMinor > 0 && <Badge $variant="error">Paused</Badge>}
        {o.zone === 'overdrawn' && <Badge $variant="warning">Overdrawn</Badge>}
        {outstanding > 0 && config.funderMode !== 'sponsor' && <Badge $variant="warning">{formatMinor(outstanding, currency)} due</Badge>}
        {summary.totals.pendingDrawsMinor > 0 && <Badge $variant="info">Awaiting approval</Badge>}
      </Line>
    </Wrap>
  );
}
