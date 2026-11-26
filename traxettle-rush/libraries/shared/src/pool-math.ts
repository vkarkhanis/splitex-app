/**
 * Money pooling — pure ledger maths.
 *
 * No I/O. Shared by the API (authoritative) and the clients (rendering the
 * balance meter), so both always agree. Every amount is integer minor units.
 */
import type {
  ExpenseFundingSource,
  PoolAdvanceKind,
  PoolAdvanceStatus,
  PoolArrear,
  PoolConfig,
  PoolContributionKind,
  PoolContributionStatus,
  PoolCycleTotals,
  PoolDeficitPolicy,
  PoolDrawStatus,
  PoolEntityRef,
  PoolEntityShare,
  PoolFundingState,
  PoolHoldings,
  PoolOverdraftState,
  PoolPaidFrom,
  PoolRefusalCode,
  PoolShareBasis,
  PoolSurplusPolicy,
} from './pool';
import { parseEntityKey } from './pool';

// ── Allocation ────────────────────────────────────────────────────────────

export interface AllocationWeight {
  key: string;
  weight: number;
}

/**
 * Split an integer `total` across weights so the parts sum to `total` EXACTLY,
 * using the largest-remainder method. Negative totals split symmetrically.
 * If every weight is zero the total is split equally. Ties go to the
 * lexically-first key, so results are deterministic.
 */
export function allocateMinor(total: number, weights: AllocationWeight[]): Record<string, number> {
  if (!Number.isInteger(total)) throw new Error(`allocateMinor: total must be an integer, got ${total}`);
  const result: Record<string, number> = {};
  if (weights.length === 0) {
    if (total !== 0) throw new Error('allocateMinor: cannot allocate a non-zero total across no entities');
    return result;
  }

  const merged = new Map<string, number>();
  for (const w of weights) {
    const weight = Number.isFinite(w.weight) && w.weight > 0 ? w.weight : 0;
    merged.set(w.key, (merged.get(w.key) || 0) + weight);
  }
  const keys = [...merged.keys()].sort();
  const raw = keys.map((k) => merged.get(k)!);
  // Scale fractional weights to integers so the arithmetic below is exact.
  const scale = raw.every(Number.isInteger) ? 1 : 1e6;
  let ints = raw.map((w) => BigInt(Math.round(w * scale)));
  if (ints.every((w) => w === BigInt(0))) ints = ints.map(() => BigInt(1));

  const zero = BigInt(0);
  const sumW = ints.reduce((a, b) => a + b, zero);
  const abs = BigInt(Math.abs(total));
  const base = ints.map((w) => (abs * w) / sumW);
  const rems = ints.map((w) => (abs * w) % sumW);
  const leftover = Number(abs - base.reduce((a, b) => a + b, zero));

  const order = keys
    .map((_, i) => i)
    .sort((a, b) => (rems[b] > rems[a] ? 1 : rems[b] < rems[a] ? -1 : a - b));
  for (let n = 0; n < leftover; n++) base[order[n]] += BigInt(1);

  const sign = total < 0 ? -1 : 1;
  keys.forEach((k, i) => {
    const value = Number(base[i]) * sign;
    result[k] = value === 0 ? 0 : value;
  });
  return result;
}

// ── Ledger inputs ─────────────────────────────────────────────────────────

export interface ContributionLike {
  entityKey: string;
  kind: PoolContributionKind;
  status: PoolContributionStatus;
  expectedMinor: number;
  receivedMinor: number;
  /** top_up only: a gift (consumed) rather than a loan (paid back). */
  gift?: boolean;
}

export interface DrawLike {
  amountMinor: number;
  fundingSource: Exclude<ExpenseFundingSource, 'self'>;
  status: PoolDrawStatus;
  /** Consumption weights (entity key → weight) for consumption-based sharing. */
  consumption?: AllocationWeight[];
}

