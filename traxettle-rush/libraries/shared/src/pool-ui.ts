/**
 * Money pooling — platform-agnostic presentation helpers shared by the web and
 * mobile clients: money formatting, user-facing copy for refusals, the receipt
 * rule (mirrors the API), the create-event funding choice, and the balance
 * meter geometry. Keeping these here means both clients always agree.
 */
import { POOL_PRESETS, allowedFundingSources, currencyExponent, fromMinor, toMinor } from './pool';
import type {
  CreatePoolConfigDto,
  EventFundingModel,
  ExpenseFundingSource,
  PoolAdvance,
  PoolAdvanceKind,
  PoolBalanceZone,
  PoolConfig,
  PoolContributionStatus,
  PoolDrawState,
  PoolExpenseApprovalMode,
  PoolFoldedItem,
  PoolOverdraftState,
  PoolPaidFrom,
  PoolPreset,
  PoolRefusalDetails,
} from './pool';

// ── Formatting & copy ─────────────────────────────────────────────────────

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', AUD: 'A$', CAD: 'C$',
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || `${currency} `;
}

/** Format integer minor units for display: 1234567 INR → "₹12,345.67". */
export function formatMinor(minor: number, currency: string, opts: { signed?: boolean } = {}): string {
  const exp = currencyExponent(currency);
  const major = fromMinor(Math.abs(minor), currency);
  const text = major.toLocaleString(undefined, { minimumFractionDigits: exp, maximumFractionDigits: exp });
  const sign = minor < 0 ? '−' : opts.signed && minor > 0 ? '+' : '';
  return `${sign}${currencySymbol(currency)}${text}`;
}

/** User-facing nouns: "pool" stays the internal term. */
export const POOL_NOUN: Record<PoolPreset, string> = {
  trip_kitty: 'Kitty',
  household: 'Fund',
  club_treasury: 'Treasury',
  sponsor_budget: 'Budget',
  target_collection: 'Collection',
};

export function poolNoun(config?: Pick<PoolConfig, 'preset'> | null): string {
  return (config?.preset && POOL_NOUN[config.preset]) || 'Pool';
}

export const ZONE_TONE: Record<PoolBalanceZone, 'success' | 'warning' | 'error'> = {
  healthy: 'success',
  overdrawn: 'warning',
  blocked: 'error',
};

