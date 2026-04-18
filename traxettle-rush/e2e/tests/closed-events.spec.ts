import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';

test.describe('Closed Events Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
  });

  test('renders closed events page actions', async ({ page }) => {
    await page.goto('/closed-events');
    await expect(page.getByTestId('closed-events-page')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email last 3 months' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Dashboard' })).toBeVisible();
  });
});
