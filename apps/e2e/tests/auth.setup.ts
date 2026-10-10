import { test as setup } from '@playwright/test';
import { USERS, authFile, signIn } from '../fixtures.js';

for (const who of Object.keys(USERS) as (keyof typeof USERS)[]) {
  setup(`sign in as ${who}`, async ({ page }) => {
    await signIn(page, who);
    await page.context().storageState({ path: authFile(who) });
  });
}
