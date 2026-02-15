import { test, expect } from '@playwright/test';
import { loginAsMockUser, logout } from '../helpers/auth';

test.describe('Navigation', () => {
  test('should show sign in and register links when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="/auth/login"]').first()).toBeVisible();
    await expect(page.locator('a[href="/auth/register"]').first()).toBeVisible();
  });

  test('should show dashboard, invitations, profile links when authenticated', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/');
    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-invitations')).toBeVisible();
    await expect(page.getByTestId('nav-profile')).toBeVisible();
    await expect(page.getByTestId('nav-signout')).toBeVisible();
  });

  test('should navigate to dashboard when clicking Dashboard link', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/');
    await page.getByTestId('nav-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('should navigate to invitations page', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/');
    await page.getByTestId('nav-invitations').click();
    await expect(page).toHaveURL(/\/invitations/);
    await expect(page.getByTestId('invitations-page')).toBeVisible();
  });

  test('should sign out and show unauthenticated nav', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/');
    await expect(page.getByTestId('nav-signout')).toBeVisible();
    await logout(page);
    await page.goto('/');
    await expect(page.locator('a[href="/auth/login"]').first()).toBeVisible();
  });
});