export function computeCycleTotals(input: {
  openingBalanceMinor: number;
  contributions: ContributionLike[];
  draws: DrawLike[];
  /** Confirmed early repayments to lenders (§10.6). They lower the balance; they aren't spending. */
  earlyRepaymentsMinor?: number;
}): PoolCycleTotals {
  let expectedRegularMinor = 0;
  let confirmedRegularMinor = 0;
  let confirmedTopUpMinor = 0;
  let overdraftCoverMinor = 0;
  for (const c of input.contributions) {
    if (c.kind === 'regular') {
      if (c.status !== 'waived') expectedRegularMinor += c.expectedMinor;
      confirmedRegularMinor += c.receivedMinor;
    } else if (c.kind === 'top_up') {
      confirmedTopUpMinor += c.receivedMinor;
    } else {
      overdraftCoverMinor += c.receivedMinor;
    }
  }

  let poolSpendMinor = 0;
  let reimbursementsMinor = 0;
  let pendingDrawsMinor = 0;
  for (const d of input.draws) {
    if (d.status === 'approved') {
      if (d.fundingSource === 'pool') poolSpendMinor += d.amountMinor;
      else reimbursementsMinor += d.amountMinor;
    } else if (d.status === 'pending') {
      pendingDrawsMinor += d.amountMinor;
    }
  }

  const earlyRepaymentsMinor = Math.max(0, input.earlyRepaymentsMinor || 0);
  const balanceMinor =
    input.openingBalanceMinor + confirmedRegularMinor + confirmedTopUpMinor + overdraftCoverMinor
    - poolSpendMinor - reimbursementsMinor - earlyRepaymentsMinor;

  return {
    expectedRegularMinor,
    confirmedRegularMinor,
    confirmedTopUpMinor,
    overdraftCoverMinor,
    poolSpendMinor,
    reimbursementsMinor,
    pendingDrawsMinor,
    // Only present when there were early repayments, so existing pools report exactly as before.
    ...(earlyRepaymentsMinor > 0 ? { earlyRepaymentsMinor } : {}),
    balanceMinor,
  };
}

/** Outstanding regular contributions per entity (expected − received, non-waived). */
export function computeArrears(contributions: Array<ContributionLike & { entityKey: string }>): PoolArrear[] {
  const byEntity = new Map<string, number>();
  for (const c of contributions) {
    if (c.kind !== 'regular' || c.status === 'waived') continue;
    const outstanding = c.expectedMinor - c.receivedMinor;
    if (outstanding > 0) byEntity.set(c.entityKey, (byEntity.get(c.entityKey) || 0) + outstanding);
  }
  return [...byEntity.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, outstandingMinor]) => ({ ...parseEntityKey(key), outstandingMinor }));
}

/**
 * Confirmed top-ups lent (not given) by anyone but the custodian, by payer: what a sponsor
 * ("Just me") pool's custodian pays back at close. Design doc §10.
 */
export function lentTopUps(
  contributions: Array<{ kind: PoolContributionKind; gift?: boolean; receivedMinor: number; fromUserId: string }>,
  custodianUserId: string,
): { totalMinor: number; byUser: Record<string, number> } {
  const byUser: Record<string, number> = {};
  let totalMinor = 0;
  for (const c of contributions) {
    if (c.kind !== 'top_up' || c.gift || c.fromUserId === custodianUserId || !(c.receivedMinor > 0)) continue;
    byUser[c.fromUserId] = (byUser[c.fromUserId] || 0) + c.receivedMinor;
    totalMinor += c.receivedMinor;
  }
  return { totalMinor, byUser };
}

/** A hand-over (§9.3, §10.6), keyed by the entities on each side. */
export interface AdvanceLike {
  kind: PoolAdvanceKind;
  status: PoolAdvanceStatus;
  fromKey: string;
  toKey: string;
  amountMinor: number;
}

/** A pool-funded expense, with who paid it, for working out what spenders hold. */
export interface HoldingDrawLike {
  payerKey: string;
  amountMinor: number;
  status: PoolDrawStatus;
  fundingSource: Exclude<ExpenseFundingSource, 'self'>;
  paidFrom?: PoolPaidFrom;
}

/**
 * Who holds the pool's remaining money (design doc §9.3). For everyone but the custodian:
 *
 *   held = openingHeld + confirmed advances in − confirmed returns out − approved spends paid from held money
 *
 * A rejected spend doesn't lower `held`, so the spender still owes it. Spending more than they
 * hold takes `held` below zero: the pool owes them the difference, like a claim. Early repayments
 * leave the pool from the custodian, so they don't change anyone's `held`.
 * The custodian holds the rest: `withCustodian = balance − Σ held`.
 */
