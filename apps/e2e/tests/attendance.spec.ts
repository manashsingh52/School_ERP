import { school, as, expect, test } from '../fixtures.js';

test.use({ who: 'teacher' });

test('the class teacher takes today’s register and the parent sees the absence', async ({ page: teacher, browser }) => {
  await teacher.goto(school('/attendance'));
  await teacher.getByRole('button', { name: 'Open register' }).click();
  await expect(teacher.getByRole('heading', { name: '8-A register' })).toBeVisible();
  const students = teacher.getByRole('list', { name: 'Students' });
  await expect(students.getByRole('listitem').first()).toBeVisible();

  const markAll = teacher.getByRole('button', { name: 'Mark all present' });
  if (await markAll.isVisible()) await markAll.click();
  // Two students in 8-A are called Rahul Kumar; the parent's child is admission no. 1501.
  const rahul = students.getByRole('listitem').filter({ hasText: 'Adm. 1501' });
  await rahul.getByRole('radio', { name: 'Absent' }).click();
  await teacher.getByRole('button', { name: /Submit register|Save changes/ }).click();
  await expect(teacher.getByText(/Attendance submitted · 1 absent|Changes saved/)).toBeVisible();

  // Saved for real: a fresh load shows the same marks.
  await teacher.reload();
  await expect(rahul.getByRole('radio', { name: 'Absent' })).toHaveAttribute('aria-checked', 'true');

  // Rahul's parent (who also has Ananya) switches to him and sees today's absence.
  const parentSession = await browser.newContext(as('parent'));
  const parent = await parentSession.newPage();
  await parent.goto(school('/dashboard'));
  await parent.getByRole('button', { name: /Switch child/ }).click();
  await parent.getByRole('menuitem', { name: /Rahul/ }).click();
  await expect(parent.getByRole('button', { name: /Showing Rahul/ })).toBeVisible();
  await expect(parent.getByRole('link', { name: /Today.*absent/i })).toBeVisible();
  await parentSession.close();
});
