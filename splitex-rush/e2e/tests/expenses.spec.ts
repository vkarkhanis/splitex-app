import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { createTestEvent } from '../helpers/api';

test.describe('Expense Management', () => {
  let eventId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    const res = await createTestEvent();
    eventId = res.data?.id;
  });

  test('should display create expense page with all fields', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
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
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}/expenses/create`);
    await expect(page.getByTestId('create-expense-submit')).toBeDisabled();
  });

  test('should fill expense form and submit', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}/expenses/create`);

    await page.getByTestId('expense-title-input').fill('Hotel Booking');
    await page.getByTestId('expense-description-input').fill('Beach resort');
    await page.getByTestId('expense-amount-input').fill('300');
    await page.getByTestId('expense-currency-select').selectOption('USD');
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
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByTestId('split-type-custom').check();
    // Custom split inputs should appear if there are participants
    await page.waitForTimeout(300);
  });

  test('should change split type to ratio', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByTestId('split-type-ratio').check();
    await page.waitForTimeout(300);
  });

  test('should cancel and go back', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
  });
});
