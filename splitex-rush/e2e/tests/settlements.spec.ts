import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import {
  addParticipantToEvent,
  approveSettlement,
  createSplitExpense,
  createTestEvent,
  generateSettlement,
  getEventSettlements,
  paySettlement,
  retrySettlement,
} from '../helpers/api';

test.describe('Settlement Flows (Mock Payments Only)', () => {
  test('same-currency settlement: generate, pay and approve via mocked flow', async ({ page }) => {
    const adminToken = 'mock-settle-admin-1';
    const payerToken = 'mock-settle-payer-1';

    const eventRes = await createTestEvent(adminToken, { currency: 'USD' });
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'Failed to create event');
      return;
    }

    await addParticipantToEvent(eventId, payerToken, adminToken);

    await createSplitExpense(
      eventId,
      adminToken,
      [
        { entityType: 'user', entityId: adminToken, amount: 50 },
        { entityType: 'user', entityId: payerToken, amount: 50 },
      ],
      100,
      'USD'
    );

    await loginAsMockUser(page, adminToken);
    await page.goto(`/events/${eventId}`);
    const generated = await generateSettlement(eventId, adminToken);
    expect(generated.success).toBe(true);
    await page.reload();

    await expect(page.getByTestId('settlement-section')).toBeVisible({ timeout: 8000 });

    const settlementsRes = await getEventSettlements(eventId, adminToken);
    expect(settlementsRes.success).toBe(true);
    expect(settlementsRes.data.length).toBeGreaterThan(0);

    const settlementId = settlementsRes.data[0].id;

    const payRes = await paySettlement(settlementId, payerToken, false);
    expect(payRes.success).toBe(true);
    expect(payRes.data.paymentMethod).toBe('mock');

    const approveRes = await approveSettlement(settlementId, adminToken);
    expect(approveRes.success).toBe(true);

    await page.reload();
    await expect(page.getByTestId(`settlement-txn-${settlementId}`)).toContainText('Payment confirmed', { timeout: 8000 });
  });

  test('multi-currency settlement with predefined FX uses conversion data and mocked provider', async () => {
    const adminToken = 'mock-settle-admin-2';
    const payerToken = 'mock-settle-payer-2';

    const eventRes = await createTestEvent(adminToken, {
      currency: 'USD',
      settlementCurrency: 'INR',
      fxRateMode: 'predefined',
      predefinedFxRates: { USD_INR: 82.5 },
    });
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'Failed to create event');
      return;
    }

    await addParticipantToEvent(eventId, payerToken, adminToken);

    await createSplitExpense(
      eventId,
      adminToken,
      [
        { entityType: 'user', entityId: adminToken, amount: 60 },
        { entityType: 'user', entityId: payerToken, amount: 60 },
      ],
      120,
      'USD'
    );

    const generated = await generateSettlement(eventId, adminToken);
    expect(generated.success).toBe(true);
    expect(generated.data.settlements.length).toBeGreaterThan(0);

    const settlement = generated.data.settlements[0];
    expect(settlement.settlementCurrency).toBe('INR');
    expect(settlement.fxRate).toBe(82.5);
    expect(settlement.settlementAmount).toBeGreaterThan(0);

    const payRes = await paySettlement(settlement.id, payerToken, false);
    expect(payRes.success).toBe(true);
    expect(payRes.data.status).toBe('initiated');
    expect(payRes.data.paymentMethod).toBe('mock');

    const approveRes = await approveSettlement(settlement.id, adminToken);
    expect(approveRes.success).toBe(true);
    expect(approveRes.data.settlement.status).toBe('completed');
  });

  test('payer can retry an initiated settlement payment', async () => {
    const adminToken = 'mock-settle-admin-retry-1';
    const payerToken = 'mock-settle-payer-retry-1';

    const eventRes = await createTestEvent(adminToken, { currency: 'USD' });
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'Failed to create event (likely infra/quota constraint)');
      return;
    }

    await addParticipantToEvent(eventId, payerToken, adminToken);
    await createSplitExpense(
      eventId,
      adminToken,
      [
        { entityType: 'user', entityId: adminToken, amount: 80 },
        { entityType: 'user', entityId: payerToken, amount: 80 },
      ],
      160,
      'USD'
    );

    const generated = await generateSettlement(eventId, adminToken);
    expect(generated.success).toBe(true);
    expect(generated.data.settlements.length).toBeGreaterThan(0);

    const settlementId = generated.data.settlements[0].id;

    const payRes = await paySettlement(settlementId, payerToken, false);
    expect(payRes.success).toBe(true);
    expect(payRes.data.status).toBe('initiated');

    const retryRes = await retrySettlement(settlementId, payerToken, false);
    expect(retryRes.success).toBe(true);
    expect(retryRes.data.status).toBe('initiated');
    expect(retryRes.data.paymentMethod).toBe('mock');
    expect((retryRes.data.retryCount ?? 0)).toBeGreaterThanOrEqual(1);

    const settlementsRes = await getEventSettlements(eventId, adminToken);
    expect(settlementsRes.success).toBe(true);
    const updated = (settlementsRes.data || []).find((s: any) => s.id === settlementId);
    expect(updated).toBeTruthy();
    expect(updated.status).toBe('initiated');
    expect((updated.retryCount ?? 0)).toBeGreaterThanOrEqual(1);

    const approveRes = await approveSettlement(settlementId, adminToken);
    expect(approveRes.success).toBe(true);
    expect(approveRes.data.settlement.status).toBe('completed');
  });
});
