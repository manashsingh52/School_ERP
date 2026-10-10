import { school, expect, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'accountant' });
  test('the accountant collects cash at the counter and a receipt is made', async ({ page }) => {
    await page.goto(school('/payments'));
    await page.getByRole('textbox', { name: 'Find student' }).fill('1501');
    await page.getByRole('button', { name: /Rahul Kumar/ }).click();
    await expect(page.getByRole('checkbox', { name: /^Pay INV/ }).first()).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Cash' })).toBeChecked();
    const collect = page.getByRole('button', { name: /^Collect ₹/ });
    const amount = (await collect.textContent())!.replace(/^.*Collect /, '').trim();
    await collect.click();

    await expect(page.getByText(`${amount} received`)).toBeVisible();
    // The receipt PDF is made by a background job; the button turns on when it's ready.
    await expect(page.getByRole('button', { name: 'Print receipt' })).toBeEnabled({ timeout: 30_000 });

    // Nothing is left to collect for Rahul, and the payment is in the day's list.
    await page.getByRole('button', { name: 'Next student' }).click();
    await page.getByRole('textbox', { name: 'Find student' }).fill('1501');
    await page.getByRole('button', { name: /Rahul Kumar/ }).click();
    await expect(page.getByRole('button', { name: /^Collect ₹/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Payments' }).click();
    await expect(page.getByRole('main').getByText('Rahul Kumar').first()).toBeVisible();
  });
});

test.describe(() => {
  test.use({ who: 'parent' });
  test('a failed online payment leaves the bill unpaid', async ({ page }) => {
    await page.goto(school('/my/fees'));
    const pay = page.getByRole('button', { name: /^Pay ₹/ });
    const amount = await pay.textContent();
    await pay.click();
    await page.getByRole('dialog', { name: 'Test checkout' }).getByRole('button', { name: 'Payment fails' }).click();
    const failed = page.getByRole('dialog', { name: 'Payment did not go through' });
    await expect(failed).toContainText('No money was taken');
    await failed.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Pay ₹/ })).toHaveText(amount!);
  });
});

test.describe(() => {
  test.use({ who: 'parent' });
  test('a parent pays online (payment sandbox) and the bill is cleared', async ({ page }) => {
    await page.goto(school('/my/fees'));
    await expect(page.getByRole('heading', { name: "Ananya's fees" })).toBeVisible();
    const receipts = page.getByRole('main').getByRole('listitem').filter({ hasText: /RCPT\// });
    await expect(receipts.first()).toBeVisible();
    const before = await receipts.count();
    await page.getByRole('button', { name: /^Pay ₹/ }).click();
    const checkout = page.getByRole('dialog', { name: 'Test checkout' });
    await expect(checkout).toContainText('no real money');
    await checkout.getByRole('button', { name: 'Pay with UPI (succeeds)' }).click();

    const done = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Payment received' }) });
    await expect(done).toBeVisible({ timeout: 30_000 });
    await done.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^Pay ₹/ })).toHaveCount(0);
    await expect(receipts).toHaveCount(before + 1);
    await expect(receipts.first()).toContainText('Online');

    // An older payment's receipt was never rendered (seeded, like imported history): it's made on request.
    // The link is a download, so the new tab closes itself; check the file that was sent.
    const file = page.context().waitForEvent('response', (r) => r.url().includes('/files/'));
    await receipts.last().getByRole('button', { name: 'Receipt' }).click();
    const pdf = await file;
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
  });
});
