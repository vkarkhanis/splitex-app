/**
 * Money pooling — shared contracts.
 *
 * Pooling is a *funding model*, not a separate ledger: an event is funded either
 * peer-to-peer (today's behaviour), from a pool, or both. Every pool field is
 * optional, and an absent field always means "behave exactly as before".
 *
 * All pool amounts are integer MINOR units (paise, cents; yen have none) so a
 * balance carried across many cycles never accumulates float drift. Convert only
 * at the presentation boundary with `toMinor` / `fromMinor`.
 */

export type EventFundingModel = 'peer_to_peer' | 'pool' | 'hybrid';

/** Absent `Event.fundingModel` must always be read as this. Never backfill it. */
export const DEFAULT_FUNDING_MODEL: EventFundingModel = 'peer_to_peer';

/**
 * Where an expense's money came from.
 * - `self`: today's behaviour — the payer's own money, split into debts.
 * - `pool`: paid directly from pool funds. Deducts; creates no debt.
 * - `pool_reimbursement`: spender used their own money and claims it back from
 *   the pool. Deducts; the claimant is paid back through a settlement leg.
 */
export type ExpenseFundingSource = 'self' | 'pool' | 'pool_reimbursement';

/** Absent `Expense.fundingSource` must always be read as this. */
export const DEFAULT_FUNDING_SOURCE: ExpenseFundingSource = 'self';

/** "Several of us put money in" vs "just me" (single sponsor). */
export type PoolFunderMode = 'contributors' | 'sponsor';
export type PoolCycleMode = 'single' | 'recurring';
export type PoolRecurrence = 'monthly' | 'quarterly' | 'custom';
export type PoolSurplusPolicy = 'refund_pro_rata' | 'refund_equal' | 'carry_forward' | 'retain';
export type PoolDeficitPolicy = 'collect_pro_rata' | 'collect_equal' | 'collect_by_consumption' | 'custodian_absorbs';
export type PoolOverdraftPolicy = 'block' | 'graduated' | 'allow';
export type PoolOverdraftBaseline = 'confirmed_funding' | 'expected_funding' | 'target_amount';
export type PoolExpenseApprovalMode = 'none' | 'above_threshold' | 'always';
export type PoolPreset = 'trip_kitty' | 'household' | 'club_treasury' | 'sponsor_budget' | 'target_collection';

export interface PoolConfig {
  preset?: PoolPreset;
  funderMode: PoolFunderMode;
  cycleMode: PoolCycleMode;
  recurrence?: PoolRecurrence;
  /** Sponsor budget / collection target. null ⇒ open-ended. */
  targetAmountMinor?: number | null;
  /** Expected contribution per roster entity when a scheduled cycle opens. */
  defaultContributionMinor?: number | null;
  /** Who physically holds the money: confirms contributions, pays out legs. */
  custodianUserId: string;
  /** Sponsor mode: users allowed to draw from the pool without contributing. */
  authorizedSpenders?: string[];
  /** Sponsor mode: every member of these groups may draw from the pool. */
  authorizedSpenderGroups?: string[];
  /** Optional cap per spender (userId or groupId → minor units). */
  spenderCapsMinor?: Record<string, number>;
  surplusPolicy: PoolSurplusPolicy;
  deficitPolicy: PoolDeficitPolicy;
  overdraftPolicy: PoolOverdraftPolicy;
  /** `graduated`: % of the baseline that may be overdrawn. Default 20. */
  overdraftTolerancePercent?: number;
  /** How the overdraft baseline is derived. Default `confirmed_funding`. */
  overdraftBaseline?: PoolOverdraftBaseline;
  /**
   * `graduated`: once spending is paused at the floor, it stays paused until the
   * balance rises ABOVE this % of the baseline. Default 0 — i.e. the full
   * overdraft must be repaid plus more before pre-authorised draws resume.
   */
  overdraftClearancePercent?: number;
  /** Refuse pre-authorised draws until the funding target is reached (escrow). */
  requireFullFundingBeforeSpend?: boolean;
  /** Receipt mandatory on pool draws above this. 0 ⇒ always. null ⇒ never. */
  receiptRequiredAboveMinor?: number | null;
  /** Reimbursement claims must carry a receipt. Default true. */
  claimReceiptRequired?: boolean;
  expenseApproval: PoolExpenseApprovalMode;
  approvalThresholdMinor?: number | null;
  /** Recurring pools: a member joining/leaving closes the current cycle. */
  membershipChangeClosesCycle?: boolean;
  /**
   * Spenders may record a spend paid with the custodian's card or UPI (§9.3). Absent ⇒ true.
   * Off: the option isn't offered and the API refuses `paidFrom: 'sponsor_card'`.
   */
  allowSponsorCardSpends?: boolean;
}