export function computeHoldings(input: {
  custodianEntityKey: string;
  balanceMinor: number;
  openingHeld?: Record<string, number>;
  advances: AdvanceLike[];
  draws: HoldingDrawLike[];
}): PoolHoldings {
  const custodian = input.custodianEntityKey;
  const held: Record<string, number> = {};
  const add = (key: string, amount: number) => {
    if (key === custodian || amount === 0) return;
    held[key] = (held[key] || 0) + amount;
  };
  for (const [key, amount] of Object.entries(input.openingHeld || {})) add(key, amount);
  let pendingOutMinor = 0;
  for (const a of input.advances) {
    if (a.kind === 'advance') {
      if (a.status === 'confirmed') add(a.toKey, a.amountMinor);
      else if (a.status === 'initiated') pendingOutMinor += a.amountMinor;
    } else if (a.kind === 'return' && a.status === 'confirmed') {
      add(a.fromKey, -a.amountMinor);
    }
  }
  for (const d of input.draws) {
    if (d.status === 'approved' && d.fundingSource === 'pool' && d.paidFrom === 'advance') add(d.payerKey, -d.amountMinor);
  }
  const heldBy: Record<string, number> = {};
  let withSpendersMinor = 0;
  for (const key of Object.keys(held).sort()) {
    if (held[key] === 0) continue;
    heldBy[key] = held[key];
    withSpendersMinor += held[key];
  }
  return {
    withCustodianMinor: input.balanceMinor - withSpendersMinor,
    withSpendersMinor,
    heldBy,
    pendingOutMinor,
  };
}

/**
 * What each lender can still be paid back early (design doc §10.6, decision D5): their confirmed
 * top-ups that aren't gifts, less early repayments already confirmed or waiting for confirmation.
 */
export function outstandingLoans(
  contributions: Array<{ kind: PoolContributionKind; gift?: boolean; receivedMinor: number; fromUserId: string }>,
  advances: Array<{ kind: PoolAdvanceKind; status: PoolAdvanceStatus; toUserId: string; amountMinor: number }>,
  custodianUserId: string,
): { totalMinor: number; byUser: Record<string, number> } {
  const lent = lentTopUps(contributions, custodianUserId).byUser;
  for (const a of advances) {
    if (a.kind !== 'repayment' || (a.status !== 'confirmed' && a.status !== 'initiated')) continue;
    if (lent[a.toUserId] !== undefined) lent[a.toUserId] -= a.amountMinor;
  }
  const byUser: Record<string, number> = {};
  let totalMinor = 0;
  for (const [userId, amount] of Object.entries(lent)) {
    if (amount <= 0) continue;
    byUser[userId] = amount;
    totalMinor += amount;
  }
  return { totalMinor, byUser };
}

export function computeFundingState(
  config: Pick<PoolConfig, 'targetAmountMinor'>,
  openingBalanceMinor: number,
  totals: PoolCycleTotals,
): PoolFundingState {
  // Money paid back early to lenders no longer funds the pool (§10.6).
  const fundedMinor = openingBalanceMinor + totals.confirmedRegularMinor + totals.confirmedTopUpMinor - (totals.earlyRepaymentsMinor || 0);
  const targetMinor =
    typeof config.targetAmountMinor === 'number' && config.targetAmountMinor > 0
      ? config.targetAmountMinor
      : totals.expectedRegularMinor > 0
        ? totals.expectedRegularMinor
        : null;
  if (targetMinor === null) return { targetMinor: null, fundedMinor, state: 'open_ended' };
  return { targetMinor, fundedMinor, state: fundedMinor >= targetMinor ? 'funded' : 'underfunded' };
}

// ── Overdraft ─────────────────────────────────────────────────────────────

