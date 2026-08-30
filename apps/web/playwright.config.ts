import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Some environments ship a pre-installed Chromium at a fixed
        // path instead of the revision `playwright install` would
        // fetch (see CONTRIBUTING.md). Set PLAYWRIGHT_CHROMIUM_PATH to
        // use it; otherwise Playwright resolves its own managed browser
        // as usual.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 5173',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
      },
});
