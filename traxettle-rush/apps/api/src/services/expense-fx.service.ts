import { fromMinor, toMinor } from '@traxettle/shared';
import type { Expense, ExpenseSplit } from '@traxettle/shared';
import { EntitlementService } from './entitlement.service';
import { FxRateService } from './fx-rate.service';

/**
 * Expenses entered in another currency (money pooling Phase 3, proposal §5 and §6).
 *
 * The expense is stored in the event currency (`amount`, `currency`, and split amounts), so every
 * balance, pool rule and settlement keeps working on one currency. What was entered and the rate
 * used are kept beside it. Rates come from the same place as multi-currency settlement: the
 * event's predefined rate if it has one, otherwise today's rate (D7). Allowed when the event's
 * creator has the multi-currency (Pro) capability (D9).
 */

export interface FxStamp {
  originalAmount: number;
  originalCurrency: string;
  fxRate: number;
  fxRateDate: string;
  fxRateSource: 'predefined' | 'eod';
}

export interface ConvertedExpense {
  amount: number;
  currency: string;
  /** Converted split amounts; undefined when none were given. */
  splits?: ExpenseSplit[];
  /** The stamp to store; null clears an earlier one; undefined leaves it as it is. */
  fx: FxStamp | null | undefined;
}

export class ExpenseFxError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

