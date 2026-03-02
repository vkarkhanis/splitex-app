'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
  Field,
  Input,
  Label,
  Select,
  TextArea,
  useToast,
} from '@traxettle/ui';
import { api } from '../../../utils/api';
import { useEffect } from 'react';

const Page = styled.div`
  width: 100%;
  max-width: 640px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const Buttons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 6px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

const FxSection = styled.div`
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FxSectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.muted};
`;

const FxInfo = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.info};
  background: ${(p) => p.theme.colors.infoBg};
  padding: 8px 12px;
  border-radius: 6px;
  line-height: 1.5;
`;

const RadioGroup = styled.div`
  display: flex;
  gap: 16px;
  padding: 4px 0;
`;

const RadioLabel = styled.label<{ $checked?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1.5px solid ${(p) => p.$checked ? p.theme.colors.primary : p.theme.colors.border};
  background: ${(p) => p.$checked ? p.theme.colors.primary + '10' : 'transparent'};
  transition: all 0.15s;
  &:hover { border-color: ${(p) => p.theme.colors.primary}; }
`;

type ProfileCaps = { multiCurrencySettlement: boolean };
type ProfileData = {
  tier: 'free' | 'pro';
  capabilities?: ProfileCaps;
};

export default function CreateEventPage() {
  const { push: pushToast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'event' as 'trip' | 'event',
    startDate: '',
    endDate: '',
    currency: 'USD',
    settlementCurrency: '',
    fxRateMode: 'eod' as 'predefined' | 'eod',
    predefinedFxRate: '',
  });

  const needsFx = form.settlementCurrency && form.settlementCurrency !== form.currency;
  const canUseFx = Boolean(profile?.capabilities?.multiCurrencySettlement || profile?.tier === 'pro');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get<ProfileData>('/api/users/profile');
        setProfile(res.data || null);
      } catch {
        // best-effort
      }
    };
    void loadProfile();
    const onTierUpdate = () => { void loadProfile(); };
    window.addEventListener('traxettle:tierUpdated', onTierUpdate);
    return () => window.removeEventListener('traxettle:tierUpdated', onTierUpdate);
  }, []);

  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.currency.trim()) {
      setError('Name, start date, and currency are required.');
      return;
    }
    if (needsFx && !canUseFx) {
      setError('Multi-currency settlement requires Pro.');
      return;
    }
    if (needsFx && form.fxRateMode === 'predefined') {
      const parsed = Number(form.predefinedFxRate);
      if (!form.predefinedFxRate || !Number.isFinite(parsed) || parsed <= 0) {
        const msg = `Enter a valid predefined FX rate for ${form.currency} → ${form.settlementCurrency}.`;
        setError(msg);
        pushToast({ type: 'error', title: 'Invalid FX Rate', message: msg });
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        description: form.description.trim(),
        type: form.type,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        currency: form.currency.trim(),
      };

      // Multi-currency settlement
      if (needsFx) {
        payload.settlementCurrency = form.settlementCurrency;
        payload.fxRateMode = form.fxRateMode;
        if (form.fxRateMode === 'predefined' && form.predefinedFxRate) {
          const key = `${form.currency}_${form.settlementCurrency}`;
          payload.predefinedFxRates = { [key]: parseFloat(form.predefinedFxRate) };
        }
      }

      const res = await api.post('/api/events', payload);

      pushToast({ type: 'success', title: 'Event Created', message: `"${form.name}" has been created.` });
      router.push(`/events/${res.data.id}`);
    } catch (err: any) {
      if (String(err?.message || '').includes('FEATURE_REQUIRES_PRO') || String(err?.message || '').includes('requires Pro')) {
        setError('Multi-currency settlement requires Pro.');
        pushToast({ type: 'error', title: 'Pro Feature', message: 'Upgrade to Pro to use multi-currency settlement.' });
        return;
      }
      setError(err.message || 'Failed to create event');
      pushToast({ type: 'error', title: 'Error', message: err.message || 'Failed to create event' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page data-testid="create-event-page">
      <Card>
        <CardHeader>
          <CardTitle>Create Event</CardTitle>
          <CardSubtitle>Set up a new event or trip to start splitting expenses.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <Form onSubmit={handleSubmit} data-testid="create-event-form">
            <Field>
              <Label htmlFor="event-name">Event Name</Label>
              <Input
                id="event-name"
                data-testid="event-name-input"
                placeholder="e.g. Goa Trip 2025"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                disabled={loading}
                $hasError={Boolean(error) && !form.name}
              />
            </Field>

            <Field>
              <Label htmlFor="event-description">Description (optional)</Label>
              <TextArea
                id="event-description"
                data-testid="event-description-input"
                placeholder="Brief description of the event..."
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                disabled={loading}
              />
            </Field>

            <Row>
              <Field>
                <Label htmlFor="event-type">Type</Label>
                <Select
                  id="event-type"
                  data-testid="event-type-select"
                  value={form.type}
                  onChange={(e) => updateForm({ type: e.target.value as 'trip' | 'event' })}
                  disabled={loading}
                >
                  <option value="event">Event</option>
                  <option value="trip">Trip</option>
                </Select>
              </Field>

              <Field>
                <Label htmlFor="event-currency">Currency</Label>
                <Select
                  id="event-currency"
                  data-testid="event-currency-select"
                  value={form.currency}
                  onChange={(e) => updateForm({ currency: e.target.value })}
                  disabled={loading}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                  <option value="JPY">JPY</option>
                  <option value="AUD">AUD</option>
                  <option value="CAD">CAD</option>
                </Select>
              </Field>
            </Row>

            <Row>
              <Field>
                <Label htmlFor="event-start-date">Start Date</Label>
                <Input
                  id="event-start-date"
                  data-testid="event-start-date-input"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={form.startDate}
                  onChange={(e) => updateForm({ startDate: e.target.value })}
                  disabled={loading}
                  $hasError={Boolean(error) && !form.startDate}
                />
              </Field>

              <Field>
                <Label htmlFor="event-end-date">End Date (optional)</Label>
                <Input
                  id="event-end-date"
                  data-testid="event-end-date-input"
                  type="date"
                  min={form.startDate || new Date().toISOString().split('T')[0]}
                  value={form.endDate}
                  onChange={(e) => updateForm({ endDate: e.target.value })}
                  disabled={loading}
                />
              </Field>
            </Row>

            {/* Settlement Currency (optional — different from expense currency) */}
            <Row>
              <Field>
                <Label htmlFor="settlement-currency">Settlement Currency (optional)</Label>
                {!canUseFx && <ErrorText>PRO feature</ErrorText>}
                <Select
                  id="settlement-currency"
                  data-testid="settlement-currency-select"
                  value={form.settlementCurrency}
                  onChange={(e) => updateForm({ settlementCurrency: e.target.value })}
                  disabled={loading}
                >
                  <option value="">Same as expense currency</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                  <option value="JPY">JPY</option>
                  <option value="AUD">AUD</option>
                  <option value="CAD">CAD</option>
                </Select>
              </Field>
            </Row>

            {/* FX Rate Settings — only shown when settlement currency differs */}
            {needsFx && (
              <FxSection>
                <FxSectionTitle>FX Rate Settings ({form.currency} → {form.settlementCurrency})</FxSectionTitle>
                <FxInfo>
                  Expenses will be recorded in {form.currency} but settlements will happen in {form.settlementCurrency}.
                  Choose how the conversion rate is determined.
                </FxInfo>
                {!canUseFx && (
                  <ErrorText>Multi-currency settlement requires Pro.</ErrorText>
                )}
                <Field>
                  <Label>FX Rate Mode</Label>
                  <RadioGroup>
                    <RadioLabel $checked={form.fxRateMode === 'eod'}>
                      <input
                        type="radio"
                        name="fxRateMode"
                        value="eod"
                        checked={form.fxRateMode === 'eod'}
                        onChange={() => updateForm({ fxRateMode: 'eod' })}
                        disabled={loading}
                        data-testid="fx-mode-eod"
                      />
                      EOD Rate (latest available at settlement time)
                    </RadioLabel>
                    <RadioLabel $checked={form.fxRateMode === 'predefined'}>
                      <input
                        type="radio"
                        name="fxRateMode"
                        value="predefined"
                        checked={form.fxRateMode === 'predefined'}
                        onChange={() => updateForm({ fxRateMode: 'predefined' })}
                        disabled={loading}
                        data-testid="fx-mode-predefined"
                      />
                      Predefined Rate
                    </RadioLabel>
                  </RadioGroup>
                </Field>
                {form.fxRateMode === 'predefined' && (
                  <Field>
                    <Label htmlFor="predefined-fx-rate">1 {form.currency} = ? {form.settlementCurrency}</Label>
                    <Input
                      id="predefined-fx-rate"
                      data-testid="predefined-fx-rate-input"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      placeholder={`e.g. ${form.currency === 'USD' && form.settlementCurrency === 'INR' ? '83.50' : '1.00'}`}
                      value={form.predefinedFxRate}
                      onChange={(e) => updateForm({ predefinedFxRate: e.target.value })}
                      disabled={loading}
                    />
                  </Field>
                )}
              </FxSection>
            )}

            {error && <ErrorText data-testid="create-event-error">{error}</ErrorText>}

            <Buttons>
              <Button
                type="button"
                $variant="outline"
                onClick={() => router.back()}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                $variant="primary"
                disabled={loading || !form.name.trim() || !form.startDate}
                data-testid="create-event-submit"
              >
                {loading ? 'Creating...' : 'Create Event'}
              </Button>
            </Buttons>
          </Form>
        </CardBody>
      </Card>
    </Page>
  );
}
