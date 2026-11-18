import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { apiRequest, createTestEvent, switchTier } from '../helpers/api';

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

    await expect(page.getByText('Multi-currency settlement requires Pro.')).toBeVisible();
    await expect(page.getByTestId('create-event-submit')).toBeDisabled();

    const proSwitch = await switchTier(userId, 'pro');
    expect(proSwitch.status).toBe(200);

    await expect(page.getByTestId('create-event-submit')).toBeEnabled({ timeout: 15000 });
    await page.getByTestId('create-event-submit').click();
    await expect(page).toHaveURL(/\/events\//, { timeout: 15000 });
  });

  // "Several of us" pools need a Pro creator (design doc §12); "Just me" budgets stay free.
  test('only Pro users can create a "Several of us" pool', async () => {
    const userId = 'mock-tier-group-pool-1';
    const kitty = () => apiRequest('POST', '/api/events', {
      name: `Kitty ${Date.now()}`, type: 'trip', startDate: '2026-12-01', currency: 'INR',
      pool: { preset: 'trip_kitty', defaultContributionMinor: 100000 },
    }, userId);

    expect((await switchTier(userId, 'free')).status).toBe(200);
    const refused = await kitty();
    expect(refused.success).toBe(false);
    expect(refused.code).toBe('FEATURE_REQUIRES_PRO');
    expect(refused.feature).toBe('contributor_pools');

    const budget = await apiRequest('POST', '/api/events', {
      name: `Budget ${Date.now()}`, type: 'event', startDate: '2026-12-01', currency: 'INR',
      pool: { preset: 'sponsor_budget', targetAmountMinor: 1000000 },
    }, userId);
    expect(budget.success).toBe(true);

    expect((await switchTier(userId, 'pro')).status).toBe(200);
    const created = await kitty();
    expect(created.success).toBe(true);
    expect(created.data?.fundingModel).toBe('pool');
  });

  test('web create-event page marks "Several of us" as Pro for a free user', async ({ page }) => {
    const userId = 'mock-tier-group-pool-web-1';
    await switchTier(userId, 'free');
    await loginAsMockUser(page, userId);

    await page.goto('/events/create');
    await expect(page.getByTestId('create-event-page')).toBeVisible();
    await page.getByTestId('event-name-input').fill('Group pool tier check');
    await page.getByTestId('event-start-date-input').fill('2026-12-01');
    await page.getByTestId('funding-pool').click();
    await expect(page.getByTestId('funder-contributors-pro')).toBeVisible();
    await page.getByTestId('funder-contributors').click();
    await expect(page.getByTestId('funding-pro-notice')).toContainText('Group pools are a Pro feature');
    await expect(page.getByTestId('create-event-submit')).toBeDisabled();

    // "Just me" stays free.
    await page.getByTestId('funder-sponsor').click();
    await expect(page.getByTestId('funding-pro-notice')).toHaveCount(0);
  });
});