export function computeOverdraftState(
  config: Pick<
    PoolConfig,
    'overdraftPolicy' | 'overdraftTolerancePercent' | 'overdraftBaseline' | 'overdraftClearancePercent' | 'targetAmountMinor'
  >,
  openingBalanceMinor: number,
  totals: PoolCycleTotals,
  latchedAt?: string | null,
): PoolOverdraftState {
  const policy = config.overdraftPolicy;
  const baselineKind = config.overdraftBaseline ?? 'confirmed_funding';
  // Money paid back early to lenders no longer funds the pool, so the tolerance shrinks with it (§10.6).
  const repaid = totals.earlyRepaymentsMinor || 0;
  const confirmedFunding = openingBalanceMinor + totals.confirmedRegularMinor + totals.confirmedTopUpMinor - repaid;

  let baselineMinor: number;
  if (baselineKind === 'expected_funding') {
    baselineMinor = openingBalanceMinor + totals.expectedRegularMinor + totals.confirmedTopUpMinor - repaid;
  } else if (baselineKind === 'target_amount' && typeof config.targetAmountMinor === 'number' && config.targetAmountMinor > 0) {
    baselineMinor = config.targetAmountMinor;
  } else {
    baselineMinor = confirmedFunding;
  }
  baselineMinor = Math.max(0, baselineMinor);

  const tolerancePercent =
    policy === 'graduated' ? Math.max(0, config.overdraftTolerancePercent ?? 20) : 0;
  // Floor the tolerance so a fractional minor unit of extra headroom is never granted.
  const toleranceMinor = policy === 'graduated' ? Math.floor((baselineMinor * tolerancePercent) / 100) : 0;
  const floorMinor = policy === 'allow' ? Number.NEGATIVE_INFINITY : toleranceMinor === 0 ? 0 : -toleranceMinor;
  const clearanceThresholdMinor =
    policy === 'graduated' ? Math.floor((baselineMinor * Math.max(0, config.overdraftClearancePercent ?? 0)) / 100) : 0;

  const balanceMinor = totals.balanceMinor;
  // Reaching the floor latches by definition; the persisted flag only matters
  // during recovery (floor < balance ≤ clearance threshold).
  const latched =
    policy === 'graduated' &&
    (balanceMinor <= floorMinor || (Boolean(latchedAt) && balanceMinor <= clearanceThresholdMinor));

  let zone: PoolOverdraftState['zone'];
  if (policy === 'allow') zone = balanceMinor > 0 ? 'healthy' : 'overdrawn';
  else if (latched || balanceMinor <= floorMinor) zone = 'blocked';
  else zone = balanceMinor > 0 ? 'healthy' : 'overdrawn';

  const headroomMinor =
    policy === 'allow'
      ? Number.MAX_SAFE_INTEGER
      : latched
        ? 0
        : Math.max(0, balanceMinor - floorMinor);

  return {
    policy,
    baselineMinor,
    tolerancePercent,
    toleranceMinor,
    floorMinor: Number.isFinite(floorMinor) ? floorMinor : -Number.MAX_SAFE_INTEGER,
    balanceMinor,
    headroomMinor,
    zone,
    latched,
    clearanceThresholdMinor,
  };
}

/**
 * Should the cycle's overdraft latch change after the balance moved?
 * Latches when the balance reaches the floor; releases once it rises above the
 * clearance threshold — "paused until the overdraft is repaid plus more".
 */
export function nextOverdraftLatch(
  state: PoolOverdraftState,
  currentlyLatched: boolean,
): 'latch' | 'release' | 'unchanged' {
  if (state.policy !== 'graduated') return currentlyLatched ? 'release' : 'unchanged';
  if (!currentlyLatched && state.balanceMinor <= state.floorMinor) return 'latch';
  if (currentlyLatched && state.balanceMinor > state.clearanceThresholdMinor) return 'release';
  return 'unchanged';
}

/**
 * What paying a lender back early does to pool spending (design doc §10.6). It's allowed even when
 * spending is paused, or would pause; the custodian is warned with how much they'd need to add.
 * The repayment lowers both the balance and the overdraft baseline (decision D6).
 */
export function earlyRepaymentImpact(
  config: Pick<
    PoolConfig,
    'overdraftPolicy' | 'overdraftTolerancePercent' | 'overdraftBaseline' | 'overdraftClearancePercent' | 'targetAmountMinor'
  >,
  openingBalanceMinor: number,
  totals: PoolCycleTotals,
  latchedAt: string | null | undefined,
  amountMinor: number,
): { alreadyPaused: boolean; pauses: boolean; addToResumeMinor: number } {
  if (config.overdraftPolicy !== 'graduated') return { alreadyPaused: false, pauses: false, addToResumeMinor: 0 };
  const before = computeOverdraftState(config, openingBalanceMinor, totals, latchedAt);
  const after = computeOverdraftState(config, openingBalanceMinor, {
    ...totals,
    earlyRepaymentsMinor: (totals.earlyRepaymentsMinor || 0) + amountMinor,
    balanceMinor: totals.balanceMinor - amountMinor,
  }, before.latched ? (latchedAt || 'latched') : null);
  const alreadyPaused = before.latched;
  const pausedAfter = after.latched;
  return {
    alreadyPaused,
    pauses: !alreadyPaused && pausedAfter,
    // Same rule as a refused draw: the balance must rise above the clearance threshold to resume.
    addToResumeMinor: pausedAfter ? Math.max(0, after.clearanceThresholdMinor - after.balanceMinor + 1) : 0,
  };
}

