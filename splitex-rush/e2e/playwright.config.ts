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
      command: 'cd ../apps/api && npx ts-node src/index.ts',
      port: 3001,
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd ../apps/web && npm run dev',
      port: 3000,
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