export const CONTRIBUTION_STATUS: Record<PoolContributionStatus, { label: string; tone: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { label: 'Not paid', tone: 'default' },
  initiated: { label: 'Awaiting confirmation', tone: 'info' },
  partial: { label: 'Part paid', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  waived: { label: 'Waived', tone: 'default' },
};

/** "1 payment to confirm · 2 payments to make", or null when nothing waits on the user. */
export function poolPaymentActionsText(toConfirm: number, toPay: number): string | null {
  const parts: string[] = [];
  if (toConfirm > 0) parts.push(`${toConfirm} payment${toConfirm === 1 ? '' : 's'} to confirm`);
  if (toPay > 0) parts.push(`${toPay} payment${toPay === 1 ? '' : 's'} to make`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export type ReimbursementStatus = 'to_reimburse' | 'sent' | 'in_settlement' | 'reimbursed';

export const REIMBURSEMENT_STATUS: Record<ReimbursementStatus, { label: string; tone: 'success' | 'warning' | 'info' }> = {
  to_reimburse: { label: 'To reimburse', tone: 'warning' },
  sent: { label: 'Reimbursement sent', tone: 'info' },
  in_settlement: { label: 'In final settlement', tone: 'info' },
  reimbursed: { label: 'Reimbursed', tone: 'success' },
};

/** A leg folded into the final settlement (§11) is done once the event is settled. */
function nettedLegDone(eventStatus?: string | null): boolean {
  return eventStatus === 'settled' || eventStatus === 'closed';
}

/**
 * How far an approved claim's pay-back has got, from the claim and the status
 * of its reimbursement leg. Null while the claim is pending or rejected.
 * `eventStatus` decides how a leg folded into the final settlement (`netted`) reads.
 */
export function reimbursementStatus(
  draw: Pick<PoolDrawState, 'status' | 'selfReimbursed'> | null | undefined,
  legStatus?: string | null,
  eventStatus?: string | null,
): ReimbursementStatus | null {
  if (draw?.status !== 'approved') return null;
  if (draw.selfReimbursed || legStatus === 'completed') return 'reimbursed';
  if (legStatus === 'netted') return nettedLegDone(eventStatus) ? 'reimbursed' : 'in_settlement';
  return legStatus === 'initiated' ? 'sent' : 'to_reimburse';
}

/**
 * Explain a refused pool draw in plain language, using the structured details
 * the API returns. Falls back to the raw message.
 */
export type RepaymentStatus = 'to_repay' | 'repay_sent' | 'in_settlement' | 'repaid';

export const REPAYMENT_STATUS: Record<RepaymentStatus, { label: string; tone: 'success' | 'warning' | 'info' }> = {
  to_repay: { label: 'Owed back', tone: 'warning' },
  repay_sent: { label: 'Repayment sent', tone: 'info' },
  in_settlement: { label: 'In final settlement', tone: 'info' },
  repaid: { label: 'Repaid', tone: 'success' },
};

/**
 * A pool spend already paid with the pool's money, then rejected: the spender owes it back
 * through its `pool_repayment` leg (§9.2). `legStatus` is that leg's status; none ⇒ nothing owed.
 * `eventStatus` decides how a leg folded into the final settlement (`netted`) reads.
 */
export function repaymentStatus(drawStatus: string | null | undefined, legStatus?: string | null, eventStatus?: string | null): RepaymentStatus | null {
  if (drawStatus !== 'rejected' || !legStatus) return null;
  if (legStatus === 'completed') return 'repaid';
  if (legStatus === 'netted') return nettedLegDone(eventStatus) ? 'repaid' : 'in_settlement';
  return legStatus === 'initiated' ? 'repay_sent' : 'to_repay';
}

// ── Hand-overs: advances, returns, early repayments (§9.3, §10.6) ──────────

export const ADVANCE_KIND_LABEL: Record<PoolAdvanceKind, string> = {
  advance: 'Advance',
  return: 'Returned',
  repayment: 'Paid back early',
};

/**
 * Where a hand-over stands, from the viewer's side: "Waiting for Ravi to confirm",
 * "Waiting for you to confirm", "Confirmed", "Not received", "Cancelled".
 */
export function advanceStatusText(
  advance: Pick<PoolAdvance, 'status' | 'toUserId'>,
  viewerId: string,
  nameOf: (userId: string) => string,
): string {
  switch (advance.status) {
    case 'confirmed': return 'Confirmed';
    case 'rejected': return 'Not received';
    case 'cancelled': return 'Cancelled';
    default:
      return advance.toUserId === viewerId ? 'Waiting for you to confirm' : `Waiting for ${nameOf(advance.toUserId)} to confirm`;
  }
}

// ── Settle-up preview: the pool's own figures ─────────────────────────────

export interface SettleUpFigure {
  key: 'carried_in' | 'collected' | 'paid_back_early' | 'spent' | 'result';
  label: string;
  /** Money out of the pool is negative. The last row (`result`) is unsigned: its label says which way. */
  amountMinor: number;
}

/**
 * The figures at the top of a settle-up or cycle-close preview, in an order that adds up on screen:
 * carried in + collected − paid back early − spent = left over (or short by).
 * "Carried in" and "Paid back early" appear only when they aren't zero. Money paid back early (§10.6)
 * is counted in "Collected" when it came in, so without its own row the figures wouldn't add up.
 * A server from before Phase 2 sends no `earlyRepaymentsMinor`, which counts as none.
 */
export function settleUpFigures(preview: {
  openingBalanceMinor: number;
  confirmedContributionsMinor: number;
  earlyRepaymentsMinor?: number;
  poolSpendMinor: number;
  reimbursementsMinor: number;
  preCoverBalanceMinor: number;
}): SettleUpFigure[] {
  const figures: SettleUpFigure[] = [];
  if (preview.openingBalanceMinor !== 0) {
    figures.push({ key: 'carried_in', label: 'Carried in', amountMinor: preview.openingBalanceMinor });
  }
  figures.push({ key: 'collected', label: 'Collected', amountMinor: preview.confirmedContributionsMinor });
  const repaid = preview.earlyRepaymentsMinor || 0;
  if (repaid > 0) figures.push({ key: 'paid_back_early', label: 'Paid back early', amountMinor: -repaid });
  figures.push({ key: 'spent', label: 'Spent from the pool', amountMinor: -(preview.poolSpendMinor + preview.reimbursementsMinor) });
  figures.push({
    key: 'result',
    label: preview.preCoverBalanceMinor >= 0 ? 'Left over' : 'Short by',
    amountMinor: Math.abs(preview.preCoverBalanceMinor),
  });
  return figures;
}

// ── Settle-up preview: pool payments folded into the final settlement (§11) ──

export interface SettleUpRow {
  /** Entity key. */
  key: string;
  /** From the pool itself: + gets back, − pays. */
  poolMinor: number;
  /** Repayments and claims folded in: + owed to them, − owed by them. */
  adjustments: Array<{ amountMinor: number; text: string }>;
  totalMinor: number;
}

/**
 * Each person's settle-up figure: what the pool pays them (or they pay it), plus the repayments
 * and claims folded into the final settlement. `keyOf` maps a user to their entity key (their
 * group, if they're in one), as the plan does.
 */
export function settleUpRows(
  settlementBalances: Record<string, number>,
  folded: PoolFoldedItem[],
  keyOf: (userId: string) => string,
): SettleUpRow[] {
  const rows = new Map<string, SettleUpRow>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, poolMinor: 0, adjustments: [], totalMinor: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const [key, v] of Object.entries(settlementBalances)) row(key).poolMinor += v;
  for (const f of folded) {
    const fromKey = keyOf(f.fromUserId);
    const toKey = keyOf(f.toUserId);
    if (fromKey === toKey) continue;
    const what = f.kind === 'pool_repayment' ? `${f.title || 'a spend'} (repayment)` : `${f.title || 'a claim'} (claim)`;
    row(fromKey).adjustments.push({ amountMinor: -f.amountMinor, text: what });
    row(toKey).adjustments.push({ amountMinor: f.amountMinor, text: what });
  }
  const out: SettleUpRow[] = [];
  for (const r of rows.values()) {
    r.totalMinor = r.poolMinor + r.adjustments.reduce((s, a) => s + a.amountMinor, 0);
    if (r.totalMinor !== 0 || r.adjustments.length > 0) out.push(r);
  }
  return out.sort((a, b) => b.totalMinor - a.totalMinor);
}

/**
 * Words for one row: "gets back ₹9,400" and, when something was folded in,
 * "₹10,000 from the budget, less ₹600 for Snacks (repayment)".
 * "plus" and "less" follow the row's first figure, so they read the same way for someone paying:
 * "₹10,000 to the budget, less ₹600 for Snacks (repayment)" → pays ₹9,400.
 */
export function describeSettleUpRow(row: SettleUpRow, currency: string, noun: string): { headline: string; detail: string | null } {
  const money = (v: number) => formatMinor(Math.abs(v), currency);
  const headline = row.totalMinor > 0 ? `gets back ${money(row.totalMinor)}` : row.totalMinor < 0 ? `pays ${money(row.totalMinor)}` : 'is square';
  if (row.adjustments.length === 0) return { headline, detail: null };
  const parts: string[] = [];
  // The direction of the first figure: receiving (> 0) or paying (< 0).
  let direction = 0;
  if (row.poolMinor !== 0) {
    parts.push(`${money(row.poolMinor)} ${row.poolMinor > 0 ? 'from' : 'to'} the ${noun.toLowerCase()}`);
    direction = Math.sign(row.poolMinor);
  }
  for (const a of row.adjustments) {
    let word: string;
    if (direction === 0) {
      word = a.amountMinor > 0 ? 'Owed' : 'Owes';
      direction = Math.sign(a.amountMinor);
    } else {
      word = Math.sign(a.amountMinor) === direction ? 'plus' : 'less';
    }
    parts.push(`${word} ${money(a.amountMinor)} for ${a.text}`);
  }
  return { headline, detail: parts.join(', ') };
}

// ── "Paid with" on the expense form ───────────────────────────────────────

/**
 * What the person picks on the expense form. `pool_held` and `pool_card` are both
 * `fundingSource: 'pool'`, told apart by `paidFrom` (§9.3); `pool` is the custodian's own choice.
 */
export type PaidWithChoice = 'pool' | 'pool_held' | 'pool_card' | 'pool_reimbursement' | 'self';

export interface PaidWithOption {
  value: PaidWithChoice;
  fundingSource: ExpenseFundingSource;
  paidFrom?: PoolPaidFrom;
  title: string;
  text: string;
  /** Listed first and marked "Suggested". */
  suggested: boolean;
}

/** The fields the API expects for a choice. */
export function paidWithPayload(choice: PaidWithChoice): { fundingSource: ExpenseFundingSource; paidFrom?: PoolPaidFrom } {
  if (choice === 'pool_held') return { fundingSource: 'pool', paidFrom: 'advance' };
  if (choice === 'pool_card') return { fundingSource: 'pool', paidFrom: 'sponsor_card' };
  return { fundingSource: choice };
}

/** The choice that matches a saved expense, for the edit form. */
export function paidWithChoiceFor(
  expense: { fundingSource?: ExpenseFundingSource | null; poolDraw?: Pick<PoolDrawState, 'paidFrom'> | null },
  isCustodian: boolean,
): PaidWithChoice {
  const source = expense.fundingSource || 'self';
  if (source !== 'pool') return source;
  if (expense.poolDraw?.paidFrom === 'advance') return 'pool_held';
  if (expense.poolDraw?.paidFrom === 'sponsor_card') return 'pool_card';
  return isCustodian ? 'pool' : 'pool_card';
}

/**
 * The "Paid with" options for one person (design doc §9.3, decision D1). The custodian pays from
 * the pool directly. Anyone else picks how they paid with pool money: money they hold (offered
 * once they've been handed some) or the custodian's card/UPI (while the pool allows it); or their
 * own money.
 */
export function paidWithOptions(input: {
  model: EventFundingModel;
  isCustodian: boolean;
  currency: string;
  noun: string;
  /** `config.allowSponsorCardSpends !== false`. */
  allowCardSpends: boolean;
  /** What this person holds now (holdings.heldBy for their entity). */
  heldMinor?: number;
  /** They've been handed money this cycle (or carried some in), even if it's all spent. */
  hasAdvances?: boolean;
  /** "Anita": names the card option. */
  custodianName?: string;
  /** Listed first and marked "Suggested" (spenders in a sponsor pool: claiming back is risk-free). */
  preferred?: ExpenseFundingSource;
}): PaidWithOption[] {
  const noun = input.noun.toLowerCase();
  const options: PaidWithOption[] = [];
  for (const source of allowedFundingSources(input.model)) {
    if (source === 'pool') {
      if (input.isCustodian) {
        options.push({ value: 'pool', fundingSource: 'pool', title: 'Pool funds', text: `Paid from the ${noun} (card, cash or account).`, suggested: false });
        continue;
      }
      const held = input.heldMinor || 0;
      if (input.hasAdvances || held !== 0) {
        options.push({
          value: 'pool_held', fundingSource: 'pool', paidFrom: 'advance',
          title: `${input.noun} money I'm holding`,
          text: held > 0
            ? `${formatMinor(held, input.currency)} left.`
            : `Nothing left; what you spend beyond it is paid back to you.`,
          suggested: false,
        });
      }
      if (input.allowCardSpends) {
        options.push({
          value: 'pool_card', fundingSource: 'pool', paidFrom: 'sponsor_card',
          title: input.custodianName ? `${input.custodianName}'s card or UPI` : "The custodian's card or UPI",
          text: 'Paid with their card, UPI or account.',
          suggested: false,
        });
      }
    } else if (source === 'pool_reimbursement') {
      options.push({ value: 'pool_reimbursement', fundingSource: source, title: 'My money — claim it back', text: `You paid; the ${noun} pays you back.`, suggested: false });
    } else {
      options.push({ value: 'self', fundingSource: source, title: 'My money — split it', text: 'A regular split between people.', suggested: false });
    }
  }
  if (input.preferred) {
    for (const o of options) o.suggested = o.value === input.preferred;
    options.sort((a, b) => Number(b.suggested) - Number(a.suggested));
  }
  return options;
}

export function describePoolRefusal(err: { code?: string; message?: string; data?: Partial<PoolRefusalDetails> }, currency: string): string {
  const d = err.data || {};
  const money = (v?: number) => formatMinor(Math.max(0, v || 0), currency);
  switch (err.code) {
    case 'POOL_OVERDRAFT_BLOCKED':
      if ((d.clearanceRequired || 0) > 0) {
        return `Spending is paused until the overdraft is repaid. Add more than ${money(d.clearanceRequired)} to resume.`;
      }
      return `This would go past the overdraft limit. Add at least ${money(d.shortfall)} to the pool to allow it.`;
    case 'POOL_INSUFFICIENT_FUNDS':
      return `Not enough money in the pool. Add at least ${money(d.shortfall)} first.`;
    case 'POOL_UNDERFUNDED':
      return `The collection hasn't reached its target yet (${money(d.shortfall)} still to collect).`;
    case 'POOL_SPENDER_CAP':
      return 'This would take you over your spending limit for this pool.';
    case 'POOL_RECEIPT_REQUIRED':
      return 'Attach a receipt to record this.';
    default:
      return err.message || 'The pool refused this expense.';
  }
}

/** Refusals the user can override by confirming the money was already spent. */
export function canRecordAnyway(code?: string): boolean {
  return code === 'POOL_OVERDRAFT_BLOCKED' || code === 'POOL_INSUFFICIENT_FUNDS' || code === 'POOL_UNDERFUNDED' || code === 'POOL_SPENDER_CAP';
}

/**
 * Mirrors the server rule: is a receipt mandatory for this pool expense?
 * `askingFirst`: someone other than the custodian asking before they spend. Nothing has been
 * bought yet, so there's no receipt to attach; it can be added to the expense after paying.
 */
export function isReceiptRequired(
  config: Pick<PoolConfig, 'claimReceiptRequired' | 'receiptRequiredAboveMinor'> | null | undefined,
  fundingSource: 'self' | 'pool' | 'pool_reimbursement',
  amountMinor: number,
  opts: { askingFirst?: boolean } = {},
): boolean {
  if (!config || fundingSource === 'self') return false;
  if (fundingSource === 'pool_reimbursement') return config.claimReceiptRequired !== false;
  if (opts.askingFirst) return false;
  const threshold = config.receiptRequiredAboveMinor;
  return threshold !== null && threshold !== undefined && amountMinor > threshold;
}

/**
 * How an expense list describes a pool expense, before "by <name>". A spend someone asked for
 * first isn't paid until it's approved, so it reads "Requested" until then (and if it's rejected).
 */
export function poolExpenseByline(expense: {
  fundingSource?: ExpenseFundingSource;
  poolDraw?: Pick<PoolDrawState, 'status' | 'alreadyIncurred'> | null;
}): string {
  if (expense.fundingSource === 'pool_reimbursement') return 'Claimed from the pool';
  const draw = expense.poolDraw;
  if (draw && draw.alreadyIncurred === false && draw.status !== 'approved') return 'Requested from the pool';
  return 'Paid from the pool';
}

export interface PoolErrorInfo {
  message: string;
  code?: string;
  data?: Partial<PoolRefusalDetails>;
}

/** Normalise anything thrown by the API client into message/code/data. */
export function toPoolError(err: unknown, fallback = 'Something went wrong'): PoolErrorInfo {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; data?: unknown };
    return {
      message: typeof e.message === 'string' && e.message ? e.message : fallback,
      code: typeof e.code === 'string' ? e.code : undefined,
      data: e.data && typeof e.data === 'object' ? (e.data as Partial<PoolRefusalDetails>) : undefined,
    };
  }
  return { message: fallback };
}

