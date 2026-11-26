import { defineConfig, devices } from '@playwright/test';

process.env.PLAYWRIGHT_API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3201';

const CI = !!process.env.CI;
/**
 * `PLAYWRIGHT_CHANNEL=chrome` runs the tests in the installed Google Chrome instead of
 * Playwright's own Chromium (useful on a Mac where `npx playwright install` hasn't been run).
 * The regression runner sets it automatically when Playwright's browsers are missing.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: 1,
  // Each test is printed as it runs; the HTML report (`npm run report`) is kept for failures and CI artifacts.
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
  // `npm run dev` rather than `rushx dev`, so CI doesn't need a global Rush.
  webServer: [
    {
      command: 'cd ../apps/api && APP_ENV=local PORT=3201 INTERNAL_TIER_SWITCH_ENABLED=true PAYMENT_ALLOW_REAL_IN_NON_PROD=false npm run dev',
      port: 3201,
      timeout: CI ? 120000 : 30000,
      reuseExistingServer: false,
    },
    {
      command: 'cd ../apps/web && PORT=3200 NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_API_URL=http://localhost:3201 NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true npm run dev',
      port: 3200,
      timeout: CI ? 240000 : 60000,
      reuseExistingServer: false,
    },
  ],
});
