import {
  POOL_PRESETS,
  POOL_PRESET_LABELS,
  allowedFundingSources,
  buildPoolConfig,
  currencyExponent,
  entityKey,
  fromMinor,
  isPoolFundedEvent,
  isPoolFundedExpense,
  isPoolSideLeg,
  parseEntityKey,
  resolveFundingModel,
  resolveFundingSource,
  toMinor,
} from '../index';
import type { PoolPreset } from '../index';

describe('money helpers', () => {
  it('converts major to minor units for 2-decimal currencies', () => {
    expect(toMinor(10.5, 'USD')).toBe(1050);
    expect(toMinor(15000, 'INR')).toBe(1500000);
    expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
  });

  it('is immune to binary float drift on half-cent values', () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE-754; naive Math.round gives 100.
    expect(toMinor(1.005, 'USD')).toBe(101);
    expect(toMinor(2.675, 'GBP')).toBe(268);
  });

  it('rounds half away from zero, symmetrically for negatives', () => {
    expect(toMinor(-1.005, 'USD')).toBe(-101);
    expect(toMinor(-0.004, 'USD')).toBe(0);
    expect(Object.is(toMinor(-0.004, 'USD'), 0)).toBe(true);
  });

  it('treats JPY as having no minor unit', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('jpy')).toBe(0);
    expect(toMinor(1000, 'JPY')).toBe(1000);
    expect(toMinor(1000.6, 'JPY')).toBe(1001);
    expect(fromMinor(1000, 'JPY')).toBe(1000);
  });

  it('defaults unknown currencies to 2 decimals', () => {
    expect(currencyExponent('XYZ')).toBe(2);
    expect(currencyExponent('')).toBe(2);
  });

  it('round-trips minor units', () => {
    expect(fromMinor(1050, 'USD')).toBe(10.5);
    expect(fromMinor(toMinor(1234.56, 'INR'), 'INR')).toBe(1234.56);
  });

  it('rejects non-finite amounts', () => {
    expect(() => toMinor(Number.NaN, 'USD')).toThrow('Invalid amount');
    expect(() => toMinor(Number.POSITIVE_INFINITY, 'USD')).toThrow('Invalid amount');
  });
});

describe('funding model defaults (backward compatibility)', () => {
  it('reads an absent fundingModel as peer_to_peer', () => {
    expect(resolveFundingModel({})).toBe('peer_to_peer');
    expect(resolveFundingModel({ fundingModel: null })).toBe('peer_to_peer');
    expect(resolveFundingModel(undefined)).toBe('peer_to_peer');
    expect(resolveFundingModel({ fundingModel: 'pool' })).toBe('pool');
  });

  it('reads an absent fundingSource as self', () => {
    expect(resolveFundingSource({})).toBe('self');
    expect(resolveFundingSource(null)).toBe('self');
    expect(resolveFundingSource({ fundingSource: 'pool_reimbursement' })).toBe('pool_reimbursement');
  });

  it('classifies pool-funded events and expenses', () => {
    expect(isPoolFundedEvent({})).toBe(false);
    expect(isPoolFundedEvent({ fundingModel: 'pool' })).toBe(true);
    expect(isPoolFundedEvent({ fundingModel: 'hybrid' })).toBe(true);
    expect(isPoolFundedExpense({})).toBe(false);
    expect(isPoolFundedExpense({ fundingSource: 'self' })).toBe(false);
    expect(isPoolFundedExpense({ fundingSource: 'pool' })).toBe(true);
    expect(isPoolFundedExpense({ fundingSource: 'pool_reimbursement' })).toBe(true);
  });

  it('restricts funding sources by event funding model', () => {
    expect(allowedFundingSources('peer_to_peer')).toEqual(['self']);
    expect(allowedFundingSources('pool')).toEqual(['pool', 'pool_reimbursement']);
    expect(allowedFundingSources('hybrid')).toEqual(['pool', 'pool_reimbursement', 'self']);
  });

  it('identifies pool-side settlement legs; absent kind is a standard leg', () => {
    expect(isPoolSideLeg({})).toBe(false);
    expect(isPoolSideLeg({ kind: 'standard' })).toBe(false);
    expect(isPoolSideLeg({ kind: 'pool_reimbursement' })).toBe(true);
    expect(isPoolSideLeg({ kind: 'pool_cycle' })).toBe(true);
    expect(isPoolSideLeg({ kind: 'pool_member_exit' })).toBe(true);
    expect(isPoolSideLeg(undefined)).toBe(false);
  });
});

describe('entity keys', () => {
  it('round-trips user and group keys', () => {
    expect(entityKey('user', 'u1')).toBe('user:u1');
    expect(parseEntityKey('group:g1')).toEqual({ entityType: 'group', entityId: 'g1' });
  });

  it('preserves ids that themselves contain a colon', () => {
    expect(parseEntityKey('user:email:abc')).toEqual({ entityType: 'user', entityId: 'email:abc' });
  });
});

describe('pool presets', () => {
  const presets = Object.keys(POOL_PRESETS) as PoolPreset[];

  it('has a user-facing label for every preset', () => {
    for (const p of presets) {
      expect(POOL_PRESET_LABELS[p].title).toBeTruthy();
      expect(POOL_PRESET_LABELS[p].tagline).toBeTruthy();
    }
  });

  it('matches the documented policy defaults', () => {
    expect(POOL_PRESETS.trip_kitty).toMatchObject({ cycleMode: 'single', surplusPolicy: 'refund_pro_rata', overdraftPolicy: 'graduated' });
    expect(POOL_PRESETS.household).toMatchObject({ cycleMode: 'recurring', surplusPolicy: 'carry_forward', membershipChangeClosesCycle: true });
    expect(POOL_PRESETS.club_treasury).toMatchObject({ cycleMode: 'recurring', surplusPolicy: 'carry_forward', membershipChangeClosesCycle: false });
    expect(POOL_PRESETS.sponsor_budget).toMatchObject({ funderMode: 'sponsor', surplusPolicy: 'retain', deficitPolicy: 'custodian_absorbs', expenseApproval: 'always' });
    expect(POOL_PRESETS.target_collection).toMatchObject({ overdraftPolicy: 'block', requireFullFundingBeforeSpend: true });
  });

  it('uses a 20% graduated overdraft with zero clearance by default', () => {
    for (const p of ['trip_kitty', 'household', 'club_treasury', 'sponsor_budget'] as PoolPreset[]) {
      expect(POOL_PRESETS[p]).toMatchObject({
        overdraftPolicy: 'graduated',
        overdraftTolerancePercent: 20,
        overdraftBaseline: 'confirmed_funding',
        overdraftClearancePercent: 0,
      });
    }
  });

  it('builds a config with custodian, extras and overrides', () => {
    const cfg = buildPoolConfig('household', 'u1', { defaultContributionMinor: 1500000 }, { overdraftTolerancePercent: 10 });
    expect(cfg.custodianUserId).toBe('u1');
    expect(cfg.preset).toBe('household');
    expect(cfg.defaultContributionMinor).toBe(1500000);
    expect(cfg.targetAmountMinor).toBeNull();
    expect(cfg.overdraftTolerancePercent).toBe(10);
    expect(cfg.surplusPolicy).toBe('carry_forward');
  });

  it('does not let overrides change the preset name', () => {
    const cfg = buildPoolConfig('trip_kitty', 'u1', {}, { preset: 'household' } as any);
    expect(cfg.preset).toBe('trip_kitty');
  });
});
