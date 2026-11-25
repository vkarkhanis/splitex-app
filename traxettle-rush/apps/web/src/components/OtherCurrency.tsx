'use client';

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { formatMinor, fxRateText, toMinor } from '@traxettle/shared';
import { api } from '../utils/api';
import { FxRatesAttribution } from './FxRatesAttribution';

/** Currencies offered on the expense form. The event's own currency is always included. */
export const EXPENSE_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'CHF'];

export function currencyOptions(eventCurrency: string): string[] {
  return EXPENSE_CURRENCIES.includes(eventCurrency) ? EXPENSE_CURRENCIES : [eventCurrency, ...EXPENSE_CURRENCIES];
}

export interface FxQuote { from: string; to: string; rate: number; date: string; source: 'predefined' | 'eod'; amount: number }

/**
 * Phase 3: what an amount entered in another currency comes to in the event currency, fetched
 * from the API as the person types (the API converts again when saving).
 */
export function useFxPreview(eventId: string, from: string, eventCurrency: string, amountText: string) {
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setQuote(null);
    setError('');
    const amount = parseFloat(amountText);
    if (!eventCurrency || from === eventCurrency || !Number.isFinite(amount) || amount <= 0) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get<FxQuote>(`/api/events/${eventId}/fx-preview?from=${encodeURIComponent(from)}&amount=${amount}`)
        .then((res) => { if (!cancelled) setQuote(res.data || null); })
        .catch((err: any) => { if (!cancelled) setError(err?.message || "Couldn't get the rate."); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eventId, from, eventCurrency, amountText]);
  /** The amount in the event's minor units, when known: for the receipt rule and the pool projection. */
  const amountMinor = (() => {
    if (from === eventCurrency) { const n = parseFloat(amountText); return Number.isFinite(n) && n > 0 ? toMinor(n, eventCurrency) : 0; }
    return quote ? toMinor(quote.amount, eventCurrency) : 0;
  })();
  return { quote, error, amountMinor };
}

const Line = styled.div<{ $error?: boolean }>`
  font-size: 12px;
  margin-top: -4px;
  margin-bottom: 8px;
  color: ${(p) => (p.$error ? p.theme.colors.error : p.theme.colors.muted)};
`;

/** "≈ ₹835.00 at 1 USD = 83.5 INR (today's rate)", or why it can't be converted. */
export function FxPreviewLine({ quote, error }: { quote: FxQuote | null; error: string }) {
  if (error) return <Line $error data-testid="fx-preview-error">{error}</Line>;
  if (!quote) return null;
  return (
    <Line data-testid="fx-preview">
      ≈ {formatMinor(toMinor(quote.amount, quote.to), quote.to)} at {fxRateText(quote.from, quote.to, quote.rate)}{' '}
      ({quote.source === 'predefined' ? "the event's set rate" : "today's rate"}). It&apos;s recorded in {quote.to}.
      {quote.source === 'eod' && <div><FxRatesAttribution /></div>}
    </Line>
  );
}