/** Fields a client may send when creating a pool event. */
export interface CreatePoolConfigDto {
  preset: PoolPreset;
  custodianUserId?: string;
  targetAmountMinor?: number | null;
  defaultContributionMinor?: number | null;
  /** Hybrid: also allow ordinary peer-to-peer split expenses in the event. */
  allowPeerExpenses?: boolean;
  overrides?: Partial<Omit<PoolConfig, 'custodianUserId' | 'preset'>>;
}

export interface PoolEntityRef {
  entityId: string;
  entityType: 'user' | 'group';
}

export type PoolCycleStatus = 'open' | 'reconciling' | 'closed';
export type PoolCycleCloseReason = 'scheduled' | 'membership_change' | 'dissolution' | 'manual';

export interface PoolCycle {
  id: string;
  eventId: string;
  sequence: number;
  label: string;
  startDate: string;
  endDate?: string | null;
  status: PoolCycleStatus;
  currency: string;
  /** Carried in from the previous cycle. 0 for cycle 1. */
  openingBalanceMinor: number;
  /** Per-entity carried credit (entity key → minor). Sums to openingBalanceMinor. */
  openingCredits: Record<string, number>;
  /**
   * Pool money each spender still held when the previous cycle closed and carried forward
   * (entity key → minor; < 0 ⇒ the pool owed them). Absent ⇒ nobody held anything (§9.3).
   */
  openingHeld?: Record<string, number>;
  /** Entities that share this cycle's spending. */
  roster: PoolEntityRef[];
  /** Set while pre-authorised draws are paused by the graduated overdraft. */
  overdraftLatchedAt?: string | null;
  closeReason?: PoolCycleCloseReason | null;
  closedAt?: string | null;
  closedBy?: string | null;
  reconciliation?: PoolReconciliation | null;
  createdAt: string;
  updatedAt: string;
}

export type PoolContributionKind = 'regular' | 'top_up' | 'overdraft_cover';
/**
 * Mirrors the settlement leg lifecycle: contributor marks paid → custodian
 * confirms. A custodian rejection returns the contribution to `pending`.
 */
export type PoolContributionStatus = 'pending' | 'initiated' | 'partial' | 'confirmed' | 'waived';
export type PoolAuditAction =
  | 'created'
  | 'marked_paid'
  | 'confirmed'
  | 'partially_confirmed'
  | 'rejected'
  | 'waived'
  | 'amount_changed'
  | 'cancelled';

export interface PoolAuditEntry {
  id: string;
  action: PoolAuditAction;
  actorUserId: string;
  note?: string;
  referenceId?: string;
  proofUrl?: string;
  amountMinor?: number;
  statusFrom?: string;
  statusTo?: string;
  createdAt: string;
}

