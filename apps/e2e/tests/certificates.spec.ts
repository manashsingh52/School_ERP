import { as, expect, school, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'admin' });

  test('the office awards Rahul a certificate; his parent finds it under Achievements', async ({ page, browser }) => {
    // Two students in 8-A are called Rahul Kumar; the parent's child is admission no. 1501.
    await page.goto(school('/students'));
    await page.getByRole('textbox', { name: 'Search students' }).fill('1501');
    await page.getByRole('row', { name: /Rahul Kumar/ }).click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await page.getByRole('tab', { name: 'Achievements' }).click();
    await page.getByRole('button', { name: 'Issue certificate' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Achievement/ }).click();
    await dialog.getByLabel('Competition or event').fill('Inter-school Chess Championship');
    await dialog.getByRole('button', { name: 'Winner' }).click();
    await dialog.getByRole('button', { name: 'Issue certificate' }).click();
    await expect(page.getByText('Certificate issued · parents will be told')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download certificate for Inter-school Chess Championship' })).toBeVisible();

    const parentSession = await browser.newContext(as('parent'));
    const parent = await parentSession.newPage();
    await parent.goto(school('/my/achievements'));
    await parent.getByRole('button', { name: /Switch child/ }).click();
    await parent.getByRole('menuitem', { name: /Rahul/ }).click();
    await expect(parent.getByRole('heading', { name: "Rahul's achievements" })).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Download certificate for Inter-school Chess Championship' })).toBeVisible();
    await expect(parent.getByText('Winner', { exact: true })).toBeVisible();
    await parentSession.close();
  });
});