/** User-facing text for an error, explaining pool refusals in plain language. */
export function poolErrorText(err: unknown, currency: string, fallback?: string): string {
  const info = toPoolError(err, fallback);
  return info.code?.startsWith('POOL_') ? describePoolRefusal(info, currency) : info.message;
}

// ── Balance meter ─────────────────────────────────────────────────────────

/**
 * Geometry of the three-zone meter. The track spans the pool plus its overdraft
 * allowance; the fill shows how much has been spent, turning amber past the
 * pool mark and red once spending is paused.
 */
export function meterGeometry(o: Pick<PoolOverdraftState, 'baselineMinor' | 'toleranceMinor' | 'balanceMinor' | 'zone'>) {
  const total = o.baselineMinor + o.toleranceMinor;
  if (total <= 0) return { poolMarkPct: 100, spentPoolPct: 0, spentOverdraftPct: 0, total };
  const spent = Math.min(Math.max(o.baselineMinor - o.balanceMinor, 0), total);
  const spentPool = Math.min(spent, o.baselineMinor);
  const spentOver = Math.max(0, spent - o.baselineMinor);
  const pct = (v: number) => Math.round((v / total) * 1000) / 10;
  return { poolMarkPct: pct(o.baselineMinor), spentPoolPct: pct(spentPool), spentOverdraftPct: pct(spentOver), total };
}