export interface PoolContribution {
  id: string;
  eventId: string;
  cycleId: string;
  fromEntityId: string;
  fromEntityType: 'user' | 'group';
  /** The actual payer. For a group, its designated payer. */
  fromUserId: string;
  kind: PoolContributionKind;
  /**
   * top_up only: given to the event, not lent. Absent ⇒ a loan, paid back at close
   * (in a "Just me" pool by the sponsor). See design doc §10.
   */
  gift?: boolean;
  /** Agreed amount for this cycle. Defines the contributor's fair-share weight. */
  expectedMinor: number;
  /** Amount the custodian has confirmed receiving. */
  receivedMinor: number;
  /** Amount the contributor says they sent in their latest mark-paid. */
  claimedMinor?: number | null;
  currency: string;
  status: PoolContributionStatus;
  dueDate?: string | null;
  paymentReference?: string | null;
  payerNote?: string | null;
  proofUrl?: string | null;
  payerMarkedAt?: string | null;
  custodianConfirmedAt?: string | null;
  rejectionReason?: string | null;
  auditTrail: PoolAuditEntry[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Money handed between the custodian and someone else (design doc §9.3, §10.6):
 * - `advance`: custodian → spender. Moves money between holders; the pool's remaining amount is unchanged.
 * - `return`: spender → custodian. The same, the other way.
 * - `repayment`: custodian → lender, paying a top-up back early. Lowers the remaining amount.
 */
export type PoolAdvanceKind = 'advance' | 'return' | 'repayment';
/** Recorded (`initiated`) → the receiver confirms, or says it never arrived (`rejected`); the recorder may cancel it while waiting. */
export type PoolAdvanceStatus = 'initiated' | 'confirmed' | 'rejected' | 'cancelled';

export interface PoolAdvance {
  id: string;
  eventId: string;
  cycleId: string;
  kind: PoolAdvanceKind;
  /** advance / repayment: the custodian. return: the holder. */
  fromUserId: string;
  /** advance: the spender. return: the custodian. repayment: the lender. */
  toUserId: string;
  amountMinor: number;
  currency: string;
  status: PoolAdvanceStatus;
  note?: string | null;
  /** Optional proof of the hand-over (photo or PDF), as on contributions. */
  proofUrl?: string | null;
  rejectionReason?: string | null;
  createdBy: string;
  createdAt: string;
  confirmedAt?: string | null;
  updatedAt: string;
  auditTrail: PoolAuditEntry[];
}

/**
 * Who holds the pool's remaining money (§9.3). Derived, never stored:
 * `withCustodianMinor + withSpendersMinor = remaining (the cycle balance)`.
 */
export interface PoolHoldings {
  withCustodianMinor: number;
  /** Σ held by everyone but the custodian. Negative when the pool owes spenders more than they hold. */
  withSpendersMinor: number;
  /** Entity key → held. > 0: holds pool money · < 0: the pool owes them. Zeros omitted. */
  heldBy: Record<string, number>;
  /** Advances recorded but not yet confirmed: not available to hand out again. */
  pendingOutMinor: number;
}

/** How a spender other than the custodian paid a pool spend (§9.3). Absent ⇒ as built in Phase 1. */
export type PoolPaidFrom = 'advance' | 'sponsor_card';

export type PoolDrawStatus = 'pending' | 'approved' | 'rejected';
export type PoolExpenseFlag = 'exceeds_tolerance' | 'exceeds_spender_cap' | 'underfunded';

/**
 * Approval state of a pool-funded expense (`pool` or `pool_reimbursement`).
 * Only `approved` draws deduct from the pool.
 */
export interface PoolDrawState {
  status: PoolDrawStatus;
  decidedBy?: string | null;
  decidedAt?: string | null;
  reason?: string | null;
  /**
   * pool_reimbursement: the settlement leg paying the claimant back.
   * pool, rejected after it was already paid: the `pool_repayment` leg from the spender to the custodian.
   */
  settlementId?: string | null;
  /** pool_reimbursement filed by the custodian: no leg needed. */
  selfReimbursed?: boolean;
  /**
   * The money had already been spent when recorded (never refused, only flagged).
   * For a pool spend: "I've already paid with the pool's money", as opposed to asking first.
   */
  alreadyIncurred?: boolean;
  /**
   * Pool spend by someone other than the custodian: paid from pool money they hold (`advance`)
   * or with the custodian's card/UPI (`sponsor_card`). A rejected, already-paid spend from held
   * money stays in what they hold; one on the card is owed back through a `pool_repayment` leg.
   */
  paidFrom?: PoolPaidFrom;
}

export interface PoolLedgerEntry {
  /** Contribution, expense or advance id. */
  id: string;
  type: 'contribution' | 'draw' | 'advance';
  at: string;
  title: string;
  /** Signed: money in is positive, money out negative. */
  amountMinor: number;
  status: string;
  actorUserId: string;
  entityId?: string;
  entityType?: 'user' | 'group';
  contributionKind?: PoolContributionKind;
  fundingSource?: 'pool' | 'pool_reimbursement';
  /** Pool spends: already paid with the pool's money (true) or asking before spending (false). */
  alreadyIncurred?: boolean;
  /** Pool spends by someone other than the custodian: how they paid. */
  paidFrom?: PoolPaidFrom;
  /** type 'advance': which kind of hand-over, and between whom. */
  advanceKind?: PoolAdvanceKind;
  fromUserId?: string;
  toUserId?: string;
  receiptUrls: string[];
  flags?: PoolExpenseFlag[];
  /** pool_reimbursement: status of the leg paying the claimant back. A rejected, already-paid pool spend: of its repayment leg. */
  settlementStatus?: string | null;
  /** Whether this entry currently moves the balance. */
  counted: boolean;
}

export interface PoolSpenderSummary {
  /** userId, or groupId when the spender is authorised through a group. */
  spenderId: string;
  spenderType: 'user' | 'group';
  spentMinor: number;
  pendingMinor: number;
  capMinor: number | null;
  /** Pool money they hold (< 0: the pool owes them). Absent from servers before Phase 2. */
  heldMinor?: number;
}

export interface PoolLedger {
  summary: PoolCycleSummary;
  contributions: PoolContribution[];
  entries: PoolLedgerEntry[];
  spenders: PoolSpenderSummary[];
  cycles: PoolCycle[];
  /** Hand-overs in this cycle (§9.3, §10.6). Absent from servers before Phase 2. */
  advances?: PoolAdvance[];
}

export interface PoolEntityShare {
  entityId: string;
  entityType: 'user' | 'group';
  openingCreditMinor: number;
  /** Confirmed regular + top-up money put in this cycle. */
  contributedMinor: number;
  /** The part of it given as gifts (consumed, never paid back). */
  giftedMinor?: number;
  /** Money fronted to cover a deficit at close. */
  coverMinor: number;
  /** Agreed share weight (non-waived regular expected amounts). */
  commitmentMinor: number;
  /** This entity's fair share of the cycle's spending. */
  fairShareMinor: number;
  /** Top-ups already paid back early (§10.6). */
  repaidMinor?: number;
  /** Pool money they still hold at close (§9.3); settled through the pay-out, not `net`. */
  heldMinor?: number;
  /** opening + contributed − gifted − repaid − fairShare + cover. > 0 ⇒ owed · < 0 ⇒ owes. */
  netMinor: number;
}

export type PoolShareBasis = 'commitment' | 'equal' | 'consumption' | 'custodian';

export interface PoolReconciliation {
  cycleId: string;
  currency: string;
  openingBalanceMinor: number;
  confirmedContributionsMinor: number;
  overdraftCoverMinor: number;
  poolSpendMinor: number;
  reimbursementsMinor: number;
  /** opening + contributions − spend, before any overdraft cover. */
  preCoverBalanceMinor: number;
  /** preCover + cover. Never negative once a cycle is closed. */
  closingBalanceMinor: number;
  outcome: 'surplus' | 'deficit' | 'balanced';
  shareBasis: PoolShareBasis;
  disposition: 'carry_forward' | 'settle';
  entityShares: PoolEntityShare[];
  settlementIds: string[];
  /** Top-ups paid back early during the cycle (§10.6). */
  earlyRepaymentsMinor?: number;
  /** Pool money each spender held at close (§9.3). */
  heldBy?: Record<string, number>;
  /** Repayments and unpaid claims folded into the final settlement (§11). */
  nettedLegIds?: string[];
  generatedAt: string;
  generatedBy: string;
}

export type PoolBalanceZone = 'healthy' | 'overdrawn' | 'blocked';

export interface PoolOverdraftState {
  policy: PoolOverdraftPolicy;
  baselineMinor: number;
  tolerancePercent: number;
  toleranceMinor: number;
  /** Lowest balance a pre-authorised draw may reach. */
  floorMinor: number;
  balanceMinor: number;
  /** How much more may be drawn right now (balance − floor, never negative). */
  headroomMinor: number;
  zone: PoolBalanceZone;
  latched: boolean;
  /** Balance must rise above this before a latched pool resumes. */
  clearanceThresholdMinor: number;
}

export interface PoolCycleTotals {
  expectedRegularMinor: number;
  confirmedRegularMinor: number;
  confirmedTopUpMinor: number;
  overdraftCoverMinor: number;
  poolSpendMinor: number;
  reimbursementsMinor: number;
  pendingDrawsMinor: number;
  /** Confirmed early repayments to lenders (§10.6): money leaving, not spending. */
  earlyRepaymentsMinor?: number;
  balanceMinor: number;
}

export interface PoolFundingState {
  targetMinor: number | null;
  fundedMinor: number;
  state: 'underfunded' | 'funded' | 'open_ended';
}

export interface PoolArrear {
  entityId: string;
  entityType: 'user' | 'group';
  outstandingMinor: number;
}

export interface PoolCycleSummary {
  cycle: PoolCycle;
  totals: PoolCycleTotals;
  overdraft: PoolOverdraftState;
  funding: PoolFundingState;
  arrears: PoolArrear[];
  /** Who holds the remaining money (§9.3). Absent from servers before Phase 2. */
  holdings?: PoolHoldings;
}

/** A pool payment the final settlement will include (§11): an existing leg, or one settle-up creates. */
export interface PoolFoldedItem {
  settlementId: string | null;
  expenseId: string | null;
  kind: 'pool_repayment' | 'pool_reimbursement';
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  /** The expense's title, e.g. "Snacks". */
  title: string;
}

/** An open pool payment that stays separate at settle-up: already being paid, or from an earlier cycle. */
export interface PoolSeparateLeg {
  settlementId: string;
  kind: string;
  status: string;
  expenseId: string | null;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export type PoolRefusalCode = 'POOL_OVERDRAFT_BLOCKED' | 'POOL_INSUFFICIENT_FUNDS' | 'POOL_UNDERFUNDED';

/** `data` payload of a refused pool draw. All amounts in minor units. */
export interface PoolRefusalDetails {
  code: PoolRefusalCode;
  balance: number;
  baseline: number;
  tolerance: number;
  floor: number;
  requested: number;
  projected: number;
  /** Add at least this much to permit THIS draw. */
  shortfall: number;
  /** Balance must rise by more than this to leave the paused state. */
  clearanceRequired: number;
}

// ── Presets ───────────────────────────────────────────────────────────────

type PresetConfig = Omit<PoolConfig, 'custodianUserId'>;

const GRADUATED = { overdraftPolicy: 'graduated', overdraftTolerancePercent: 20, overdraftBaseline: 'confirmed_funding', overdraftClearancePercent: 0 } as const;

/**
 * The policy matrix behind the UI. Users pick a preset ("Kitty", "Fund",
 * "Budget"...) and never see surplus/deficit policies unless they open Advanced.
 */
export const POOL_PRESETS: Record<PoolPreset, PresetConfig> = {
  trip_kitty: {
    preset: 'trip_kitty',
    funderMode: 'contributors',
    cycleMode: 'single',
    surplusPolicy: 'refund_pro_rata',
    deficitPolicy: 'collect_pro_rata',
    ...GRADUATED,
    receiptRequiredAboveMinor: null,
    claimReceiptRequired: false,
    expenseApproval: 'none',
    membershipChangeClosesCycle: false,
  },
  household: {
    preset: 'household',
    funderMode: 'contributors',
    cycleMode: 'recurring',
    recurrence: 'monthly',
    surplusPolicy: 'carry_forward',
    deficitPolicy: 'collect_pro_rata',
    ...GRADUATED,
    receiptRequiredAboveMinor: null,
    claimReceiptRequired: true,
    expenseApproval: 'none',
    membershipChangeClosesCycle: true,
  },
  club_treasury: {
    preset: 'club_treasury',
    funderMode: 'contributors',
    cycleMode: 'recurring',
    recurrence: 'monthly',
    surplusPolicy: 'carry_forward',
    // Dues are tiered, so a shortfall is shared by tier (commitment), not head-count.
    deficitPolicy: 'collect_pro_rata',
    ...GRADUATED,
    receiptRequiredAboveMinor: null,
    claimReceiptRequired: true,
    expenseApproval: 'none',
    membershipChangeClosesCycle: false,
  },
  sponsor_budget: {
    preset: 'sponsor_budget',
    funderMode: 'sponsor',
    cycleMode: 'single',
    surplusPolicy: 'retain',
    deficitPolicy: 'custodian_absorbs',
    ...GRADUATED,
    receiptRequiredAboveMinor: 0,
    claimReceiptRequired: true,
    expenseApproval: 'always',
    membershipChangeClosesCycle: false,
  },
  target_collection: {
    preset: 'target_collection',
    funderMode: 'contributors',
    cycleMode: 'single',
    surplusPolicy: 'refund_pro_rata',
    deficitPolicy: 'collect_pro_rata',
    overdraftPolicy: 'block',
    overdraftTolerancePercent: 0,
    overdraftBaseline: 'target_amount',
    overdraftClearancePercent: 0,
    requireFullFundingBeforeSpend: true,
    receiptRequiredAboveMinor: null,
    claimReceiptRequired: false,
    expenseApproval: 'none',
    membershipChangeClosesCycle: false,
  },
};

export const POOL_PRESET_LABELS: Record<PoolPreset, { title: string; tagline: string }> = {
  trip_kitty: { title: 'Kitty', tagline: 'Everyone chips in once; leftovers are refunded in proportion.' },
  household: { title: 'Fund', tagline: 'Monthly contributions for shared bills; balance rolls over.' },
  club_treasury: { title: 'Treasury', tagline: 'Recurring dues at any tier; surplus stays in the treasury.' },
  sponsor_budget: { title: 'Budget', tagline: 'You fund it; others spend from it and claim reimbursements.' },
  target_collection: { title: 'Collection', tagline: 'Collect toward a target before committing to a big spend.' },
};

export function buildPoolConfig(
  preset: PoolPreset,
  custodianUserId: string,
  extras: { targetAmountMinor?: number | null; defaultContributionMinor?: number | null } = {},
  overrides: Partial<PresetConfig> = {},
): PoolConfig {
  return {
    ...POOL_PRESETS[preset],
    ...overrides,
    preset,
    custodianUserId,
    targetAmountMinor: extras.targetAmountMinor ?? overrides.targetAmountMinor ?? null,
    defaultContributionMinor: extras.defaultContributionMinor ?? overrides.defaultContributionMinor ?? null,
  };
}

// ── Funding-model helpers ─────────────────────────────────────────────────

export function resolveFundingModel(event: { fundingModel?: EventFundingModel | null } | null | undefined): EventFundingModel {
  return event?.fundingModel ?? DEFAULT_FUNDING_MODEL;
}

export function resolveFundingSource(expense: { fundingSource?: ExpenseFundingSource | null } | null | undefined): ExpenseFundingSource {
  return expense?.fundingSource ?? DEFAULT_FUNDING_SOURCE;
}

export function isPoolFundedEvent(event: { fundingModel?: EventFundingModel | null } | null | undefined): boolean {
  const model = resolveFundingModel(event);
  return model === 'pool' || model === 'hybrid';
}

export function isPoolFundedExpense(expense: { fundingSource?: ExpenseFundingSource | null } | null | undefined): boolean {
  const source = resolveFundingSource(expense);
  return source === 'pool' || source === 'pool_reimbursement';
}

/**
 * Whether `approverId` may approve a pool expense paid by `payerId`. Managers
 * approve, but never their own spending, except the custodian: it is their
 * money. This also decides whether a manager's own new expense is approved
 * automatically.
 */
export function canApproveDraw(approverId: string, payerId: string, custodianUserId: string, approverIsManager: boolean): boolean {
  return approverIsManager && (approverId !== payerId || approverId === custodianUserId);
}

/** Funding sources an expense may use in an event with this funding model. */
export function allowedFundingSources(model: EventFundingModel): ExpenseFundingSource[] {
  if (model === 'pool') return ['pool', 'pool_reimbursement'];
  if (model === 'hybrid') return ['pool', 'pool_reimbursement', 'self'];
  return ['self'];
}

export function entityKey(entityType: 'user' | 'group', entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function parseEntityKey(key: string): PoolEntityRef {
  const idx = key.indexOf(':');
  const type = key.slice(0, idx);
  return { entityType: type === 'group' ? 'group' : 'user', entityId: key.slice(idx + 1) };
}

// ── Money ─────────────────────────────────────────────────────────────────

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF']);

/** Number of minor-unit digits for an ISO-4217 code (JPY ⇒ 0, most ⇒ 2). */
export function currencyExponent(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase()) ? 0 : 2;
}

/** Major → minor units, rounding half away from zero and immune to 1.005×100 drift. */
export function toMinor(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount: ${amount}`);
  const factor = 10 ** currencyExponent(currency);
  const scaled = Number((Math.abs(amount) * factor).toPrecision(15));
  const rounded = Math.round(scaled);
  return amount < 0 && rounded !== 0 ? -rounded : rounded;
}

/** Minor → major units. */
export function fromMinor(minor: number, currency: string): number {
  const factor = 10 ** currencyExponent(currency);
  return minor / factor;
}
