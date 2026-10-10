import { school, expect, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'teacher' });
  test('a teacher enters marks; impossible marks are stopped before saving', async ({ page }) => {
    await page.goto(school('/exams'));
    await page.getByRole('link', { name: /Half-Yearly/ }).click();
    await page.getByRole('row', { name: /Mathematics 8-B/ }).getByRole('link', { name: 'Enter' }).click();
    await expect(page.getByRole('heading', { name: 'Mathematics · 8-B' })).toBeVisible();
    await expect(page.getByText(/Out of 80/)).toBeVisible();

    const rows = page.getByRole('main').getByRole('listitem');
    const first = rows.nth(0);
    const second = rows.nth(1);
    const third = rows.nth(2);
    await first.getByRole('textbox').fill('72');
    await second.getByRole('button', { name: 'AB' }).click();
    await third.getByRole('textbox').fill('90'); // more than 80
    await page.getByRole('button', { name: 'Save marks' }).click();
    await expect(page.getByText('1 mark needs fixing first.')).toBeVisible();

    await third.getByRole('textbox').fill('65');
    await page.getByRole('button', { name: 'Save marks' }).click();
    await expect(page.getByText(/Saved · 3 of 25 entered/)).toBeVisible();

    await page.reload();
    await expect(first.getByRole('textbox')).toHaveValue('72');
    await expect(third.getByRole('textbox')).toHaveValue('65');
    await expect(page.getByText('All changes saved')).toBeVisible();
  });
});