/** One-line status for the meter, matching the design's copy for each zone. */
export function meterCaption(o: PoolOverdraftState, currency: string): string {
  if (o.zone === 'blocked') {
    const needed = Math.max(0, o.clearanceThresholdMinor - o.balanceMinor);
    if (o.policy === 'block' || o.toleranceMinor === 0) {
      return o.baselineMinor === 0 ? 'Nothing in the pool yet — add money to start spending' : 'The pool is empty — add money to keep spending';
    }
    return `Pool spending is paused — add more than ${formatMinor(needed, currency)} to resume`;
  }
  if (o.zone === 'overdrawn') {
    return `Overdrawn ${formatMinor(-o.balanceMinor, currency)} · ${formatMinor(o.headroomMinor, currency)} of overdraft headroom left`;
  }
  return `${formatMinor(o.balanceMinor, currency)} left of ${formatMinor(o.baselineMinor, currency)}`;
}

// ── Create-event funding choice ───────────────────────────────────────────

export type FundingKind = 'split' | 'pool';
export type FunderChoice = 'contributors' | 'sponsor';

/** Form state for the create-event funding step (amounts are major-unit text). */
export interface FundingChoice {
  kind: FundingKind;
  funder: FunderChoice;
  preset: PoolPreset;
  perPersonAmount: string;
  targetAmount: string;
  allowPeerExpenses: boolean;
  tolerancePercent: string;
  approval: PoolExpenseApprovalMode;
  approvalThreshold: string;
}

