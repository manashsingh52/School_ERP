import { school, expect, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'admin' });
  test('admin admits a student with a parent and finds them in the list', async ({ page }) => {
    await page.goto(school('/students/new'));
    await page.getByLabel('First name').fill('Meher');
    await page.getByLabel('Last name').fill('Testwala');
    await page.getByLabel('Admission number').fill('E2E-001');
    const section = page.getByLabel('Class & section');
    const label = await section.locator('option').filter({ hasText: /8.*A/ }).first().textContent();
    await section.selectOption({ label: label! });
    await page.getByLabel('Name', { exact: true }).fill('Gurpreet Testwala');
    await page.getByRole('textbox', { name: 'Mobile', exact: true }).fill('9876500011');
    await page.getByRole('button', { name: 'Add student' }).click();

    await expect(page.getByText(/Meher added to 8-A/)).toBeVisible();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: /Meher Testwala/ })).toBeVisible();

    await page.goto(school('/students'));
    await page.getByRole('textbox', { name: 'Search students' }).fill('E2E-001');
    await expect(page.getByRole('row', { name: /Meher Testwala/ })).toBeVisible();
  });
});

test.describe(() => {
  test.use({ who: 'admin' });
  test('the same admission number can’t be used twice', async ({ page }) => {
    await page.goto(school('/students/new'));
    await page.getByLabel('First name').fill('Second');
    await page.getByLabel('Admission number').fill('E2E-001');
    const section = page.getByLabel('Class & section');
    const label = await section.locator('option').filter({ hasText: /8.*A/ }).first().textContent();
    await section.selectOption({ label: label! });
    await page.getByRole('button', { name: 'Remove parent' }).click();
    await page.getByRole('button', { name: 'Add student' }).click();
    const field = page.getByLabel('Admission number');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused(); // the form jumps back up to it
    await expect(page.getByRole('alert').filter({ hasText: 'Already in use' })).toBeInViewport();
    await expect(page).toHaveURL(/\/students\/new$/);
  });
});
