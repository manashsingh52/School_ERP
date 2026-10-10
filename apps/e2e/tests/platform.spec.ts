import { consoleUrl, school, expect, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'superadmin' });
  test('the platform console lists the schools', async ({ page }) => {
    await page.goto(consoleUrl('/platform/schools'));
    const row = page.getByRole('row', { name: /Demo Public School/ });
    await expect(row).toContainText('Live');
    await row.getByRole('link', { name: 'Demo Public School' }).click();
    await expect(page.getByRole('heading', { name: 'Demo Public School' })).toBeVisible();
  });
});

test.describe(() => {
  test.use({ who: 'admin' });
  test('school staff can’t open the platform console', async ({ page }) => {
    await page.goto(consoleUrl('/platform'));
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Schools' })).toHaveCount(0);
  });
});

test.describe(() => {
  test.use({ who: 'parent' });
  test('a parent’s student list holds only their own children', async ({ page }) => {
    await page.goto(school('/students'));
    const rows = page.getByRole('main').getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Ananya Kumar' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'Rahul Kumar' })).toHaveCount(1);
  });
});
