import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, test as base, expect } from '@playwright/test';

export const API_PORT = 4100;
export const WEB_PORT = 3100;
/** Test-only password given to every seeded user in the throwaway database (same value as apps/api/test/helpers.ts). */
export const PASSWORD = 'Test@Pass123';

/** The demo school's web address, or the platform console's. */
export const school = (path = '/') => `http://demo.localhost:${WEB_PORT}${path}`;
export const consoleUrl = (path = '/') => `http://admin.localhost:${WEB_PORT}${path}`;

export const USERS = {
  admin: 'admin@demo.school',
  principal: 'principal@demo.school',
  accountant: 'accountant@demo.school',
  teacher: 'teacher@demo.school',
  parent: 'parent@demo.school',
  superadmin: 'superadmin@schoolos.local',
} as const;

/** Sign in through the real form. */
export async function signIn(page: Page, who: keyof typeof USERS, url = who === 'superadmin' ? consoleUrl('/login') : school('/login')) {
  await page.goto(url);
  await page.getByLabel('Phone or email').fill(USERS[who]);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Saved session of each role, made once per run by tests/auth.setup.ts (the API rate-limits sign-ins). */
export const authFile = (who: keyof typeof USERS) => join(dirname(fileURLToPath(import.meta.url)), '.auth', `${who}.json`);
export const as = (who: keyof typeof USERS) => ({ storageState: authFile(who) });

/** `test.use({ who: 'teacher' })` gives the `page` fixture that role's saved session. */
export const test = base.extend<{ who: keyof typeof USERS | null }>({
  who: [null, { option: true }],
  storageState: async ({ who, storageState }, use) => use(who ? authFile(who) : storageState),
});
export { expect };
