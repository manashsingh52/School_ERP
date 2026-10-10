import { defineConfig } from '@playwright/test';

/**
 * Browser tests for the critical paths (docs/12 "Definition of Done"). `pnpm e2e` from the repo
 * root builds the API and web app, then global-setup starts a throwaway database seeded with the
 * demo school, the API on :4100 and the web app on :3100 — the dev servers on :3000/:4000 are untouched.
 */
export default defineConfig({
  testDir: './tests',
  projects: [
    { name: 'sign-in', testMatch: /auth\.setup\.ts/ },
    { name: 'chrome', testIgnore: /auth\.setup\.ts/, dependencies: ['sign-in'] },
  ],
  globalSetup: './global-setup.ts',
  // One seeded school shared by every test, and some tests change it: run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    // Locally: the installed Google Chrome (no browser download). CI: `playwright install chromium`.
    channel: process.env.CI ? undefined : 'chrome',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
