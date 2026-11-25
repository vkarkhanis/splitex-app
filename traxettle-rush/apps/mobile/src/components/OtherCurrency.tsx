import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatMinor, fxRateText, toMinor } from '@traxettle/shared';
import { api } from '../api';
import { useTheme } from '../context/ThemeContext';
import { fontSizes, radii, spacing } from '../theme';
import { FxRatesAttribution } from './FxRatesAttribution';

/** Currencies offered on the expense form. The event's own currency is always first. */
export const EXPENSE_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'CHF'];

export function currencyOptions(eventCurrency: string, current?: string): string[] {
  const list = [eventCurrency, ...EXPENSE_CURRENCIES.filter((c) => c !== eventCurrency)];
  return current && !list.includes(current) ? [...list, current] : list;
}

export interface FxQuote { from: string; to: string; rate: number; date: string; source: 'predefined' | 'eod'; amount: number }

/**
 * Phase 3: what an amount entered in another currency comes to in the event currency, fetched from
 * the API as the person types (the API converts again when saving).
 */
export function useFxPreview(eventId: string, from: string, eventCurrency: string, amountText: string, skip = false) {
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setQuote(null);
    setError('');
    const amount = parseFloat(amountText);
    if (skip || !eventCurrency || from === eventCurrency || !Number.isFinite(amount) || amount <= 0) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get<FxQuote>(`/api/events/${eventId}/fx-preview?from=${encodeURIComponent(from)}&amount=${amount}`)
        .then((res) => { if (!cancelled) setQuote(res.data || null); })
        .catch((err: any) => { if (!cancelled) setError(err?.message || "Couldn't get the rate."); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eventId, from, eventCurrency, amountText, skip]);
  return { quote, error };
}

/** The amount in the event's minor units, when known: for the receipt rule and the pool projection. */
export function amountInEventMinor(amountText: string, from: string, eventCurrency: string, quote: FxQuote | null): number {
  if (!eventCurrency || from === eventCurrency) {
    const n = parseFloat(amountText);
    return Number.isFinite(n) && n > 0 ? toMinor(n, eventCurrency || from) : 0;
  }
  return quote ? toMinor(quote.amount, eventCurrency) : 0;
}

/** Currency chips, shown only when the event allows another currency. */
export function CurrencyPicker({ value, onChange, eventCurrency }: { value: string; onChange: (c: string) => void; eventCurrency: string }) {
  const { colors } = useTheme().theme;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="currency-picker" style={{ marginBottom: spacing.sm }}>
      {currencyOptions(eventCurrency, value).map((c) => {
        const on = c === value;
        return (
          <TouchableOpacity key={c} testID={`currency-${c}`} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(c)}
            style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.infoBg : colors.surface, borderRadius: radii.md, paddingVertical: 6, paddingHorizontal: 12, marginRight: spacing.xs }}>
            <Text style={{ color: on ? colors.primary : colors.text, fontWeight: on ? '700' : '500', fontSize: fontSizes.sm }}>{c}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** "≈ ₹835.00 at 1 USD = 83.5 INR (today's rate)", or why it can't be converted. */
export function FxPreviewLine({ quote, error }: { quote: FxQuote | null; error: string }) {
  const { colors } = useTheme().theme;
  if (error) return <Text testID="fx-preview-error" style={{ color: colors.error, fontSize: fontSizes.xs, marginBottom: spacing.sm }}>{error}</Text>;
  if (!quote) return null;
  return (
    <View testID="fx-preview" style={{ marginBottom: spacing.sm }}>
      <Text style={{ color: colors.textSecondary, fontSize: fontSizes.xs }}>
        ≈ {formatMinor(toMinor(quote.amount, quote.to), quote.to)} at {fxRateText(quote.from, quote.to, quote.rate)} ({quote.source === 'predefined' ? "the event's set rate" : "today's rate"}). It's recorded in {quote.to}.
      </Text>
      {quote.source === 'eod' && <FxRatesAttribution />}
    </View>
  );
}