export interface DrawDecision {
  allowed: boolean;
  /** The draw is allowed but takes (or keeps) the balance below zero. */
  warn: boolean;
  /** Recorded after the fact despite breaching a limit — notify the custodian. */
  flag?: 'exceeds_tolerance' | 'underfunded';
  code?: PoolRefusalCode;
  projectedMinor: number;
  shortfallMinor: number;
  clearanceRequiredMinor: number;
}

/**
 * Pre-flight check for a pool draw.
 *
 * Pre-authorised draws ("about to spend from the pool") are refused past the
 * limit. Money that has ALREADY left someone's account is always recorded and
 * flagged instead — an accurate ledger beats an enforced one.
 */
export function evaluateDraw(
  state: PoolOverdraftState,
  amountMinor: number,
  opts: { alreadyIncurred: boolean; funding?: PoolFundingState; requireFullFunding?: boolean },
): DrawDecision {
  const projectedMinor = state.balanceMinor - amountMinor;
  const clearanceRequiredMinor = state.latched ? Math.max(0, state.clearanceThresholdMinor - state.balanceMinor) : 0;
  const base = { projectedMinor, shortfallMinor: 0, clearanceRequiredMinor };

  if (opts.requireFullFunding && opts.funding?.state === 'underfunded') {
    const shortfallMinor = Math.max(0, (opts.funding.targetMinor ?? 0) - opts.funding.fundedMinor);
    if (opts.alreadyIncurred) return { ...base, allowed: true, warn: projectedMinor < 0, flag: 'underfunded', shortfallMinor };
    return { ...base, allowed: false, warn: false, code: 'POOL_UNDERFUNDED', shortfallMinor };
  }

  if (state.policy === 'allow') return { ...base, allowed: true, warn: projectedMinor < 0 };

  if (state.policy === 'block') {
    if (projectedMinor >= 0) return { ...base, allowed: true, warn: false };
    const shortfallMinor = -projectedMinor;
    if (opts.alreadyIncurred) return { ...base, allowed: true, warn: true, flag: 'exceeds_tolerance', shortfallMinor };
    return { ...base, allowed: false, warn: false, code: 'POOL_INSUFFICIENT_FUNDS', shortfallMinor };
  }

  // graduated
  const breachesFloor = projectedMinor < state.floorMinor;
  if (!state.latched && !breachesFloor) return { ...base, allowed: true, warn: projectedMinor < 0 };

  const toUnlatch = state.latched ? state.clearanceThresholdMinor - state.balanceMinor + 1 : 0;
  const toClearFloor = state.floorMinor - projectedMinor;
  const shortfallMinor = Math.max(0, toUnlatch, toClearFloor);
  if (opts.alreadyIncurred) return { ...base, allowed: true, warn: true, flag: 'exceeds_tolerance', shortfallMinor };
  return { ...base, allowed: false, warn: false, code: 'POOL_OVERDRAFT_BLOCKED', shortfallMinor };
}

// ── Reconciliation ────────────────────────────────────────────────────────

export interface ReconcileInput {
  custodianEntityKey: string;
  roster: PoolEntityRef[];
  openingCredits: Record<string, number>;
  contributions: ContributionLike[];
  draws: DrawLike[];
  surplusPolicy: PoolSurplusPolicy;
  deficitPolicy: PoolDeficitPolicy;
  /** Final close of the pool: always settle, never carry forward. */
  forDissolution?: boolean;
  /** Cover not yet recorded as contributions (used to preview a close). */
  extraCover?: Array<{ entityKey: string; amountMinor: number }>;
  /** Confirmed early repayments to lenders, by lender entity (§10.6). */
  repayments?: Array<{ entityKey: string; amountMinor: number }>;
  /**
   * Pool money each spender still holds (entity key → minor, from computeHoldings; §9.3). It is part
   * of the closing balance, so a settling close collects it from them rather than from the custodian.
   */
  held?: Record<string, number>;
}

