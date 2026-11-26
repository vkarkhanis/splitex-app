/**
 * The pure pool helpers are implemented and tested in @traxettle/shared
 * (src/__tests__/pool-ui.test.ts). Here: the web-only tile maths, and that the
 * web modules re-export the shared implementations unchanged.
 */
import * as shared from '@traxettle/shared';
import * as fundingChoice from '../../components/pool/fundingChoice';
import * as poolFormat from '../../components/pool/poolFormat';
import { meterCaption, meterGeometry } from '../../components/pool/PoolMeter';
import { remainingPct } from '../../components/pool/PoolTileStatus';
import type { PoolCycleSummary, PoolOverdraftState } from '@traxettle/shared';

const overdraft = (patch: Partial<PoolOverdraftState>): PoolOverdraftState => ({
  policy: 'graduated', baselineMinor: 10000, tolerancePercent: 20, toleranceMinor: 2000, floorMinor: -2000,
  balanceMinor: 2500, headroomMinor: 4500, zone: 'healthy', latched: false, clearanceThresholdMinor: 0, ...patch,
});

describe('web pool modules', () => {
  it('re-export the shared implementations', () => {
    expect(poolFormat.formatMinor).toBe(shared.formatMinor);
    expect(poolFormat.describePoolRefusal).toBe(shared.describePoolRefusal);
    expect(poolFormat.isReceiptRequired).toBe(shared.isReceiptRequired);
    expect(fundingChoice.buildFundingPayload).toBe(shared.buildFundingPayload);
    expect(fundingChoice.DEFAULT_FUNDING_CHOICE).toBe(shared.DEFAULT_FUNDING_CHOICE);
    expect(meterGeometry).toBe(shared.meterGeometry);
    expect(meterCaption).toBe(shared.meterCaption);
  });

  it('computes the tile\'s remaining share', () => {
    const summary = (balance: number, base: number) => ({ overdraft: overdraft({ balanceMinor: balance, baselineMinor: base }) }) as unknown as PoolCycleSummary;
    expect(remainingPct(summary(2500, 10000))).toBe(25);
    expect(remainingPct(summary(-100, 10000))).toBe(0);
    expect(remainingPct(summary(100, 0))).toBe(0);
    expect(remainingPct(summary(20000, 10000))).toBe(100);
  });
});
