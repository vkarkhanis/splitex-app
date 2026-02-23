import { Page } from '@playwright/test';

/**
 * Sets up a mock authenticated session by injecting auth tokens into localStorage.
 * This bypasses Firebase auth for E2E testing.
 */
export async function loginAsMockUser(page: Page, userId: string = 'mock-e2e-user') {
  await page.goto('/');
  await page.evaluate((uid) => {
    window.localStorage.setItem('traxettle.authToken', uid);
    window.localStorage.setItem('traxettle.uid', uid);
    window.dispatchEvent(new Event('traxettle:authChange'));
    window.dispatchEvent(new Event('storage'));
  }, userId);
  // Wait for nav to update
  await page.waitForTimeout(500);
}

/**
 * Clears auth state
 */
export async function logout(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('traxettle.authToken');
    window.localStorage.removeItem('traxettle.uid');
    window.dispatchEvent(new Event('traxettle:authChange'));
    window.dispatchEvent(new Event('storage'));
  });
  await page.waitForTimeout(300);
}