export interface ReconcileResult {
  openingBalanceMinor: number;
  confirmedContributionsMinor: number;
  overdraftCoverMinor: number;
  /** Top-ups given as gifts: they pay for spending and are never paid back. */
  giftsMinor: number;
  /** Top-ups already paid back early (§10.6). */
  earlyRepaymentsMinor: number;
  poolSpendMinor: number;
  reimbursementsMinor: number;
  preCoverBalanceMinor: number;
  closingBalanceMinor: number;
  /** Deficit nobody has been recorded as covering yet. Must be 0 to close. */
  uncoveredDeficitMinor: number;
  outcome: 'surplus' | 'deficit' | 'balanced';
  shareBasis: PoolShareBasis;
  disposition: 'carry_forward' | 'settle';
  entityShares: PoolEntityShare[];
  /**
   * Settlement balances (entity key → minor; > 0 owed, < 0 owes) including the
   * custodian paying out the cash they hold, and spenders handing back what they hold.
   * Sums to zero. Empty when carrying.
   */
  settlementBalances: Record<string, number>;
  /** Pool money each spender held at close (non-zero entries of `held`, custodian excluded). */
  heldBy: Record<string, number>;
}

function basisFor(policy: PoolSurplusPolicy | PoolDeficitPolicy): PoolShareBasis {
  switch (policy) {
    case 'refund_equal':
    case 'collect_equal':
      return 'equal';
    case 'collect_by_consumption':
      return 'consumption';
    case 'retain':
    case 'custodian_absorbs':
      return 'custodian';
    default:
      return 'commitment';
  }
}

/**
 * Reconcile a cycle. Each entity's fair share of the cycle's spending is set by
 * the active policy; its net position is what it put in minus that share:
 *
 *   spendToShare = approved spend − gifts
 *   net = openingCredit + contributed − gifted − repaid + cover − fairShare
 *
 * Fair shares are weighted by AGREED commitment, not by what was actually paid,
 * so a member who paid nothing still bears their share and correctly ends up
 * owing. A top-up is a loan, paid back through `net` (in a sponsor pool, by the
 * custodian), unless it was given as a gift, which pays for spending instead.
 * A top-up paid back early (`repaid`) has already left the pool. Σ net always equals the
 * closing balance. When the cycle settles, whatever spenders still hold is collected from
 * them instead of the custodian (§9.3).
 */
