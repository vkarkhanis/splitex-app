import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'cd ../apps/api && APP_ENV=local INTERNAL_TIER_SWITCH_ENABLED=true PAYMENT_ALLOW_REAL_IN_NON_PROD=false rushx dev',
      port: 3001,
      timeout: 30000,
      reuseExistingServer: false,
    },
    {
      command: 'cd ../apps/web && NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true rushx dev',
      port: 3000,
      timeout: 60000,
      reuseExistingServer: false,
    },
  ],
});
