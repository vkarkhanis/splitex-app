import {
  buildFundingPayload,
  canRecordAnyway,
  choosePool,
  contributorPoolsAvailable,
  CONTRIBUTOR_POOLS_IN_PRODUCTION,
  currencySymbol,
  DEFAULT_FUNDING_CHOICE,
  describePoolRefusal,
  formatMinor,
  isReceiptRequired,
  meterCaption,
  meterGeometry,
  needsTarget,
  poolErrorText,
  poolNoun,
  poolPaymentActions,
  poolPaymentActionsText,
  REIMBURSEMENT_STATUS,
  reimbursementStatus,
  toPoolError,
  validateFundingChoice,
  withPreset,
} from '../index';
import type { FundingChoice, PoolOverdraftState } from '../index';

const pool = (patch: Partial<FundingChoice> = {}): FundingChoice => ({ ...DEFAULT_FUNDING_CHOICE, kind: 'pool', ...patch });

describe('funding choice → create-event payload', () => {
  it('sends nothing for a split-expenses event (backward compatible)', () => {
    expect(buildFundingPayload(DEFAULT_FUNDING_CHOICE, 'INR')).toEqual({});
    expect(validateFundingChoice(DEFAULT_FUNDING_CHOICE)).toBeNull();
  });

  it('builds a trip kitty with a per-person amount in minor units', () => {
    expect(buildFundingPayload(pool({ perPersonAmount: '10000' }), 'INR')).toEqual({
      fundingModel: 'pool',
      pool: { preset: 'trip_kitty', defaultContributionMinor: 1000000 },
    });
  });

  it('respects currencies without minor units', () => {
    expect(buildFundingPayload(pool({ perPersonAmount: '5000' }), 'JPY').pool?.defaultContributionMinor).toBe(5000);
  });

  it('builds a sponsor budget from "Just me", ignoring per-person amounts', () => {
    const choice = withPreset(pool({ funder: 'sponsor', targetAmount: '800000', perPersonAmount: '99' }), 'sponsor_budget');
    expect(buildFundingPayload(choice, 'INR')).toEqual({ fundingModel: 'pool', pool: { preset: 'sponsor_budget', targetAmountMinor: 80000000 } });
  });

  it('marks the event hybrid when peer expenses are allowed (never for sponsors)', () => {
    expect(buildFundingPayload(pool({ allowPeerExpenses: true }), 'INR')).toMatchObject({ fundingModel: 'hybrid', pool: { allowPeerExpenses: true } });
    const sponsor = withPreset(pool({ allowPeerExpenses: true, targetAmount: '1' }), 'sponsor_budget');
    expect(sponsor.allowPeerExpenses).toBe(false);
    expect(buildFundingPayload({ ...sponsor, allowPeerExpenses: true }, 'INR').fundingModel).toBe('pool');
  });

  it('only sends overrides that differ from the preset', () => {
    expect(buildFundingPayload(pool({ tolerancePercent: '20', approval: 'none' }), 'INR').pool?.overrides).toBeUndefined();
    expect(buildFundingPayload(pool({ tolerancePercent: '10', approval: 'above_threshold', approvalThreshold: '500' }), 'INR').pool?.overrides).toEqual({
      overdraftTolerancePercent: 10,
      expenseApproval: 'above_threshold',
      approvalThresholdMinor: 50000,
    });
  });

  it('takes the preset defaults when switching presets', () => {
    const household = withPreset(pool(), 'household');
    expect(household).toMatchObject({ preset: 'household', funder: 'contributors', tolerancePercent: '20', approval: 'none' });
    const sponsor = withPreset(pool(), 'sponsor_budget');
    expect(sponsor).toMatchObject({ funder: 'sponsor', approval: 'always' });
    expect(withPreset(pool(), 'target_collection').tolerancePercent).toBe('0');
  });

  it('validates required and malformed amounts', () => {
    expect(needsTarget('sponsor_budget')).toBe(true);
    expect(needsTarget('trip_kitty')).toBe(false);
    expect(validateFundingChoice(withPreset(pool(), 'sponsor_budget'))).toBe('Enter the total budget.');
    expect(validateFundingChoice(withPreset(pool(), 'target_collection'))).toBe('Enter the amount to collect.');
    expect(validateFundingChoice(pool({ perPersonAmount: 'abc' }))).toBe('Enter a valid amount per person.');
    expect(validateFundingChoice(pool({ perPersonAmount: '-1' }))).toBe('Enter a valid amount per person.');
    expect(validateFundingChoice(pool({ tolerancePercent: '150' }))).toMatch(/between 0 and 100/);
    expect(validateFundingChoice(pool({ approval: 'above_threshold' }))).toMatch(/approval/);
    expect(validateFundingChoice(pool({ perPersonAmount: '100' }))).toBeNull();
  });
});

