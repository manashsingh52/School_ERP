import { expect, test } from '@playwright/test';
import { PASSWORD, USERS, school, signIn } from '../fixtures.js';

test('a wrong password is refused with a clear message', async ({ page }) => {
  await page.goto(school('/login'));
  await page.getByLabel('Phone or email').fill(USERS.admin);
  await page.getByLabel('Password', { exact: true }).fill(`${PASSWORD}x`);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('signed-out visitors are sent to sign in, then back where they were going', async ({ page }) => {
  await page.goto(school('/students'));
  await expect(page).toHaveURL(/\/login\?next=%2Fstudents/);
  await page.getByLabel('Phone or email').fill(USERS.admin);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/students$/);
});

test('admin signs in to the dashboard and signs out', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Demo Public School').first()).toBeVisible();
  await page.goto(school('/dashboard'));
  await page.getByRole('button', { name: /account|profile|admin/i }).first().click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('an unknown school address says so', async ({ page }) => {
  await page.goto(school('/login').replace('demo.', 'no-such-school.'));
  await expect(page.getByText(/couldn.t find|not found|doesn.t exist/i).first()).toBeVisible();
});
