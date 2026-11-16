import {
  allocateMinor,
  computeArrears,
  computeCycleTotals,
  computeFundingState,
  computeHoldings,
  computeOverdraftState,
  earlyRepaymentImpact,
  evaluateDraw,
  lentTopUps,
  nextOverdraftLatch,
  outstandingLoans,
  reconcileCycle,
  splitForMembershipChange,
} from '../index';
import type { AdvanceLike, ContributionLike, DrawLike, HoldingDrawLike, PoolConfig, PoolCycleTotals, ReconcileInput } from '../index';

// ── helpers ───────────────────────────────────────────────────────────────

const paid = (entityKey: string, amount: number, expected = amount): ContributionLike => ({
  entityKey,
  kind: 'regular',
  status: amount >= expected ? 'confirmed' : amount > 0 ? 'partial' : 'pending',
  expectedMinor: expected,
  receivedMinor: amount,
});
const topUp = (entityKey: string, amount: number, gift?: boolean): ContributionLike => ({
  entityKey,
  kind: 'top_up',
  status: 'confirmed',
  expectedMinor: amount,
  receivedMinor: amount,
  ...(gift ? { gift: true } : {}),
});
const spend = (amount: number, consumption?: DrawLike['consumption']): DrawLike => ({
  amountMinor: amount,
  fundingSource: 'pool',
  status: 'approved',
  consumption,
});
const users = (...ids: string[]) => ids.map((id) => ({ entityType: 'user' as const, entityId: id }));
const net = (r: ReturnType<typeof reconcileCycle>, key: string) =>
  r.entityShares.find((e) => `${e.entityType}:${e.entityId}` === key)!.netMinor;

const graduated: Pick<PoolConfig, 'overdraftPolicy' | 'overdraftTolerancePercent' | 'overdraftBaseline' | 'overdraftClearancePercent' | 'targetAmountMinor'> = {
  overdraftPolicy: 'graduated',
  overdraftTolerancePercent: 20,
  overdraftBaseline: 'confirmed_funding',
  overdraftClearancePercent: 0,
  targetAmountMinor: null,
};

function totals(partial: Partial<PoolCycleTotals>): PoolCycleTotals {
  const t: PoolCycleTotals = {
    expectedRegularMinor: 0,
    confirmedRegularMinor: 0,
    confirmedTopUpMinor: 0,
    overdraftCoverMinor: 0,
    poolSpendMinor: 0,
    reimbursementsMinor: 0,
    pendingDrawsMinor: 0,
    balanceMinor: 0,
    ...partial,
  };
  return t;
}