describe('pool formatting', () => {
  it('formats minor units with symbols and signs', () => {
    expect(formatMinor(1234567, 'INR')).toBe(`₹${(12345.67).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    expect(formatMinor(-500, 'USD')).toBe('−$5.00');
    expect(formatMinor(500, 'USD', { signed: true })).toBe('+$5.00');
    expect(formatMinor(1000, 'JPY')).toBe(`¥${(1000).toLocaleString()}`);
    expect(currencySymbol('CHF')).toBe('CHF ');
  });

  it('uses friendly nouns per preset', () => {
    expect(poolNoun({ preset: 'trip_kitty' })).toBe('Kitty');
    expect(poolNoun({ preset: 'household' })).toBe('Fund');
    expect(poolNoun({ preset: 'sponsor_budget' })).toBe('Budget');
    expect(poolNoun(null)).toBe('Pool');
  });

  it('explains refusals in plain language', () => {
    expect(describePoolRefusal({ code: 'POOL_OVERDRAFT_BLOCKED', data: { clearanceRequired: 400000 } }, 'INR')).toMatch(/more than ₹4,000\.00 to resume/);
    expect(describePoolRefusal({ code: 'POOL_OVERDRAFT_BLOCKED', data: { shortfall: 100000 } }, 'INR')).toMatch(/at least ₹1,000\.00/);
    expect(describePoolRefusal({ code: 'POOL_INSUFFICIENT_FUNDS', data: { shortfall: 100 } }, 'USD')).toMatch(/\$1\.00/);
    expect(describePoolRefusal({ code: 'POOL_UNDERFUNDED', data: { shortfall: 2400000 } }, 'INR')).toMatch(/₹24,000\.00 still to collect/);
    expect(describePoolRefusal({ code: 'POOL_SPENDER_CAP' }, 'INR')).toMatch(/spending limit/);
    expect(describePoolRefusal({ code: 'POOL_RECEIPT_REQUIRED' }, 'INR')).toMatch(/receipt/);
    expect(describePoolRefusal({ code: 'OTHER', message: 'Raw' }, 'INR')).toBe('Raw');
  });

  it('knows which refusals can be overridden by "already paid"', () => {
    expect(canRecordAnyway('POOL_OVERDRAFT_BLOCKED')).toBe(true);
    expect(canRecordAnyway('POOL_SPENDER_CAP')).toBe(true);
    expect(canRecordAnyway('POOL_RECEIPT_REQUIRED')).toBe(false);
    expect(canRecordAnyway(undefined)).toBe(false);
  });

  it('mirrors the server receipt rule', () => {
    const cfg = { claimReceiptRequired: true, receiptRequiredAboveMinor: 0 };
    expect(isReceiptRequired(cfg, 'self', 100)).toBe(false);
    expect(isReceiptRequired(cfg, 'pool_reimbursement', 1)).toBe(true);
    expect(isReceiptRequired({ ...cfg, claimReceiptRequired: false }, 'pool_reimbursement', 1)).toBe(false);
    expect(isReceiptRequired(cfg, 'pool', 1)).toBe(true);
    expect(isReceiptRequired({ ...cfg, receiptRequiredAboveMinor: null }, 'pool', 1)).toBe(false);
    expect(isReceiptRequired({ ...cfg, receiptRequiredAboveMinor: 500 }, 'pool', 500)).toBe(false);
    expect(isReceiptRequired(null, 'pool', 1)).toBe(false);
  });

  it('normalises thrown errors', () => {
    expect(toPoolError({ message: 'Nope', code: 'POOL_UNDERFUNDED', data: { shortfall: 5 } })).toEqual({ message: 'Nope', code: 'POOL_UNDERFUNDED', data: { shortfall: 5 } });
    expect(toPoolError('boom', 'fallback')).toEqual({ message: 'fallback' });
    expect(toPoolError({ message: '' }, 'fallback').message).toBe('fallback');
    expect(poolErrorText({ code: 'POOL_SPENDER_CAP', message: 'x' }, 'INR')).toMatch(/spending limit/);
    expect(poolErrorText(new Error('plain'), 'INR')).toBe('plain');
  });
});

const overdraft = (patch: Partial<PoolOverdraftState>): PoolOverdraftState => ({
  policy: 'graduated',
  baselineMinor: 5340000,
  tolerancePercent: 20,
  toleranceMinor: 1068000,
  floorMinor: -1068000,
  balanceMinor: 1450000,
  headroomMinor: 2518000,
  zone: 'healthy',
  latched: false,
  clearanceThresholdMinor: 0,
  ...patch,
});

describe('balance meter', () => {
  it('lays out the healthy zone', () => {
    const g = meterGeometry(overdraft({}));
    expect(g.poolMarkPct).toBeCloseTo(83.3, 1);
    expect(g.spentPoolPct).toBeCloseTo(((5340000 - 1450000) / 6408000) * 100, 0);
    expect(g.spentOverdraftPct).toBe(0);
    expect(meterCaption(overdraft({}), 'INR')).toMatch(/^₹14,500\.00 left of ₹53,400\.00$/);
  });

  it('extends into the overdraft zone (design doc example)', () => {
    const o = overdraft({ balanceMinor: -460000, headroomMinor: 608000, zone: 'overdrawn' });
    const g = meterGeometry(o);
    expect(g.spentPoolPct).toBeCloseTo(83.3, 1);
    expect(g.spentOverdraftPct).toBeCloseTo((460000 / 6408000) * 100, 1);
    expect(meterCaption(o, 'INR')).toBe('Overdrawn ₹4,600.00 · ₹6,080.00 of overdraft headroom left');
  });

  it('explains a paused pool and an empty one', () => {
    expect(meterCaption(overdraft({ balanceMinor: -400000, zone: 'blocked', latched: true, headroomMinor: 0 }), 'INR'))
      .toBe('Pool spending is paused — add more than ₹4,000.00 to resume');
    expect(meterCaption(overdraft({ policy: 'block', toleranceMinor: 0, baselineMinor: 0, balanceMinor: 0, zone: 'blocked' }), 'INR'))
      .toMatch(/Nothing in the pool yet/);
    expect(meterCaption(overdraft({ policy: 'block', toleranceMinor: 0, balanceMinor: 0, zone: 'blocked' }), 'INR'))
      .toMatch(/The pool is empty/);
  });

  it('handles an empty track', () => {
    expect(meterGeometry(overdraft({ baselineMinor: 0, toleranceMinor: 0 }))).toEqual({ poolMarkPct: 100, spentPoolPct: 0, spentOverdraftPct: 0, total: 0 });
  });

  it('clamps spending beyond the limit', () => {
    const g = meterGeometry(overdraft({ balanceMinor: -5000000, zone: 'blocked' }));
    expect(g.spentPoolPct + g.spentOverdraftPct).toBeCloseTo(100, 0);
  });

});

describe('reimbursement status of a claim', () => {
  it('has no pay-back status until the claim is approved', () => {
    expect(reimbursementStatus(undefined)).toBeNull();
    expect(reimbursementStatus({ status: 'pending' }, 'pending')).toBeNull();
    expect(reimbursementStatus({ status: 'rejected' })).toBeNull();
  });

  it('follows the reimbursement leg once approved', () => {
    expect(reimbursementStatus({ status: 'approved' })).toBe('to_reimburse');
    expect(reimbursementStatus({ status: 'approved' }, 'pending')).toBe('to_reimburse');
    expect(reimbursementStatus({ status: 'approved' }, 'initiated')).toBe('sent');
    expect(reimbursementStatus({ status: 'approved' }, 'completed')).toBe('reimbursed');
  });

  it('counts the custodian\'s own claim as reimbursed straight away', () => {
    expect(reimbursementStatus({ status: 'approved', selfReimbursed: true })).toBe('reimbursed');
  });

  it('labels each status', () => {
    expect(REIMBURSEMENT_STATUS.to_reimburse.label).toBe('To reimburse');
    expect(REIMBURSEMENT_STATUS.sent.label).toBe('Reimbursement sent');
    expect(REIMBURSEMENT_STATUS.reimbursed).toEqual({ label: 'Reimbursed', tone: 'success' });
  });
});

describe('"Several of us" pools in the first release', () => {
  it('are held back from production', () => {
    expect(CONTRIBUTOR_POOLS_IN_PRODUCTION).toBe(false);
    expect(contributorPoolsAvailable('production')).toBe(false);
  });

  it('stay available everywhere before production, for testing', () => {
    for (const env of ['local', 'development', 'staging', 'internal', 'STAGING']) {
      expect(contributorPoolsAvailable(env)).toBe(true);
    }
  });

  it('count a missing or unknown environment as production', () => {
    expect(contributorPoolsAvailable(undefined)).toBe(false);
    expect(contributorPoolsAvailable('')).toBe(false);
    expect(contributorPoolsAvailable('prod')).toBe(false);
  });

  it('start "Pool money" on "Just me" when that is the only funder offered', () => {
    expect(choosePool(DEFAULT_FUNDING_CHOICE, false)).toMatchObject({ kind: 'pool', funder: 'sponsor', preset: 'sponsor_budget', approval: 'always' });
    expect(choosePool(DEFAULT_FUNDING_CHOICE, true)).toMatchObject({ kind: 'pool', funder: 'contributors', preset: 'trip_kitty' });
  });
});

describe('pool payments waiting on a user', () => {
  const leg = (id: string, from: string, to: string, status: string, kind: string | null = 'pool_reimbursement') =>
    ({ id, fromUserId: from, toUserId: to, status, kind }) as any;
  const legs = [
    leg('a', 'alice', 'bob', 'initiated'),          // paid to Bob, he must confirm
    leg('b', 'alice', 'bob', 'pending'),            // Alice still has to pay
    leg('c', 'bob', 'alice', 'failed', 'pool_member_exit'), // Bob must pay (retry)
    leg('d', 'alice', 'bob', 'completed'),          // done
    leg('e', 'carol', 'bob', 'initiated', 'standard'), // not a pool payment
    leg('f', 'carol', 'bob', 'initiated', null),       // no kind: not a pool payment
  ];

  it('finds what each person has to confirm or pay', () => {
    const bob = poolPaymentActions(legs, 'bob');
    expect(bob.toConfirm.map((l) => l.id)).toEqual(['a']);
    expect(bob.toPay.map((l) => l.id)).toEqual(['c']);
    const alice = poolPaymentActions(legs, 'alice');
    expect(alice.toConfirm).toEqual([]);
    expect(alice.toPay.map((l) => l.id)).toEqual(['b']);
  });

  it('has nothing for an unknown user', () => {
    expect(poolPaymentActions(legs, null)).toEqual({ toPay: [], toConfirm: [] });
  });

  it('describes the waiting payments in words', () => {
    expect(poolPaymentActionsText(1, 0)).toBe('1 payment to confirm');
    expect(poolPaymentActionsText(2, 1)).toBe('2 payments to confirm · 1 payment to make');
    expect(poolPaymentActionsText(0, 3)).toBe('3 payments to make');
    expect(poolPaymentActionsText(0, 0)).toBeNull();
  });
});
