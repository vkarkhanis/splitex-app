import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { createTestEvent, switchTier } from '../helpers/api';

test.describe('Tier entitlements', () => {
  test('local tier switch API toggles FX capability for event creation', async () => {
    const userId = 'mock-tier-api-1';

    const freeSwitch = await switchTier(userId, 'free');
    expect(freeSwitch.status).toBe(200);

    const freeFx = await createTestEvent(userId, {
      currency: 'USD',
      settlementCurrency: 'INR',
      fxRateMode: 'predefined',
      predefinedFxRates: { USD_INR: 82.5 },
    });

    expect(freeFx.success).toBe(false);
    expect(freeFx.code).toBe('FEATURE_REQUIRES_PRO');
    expect(freeFx.feature).toBe('multi_currency_settlement');

    const proSwitch = await switchTier(userId, 'pro');
    expect(proSwitch.status).toBe(200);

    const proFx = await createTestEvent(userId, {
      currency: 'USD',
      settlementCurrency: 'INR',
      fxRateMode: 'predefined',
      predefinedFxRates: { USD_INR: 82.5 },
    });

    expect(proFx.success).toBe(true);
    expect(proFx.data?.id).toBeTruthy();
  });

  test('web create-event page updates after tier change broadcast', async ({ page }) => {
    const userId = 'mock-tier-web-live-1';

    await switchTier(userId, 'free');
    await loginAsMockUser(page, userId);

    await page.goto('/events/create');
    await expect(page.getByTestId('create-event-page')).toBeVisible();

    await page.getByTestId('event-name-input').fill('Tier Broadcast Event');
    await page.getByTestId('event-type-select').selectOption('event');
    await page.getByTestId('event-currency-select').selectOption('USD');
    await page.getByTestId('settlement-currency-select').selectOption('INR');
    await page.getByTestId('event-start-date-input').fill('2026-03-01');
    await page.getByTestId('fx-mode-predefined').check();
    await page.getByTestId('predefined-fx-rate-input').fill('82.5');

    await page.getByTestId('create-event-submit').click();
    await expect(page.getByTestId('create-event-error')).toContainText('requires Pro', { timeout: 10000 });

    const proSwitch = await switchTier(userId, 'pro');
    expect(proSwitch.status).toBe(200);

    await page.getByTestId('create-event-submit').click();
    await expect(page).toHaveURL(/\/events\//, { timeout: 15000 });
  });
});