export const DEFAULT_FUNDING_CHOICE: FundingChoice = {
  kind: 'split',
  funder: 'contributors',
  preset: 'trip_kitty',
  perPersonAmount: '',
  targetAmount: '',
  allowPeerExpenses: false,
  tolerancePercent: '20',
  approval: 'none',
  approvalThreshold: '',
};

export const CONTRIBUTOR_PRESETS: PoolPreset[] = ['trip_kitty', 'household', 'club_treasury', 'target_collection'];

/**
 * "Several of us" pools in production. Held back for the first release (only "Just me" budgets);
 * released with Phase 2, as a Pro feature for whoever creates the pool (design doc §12). The API
 * enforces Pro whatever this says; this decides whether production apps offer the option and list
 * group pools among Pro features. Set to false to hide them again.
 */
export const CONTRIBUTOR_POOLS_IN_PRODUCTION = true;

const PRE_PRODUCTION_ENVS = ['local', 'development', 'staging', 'internal'];

/**
 * Whether the create-event form offers "Several of us" in this app environment.
 * A missing or unknown environment counts as production, so the option can't
 * reach production users by accident.
 */
export function contributorPoolsAvailable(appEnv: string | null | undefined): boolean {
  return CONTRIBUTOR_POOLS_IN_PRODUCTION || PRE_PRODUCTION_ENVS.includes(String(appEnv ?? '').toLowerCase());
}