/** Seeded PRNG so the property tests are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── allocateMinor ─────────────────────────────────────────────────────────

describe('allocateMinor', () => {
  it('splits awkward totals exactly, giving the remainder to the first key on ties', () => {
    expect(allocateMinor(100, [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }, { key: 'c', weight: 1 }])).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('splits in proportion to weights', () => {
    expect(allocateMinor(1600000, [{ key: 'a', weight: 1500000 }, { key: 'b', weight: 500000 }])).toEqual({ a: 1200000, b: 400000 });
  });

  it('gives the remainder to the largest fractional part, not the largest weight', () => {
    // quotas: a 3.3, b 6.7 → b gets the extra unit
    expect(allocateMinor(10, [{ key: 'a', weight: 33 }, { key: 'b', weight: 67 }])).toEqual({ a: 3, b: 7 });
  });

  it('splits negative totals symmetrically', () => {
    expect(allocateMinor(-100, [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }, { key: 'c', weight: 1 }])).toEqual({ a: -34, b: -33, c: -33 });
  });

  it('splits equally when every weight is zero', () => {
    expect(allocateMinor(10, [{ key: 'a', weight: 0 }, { key: 'b', weight: 0 }])).toEqual({ a: 5, b: 5 });
  });

  it('treats negative and non-finite weights as zero', () => {
    expect(allocateMinor(10, [{ key: 'a', weight: -5 }, { key: 'b', weight: 2 }, { key: 'c', weight: Number.NaN }])).toEqual({ a: 0, b: 10, c: 0 });
  });

  it('supports fractional weights', () => {
    expect(allocateMinor(100, [{ key: 'a', weight: 0.25 }, { key: 'b', weight: 0.75 }])).toEqual({ a: 25, b: 75 });
  });

  it('merges duplicate keys', () => {
    expect(allocateMinor(90, [{ key: 'a', weight: 1 }, { key: 'a', weight: 1 }, { key: 'b', weight: 1 }])).toEqual({ a: 60, b: 30 });
  });

  it('returns no zero-negative values', () => {
    const out = allocateMinor(-1, [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }]);
    expect(Object.is(out.b, 0)).toBe(true);
  });

  it('handles empty weights only for a zero total', () => {
    expect(allocateMinor(0, [])).toEqual({});
    expect(() => allocateMinor(5, [])).toThrow('no entities');
  });

  it('rejects a non-integer total', () => {
    expect(() => allocateMinor(10.5, [{ key: 'a', weight: 1 }])).toThrow('integer');
  });

  it('stays exact for very large pools (₹10 crore across uneven weights)', () => {
    const out = allocateMinor(1_000_000_000, [
      { key: 'a', weight: 333_333_333 },
      { key: 'b', weight: 333_333_333 },
      { key: 'c', weight: 333_333_334 },
    ]);
    expect(out.a + out.b + out.c).toBe(1_000_000_000);
  });

  it('property: parts always sum to the total and stay within 1 of the exact quota', () => {
    const rand = rng(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 6);
      const weights = Array.from({ length: n }, (_, j) => ({ key: `k${j}`, weight: Math.floor(rand() * 100000) }));
      const total = Math.floor(rand() * 2_000_000) - 1_000_000;
      const out = allocateMinor(total, weights);
      expect(Object.values(out).reduce((s, v) => s + v, 0)).toBe(total);
      const sumW = weights.reduce((s, w) => s + w.weight, 0) || n;
      for (const w of weights) {
        const quota = (total * (sumW === n && weights.every((x) => x.weight === 0) ? 1 : w.weight)) / sumW;
        expect(Math.abs(out[w.key] - quota)).toBeLessThan(1);
      }
    }
  });
});

// ── totals, arrears, funding ──────────────────────────────────────────────

describe('computeCycleTotals', () => {
  it('derives the balance from opening, confirmed money and approved draws only', () => {
    const t = computeCycleTotals({
      openingBalanceMinor: 840000,
      contributions: [
        paid('user:a', 1500000),
        paid('user:b', 750000, 1500000),
        { entityKey: 'user:c', kind: 'regular', status: 'waived', expectedMinor: 1500000, receivedMinor: 0 },
        { entityKey: 'user:a', kind: 'top_up', status: 'confirmed', expectedMinor: 100000, receivedMinor: 100000 },
        { entityKey: 'user:a', kind: 'overdraft_cover', status: 'confirmed', expectedMinor: 20000, receivedMinor: 20000 },
      ],
      draws: [
        spend(420000),
        { amountMinor: 210000, fundingSource: 'pool_reimbursement', status: 'approved' },
        { amountMinor: 99999, fundingSource: 'pool', status: 'pending' },
        { amountMinor: 55555, fundingSource: 'pool', status: 'rejected' },
      ],
    });
    expect(t).toEqual({
      expectedRegularMinor: 3000000, // waived excluded
      confirmedRegularMinor: 2250000,
      confirmedTopUpMinor: 100000,
      overdraftCoverMinor: 20000,
      poolSpendMinor: 420000,
      reimbursementsMinor: 210000,
      pendingDrawsMinor: 99999,
      balanceMinor: 840000 + 2250000 + 100000 + 20000 - 420000 - 210000,
    });
  });
});

describe('computeArrears', () => {
  it('lists outstanding regular contributions, ignoring waived and overpaid ones', () => {
    const arrears = computeArrears([
      paid('user:dev', 0, 1500000),
      paid('user:meera', 750000, 1500000),
      paid('user:asha', 1600000, 1500000),
      { entityKey: 'user:ravi', kind: 'regular', status: 'waived', expectedMinor: 1500000, receivedMinor: 0 },
      { entityKey: 'user:dev', kind: 'top_up', status: 'pending', expectedMinor: 5000, receivedMinor: 0 },
    ]);
    expect(arrears).toEqual([
      { entityType: 'user', entityId: 'dev', outstandingMinor: 1500000 },
      { entityType: 'user', entityId: 'meera', outstandingMinor: 750000 },
    ]);
  });
});

describe('computeFundingState', () => {
  it('uses an explicit target', () => {
    const t = totals({ confirmedRegularMinor: 4000000 });
    expect(computeFundingState({ targetAmountMinor: 6400000 }, 0, t)).toEqual({ targetMinor: 6400000, fundedMinor: 4000000, state: 'underfunded' });
    expect(computeFundingState({ targetAmountMinor: 4000000 }, 0, t).state).toBe('funded');
  });

  it('falls back to the expected contribution total', () => {
    const t = totals({ expectedRegularMinor: 6000000, confirmedRegularMinor: 6000000 });
    expect(computeFundingState({ targetAmountMinor: null }, 0, t)).toEqual({ targetMinor: 6000000, fundedMinor: 6000000, state: 'funded' });
  });

  it('counts carried balance and top-ups as funding', () => {
    const t = totals({ expectedRegularMinor: 100, confirmedRegularMinor: 50, confirmedTopUpMinor: 20 });
    expect(computeFundingState({}, 30, t)).toEqual({ targetMinor: 100, fundedMinor: 100, state: 'funded' });
  });

  it('is open-ended with no target and no expectations', () => {
    expect(computeFundingState({}, 0, totals({})).state).toBe('open_ended');
  });
});

// ── graduated overdraft ───────────────────────────────────────────────────

describe('graduated overdraft — design doc worked example (UC-1)', () => {
  // opening ₹8,400 + confirmed ₹45,000 = baseline ₹53,400; spent ₹58,000.
  const t = totals({ confirmedRegularMinor: 4500000, poolSpendMinor: 5800000, balanceMinor: 840000 + 4500000 - 5800000 });
  const state = computeOverdraftState(graduated, 840000, t);

  it('derives baseline, tolerance and floor', () => {
    expect(state.baselineMinor).toBe(5340000);
    expect(state.toleranceMinor).toBe(1068000);
    expect(state.floorMinor).toBe(-1068000);
    expect(state.balanceMinor).toBe(-460000);
  });

  it('reports the amber zone with ₹6,080 of headroom', () => {
    expect(state.zone).toBe('overdrawn');
    expect(state.headroomMinor).toBe(608000);
    expect(state.latched).toBe(false);
  });

  it('allows a ₹4,000 bill with a warning', () => {
    const d = evaluateDraw(state, 400000, { alreadyIncurred: false });
    expect(d).toMatchObject({ allowed: true, warn: true, projectedMinor: -860000 });
  });

  it('refuses a ₹9,000 bill, needing ₹2,920 more', () => {
    const d = evaluateDraw(state, 900000, { alreadyIncurred: false });
    expect(d).toMatchObject({ allowed: false, code: 'POOL_OVERDRAFT_BLOCKED', projectedMinor: -1360000, shortfallMinor: 292000 });
  });

  it('records the same ₹9,000 bill if it was already paid, flagged', () => {
    const d = evaluateDraw(state, 900000, { alreadyIncurred: true });
    expect(d).toMatchObject({ allowed: true, warn: true, flag: 'exceeds_tolerance' });
  });

  it('recovers with no manual step when Dev pays ₹15,000', () => {
    const after = totals({ confirmedRegularMinor: 6000000, poolSpendMinor: 5800000, balanceMinor: 840000 + 6000000 - 5800000 });
    const s = computeOverdraftState(graduated, 840000, after);
    expect(s.baselineMinor).toBe(6840000);
    expect(s.toleranceMinor).toBe(1368000);
    expect(s.balanceMinor).toBe(1040000);
    expect(s.zone).toBe('healthy');
  });
});

describe('graduated overdraft — the pause and its release', () => {
  const B = 1000000; // ₹10,000 pool → ₹2,000 tolerance
  const at = (balance: number, latchedAt: string | null = null, cfg = graduated) =>
    computeOverdraftState(cfg, 0, totals({ confirmedRegularMinor: B, balanceMinor: balance }), latchedAt);

  it('allows a draw that lands exactly on the floor ("allowed till 20%")', () => {
    expect(evaluateDraw(at(0), 200000, { alreadyIncurred: false }).allowed).toBe(true);
  });

  it('pauses all pre-authorised spending once at the floor', () => {
    const s = at(-200000);
    expect(s.latched).toBe(true);
    expect(s.zone).toBe('blocked');
    expect(s.headroomMinor).toBe(0);
    expect(evaluateDraw(s, 1, { alreadyIncurred: false })).toMatchObject({ allowed: false, code: 'POOL_OVERDRAFT_BLOCKED' });
  });

  it('stays paused after a partial top-up — the overdraft must be repaid plus more', () => {
    // ₹1,500 added: balance −₹500, above the floor but still not repaid.
    const s = at(-50000, '2026-10-01T00:00:00Z');
    expect(s.latched).toBe(true);
    expect(s.zone).toBe('blocked');
    const d = evaluateDraw(s, 10000, { alreadyIncurred: false });
    expect(d.allowed).toBe(false);
    expect(d.clearanceRequiredMinor).toBe(50000);
    expect(d.shortfallMinor).toBe(50001); // must exceed ₹500
  });

  it('a small top-up does not unpause a ₹1 spend (no dribbling)', () => {
    const s = at(-199999, '2026-10-01T00:00:00Z');
    expect(evaluateDraw(s, 1, { alreadyIncurred: false }).allowed).toBe(false);
  });

  it('releases once the balance is back above zero', () => {
    const s = at(1, '2026-10-01T00:00:00Z');
    expect(s.latched).toBe(false);
    expect(s.zone).toBe('healthy');
    expect(evaluateDraw(s, 150000, { alreadyIncurred: false })).toMatchObject({ allowed: true, warn: true });
  });

  it('honours a non-zero clearance threshold', () => {
    const cfg = { ...graduated, overdraftClearancePercent: 10 };
    expect(at(50000, '2026-10-01T00:00:00Z', cfg).latched).toBe(true); // ₹500 ≤ 10% of ₹10,000
    expect(at(50000, '2026-10-01T00:00:00Z', cfg).zone).toBe('blocked');
    expect(at(100001, '2026-10-01T00:00:00Z', cfg).latched).toBe(false);
  });

  it('ignores a stale latch flag once the balance has recovered', () => {
    expect(at(5000, '2026-10-01T00:00:00Z').latched).toBe(false);
  });

  it('always records already-incurred spend while paused, flagged', () => {
    expect(evaluateDraw(at(-200000), 50000, { alreadyIncurred: true })).toMatchObject({ allowed: true, flag: 'exceeds_tolerance' });
  });

  it('computes latch transitions', () => {
    expect(nextOverdraftLatch(at(-200000), false)).toBe('latch');
    expect(nextOverdraftLatch(at(-100000), false)).toBe('unchanged');
    expect(nextOverdraftLatch(at(-100000, 'x'), true)).toBe('unchanged');
    expect(nextOverdraftLatch(at(1, 'x'), true)).toBe('release');
  });
});

describe('overdraft edge cases', () => {
  it('behaves as a hard stop when nothing has been contributed yet (baseline 0)', () => {
    const s = computeOverdraftState(graduated, 0, totals({ balanceMinor: 0 }));
    expect(s.floorMinor).toBe(0);
    expect(s.zone).toBe('blocked');
    expect(evaluateDraw(s, 1, { alreadyIncurred: false }).allowed).toBe(false);
  });

  it('floors the tolerance so no fractional headroom is granted', () => {
    const s = computeOverdraftState(graduated, 0, totals({ confirmedRegularMinor: 999, balanceMinor: 999 }));
    expect(s.toleranceMinor).toBe(199); // not 199.8
  });

  it('supports the expected-funding baseline', () => {
    const s = computeOverdraftState({ ...graduated, overdraftBaseline: 'expected_funding' }, 0, totals({ expectedRegularMinor: 6000000, confirmedRegularMinor: 1000000, balanceMinor: 1000000 }));
    expect(s.baselineMinor).toBe(6000000);
    expect(s.toleranceMinor).toBe(1200000);
  });

  it('supports the target-amount baseline, falling back to confirmed funding without a target', () => {
    const t = totals({ confirmedRegularMinor: 500000, balanceMinor: 500000 });
    expect(computeOverdraftState({ ...graduated, overdraftBaseline: 'target_amount', targetAmountMinor: 80000000 }, 0, t).baselineMinor).toBe(80000000);
    expect(computeOverdraftState({ ...graduated, overdraftBaseline: 'target_amount' }, 0, t).baselineMinor).toBe(500000);
  });

  it('block policy refuses anything that would go negative', () => {
    const s = computeOverdraftState({ ...graduated, overdraftPolicy: 'block' }, 0, totals({ confirmedRegularMinor: 1000, balanceMinor: 1000 }));
    expect(s.toleranceMinor).toBe(0);
    expect(evaluateDraw(s, 1000, { alreadyIncurred: false })).toMatchObject({ allowed: true, warn: false });
    expect(evaluateDraw(s, 1001, { alreadyIncurred: false })).toMatchObject({ allowed: false, code: 'POOL_INSUFFICIENT_FUNDS', shortfallMinor: 1 });
    expect(evaluateDraw(s, 1001, { alreadyIncurred: true })).toMatchObject({ allowed: true, flag: 'exceeds_tolerance' });
  });

  it('block policy reports zero as blocked', () => {
    const s = computeOverdraftState({ ...graduated, overdraftPolicy: 'block' }, 0, totals({ balanceMinor: 0 }));
    expect(s.zone).toBe('blocked');
  });

  it('allow policy never refuses but warns below zero', () => {
    const s = computeOverdraftState({ ...graduated, overdraftPolicy: 'allow' }, 0, totals({ balanceMinor: 100 }));
    expect(evaluateDraw(s, 1_000_000, { alreadyIncurred: false })).toMatchObject({ allowed: true, warn: true });
    expect(nextOverdraftLatch(s, true)).toBe('release');
    expect(nextOverdraftLatch(s, false)).toBe('unchanged');
  });

  it('refuses spending while an escrow pool is underfunded', () => {
    const s = computeOverdraftState({ ...graduated, overdraftPolicy: 'block' }, 0, totals({ confirmedRegularMinor: 4000000, balanceMinor: 4000000 }));
    const funding = { targetMinor: 6400000, fundedMinor: 4000000, state: 'underfunded' as const };
    expect(evaluateDraw(s, 500000, { alreadyIncurred: false, funding, requireFullFunding: true })).toMatchObject({ allowed: false, code: 'POOL_UNDERFUNDED', shortfallMinor: 2400000 });
    expect(evaluateDraw(s, 500000, { alreadyIncurred: true, funding, requireFullFunding: true })).toMatchObject({ allowed: true, flag: 'underfunded' });
    expect(evaluateDraw(s, 500000, { alreadyIncurred: false, funding: { ...funding, state: 'funded' }, requireFullFunding: true }).allowed).toBe(true);
  });
});

// ── reconciliation ────────────────────────────────────────────────────────

function base(partial: Partial<ReconcileInput>): ReconcileInput {
  return {
    custodianEntityKey: 'user:a',
    roster: users('a', 'b'),
    openingCredits: {},
    contributions: [],
    draws: [],
    surplusPolicy: 'refund_pro_rata',
    deficitPolicy: 'collect_pro_rata',
    ...partial,
  };
}

describe('reconcileCycle — UC-3 trip kitty (design doc example)', () => {
  const r = reconcileCycle(base({
    contributions: [paid('user:a', 1500000), paid('user:b', 500000)],
    draws: [spend(1600000)],
  }));

  it('refunds the ₹4,000 surplus in proportion to contribution, not equally', () => {
    expect(net(r, 'user:a')).toBe(300000);
    expect(net(r, 'user:b')).toBe(100000);
    expect(r.outcome).toBe('surplus');
    expect(r.closingBalanceMinor).toBe(400000);
    expect(r.shareBasis).toBe('commitment');
  });

  it('nets the custodian holding the cash against their own refund', () => {
    // A holds ₹4,000 and is owed ₹3,000 ⇒ A pays B ₹1,000.
    expect(r.settlementBalances).toEqual({ 'user:a': -100000, 'user:b': 100000 });
    expect(Object.values(r.settlementBalances).reduce((s, v) => s + v, 0)).toBe(0);
  });
});

describe('reconcileCycle — fairness: non-payers still bear their share', () => {
  // Four flatmates agreed ₹15,000 each; Dev paid nothing; ₹50,000 was spent.
  const input = base({
    roster: users('a', 'b', 'c', 'dev'),
    contributions: [paid('user:a', 1500000), paid('user:b', 1500000), paid('user:c', 1500000), paid('user:dev', 0, 1500000)],
    draws: [spend(5000000)],
  });

  it('weights fair shares by agreed commitment, so Dev owes ₹12,500', () => {
    const r = reconcileCycle(input);
    expect(net(r, 'user:dev')).toBe(-1250000);
    expect(net(r, 'user:a')).toBe(250000);
    expect(r.outcome).toBe('deficit');
    expect(r.closingBalanceMinor).toBe(-500000);
    expect(r.uncoveredDeficitMinor).toBe(500000);
  });

  it('credits whoever covered the shortfall, closing at exactly zero', () => {
    const r = reconcileCycle({ ...input, extraCover: [{ entityKey: 'user:a', amountMinor: 500000 }] });
    expect(r.closingBalanceMinor).toBe(0);
    expect(r.uncoveredDeficitMinor).toBe(0);
    expect(net(r, 'user:a')).toBe(750000);
    expect(r.overdraftCoverMinor).toBe(500000);
    expect(r.settlementBalances).toEqual({ 'user:a': 750000, 'user:b': 250000, 'user:c': 250000, 'user:dev': -1250000 });
  });

  it('a recorded overdraft_cover contribution is equivalent to extraCover', () => {
    const recorded = reconcileCycle({
      ...input,
      contributions: [...input.contributions, { entityKey: 'user:a', kind: 'overdraft_cover', status: 'confirmed', expectedMinor: 500000, receivedMinor: 500000 }],
    });
    const previewed = reconcileCycle({ ...input, extraCover: [{ entityKey: 'user:a', amountMinor: 500000 }] });
    expect(recorded.entityShares).toEqual(previewed.entityShares);
  });

  it('does not let covering the deficit increase the coverer\'s share of it', () => {
    const r = reconcileCycle({ ...input, extraCover: [{ entityKey: 'user:a', amountMinor: 500000 }] });
    const a = r.entityShares.find((e) => e.entityId === 'a')!;
    expect(a.commitmentMinor).toBe(1500000);
    expect(a.fairShareMinor).toBe(1250000);
  });
});

describe('reconcileCycle — share bases', () => {
  it('equal: everyone bears an equal share of spending', () => {
    const r = reconcileCycle(base({
      surplusPolicy: 'refund_equal',
      contributions: [paid('user:a', 1500000), paid('user:b', 500000)],
      draws: [spend(1600000)],
    }));
    expect(r.shareBasis).toBe('equal');
    expect(net(r, 'user:a')).toBe(700000);
    expect(net(r, 'user:b')).toBe(-300000);
  });

  it('equal: a fully waived member is excused from sharing', () => {
    const r = reconcileCycle(base({
      roster: users('a', 'b', 'c'),
      deficitPolicy: 'collect_equal',
      contributions: [paid('user:a', 1000), paid('user:b', 1000), { entityKey: 'user:c', kind: 'regular', status: 'waived', expectedMinor: 1000, receivedMinor: 0 }],
      draws: [spend(3000)],
    }));
    expect(net(r, 'user:c')).toBe(0);
    expect(net(r, 'user:a')).toBe(-500);
    expect(net(r, 'user:b')).toBe(-500);
  });

  it('commitment: a waived member has zero weight', () => {
    const r = reconcileCycle(base({
      roster: users('a', 'b'),
      contributions: [paid('user:a', 1000), { entityKey: 'user:b', kind: 'regular', status: 'waived', expectedMinor: 1000, receivedMinor: 0 }],
      draws: [spend(800)],
    }));
    expect(net(r, 'user:b')).toBe(0);
    expect(net(r, 'user:a')).toBe(200);
  });

  it('commitment: top-ups are money in but do not enlarge the stake', () => {
    const r = reconcileCycle(base({
      contributions: [paid('user:a', 1000000), paid('user:b', 1000000), { entityKey: 'user:a', kind: 'top_up', status: 'confirmed', expectedMinor: 500000, receivedMinor: 500000 }],
      draws: [spend(2200000)],
    }));
    // Equal agreed stakes ⇒ ₹11,000 each. A is ₹4,000 ahead, B ₹1,000 behind.
    expect(net(r, 'user:a')).toBe(400000);
    expect(net(r, 'user:b')).toBe(-100000);
  });

  it('commitment: a gift pays for spending, lowering everyone\'s share by commitment', () => {
    const r = reconcileCycle(base({
      contributions: [paid('user:a', 3000), paid('user:b', 1000), topUp('user:c', 2000, true)],
      draws: [spend(6000)],
    }));
    // ₹6,000 spent − ₹2,000 gift = ₹4,000 shared 3:1 by commitment.
    expect(r.entityShares.find((e) => e.entityId === 'a')!.fairShareMinor).toBe(3000);
    expect(r.entityShares.find((e) => e.entityId === 'b')!.fairShareMinor).toBe(1000);
    expect(net(r, 'user:c')).toBe(0);
    expect(r.closingBalanceMinor).toBe(0);
  });

  it('consumption: a gift lowers shares by commitment', () => {
    const r = reconcileCycle(base({
      surplusPolicy: 'refund_pro_rata',
      deficitPolicy: 'collect_by_consumption',
      contributions: [paid('user:a', 1000), paid('user:b', 1000), topUp('user:c', 1000, true)],
      draws: [spend(4000, [{ key: 'user:a', weight: 1 }, { key: 'user:b', weight: 1 }])],
    }));
    expect(r.shareBasis).toBe('consumption');
    expect(r.entityShares.find((e) => e.entityId === 'a')!.fairShareMinor).toBe(1500);
    expect(r.entityShares.find((e) => e.entityId === 'b')!.fairShareMinor).toBe(1500);
    expect(r.closingBalanceMinor).toBe(-1000);
  });

  it('commitment: shares equally when nobody committed anything', () => {
    const r = reconcileCycle(base({ openingCredits: { 'user:a': 500, 'user:b': 500 }, draws: [spend(600)] }));
    expect(net(r, 'user:a')).toBe(200);
    expect(net(r, 'user:b')).toBe(200);
  });

  it('consumption: shares by what each entity consumed', () => {
    const r = reconcileCycle(base({
      deficitPolicy: 'collect_by_consumption',
      contributions: [paid('user:a', 1000), paid('user:b', 1000)],
      draws: [spend(2400, [{ key: 'user:a', weight: 3 }, { key: 'user:b', weight: 1 }])],
    }));
    expect(r.shareBasis).toBe('consumption');
    expect(net(r, 'user:a')).toBe(1000 - 1800);
    expect(net(r, 'user:b')).toBe(1000 - 600);
  });

  it('consumption: expenses without splits fall back to commitment weights', () => {
    const r = reconcileCycle(base({
      deficitPolicy: 'collect_by_consumption',
      contributions: [paid('user:a', 3000), paid('user:b', 1000)],
      draws: [spend(8000)],
    }));
    expect(net(r, 'user:a')).toBe(3000 - 6000);
    expect(net(r, 'user:b')).toBe(1000 - 2000);
  });

  it('consumption: someone outside the roster who consumed ends up owing', () => {
    const r = reconcileCycle(base({
      deficitPolicy: 'collect_by_consumption',
      contributions: [paid('user:a', 1000), paid('user:b', 1000)],
      draws: [spend(3000, [{ key: 'user:a', weight: 1 }, { key: 'user:b', weight: 1 }, { key: 'user:guest', weight: 1 }])],
    }));
    expect(net(r, 'user:guest')).toBe(-1000);
  });
});

describe('reconcileCycle — UC-2 sponsor budget', () => {
  const sponsor = (draws: DrawLike[], extra: Partial<ReconcileInput> = {}) =>
    reconcileCycle(base({
      custodianEntityKey: 'user:sponsor',
      roster: users('sponsor'),
      surplusPolicy: 'retain',
      deficitPolicy: 'custodian_absorbs',
      contributions: [paid('user:sponsor', 80000000)],
      draws,
      ...extra,
    }));

  it('retains the unspent budget with the sponsor: no settlement legs', () => {
    const r = sponsor([spend(70000000), { amountMinor: 4230000, fundingSource: 'pool_reimbursement', status: 'approved' }]);
    expect(r.shareBasis).toBe('custodian');
    expect(r.closingBalanceMinor).toBe(5770000);
    expect(r.poolSpendMinor).toBe(70000000);
    expect(r.reimbursementsMinor).toBe(4230000);
    expect(r.settlementBalances).toEqual({});
  });

  it('absorbs an overspend once the sponsor covers it', () => {
    const r = sponsor([spend(80500000)], { extraCover: [{ entityKey: 'user:sponsor', amountMinor: 500000 }] });
    expect(r.outcome).toBe('deficit');
    expect(r.closingBalanceMinor).toBe(0);
    expect(r.settlementBalances).toEqual({});
  });

  it('repays a non-sponsor who fronted cover', () => {
    const r = sponsor([spend(80500000)], { extraCover: [{ entityKey: 'user:helper', amountMinor: 500000 }] });
    expect(r.settlementBalances).toEqual({ 'user:helper': 500000, 'user:sponsor': -500000 });
  });

  // Design doc §10: money others add is a loan the sponsor pays back, unless it's a gift.
  describe('money added by others (§10)', () => {
    const anita = (contributions: ContributionLike[], draws: DrawLike[]) =>
      reconcileCycle(base({
        custodianEntityKey: 'user:anita',
        roster: users('anita'),
        surplusPolicy: 'retain',
        deficitPolicy: 'custodian_absorbs',
        contributions,
        draws,
        forDissolution: true,
      }));

    it('worked example: pays Priya back ₹10,000, keeps Ravi\'s ₹5,000 gift, Anita bears ₹1,07,000', () => {
      const r = anita(
        [paid('user:anita', 10000000), topUp('user:priya', 1000000), topUp('user:ravi', 500000, true)],
        [spend(11200000)],
      );
      expect(r.closingBalanceMinor).toBe(300000);
      expect(r.giftsMinor).toBe(500000);
      expect(net(r, 'user:anita')).toBe(-700000);
      expect(net(r, 'user:priya')).toBe(1000000);
      expect(net(r, 'user:ravi')).toBe(0);
      expect(r.entityShares.find((e) => e.entityId === 'anita')!.fairShareMinor).toBe(10700000);
      // Anita pays out the ₹3,000 left in the pool plus ₹7,000 of her own.
      expect(r.settlementBalances).toEqual({ 'user:priya': 1000000, 'user:anita': -1000000 });
    });

    it('pays a lender back in full even when the pool ends with money left', () => {
      const r = anita([paid('user:anita', 100000), topUp('user:priya', 20000)], [spend(50000)]);
      expect(r.settlementBalances).toEqual({ 'user:priya': 20000, 'user:anita': -20000 });
    });

    it("never pays back the sponsor's own top-up", () => {
      const r = anita([paid('user:anita', 100000), topUp('user:anita', 20000)], [spend(50000)]);
      expect(r.settlementBalances).toEqual({});
    });

    it('a gift lowers the sponsor\'s cost and is never paid back', () => {
      const r = anita([paid('user:anita', 100000), topUp('user:ravi', 30000, true)], [spend(120000)]);
      expect(r.settlementBalances).toEqual({});
      expect(net(r, 'user:anita')).toBe(10000);
      expect(r.closingBalanceMinor).toBe(10000);
    });

    it('ignores a top-up the sponsor has not confirmed yet', () => {
      const pending: ContributionLike = { entityKey: 'user:priya', kind: 'top_up', status: 'initiated', expectedMinor: 20000, receivedMinor: 0 };
      const r = anita([paid('user:anita', 100000), pending], [spend(50000)]);
      expect(r.settlementBalances).toEqual({});
    });
  });
});

describe('reconcileCycle — dispositions and carried credits', () => {
  it('carries forward instead of settling for a carry-forward pool', () => {
    const r = reconcileCycle(base({ surplusPolicy: 'carry_forward', contributions: [paid('user:a', 1000), paid('user:b', 1000)], draws: [spend(1500)] }));
    expect(r.disposition).toBe('carry_forward');
    expect(r.settlementBalances).toEqual({});
    expect(r.closingBalanceMinor).toBe(500);
  });

  it('settles a carry-forward pool when dissolving', () => {
    const r = reconcileCycle(base({ surplusPolicy: 'carry_forward', forDissolution: true, contributions: [paid('user:a', 1000), paid('user:b', 1000)], draws: [spend(1500)] }));
    expect(r.disposition).toBe('settle');
    expect(r.settlementBalances).toEqual({ 'user:a': -250, 'user:b': 250 });
  });

  it('passes opening credits through to net positions', () => {
    const r = reconcileCycle(base({ openingCredits: { 'user:a': 700, 'user:b': -200 }, contributions: [paid('user:a', 1000), paid('user:b', 1000)], draws: [spend(2000)] }));
    expect(r.openingBalanceMinor).toBe(500);
    expect(net(r, 'user:a')).toBe(700);
    expect(net(r, 'user:b')).toBe(-200);
  });

  it('classifies a balanced cycle', () => {
    const r = reconcileCycle(base({ contributions: [paid('user:a', 500), paid('user:b', 500)], draws: [spend(1000)] }));
    expect(r.outcome).toBe('balanced');
    expect(r.settlementBalances).toEqual({});
  });

  it('shares among everyone involved when the roster is empty', () => {
    const r = reconcileCycle(base({ roster: [], contributions: [paid('user:a', 1000), paid('user:b', 1000)], draws: [spend(1000)] }));
    expect(net(r, 'user:a')).toBe(500);
    expect(net(r, 'user:b')).toBe(500);
  });

  it('ignores pending and rejected draws', () => {
    const r = reconcileCycle(base({
      contributions: [paid('user:a', 1000), paid('user:b', 1000)],
      draws: [{ amountMinor: 999, fundingSource: 'pool', status: 'pending' }, { amountMinor: 999, fundingSource: 'pool_reimbursement', status: 'rejected' }],
    }));
    expect(r.poolSpendMinor + r.reimbursementsMinor).toBe(0);
  });

  it('agrees with computeCycleTotals on the closing balance', () => {
    const contributions = [paid('user:a', 1234567), paid('user:b', 7654, 10000)];
    const draws = [spend(999999), { amountMinor: 1111, fundingSource: 'pool_reimbursement' as const, status: 'approved' as const }];
    const r = reconcileCycle(base({ openingCredits: { 'user:a': 50 }, contributions, draws }));
    const t = computeCycleTotals({ openingBalanceMinor: 50, contributions, draws });
    expect(r.closingBalanceMinor).toBe(t.balanceMinor);
  });
});

describe('reconcileCycle — invariants (property test)', () => {
  const policies = [
    ['refund_pro_rata', 'collect_pro_rata'],
    ['refund_equal', 'collect_equal'],
    ['carry_forward', 'collect_by_consumption'],
    ['retain', 'custodian_absorbs'],
  ] as const;

  it('Σnet = closing, Σfair share = spend, and settlement balances sum to zero', () => {
    const rand = rng(7);
    for (let i = 0; i < 400; i++) {
      const ids = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, j) => `m${j}`);
      const contributions: ContributionLike[] = ids.map((id) => {
        const expected = Math.floor(rand() * 2_000_000);
        const received = rand() < 0.2 ? 0 : Math.floor(rand() * expected * 1.2);
        return { entityKey: `user:${id}`, kind: 'regular', status: rand() < 0.1 ? 'waived' : 'confirmed', expectedMinor: expected, receivedMinor: received };
      });
      for (const id of ids) {
        if (rand() < 0.4) contributions.push(topUp(`user:${id}`, Math.floor(rand() * 500_000), rand() < 0.5));
      }
      if (rand() < 0.3) contributions.push(topUp('user:outsider', Math.floor(rand() * 300_000), rand() < 0.5));
      const draws: DrawLike[] = Array.from({ length: Math.floor(rand() * 6) }, () => ({
        amountMinor: Math.floor(rand() * 900_000),
        fundingSource: rand() < 0.5 ? 'pool' : 'pool_reimbursement',
        status: 'approved',
        consumption: rand() < 0.5 ? ids.map((id) => ({ key: `user:${id}`, weight: Math.floor(rand() * 5) })) : undefined,
      }));
      const [surplusPolicy, deficitPolicy] = policies[i % policies.length];
      const r = reconcileCycle({
        custodianEntityKey: `user:${ids[0]}`,
        roster: users(...ids),
        openingCredits: rand() < 0.3 ? { [`user:${ids[0]}`]: Math.floor(rand() * 50_000) } : {},
        contributions,
        draws,
        surplusPolicy,
        deficitPolicy,
        forDissolution: rand() < 0.5,
      });
      const sumNet = r.entityShares.reduce((s, e) => s + e.netMinor, 0);
      const sumFair = r.entityShares.reduce((s, e) => s + e.fairShareMinor, 0);
      expect(sumNet).toBe(r.closingBalanceMinor);
      expect(sumFair).toBe(r.poolSpendMinor + r.reimbursementsMinor - r.giftsMinor);
      expect(Object.values(r.settlementBalances).reduce((s, v) => s + v, 0)).toBe(0);
      for (const e of r.entityShares) expect(Number.isInteger(e.netMinor)).toBe(true);
    }
  });
});

// ── membership change ─────────────────────────────────────────────────────

describe('splitForMembershipChange', () => {
  const r = reconcileCycle(base({
    roster: users('a', 'b', 'c'),
    surplusPolicy: 'carry_forward',
    contributions: [paid('user:a', 1000), paid('user:b', 1000), paid('user:c', 1000)],
    draws: [spend(1500)],
  }));

  it('pays out a leaver in credit and carries everyone else', () => {
    const out = splitForMembershipChange(r, ['user:c'], 'user:a');
    expect(out.exitBalances).toEqual({ 'user:c': 500, 'user:a': -500 });
    expect(out.carryCredits).toEqual({ 'user:a': 500, 'user:b': 500 });
    expect(out.carryOpeningBalanceMinor).toBe(1000);
    expect(Object.values(out.carryCredits).reduce((s, v) => s + v, 0)).toBe(out.carryOpeningBalanceMinor);
  });

  it('collects from a leaver who owes', () => {
    const owing = reconcileCycle(base({
      roster: users('a', 'b'),
      surplusPolicy: 'carry_forward',
      contributions: [paid('user:a', 1000), paid('user:b', 0, 1000)],
      draws: [spend(1000)],
    }));
    const out = splitForMembershipChange(owing, ['user:b'], 'user:a');
    expect(out.exitBalances).toEqual({ 'user:b': -500, 'user:a': 500 });
    expect(out.carryOpeningBalanceMinor).toBe(owing.closingBalanceMinor + 500);
  });

  it('produces no exit legs for a leaver who is exactly square', () => {
    const square = reconcileCycle(base({ surplusPolicy: 'carry_forward', contributions: [paid('user:a', 500), paid('user:b', 500)], draws: [spend(1000)] }));
    expect(splitForMembershipChange(square, ['user:b'], 'user:a').exitBalances).toEqual({});
  });

  it('refuses to let the custodian leave', () => {
    expect(() => splitForMembershipChange(r, ['user:a'], 'user:a')).toThrow('custodian');
  });
});

// ── lentTopUps (§10) ──────────────────────────────────────────────────────

describe('lentTopUps', () => {
  it('sums confirmed, non-gift top-ups by anyone but the custodian', () => {
    expect(lentTopUps([
      { kind: 'top_up', receivedMinor: 1000, fromUserId: 'priya' },
      { kind: 'top_up', receivedMinor: 500, fromUserId: 'priya' },
      { kind: 'top_up', receivedMinor: 700, fromUserId: 'ravi', gift: true },
      { kind: 'top_up', receivedMinor: 900, fromUserId: 'anita' },
      { kind: 'top_up', receivedMinor: 0, fromUserId: 'dev' },
      { kind: 'regular', receivedMinor: 5000, fromUserId: 'dev' },
      { kind: 'overdraft_cover', receivedMinor: 300, fromUserId: 'dev' },
    ], 'anita')).toEqual({ totalMinor: 1500, byUser: { priya: 1500 } });
  });
});

// ── Phase 2: hand-overs, held money and early repayments (§9.3, §10.6) ─────

const advance = (toKey: string, amount: number, status: AdvanceLike['status'] = 'confirmed'): AdvanceLike =>
  ({ kind: 'advance', status, fromKey: 'user:anita', toKey, amountMinor: amount });
const giveBack = (fromKey: string, amount: number, status: AdvanceLike['status'] = 'confirmed'): AdvanceLike =>
  ({ kind: 'return', status, fromKey, toKey: 'user:anita', amountMinor: amount });
const heldSpend = (payerKey: string, amount: number, status: HoldingDrawLike['status'] = 'approved'): HoldingDrawLike =>
  ({ payerKey, amountMinor: amount, status, fundingSource: 'pool', paidFrom: 'advance' });

describe('computeCycleTotals — early repayments', () => {
  it('lowers the balance by confirmed early repayments and reports them', () => {
    const t = computeCycleTotals({ openingBalanceMinor: 0, contributions: [paid('user:a', 10000), topUp('user:b', 2000)], draws: [spend(3000)], earlyRepaymentsMinor: 1500 });
    expect(t.earlyRepaymentsMinor).toBe(1500);
    expect(t.balanceMinor).toBe(10000 + 2000 - 3000 - 1500);
  });

  it('defaults to none, and leaves the field out so existing pools report exactly as before', () => {
    const t = computeCycleTotals({ openingBalanceMinor: 0, contributions: [paid('user:a', 10000)], draws: [] });
    expect('earlyRepaymentsMinor' in t).toBe(false);
    expect(t.balanceMinor).toBe(10000);
  });
});

describe('early repayments lower the overdraft baseline and the funded amount (D6)', () => {
  const t = totals({ confirmedRegularMinor: 80000, confirmedTopUpMinor: 20000, expectedRegularMinor: 80000, earlyRepaymentsMinor: 5000, balanceMinor: 0 });

  it('confirmed-funding baseline', () => {
    const o = computeOverdraftState(graduated, 0, t);
    expect(o.baselineMinor).toBe(95000);
    expect(o.floorMinor).toBe(-19000);
  });

  it('expected-funding baseline', () => {
    expect(computeOverdraftState({ ...graduated, overdraftBaseline: 'expected_funding' }, 0, t).baselineMinor).toBe(95000);
  });

  it('target-amount baseline is unchanged', () => {
    expect(computeOverdraftState({ ...graduated, overdraftBaseline: 'target_amount', targetAmountMinor: 120000 }, 0, t).baselineMinor).toBe(120000);
  });

  it('funded amount', () => {
    expect(computeFundingState({ targetAmountMinor: 100000 }, 0, t)).toEqual({ targetMinor: 100000, fundedMinor: 95000, state: 'underfunded' });
  });
});

describe('computeHoldings', () => {
  const hold = (advances: AdvanceLike[], draws: HoldingDrawLike[] = [], balanceMinor = 100000, openingHeld?: Record<string, number>) =>
    computeHoldings({ custodianEntityKey: 'user:anita', balanceMinor, advances, draws, openingHeld });

  it('counts a confirmed advance as held; one waiting for confirmation is pending, not held', () => {
    const h = hold([advance('user:ravi', 20000), advance('user:priya', 5000, 'initiated')]);
    expect(h.heldBy).toEqual({ 'user:ravi': 20000 });
    expect(h.pendingOutMinor).toBe(5000);
    expect(h.withSpendersMinor).toBe(20000);
    expect(h.withCustodianMinor).toBe(80000);
  });

  it('ignores rejected and cancelled advances', () => {
    expect(hold([advance('user:ravi', 20000, 'rejected'), advance('user:ravi', 1000, 'cancelled')]).heldBy).toEqual({});
  });

  it('a confirmed return lowers what they hold; one waiting does not', () => {
    const h = hold([advance('user:ravi', 20000), giveBack('user:ravi', 6000), giveBack('user:ravi', 1000, 'initiated')]);
    expect(h.heldBy).toEqual({ 'user:ravi': 14000 });
  });

  it('only approved spends paid from held money lower it', () => {
    const h = hold([advance('user:ravi', 20000)], [
      heldSpend('user:ravi', 15000),
      heldSpend('user:ravi', 900, 'pending'),
      heldSpend('user:ravi', 800, 'rejected'), // rejected: Ravi still holds it, so he still owes it
      { payerKey: 'user:ravi', amountMinor: 700, status: 'approved', fundingSource: 'pool', paidFrom: 'sponsor_card' },
      { payerKey: 'user:ravi', amountMinor: 600, status: 'approved', fundingSource: 'pool' },
      { payerKey: 'user:ravi', amountMinor: 500, status: 'approved', fundingSource: 'pool_reimbursement' },
    ]);
    expect(h.heldBy).toEqual({ 'user:ravi': 5000 });
  });

  it('spending beyond what they hold means the pool owes them', () => {
    const h = hold([advance('user:ravi', 2000)], [heldSpend('user:ravi', 3500)], 50000);
    expect(h.heldBy).toEqual({ 'user:ravi': -1500 });
    expect(h.withCustodianMinor).toBe(51500);
  });

  it('starts from what was carried in, and drops entries that reach zero', () => {
    const h = hold([giveBack('user:priya', 3000)], [], 100000, { 'user:priya': 3000, 'user:ravi': 1200 });
    expect(h.heldBy).toEqual({ 'user:ravi': 1200 });
  });

  it("never counts the custodian as a holder, and repayments don't move held money", () => {
    const h = hold([
      advance('user:anita', 5000),
      { kind: 'repayment', status: 'confirmed', fromKey: 'user:anita', toKey: 'user:priya', amountMinor: 4000 },
    ], [heldSpend('user:anita', 1000)], 100000, { 'user:anita': 7000 });
    expect(h.heldBy).toEqual({});
    expect(h.withCustodianMinor).toBe(100000);
  });

  it('property: with the custodian + held by spenders = remaining', () => {
    const rand = rng(11);
    for (let i = 0; i < 300; i++) {
      const keys = ['user:anita', 'user:ravi', 'user:priya', 'group:fam'];
      const pick = () => keys[1 + Math.floor(rand() * 3)];
      const statuses: AdvanceLike['status'][] = ['initiated', 'confirmed', 'rejected', 'cancelled'];
      const advances: AdvanceLike[] = Array.from({ length: Math.floor(rand() * 8) }, () => {
        const kind = rand() < 0.5 ? 'advance' as const : rand() < 0.7 ? 'return' as const : 'repayment' as const;
        const who = pick();
        return { kind, status: statuses[Math.floor(rand() * 4)], fromKey: kind === 'return' ? who : 'user:anita', toKey: kind === 'return' ? 'user:anita' : who, amountMinor: Math.floor(rand() * 50_000) };
      });
      const draws: HoldingDrawLike[] = Array.from({ length: Math.floor(rand() * 6) }, () => ({
        payerKey: rand() < 0.2 ? 'user:anita' : pick(),
        amountMinor: Math.floor(rand() * 40_000),
        status: (['pending', 'approved', 'rejected'] as const)[Math.floor(rand() * 3)],
        fundingSource: rand() < 0.8 ? 'pool' : 'pool_reimbursement',
        paidFrom: rand() < 0.6 ? 'advance' : rand() < 0.5 ? 'sponsor_card' : undefined,
      }));
      const balanceMinor = Math.floor(rand() * 400_000) - 100_000;
      const h = computeHoldings({ custodianEntityKey: 'user:anita', balanceMinor, advances, draws, openingHeld: rand() < 0.3 ? { 'user:ravi': Math.floor(rand() * 9000) } : undefined });
      const sumHeld = Object.values(h.heldBy).reduce((s, v) => s + v, 0);
      expect(h.withCustodianMinor + sumHeld).toBe(balanceMinor);
      expect(h.withSpendersMinor).toBe(sumHeld);
      expect(Object.keys(h.heldBy)).not.toContain('user:anita');
      expect(Object.values(h.heldBy)).not.toContain(0);
    }
  });
});

describe('outstandingLoans (D5)', () => {
  const contributions = [
    { kind: 'top_up' as const, receivedMinor: 10000, fromUserId: 'priya' },
    { kind: 'top_up' as const, receivedMinor: 3000, fromUserId: 'dev' },
    { kind: 'top_up' as const, receivedMinor: 5000, fromUserId: 'ravi', gift: true },
    { kind: 'top_up' as const, receivedMinor: 9000, fromUserId: 'anita' },
  ];

  it('is what each lender lent, less early repayments confirmed or waiting', () => {
    expect(outstandingLoans(contributions, [
      { kind: 'repayment', status: 'confirmed', toUserId: 'priya', amountMinor: 4000 },
      { kind: 'repayment', status: 'initiated', toUserId: 'priya', amountMinor: 1000 },
      { kind: 'repayment', status: 'rejected', toUserId: 'priya', amountMinor: 2500 },
      { kind: 'repayment', status: 'cancelled', toUserId: 'dev', amountMinor: 3000 },
      { kind: 'advance', status: 'confirmed', toUserId: 'priya', amountMinor: 999 },
    ], 'anita')).toEqual({ totalMinor: 8000, byUser: { priya: 5000, dev: 3000 } });
  });

  it('drops lenders who are fully paid back, and never includes gifts or the custodian', () => {
    expect(outstandingLoans(contributions, [{ kind: 'repayment', status: 'confirmed', toUserId: 'dev', amountMinor: 3000 }], 'anita'))
      .toEqual({ totalMinor: 10000, byUser: { priya: 10000 } });
  });
});

describe('earlyRepaymentImpact (§10.6)', () => {
  // ₹80,000 budget + ₹20,000 lent by Priya = ₹1,00,000 baseline; ₹1,00,000 spent.
  const t = totals({ confirmedRegularMinor: 8000000, confirmedTopUpMinor: 2000000, poolSpendMinor: 10000000, balanceMinor: 0 });

  it('no warning when spending stays open', () => {
    expect(earlyRepaymentImpact(graduated, 0, totals({ ...t, balanceMinor: 1500000, poolSpendMinor: 8500000 }), null, 1000000))
      .toEqual({ alreadyPaused: false, pauses: false, addToResumeMinor: 0 });
  });

  it('warns that it would pause spending, using the smaller baseline after the repayment', () => {
    // ₹17,000 back: balance −₹17,000; baseline ₹83,000 → floor −₹16,600, so spending pauses.
    // (On the old ₹1,00,000 baseline the floor would be −₹20,000 and it wouldn't.)
    expect(earlyRepaymentImpact(graduated, 0, t, null, 1700000)).toEqual({ alreadyPaused: false, pauses: true, addToResumeMinor: 1700001 });
  });

  it('warns when spending is already paused, with what it would take to resume afterwards', () => {
    const paused = totals({ ...t, poolSpendMinor: 12000000, balanceMinor: -2000000 });
    expect(earlyRepaymentImpact(graduated, 0, paused, '2026-11-01T00:00:00Z', 500000)).toEqual({ alreadyPaused: true, pauses: false, addToResumeMinor: 2500001 });
  });

  it('says nothing for pools without the graduated overdraft', () => {
    expect(earlyRepaymentImpact({ ...graduated, overdraftPolicy: 'block' }, 0, t, null, 1700000)).toEqual({ alreadyPaused: false, pauses: false, addToResumeMinor: 0 });
  });
});

describe('reconcileCycle — early repayments (§10.6)', () => {
  const anita = (extra: Partial<ReconcileInput>) => reconcileCycle(base({
    custodianEntityKey: 'user:anita',
    roster: users('anita'),
    surplusPolicy: 'retain',
    deficitPolicy: 'custodian_absorbs',
    contributions: [paid('user:anita', 10000000), topUp('user:priya', 1000000)],
    draws: [spend(10000000)],
    forDissolution: true,
    ...extra,
  }));

  it('pays a lender only what is left of the loan at close', () => {
    const r = anita({ repayments: [{ entityKey: 'user:priya', amountMinor: 400000 }] });
    expect(r.earlyRepaymentsMinor).toBe(400000);
    expect(r.closingBalanceMinor).toBe(600000);
    expect(net(r, 'user:priya')).toBe(600000);
    expect(r.entityShares.find((e) => e.entityId === 'priya')!.repaidMinor).toBe(400000);
    expect(r.settlementBalances).toEqual({ 'user:priya': 600000, 'user:anita': -600000 });
  });

  it('owes the lender nothing once the loan is fully paid back', () => {
    const r = anita({ repayments: [{ entityKey: 'user:priya', amountMinor: 1000000 }] });
    expect(r.settlementBalances).toEqual({});
  });

  it('agrees with computeCycleTotals on the closing balance', () => {
    const contributions = [paid('user:anita', 10000000), topUp('user:priya', 1000000)];
    const r = anita({ repayments: [{ entityKey: 'user:priya', amountMinor: 250000 }] });
    expect(r.closingBalanceMinor).toBe(computeCycleTotals({ openingBalanceMinor: 0, contributions, draws: [spend(10000000)], earlyRepaymentsMinor: 250000 }).balanceMinor);
  });
});

describe('reconcileCycle — money spenders hold (§9.3)', () => {
  const budget = (extra: Partial<ReconcileInput>) => reconcileCycle(base({
    custodianEntityKey: 'user:anita',
    roster: users('anita'),
    surplusPolicy: 'retain',
    deficitPolicy: 'custodian_absorbs',
    contributions: [paid('user:anita', 10000000)],
    draws: [spend(1500000)],
    forDissolution: true,
    ...extra,
  }));

  it('worked example: an advance of ₹20,000 with ₹15,000 spent → Ravi hands back ₹5,000', () => {
    const r = budget({ held: { 'user:ravi': 500000 } });
    expect(r.heldBy).toEqual({ 'user:ravi': 500000 });
    expect(r.settlementBalances).toEqual({ 'user:ravi': -500000, 'user:anita': 500000 });
  });

  it('pays a spender who spent more than they held', () => {
    const r = budget({ held: { 'user:ravi': -300000 } });
    expect(r.settlementBalances).toEqual({ 'user:ravi': 300000, 'user:anita': -300000 });
  });

  it('§10.3: a lender who also holds money is paid lent − held', () => {
    const r = budget({ contributions: [paid('user:anita', 10000000), topUp('user:priya', 1000000)], held: { 'user:priya': 400000 } });
    expect(r.settlementBalances).toEqual({ 'user:priya': 600000, 'user:anita': -600000 });
  });

  it("doesn't change net positions or the closing balance; ignores the custodian's own entry", () => {
    const without = budget({});
    const withHeld = budget({ held: { 'user:ravi': 500000, 'user:anita': 777 } });
    expect(withHeld.closingBalanceMinor).toBe(without.closingBalanceMinor);
    expect(withHeld.entityShares.map((e) => e.netMinor)).toEqual(without.entityShares.map((e) => e.netMinor));
    expect(withHeld.heldBy).toEqual({ 'user:ravi': 500000 });
  });

  it('records what members of a kitty hold on their share', () => {
    const r = reconcileCycle(base({ contributions: [paid('user:a', 1000), paid('user:b', 1000)], draws: [spend(1000)], held: { 'user:b': 300 } }));
    expect(r.entityShares.find((e) => e.entityId === 'b')!.heldMinor).toBe(300);
    // b's ₹500 refund is reduced by the ₹300 b already has in hand.
    expect(r.settlementBalances).toEqual({ 'user:a': -200, 'user:b': 200 });
  });

  it('carries instead of settling for a carry-forward pool, still reporting what is held', () => {
    const r = reconcileCycle(base({ surplusPolicy: 'carry_forward', contributions: [paid('user:a', 1000), paid('user:b', 1000)], draws: [spend(1500)], held: { 'user:b': 300 } }));
    expect(r.settlementBalances).toEqual({});
    expect(r.heldBy).toEqual({ 'user:b': 300 });
  });

  it('property: with repayments and held money, Σnet = closing and settlement balances sum to zero', () => {
    const rand = rng(23);
    const policies = [['refund_pro_rata', 'collect_pro_rata'], ['refund_equal', 'collect_equal'], ['carry_forward', 'collect_by_consumption'], ['retain', 'custodian_absorbs']] as const;
    for (let i = 0; i < 300; i++) {
      const ids = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, j) => `m${j}`);
      const contributions: ContributionLike[] = ids.map((id) => paid(`user:${id}`, Math.floor(rand() * 1_000_000)));
      const repayments: Array<{ entityKey: string; amountMinor: number }> = [];
      for (const id of ids.slice(1)) {
        if (rand() < 0.5) {
          const lent = Math.floor(rand() * 400_000);
          contributions.push(topUp(`user:${id}`, lent));
          if (rand() < 0.6) repayments.push({ entityKey: `user:${id}`, amountMinor: Math.floor(rand() * lent) });
        }
      }
      const held: Record<string, number> = {};
      for (const id of ids.slice(1)) if (rand() < 0.5) held[`user:${id}`] = Math.floor(rand() * 300_000) - 100_000;
      if (rand() < 0.3) held['user:outsider'] = Math.floor(rand() * 50_000);
      const draws: DrawLike[] = Array.from({ length: Math.floor(rand() * 5) }, () => ({ amountMinor: Math.floor(rand() * 700_000), fundingSource: 'pool', status: 'approved' }));
      const [surplusPolicy, deficitPolicy] = policies[i % policies.length];
      const r = reconcileCycle({
        custodianEntityKey: `user:${ids[0]}`,
        roster: users(...ids),
        openingCredits: {},
        contributions,
        draws,
        surplusPolicy,
        deficitPolicy,
        repayments,
        held,
        forDissolution: rand() < 0.6,
      });
      expect(r.entityShares.reduce((s, e) => s + e.netMinor, 0)).toBe(r.closingBalanceMinor);
      expect(Object.values(r.settlementBalances).reduce((s, v) => s + v, 0)).toBe(0);
      expect(r.earlyRepaymentsMinor).toBe(repayments.reduce((s, x) => s + x.amountMinor, 0));
      const t = computeCycleTotals({ openingBalanceMinor: 0, contributions, draws, earlyRepaymentsMinor: r.earlyRepaymentsMinor });
      expect(r.closingBalanceMinor - r.overdraftCoverMinor).toBe(t.balanceMinor);
    }
  });
});

describe('splitForMembershipChange — held money (§9.3)', () => {
  const fund = (held: Record<string, number>) => reconcileCycle(base({
    roster: users('a', 'b', 'c'),
    surplusPolicy: 'carry_forward',
    contributions: [paid('user:a', 1000), paid('user:b', 1000), paid('user:c', 1000)],
    draws: [spend(1500)],
    held,
  }));

  it('a leaver hands back what they hold as part of their exit; everyone else carries theirs', () => {
    const out = splitForMembershipChange(fund({ 'user:b': 100, 'user:c': 200 }), ['user:c'], 'user:a');
    expect(out.exitBalances).toEqual({ 'user:c': 300, 'user:a': -300 });
    expect(out.carryHeld).toEqual({ 'user:b': 100 });
    expect(out.carryOpeningBalanceMinor).toBe(1000);
  });

  it('a leaver who spent beyond what they held is paid the difference', () => {
    const out = splitForMembershipChange(fund({ 'user:c': -200 }), ['user:c'], 'user:a');
    expect(out.exitBalances).toEqual({ 'user:c': 700, 'user:a': -700 });
  });

  it('a leaver who is square but holds money only hands it back', () => {
    const square = reconcileCycle(base({ surplusPolicy: 'carry_forward', contributions: [paid('user:a', 500), paid('user:b', 500)], draws: [spend(1000)], held: { 'user:b': 250 } }));
    const out = splitForMembershipChange(square, ['user:b'], 'user:a');
    expect(out.exitBalances).toEqual({ 'user:b': -250, 'user:a': 250 });
    expect(out.carryHeld).toEqual({});
  });
});
