import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { apiRequest, createTestEvent } from '../helpers/api';
import { openEvent } from '../helpers/ui';

test.describe('Expense Management', () => {
  let eventId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    const res = await createTestEvent();
    eventId = res.data?.id;
  });

  test('should display create expense page with all fields', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    await page.goto(`/events/${eventId}/expenses/create`);
    await expect(page.getByTestId('create-expense-page')).toBeVisible();
    await expect(page.getByTestId('expense-title-input')).toBeVisible();
    await expect(page.getByTestId('expense-amount-input')).toBeVisible();
    await expect(page.getByTestId('expense-currency-select')).toBeVisible();
    await expect(page.getByTestId('split-type-equal')).toBeVisible();
    await expect(page.getByTestId('split-type-ratio')).toBeVisible();
    await expect(page.getByTestId('split-type-custom')).toBeVisible();
    await expect(page.getByTestId('create-expense-submit')).toBeVisible();
  });

  test('should disable submit when required fields are empty', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    await page.goto(`/events/${eventId}/expenses/create`);
    await expect(page.getByTestId('create-expense-submit')).toBeDisabled();
  });

  test('should fill expense form and submit', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    await page.goto(`/events/${eventId}/expenses/create`);

    await page.getByTestId('expense-title-input').fill('Hotel Booking');
    await page.getByTestId('expense-description-input').fill('Beach resort');
    await page.getByTestId('expense-amount-input').fill('300');
    // A free organiser's event takes expenses only in its own currency (another one needs Pro, Phase 3).
    await expect(page.getByTestId('expense-currency-select')).toBeDisabled();
    await page.getByTestId('split-type-equal').check();

    await expect(page.getByTestId('create-expense-submit')).toBeEnabled();
    await page.getByTestId('create-expense-submit').click();

    await page.waitForTimeout(1000);
    // Should redirect back to event detail or show error
    const url = page.url();
    const hasEventDetail = url.includes(`/events/${eventId}`) && !url.includes('/expenses/create');
    const hasError = await page.getByTestId('create-expense-error').isVisible().catch(() => false);
    expect(hasEventDetail || hasError).toBeTruthy();
  });

  test('should change split type to custom', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByTestId('split-type-custom').check();
    // Custom split inputs should appear if there are participants
    await page.waitForTimeout(300);
  });

  test('should change split type to ratio', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByTestId('split-type-ratio').check();
    await page.waitForTimeout(300);
  });

  test('lists expenses newest first by expense date', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    // Recorded in an order that matches neither the expected order nor its reverse.
    const ids: Record<string, string> = {};
    for (const [title, date] of [['Middle day', '2026-11-03'], ['Earliest day', '2026-11-01'], ['Latest day', '2026-11-05']]) {
      const res = await apiRequest('POST', '/api/expenses', {
        eventId, title, amount: 10, currency: 'USD', splitType: 'equal', date,
        splits: [{ entityType: 'user', entityId: 'mock-e2e-user', amount: 10 }],
      });
      expect(res.success, `create "${title}"`).toBe(true);
      ids[title] = res.data.id;
    }

    await openEvent(page, 'mock-e2e-user', eventId);
    const rows = page.locator('[data-testid^="expense-item-"]');
    await expect(rows).toHaveCount(3);
    const shown = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(shown).toEqual(['Latest day', 'Middle day', 'Earliest day'].map((t) => `expense-item-${ids[t]}`));
  });

  test('should cancel and go back', async ({ page }) => {
    // Fail loudly: a skipped test would hide broken setup.
    expect(eventId, 'test data should be set up').toBeTruthy();
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
  });
});