/**
 * "Several of us" is a Pro feature (design doc §12). Pro lists show this entry only where
 * `contributorPoolsAvailable(appEnv)` is true, so Pro never advertises something users can't open.
 */
export const GROUP_POOLS_PRO_FEATURE = {
  title: 'Group pools',
  desc: 'Pool money with your group: trip kitty, shared fund, club treasury or collection.',
} as const;

/** The message for an API `FEATURE_REQUIRES_PRO` refusal, by its `feature` code. */
export function proRequiredMessage(feature?: string | null): string {
  if (feature === 'contributor_pools') return 'Group pools ("Several of us") are a Pro feature.';
  return 'Multi-currency settlement requires Pro.';
}

/** Picking "Pool money": start on "Just me" when it is the only funder on offer. */
export function choosePool(choice: FundingChoice, contributorPools: boolean): FundingChoice {
  return contributorPools
    ? { ...choice, kind: 'pool' }
    : withPreset({ ...choice, kind: 'pool', funder: 'sponsor' }, 'sponsor_budget');
}

/** Switching funder/preset resets the advanced defaults to that preset's. */
export function withPreset(choice: FundingChoice, preset: PoolPreset): FundingChoice {
  const p = POOL_PRESETS[preset];
  return {
    ...choice,
    preset,
    funder: p.funderMode,
    tolerancePercent: String(p.overdraftPolicy === 'graduated' ? p.overdraftTolerancePercent ?? 20 : 0),
    approval: p.expenseApproval,
    allowPeerExpenses: p.funderMode === 'sponsor' ? false : choice.allowPeerExpenses,
  };
}