export function reconcileCycle(input: ReconcileInput): ReconcileResult {
  const rosterKeys = input.roster.map((r) => `${r.entityType}:${r.entityId}`);
  const keySet = new Set<string>(rosterKeys);
  for (const c of input.contributions) keySet.add(c.entityKey);
  for (const k of Object.keys(input.openingCredits)) keySet.add(k);
  for (const c of input.extraCover || []) keySet.add(c.entityKey);
  for (const r of input.repayments || []) keySet.add(r.entityKey);
  // Anyone who consumed shares spending, even without contributing (they then owe).
  for (const d of input.draws) for (const w of d.consumption || []) keySet.add(w.key);
  keySet.add(input.custodianEntityKey);
  const keys = [...keySet].sort();

  const opening: Record<string, number> = {};
  const contributed: Record<string, number> = {};
  const regular: Record<string, number> = {};
  const gifted: Record<string, number> = {};
  const repaid: Record<string, number> = {};
  const cover: Record<string, number> = {};
  const commitment: Record<string, number> = {};
  const fullyWaived: Record<string, boolean> = {};
  for (const k of keys) {
    opening[k] = input.openingCredits[k] || 0;
    contributed[k] = 0;
    regular[k] = 0;
    gifted[k] = 0;
    repaid[k] = 0;
    cover[k] = 0;
    commitment[k] = 0;
  }
  const regularSeen: Record<string, { total: number; waived: number }> = {};
  for (const c of input.contributions) {
    if (c.kind === 'overdraft_cover') {
      cover[c.entityKey] += c.receivedMinor;
      continue;
    }
    contributed[c.entityKey] += c.receivedMinor;
    if (c.kind === 'top_up' && c.gift) gifted[c.entityKey] += c.receivedMinor;
    if (c.kind === 'regular') {
      regular[c.entityKey] += c.receivedMinor;
      const seen = (regularSeen[c.entityKey] ||= { total: 0, waived: 0 });
      seen.total += 1;
      if (c.status === 'waived') seen.waived += 1;
      else commitment[c.entityKey] += c.expectedMinor;
    }
  }
  for (const [k, s] of Object.entries(regularSeen)) fullyWaived[k] = s.total > 0 && s.waived === s.total;
  for (const c of input.extraCover || []) cover[c.entityKey] += c.amountMinor;
  for (const r of input.repayments || []) repaid[r.entityKey] += r.amountMinor;

  const approved = input.draws.filter((d) => d.status === 'approved');
  const poolSpendMinor = approved.filter((d) => d.fundingSource === 'pool').reduce((s, d) => s + d.amountMinor, 0);
  const reimbursementsMinor = approved.filter((d) => d.fundingSource === 'pool_reimbursement').reduce((s, d) => s + d.amountMinor, 0);
  const spend = poolSpendMinor + reimbursementsMinor;
  const giftsMinor = keys.reduce((s, k) => s + gifted[k], 0);
  // Gifts pay for spending; what's left is shared under the policy.
  const spendToShare = spend - giftsMinor;

  const openingBalanceMinor = keys.reduce((s, k) => s + opening[k], 0);
  const confirmedContributionsMinor = keys.reduce((s, k) => s + contributed[k], 0);
  const overdraftCoverMinor = keys.reduce((s, k) => s + cover[k], 0);
  const earlyRepaymentsMinor = keys.reduce((s, k) => s + repaid[k], 0);
  const preCoverBalanceMinor = openingBalanceMinor + confirmedContributionsMinor - earlyRepaymentsMinor - spend;
  const closingBalanceMinor = preCoverBalanceMinor + overdraftCoverMinor;

  const policy = preCoverBalanceMinor >= 0 ? input.surplusPolicy : input.deficitPolicy;
  const shareBasis = basisFor(policy);

  // Spending is shared among roster entities (anyone, if the roster is empty).
  const sharers = rosterKeys.length > 0 ? [...rosterKeys].sort() : keys;
  const commitmentWeights = sharers.map((k) => ({ key: k, weight: commitment[k] }));
  const equalWeights = sharers.filter((k) => !fullyWaived[k]).map((k) => ({ key: k, weight: 1 }));

  const fairShare: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const addShares = (parts: Record<string, number>) => {
    for (const [k, v] of Object.entries(parts)) fairShare[k] = (fairShare[k] || 0) + v;
  };

  if (shareBasis === 'custodian') {
    // Everyone else's agreed dues are consumed; their top-ups are loans the custodian pays back
    // (gifts were taken out of spendToShare). The custodian takes whatever is left (or short).
    let othersConsumed = 0;
    for (const k of keys) {
      if (k === input.custodianEntityKey) continue;
      fairShare[k] = regular[k];
      othersConsumed += regular[k];
    }
    fairShare[input.custodianEntityKey] = spendToShare - othersConsumed;
  } else if (shareBasis === 'consumption') {
    for (const d of approved) {
      const weights = d.consumption && d.consumption.length > 0 ? d.consumption : commitmentWeights;
      addShares(allocateMinor(d.amountMinor, weights.length > 0 ? weights : equalWeights));
    }
    // Gifts lower everyone's share, by commitment.
    if (giftsMinor !== 0) {
      addShares(allocateMinor(-giftsMinor, commitmentWeights)); // all-zero weights split equally
    }
  } else if (spendToShare !== 0) {
    const weights = shareBasis === 'equal' ? equalWeights : commitmentWeights;
    addShares(allocateMinor(spendToShare, weights.length > 0 ? weights : sharers.map((k) => ({ key: k, weight: 1 }))));
  }

  const heldBy: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.held || {})) if (k !== input.custodianEntityKey && v !== 0) heldBy[k] = v;

  const entityShares: PoolEntityShare[] = keys.map((k) => {
    const ref = parseEntityKey(k);
    const netMinor = opening[k] + contributed[k] - gifted[k] - repaid[k] - (fairShare[k] || 0) + cover[k];
    return {
      entityId: ref.entityId,
      entityType: ref.entityType,
      openingCreditMinor: opening[k],
      contributedMinor: contributed[k],
      giftedMinor: gifted[k],
      coverMinor: cover[k],
      commitmentMinor: commitment[k],
      fairShareMinor: fairShare[k] || 0,
      ...(repaid[k] ? { repaidMinor: repaid[k] } : {}),
      ...(heldBy[k] ? { heldMinor: heldBy[k] } : {}),
      netMinor,
    };
  });

  const netSum = entityShares.reduce((s, e) => s + e.netMinor, 0);
  if (netSum !== closingBalanceMinor) {
    throw new Error(`reconcileCycle invariant violated: Σnet ${netSum} ≠ closing ${closingBalanceMinor}`);
  }

  const disposition: ReconcileResult['disposition'] =
    !input.forDissolution && input.surplusPolicy === 'carry_forward' ? 'carry_forward' : 'settle';

  const settlementBalances: Record<string, number> = {};
  if (disposition === 'settle') {
    for (const e of entityShares) settlementBalances[`${e.entityType}:${e.entityId}`] = e.netMinor;
    // The custodian holds the remaining cash and pays it out...
    settlementBalances[input.custodianEntityKey] =
      (settlementBalances[input.custodianEntityKey] || 0) - closingBalanceMinor;
    // ...except what spenders still hold: they hand that over instead (above zero), or are paid
    // what they spent beyond it (below zero). Σ stays zero.
    for (const [k, v] of Object.entries(heldBy)) {
      settlementBalances[k] = (settlementBalances[k] || 0) - v;
      settlementBalances[input.custodianEntityKey] += v;
    }
    for (const k of Object.keys(settlementBalances)) if (settlementBalances[k] === 0) delete settlementBalances[k];
  }

  return {
    openingBalanceMinor,
    confirmedContributionsMinor,
    overdraftCoverMinor,
    giftsMinor,
    earlyRepaymentsMinor,
    poolSpendMinor,
    reimbursementsMinor,
    preCoverBalanceMinor,
    closingBalanceMinor,
    uncoveredDeficitMinor: Math.max(0, -closingBalanceMinor),
    outcome: preCoverBalanceMinor > 0 ? 'surplus' : preCoverBalanceMinor < 0 ? 'deficit' : 'balanced',
    shareBasis,
    disposition,
    entityShares,
    settlementBalances,
    heldBy,
  };
}