interface EventLike {
  currency: string;
  createdBy?: string;
  fxRateMode?: 'predefined' | 'eod';
  predefinedFxRates?: Record<string, number>;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export class ExpenseFxService {
  constructor(
    private readonly rates = new FxRateService(),
    private readonly entitlements = new EntitlementService(),
  ) {}

  /** Whether the event takes expenses in other currencies: its creator has multi-currency (Pro). */
  async otherCurrencyAllowed(event: Pick<EventLike, 'createdBy'>): Promise<boolean> {
    if (!event.createdBy) return false;
    try {
      const entitlement = await this.entitlements.getEntitlement(event.createdBy);
      return this.entitlements.computeCapabilities(entitlement).multiCurrencySettlement;
    } catch {
      return false;
    }
  }

  /** The rate and the converted amount, for the form's preview and for saving. */
  async quote(event: EventLike, from: string, amount: number): Promise<{ rate: number; date: string; source: 'predefined' | 'eod'; amount: number }> {
    const to = event.currency;
    const currency = normalise(from);
    let info;
    try {
      info = await this.rates.getRate(currency, to, event.predefinedFxRates, event.fxRateMode || 'eod');
    } catch {
      throw new ExpenseFxError(503, `Couldn't get today's ${currency}→${to} rate. Enter the amount in ${to}, or try again later.`, 'FX_RATE_UNAVAILABLE');
    }
    return { rate: info.rate, date: info.date, source: info.source, amount: convertAmount(amount, info.rate, to) };
  }

  /** A new expense: converted if it was entered in another currency. */
  async forCreate(event: EventLike, input: { amount: number; currency: string; splits?: ExpenseSplit[] }): Promise<ConvertedExpense> {
    // An event without a currency (very old data) can't convert anything.
    if (!event.currency) return { amount: input.amount, currency: input.currency, splits: input.splits, fx: undefined };
    const currency = normalise(input.currency);
    if (currency === event.currency) return { amount: input.amount, currency, splits: input.splits, fx: undefined };
    await this.assertAllowed(event);
    const q = await this.quote(event, currency, input.amount);
    return {
      amount: q.amount,
      currency: event.currency,
      splits: input.splits && convertSplits(input.splits, input.amount, q.amount, q.rate, event.currency),
      fx: { originalAmount: input.amount, originalCurrency: currency, fxRate: q.rate, fxRateDate: q.date, fxRateSource: q.source },
    };
  }

  /**
   * An edit. The form shows what was entered, so `amount` and `currency` are entered values.
   * Changing only the amount keeps the stored rate (D11); a new currency gets a new rate. An
   * expense saved in another currency before Phase 3 is left alone unless its money changes.
   * Returns null when nothing about the money changed.
   */
  async forUpdate(
    event: EventLike,
    existing: Pick<Expense, 'amount' | 'currency' | 'originalAmount' | 'originalCurrency' | 'fxRate' | 'fxRateDate' | 'fxRateSource'>,
    dto: { amount?: number; currency?: string; splits?: ExpenseSplit[] },
  ): Promise<ConvertedExpense | null> {
    if (!event.currency) return null;
    const enteredAmount = existing.originalAmount ?? existing.amount;
    const enteredCurrency = existing.originalCurrency ?? existing.currency;
    const amount = dto.amount ?? enteredAmount;
    const currency = dto.currency !== undefined ? normalise(dto.currency) : enteredCurrency;
    const moneyChanged = amount !== enteredAmount || currency !== enteredCurrency;

    if (currency === event.currency) {
      if (!moneyChanged && !dto.splits) return null;
      return { amount, currency, splits: dto.splits, fx: existing.originalCurrency ? null : undefined };
    }

    const stamped = Boolean(existing.originalCurrency && existing.fxRate);
    if (!stamped && !moneyChanged) {
      // Saved in another currency before Phase 3: keep it as it was.
      return dto.splits ? { amount: existing.amount, currency: existing.currency, splits: dto.splits, fx: undefined } : null;
    }
    if (!moneyChanged && !dto.splits) return null;

    // Same currency as before: the stored rate (works even if the creator's Pro has lapsed).
    if (stamped && currency === existing.originalCurrency) {
      const rate = existing.fxRate!;
      const converted = convertAmount(amount, rate, event.currency);
      return {
        amount: converted,
        currency: event.currency,
        splits: dto.splits && convertSplits(dto.splits, amount, converted, rate, event.currency),
        fx: moneyChanged
          ? { originalAmount: amount, originalCurrency: currency, fxRate: rate, fxRateDate: existing.fxRateDate!, fxRateSource: existing.fxRateSource || 'eod' }
          : undefined,
      };
    }

    // A different currency: a fresh rate.
    return this.forCreate(event, { amount, currency, splits: dto.splits });
  }

  private async assertAllowed(event: EventLike): Promise<void> {
    if (await this.otherCurrencyAllowed(event)) return;
    throw new ExpenseFxError(403, `Expenses in another currency need the organiser to have Pro. Enter the amount in ${event.currency}.`, 'OTHER_CURRENCY_NOT_ALLOWED');
  }
}

function normalise(code: string): string {
  const c = String(code || '').trim().toUpperCase();
  if (!CURRENCY_CODE.test(c)) throw new ExpenseFxError(400, `"${code}" isn't a currency code`, 'CURRENCY_INVALID');
  return c;
}

/** `amount` × `rate`, rounded to the target currency's smallest unit (whole yen, paise…). */
export function convertAmount(amount: number, rate: number, to: string): number {
  return fromMinor(toMinor(amount * rate, to), to);
}

/**
 * Converts each split at the same rate. When the entered splits add up to the entered amount, the
 * rounding remainder goes on the largest split so they still add up after conversion.
 */
export function convertSplits(splits: ExpenseSplit[], enteredAmount: number, convertedAmount: number, rate: number, to: string): ExpenseSplit[] {
  const out = splits.map((s) => ({ ...s, amount: convertAmount(s.amount, rate, to) }));
  const enteredTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  if (out.length > 0 && Math.abs(enteredTotal - enteredAmount) <= 0.01) {
    const diffMinor = toMinor(convertedAmount, to) - out.reduce((sum, s) => sum + toMinor(s.amount, to), 0);
    if (diffMinor !== 0) {
      let largest = 0;
      out.forEach((s, i) => { if (s.amount > out[largest].amount) largest = i; });
      out[largest] = { ...out[largest], amount: fromMinor(toMinor(out[largest].amount, to) + diffMinor, to) };
    }
  }
  return out;
}