export function needsTarget(preset: PoolPreset): boolean {
  return preset === 'sponsor_budget' || preset === 'target_collection';
}

function parseAmount(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

/** Returns a user-facing error, or null when the choice can be submitted. */
export function validateFundingChoice(choice: FundingChoice): string | null {
  if (choice.kind === 'split') return null;
  const target = parseAmount(choice.targetAmount);
  const perPerson = parseAmount(choice.perPersonAmount);
  if (needsTarget(choice.preset)) {
    if (target === null || Number.isNaN(target) || target <= 0) {
      return choice.preset === 'sponsor_budget' ? 'Enter the total budget.' : 'Enter the amount to collect.';
    }
  }
  if (perPerson !== null && (Number.isNaN(perPerson) || perPerson < 0)) return 'Enter a valid amount per person.';
  const tol = Number(choice.tolerancePercent);
  if (!Number.isFinite(tol) || tol < 0 || tol > 100) return 'Overdraft allowance must be between 0 and 100%.';
  if (choice.approval === 'above_threshold') {
    const t = parseAmount(choice.approvalThreshold);
    if (t === null || Number.isNaN(t) || t < 0) return 'Enter the amount above which spends need approval.';
  }
  return null;
}

/** The fields to merge into the create-event request. Empty for split events. */
export function buildFundingPayload(choice: FundingChoice, currency: string): { fundingModel?: EventFundingModel; pool?: CreatePoolConfigDto } {
  if (choice.kind === 'split') return {};
  const preset = choice.funder === 'sponsor' ? 'sponsor_budget' : choice.preset;
  const p = POOL_PRESETS[preset];
  const target = parseAmount(choice.targetAmount);
  const perPerson = parseAmount(choice.perPersonAmount);
  const overrides: NonNullable<CreatePoolConfigDto['overrides']> = {};

  if (p.overdraftPolicy === 'graduated') {
    const tol = Number(choice.tolerancePercent);
    if (tol !== p.overdraftTolerancePercent) overrides.overdraftTolerancePercent = tol;
  }
  if (choice.approval !== p.expenseApproval) overrides.expenseApproval = choice.approval;
  if (choice.approval === 'above_threshold') {
    overrides.approvalThresholdMinor = toMinor(parseAmount(choice.approvalThreshold) || 0, currency);
  }

  const allowPeer = preset !== 'sponsor_budget' && choice.allowPeerExpenses;
  return {
    fundingModel: allowPeer ? 'hybrid' : 'pool',
    pool: {
      preset,
      ...(target && target > 0 ? { targetAmountMinor: toMinor(target, currency) } : {}),
      ...(perPerson && perPerson > 0 && preset !== 'sponsor_budget' ? { defaultContributionMinor: toMinor(perPerson, currency) } : {}),
      ...(allowPeer ? { allowPeerExpenses: true } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    },
  };
}
