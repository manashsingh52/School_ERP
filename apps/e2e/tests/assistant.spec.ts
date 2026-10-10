import { school, expect, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'admin' });
  test('the assistant answers from the school’s own reports', async ({ page }) => {
    await page.goto(school('/assistant'));
    await page.getByRole('textbox', { name: 'Your question' }).fill('कक्षा 8 में किसकी फीस बकाया है?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText(/overdue fees/).first()).toBeVisible();
    await expect(page.getByText('499 questions left this month')).toBeVisible();
  });
});
