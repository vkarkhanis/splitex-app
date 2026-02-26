import { db } from '../config/firebase';

export interface FxRate {
  from: string;
  to: string;
  rate: number;
  date: string;
  source: 'predefined' | 'eod';
}

/**
 * FX Rate Service — provides currency conversion rates.
 *
 * Supports two modes:
 * 1. Predefined: rates set at event creation time (stored on the Event document)
 * 2. EOD (End of Day): fetched from a free API and cached in Firestore
 *
 * Design considerations for future enhancements:
 * - User-overridden FX rates (debtor proposes, payee approves)
 * - Multiple payment currencies per event
 * - Payment provider routing (Razorpay for INR, Stripe for international)
 */
export class FxRateService {
  private cacheCollection = 'fx_rates_cache';

  /** Free API for EOD rates (exchangerate-api.com free tier, no key required) */
  private readonly EOD_API_BASE = 'https://open.er-api.com/v6/latest';

  /**
   * Get the FX rate for converting from one currency to another.
   * First checks predefined rates, then falls back to EOD rates.
   */
  async getRate(
    from: string,
    to: string,
    predefinedRates?: Record<string, number>,
    mode: 'predefined' | 'eod' = 'eod',
  ): Promise<FxRate> {
    if (from === to) {
      return { from, to, rate: 1, date: new Date().toISOString().split('T')[0], source: mode };
    }

    // Try predefined rates first (if mode is predefined)
    if (mode === 'predefined' && predefinedRates) {
      const key = `${from}_${to}`;
      const reverseKey = `${to}_${from}`;

      if (predefinedRates[key]) {
        return {
          from, to,
          rate: predefinedRates[key],
          date: new Date().toISOString().split('T')[0],
          source: 'predefined',
        };
      }
      if (predefinedRates[reverseKey]) {
        return {
          from, to,
          rate: Math.round((1 / predefinedRates[reverseKey]) * 1e6) / 1e6,
          date: new Date().toISOString().split('T')[0],
          source: 'predefined',
        };
      }

      // Predefined mode but no rate found — fall through to EOD as fallback
    }

    // EOD mode: fetch from API (with Firestore cache)
    return this.getEodRate(from, to);
  }

  /**
   * Fetch EOD rate from free API with daily Firestore cache.
   */
  async getEodRate(from: string, to: string): Promise<FxRate> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${from}_${today}`;

    // Check Firestore cache first
    try {
      const cached = await db.collection(this.cacheCollection).doc(cacheKey).get();
      if (cached.exists) {
        const data = cached.data()!;
        const rates = data.rates as Record<string, number>;
        if (rates && rates[to]) {
          return { from, to, rate: rates[to], date: today, source: 'eod' };
        }
      }
    } catch {
      // Cache miss — proceed to fetch
    }

    // Fetch from API
    try {
      const response = await fetch(`${this.EOD_API_BASE}/${from}`);
      if (!response.ok) {
        throw new Error(`FX API returned ${response.status}`);
      }
      const data = await response.json() as { result?: string; rates?: Record<string, number> };

      if (data.result === 'success' && data.rates) {
        const rates = data.rates;
        // Cache the full rate set for today
        try {
          await db.collection(this.cacheCollection).doc(cacheKey).set({
            base: from,
            rates,
            date: today,
            fetchedAt: new Date().toISOString(),
          });
        } catch {
          // Non-fatal: caching failure shouldn't block the response
        }

        if (rates[to]) {
          return { from, to, rate: rates[to], date: today, source: 'eod' };
        }
        throw new Error(`Currency ${to} not found in FX API response`);
      }
      throw new Error('Invalid FX API response');
    } catch (err: any) {
      // Fallback: try reverse lookup from cache
      try {
        const reverseCacheKey = `${to}_${today}`;
        const reverseCached = await db.collection(this.cacheCollection).doc(reverseCacheKey).get();
        if (reverseCached.exists) {
          const data = reverseCached.data()!;
          const rates = data.rates as Record<string, number>;
          if (rates && rates[from]) {
            return { from, to, rate: Math.round((1 / rates[from]) * 1e6) / 1e6, date: today, source: 'eod' };
          }
        }
      } catch {
        // Ignore reverse cache miss
      }

      throw new Error(`Failed to fetch FX rate ${from}→${to}: ${err.message}`);
    }
  }

  /**
   * Convert an amount from one currency to another using the given rate.
   */
  convert(amount: number, rate: number): number {
    return Math.round(amount * rate * 100) / 100;
  }

  /**
   * Determine which payment provider to use based on settlement currency.
   * Future: Razorpay for INR, Stripe for international.
   */
  getPaymentProvider(settlementCurrency: string): 'razorpay' | 'stripe' {
    return settlementCurrency === 'INR' ? 'razorpay' : 'stripe';
  }
}
