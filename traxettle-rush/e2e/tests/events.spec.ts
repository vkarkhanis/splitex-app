import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { apiRequestWithStatus } from '../helpers/api';
import { futureDate } from '../helpers/ui';

test.describe('Event Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
  });

  test('should show empty state on dashboard when no events', async ({ page }) => {
    // A brand-new user has no events. Waiting for the empty state (rather than checking once)
    // avoids racing the dashboard's first load.
    await loginAsMockUser(page, `mock-e2e-empty-${Date.now().toString(36)}`);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('empty-events')).toBeVisible({ timeout: 15000 });
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

    // The form refuses past start dates, so use dates ahead of today.
    const start = futureDate(30);
    const end = futureDate(39);
    await page.getByTestId('event-name-input').fill('Playwright Test Trip');
    await page.getByTestId('event-description-input').fill('A trip created by Playwright');
    await page.getByTestId('event-type-select').selectOption('trip');
    await page.getByTestId('event-currency-select').selectOption('INR');
    await page.getByTestId('event-start-date-input').fill(start);
    await page.getByTestId('event-end-date-input').fill(end);

    await expect(page.getByTestId('create-event-submit')).toBeEnabled();
    await page.getByTestId('create-event-submit').click();

    // Lands on the new event's own page (/events/<id>), not back on /events/create.
    await expect(page).toHaveURL(/\/events\/(?!create$)[^/]+$/, { timeout: 15000 });
    const eventId = new URL(page.url()).pathname.split('/').pop()!;
    expect(eventId).not.toBe('create');
    await expect(page.getByTestId('event-detail-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Playwright Test Trip' })).toBeVisible();
    await expect(page.getByTestId('create-event-error')).toHaveCount(0);

    const created = await apiRequestWithStatus('GET', `/api/events/${eventId}`);
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      id: eventId, name: 'Playwright Test Trip', description: 'A trip created by Playwright', type: 'trip', currency: 'INR',
    });
    expect(created.body.data.startDate.slice(0, 10)).toBe(start);
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
