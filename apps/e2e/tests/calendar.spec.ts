import { as, expect, school, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'admin' });

  test('the office adds a holiday; parents see it with the exams on their calendar', async ({ page, browser }) => {
    await page.goto(school('/calendar'));
    await page.getByRole('button', { name: 'Add to calendar' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Founders Day');
    await dialog.getByLabel('Type').selectOption({ label: 'Holiday' });
    const d = new Date(Date.now() + 3 * 86_400_000);
    await dialog.getByLabel('From').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/Added — everyone it concerns has been told/)).toBeVisible();

    const parentSession = await browser.newContext(as('parent'));
    const parent = await parentSession.newPage();
    await parent.goto(school('/calendar'));
    await expect(parent.getByRole('listitem').filter({ hasText: 'Founders Day' }).first()).toBeVisible();
    await expect(parent.getByRole('listitem').filter({ hasText: 'Unit Test 3' }).first()).toBeVisible(); // an exam still to come
    await parentSession.close();
  });
});
