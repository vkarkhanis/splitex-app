/**
 * Money pooling — platform-agnostic presentation helpers shared by the web and
 * mobile clients: money formatting, user-facing copy for refusals, the receipt
 * rule (mirrors the API), the create-event funding choice, and the balance
 * meter geometry. Keeping these here means both clients always agree.
 */
import { POOL_PRESETS, currencyExponent, fromMinor, toMinor } from './pool';
import type {
  CreatePoolConfigDto,
  EventFundingModel,
  PoolBalanceZone,
  PoolConfig,
  PoolContributionStatus,
  PoolExpenseApprovalMode,
  PoolOverdraftState,
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

/**
 * Explain a refused pool draw in plain language, using the structured details
 * the API returns. Falls back to the raw message.
 */
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

/** Mirrors the server rule: is a receipt mandatory for this pool expense? */
export function isReceiptRequired(
  config: Pick<PoolConfig, 'claimReceiptRequired' | 'receiptRequiredAboveMinor'> | null | undefined,
  fundingSource: 'self' | 'pool' | 'pool_reimbursement',
  amountMinor: number,
): boolean {
  if (!config || fundingSource === 'self') return false;
  if (fundingSource === 'pool_reimbursement') return config.claimReceiptRequired !== false;
  const threshold = config.receiptRequiredAboveMinor;
  return threshold !== null && threshold !== undefined && amountMinor > threshold;
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
