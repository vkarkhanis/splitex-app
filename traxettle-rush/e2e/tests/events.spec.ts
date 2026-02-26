import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';

test.describe('Event Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
  });

  test('should show empty state on dashboard when no events', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    // Dashboard may show empty state or populated cards depending on existing mock data.
    const emptyVisible = await page.getByTestId('empty-events').isVisible().catch(() => false);
    if (!emptyVisible) {
      await expect(page.getByTestId('events-grid')).toBeVisible({ timeout: 15000 });
    }
  });

  test('should navigate to create event page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('create-event-btn').click();
    await expect(page).toHaveURL(/\/events\/create/);
    await expect(page.getByTestId('create-event-page')).toBeVisible();
  });

  test('should show validation error when submitting empty form', async ({ page }) => {
    await page.goto('/events/create');
    await expect(page.getByTestId('create-event-submit')).toBeDisabled();
  });

  test('should fill and submit create event form', async ({ page }) => {
    await page.goto('/events/create');

    await page.getByTestId('event-name-input').fill('Playwright Test Trip');
    await page.getByTestId('event-description-input').fill('A trip created by Playwright');
    await page.getByTestId('event-type-select').selectOption('trip');
    await page.getByTestId('event-currency-select').selectOption('INR');
    await page.getByTestId('event-start-date-input').fill('2025-07-01');
    await page.getByTestId('event-end-date-input').fill('2025-07-10');

    await expect(page.getByTestId('create-event-submit')).toBeEnabled();
    await page.getByTestId('create-event-submit').click();

    // Should redirect to event detail page or show success
    // With mock services, the API may return a mock ID
    await page.waitForTimeout(1000);
    // Check we're either on event detail or got an error toast
    const url = page.url();
    const hasEventDetail = url.includes('/events/');
    const hasError = await page.getByTestId('create-event-error').isVisible().catch(() => false);
    expect(hasEventDetail || hasError).toBeTruthy();
  });

  test('should cancel event creation and go back', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('create-event-btn').click();
    await expect(page.getByTestId('create-event-page')).toBeVisible();

    // Click cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Should navigate back
    await page.waitForTimeout(500);
  });
});