/**
 * A member leaving a carry-forward pool must be paid out (or pay in) now — their
 * credit can't roll into a cycle they're not part of. Everyone else carries.
 * Pool money a leaver still holds is handed back as part of their exit (or, if they
 * spent beyond it, paid to them); everyone else's holdings carry forward (§9.3).
 */
export function splitForMembershipChange(
  result: ReconcileResult,
  leavingKeys: string[],
  custodianEntityKey: string,
): {
  carryCredits: Record<string, number>;
  carryOpeningBalanceMinor: number;
  exitBalances: Record<string, number>;
  carryHeld: Record<string, number>;
} {
  if (leavingKeys.includes(custodianEntityKey)) {
    throw new Error('The custodian cannot leave the pool. Assign a new custodian first.');
  }
  const leaving = new Set(leavingKeys);
  const carryCredits: Record<string, number> = {};
  const exitBalances: Record<string, number> = {};
  let exitTotal = 0;
  for (const e of result.entityShares) {
    const key = `${e.entityType}:${e.entityId}`;
    if (leaving.has(key)) {
      if (e.netMinor !== 0) {
        exitBalances[key] = e.netMinor;
        exitTotal += e.netMinor;
      }
    } else if (e.netMinor !== 0) {
      carryCredits[key] = e.netMinor;
    }
  }
  if (exitTotal !== 0) exitBalances[custodianEntityKey] = (exitBalances[custodianEntityKey] || 0) - exitTotal;
  // Held money moves between holders inside the pool, so it doesn't change what carries forward.
  const carryHeld: Record<string, number> = {};
  for (const [key, held] of Object.entries(result.heldBy || {})) {
    if (!leaving.has(key)) {
      carryHeld[key] = held;
      continue;
    }
    exitBalances[key] = (exitBalances[key] || 0) - held;
    exitBalances[custodianEntityKey] = (exitBalances[custodianEntityKey] || 0) + held;
  }
  for (const key of Object.keys(exitBalances)) if (exitBalances[key] === 0) delete exitBalances[key];
  return { carryCredits, carryOpeningBalanceMinor: result.closingBalanceMinor - exitTotal, exitBalances, carryHeld };
}
