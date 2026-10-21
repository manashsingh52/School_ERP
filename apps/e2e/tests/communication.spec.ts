import { as, expect, school, schoolDate, test } from '../fixtures.js';

test.describe(() => {
  test.use({ who: 'parent' });

  test('a parent asks the class teacher; the teacher replies and tracks it', async ({ page, browser }) => {
    await page.goto(school('/messages'));
    await page.getByRole('button', { name: 'New message' }).click();
    const dialog = page.getByRole('dialog');
    // The parent's current child is Ananya (5-B); write about Rahul (8-A), whose class teacher is the demo teacher.
    await dialog.getByLabel('About').selectOption({ label: 'Rahul Kumar (8-A)' });
    await expect(dialog.getByLabel('To', { exact: true })).toContainText('Class teacher');
    await dialog.getByLabel('Topic').selectOption({ label: 'Homework' });
    await dialog.getByLabel('Subject').fill('Science project');
    await dialog.getByLabel('Message').fill('Can Rahul submit the project on Monday instead?');
    await dialog.getByRole('button', { name: 'Send' }).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Science project' })).toBeVisible();
    await expect(page.getByText('Can Rahul submit the project on Monday instead?')).toBeVisible();

    const teacherSession = await browser.newContext(as('teacher'));
    const teacher = await teacherSession.newPage();
    await teacher.goto(school('/messages'));
    await teacher.getByRole('link', { name: /Science project/ }).click();
    await teacher.getByRole('textbox', { name: 'Reply' }).fill('Yes, Monday is fine.');
    await teacher.getByRole('button', { name: 'Send' }).click();
    await expect(teacher.getByText('Yes, Monday is fine.')).toBeVisible();
    await teacher.getByRole('combobox', { name: 'Status' }).selectOption('IN_PROGRESS');
    await expect(teacher.getByText(/Marked in progress/)).toBeVisible();
    await teacherSession.close();

    await page.reload();
    await expect(page.getByText('Yes, Monday is fine.')).toBeVisible();
    await expect(page.getByText('In progress').first()).toBeVisible();
    await expect(page.getByText('Seen').first()).toBeVisible(); // the teacher opened the parent's message
  });

  test('a parent sets a pick-up reminder', async ({ page }) => {
    await page.goto(school('/reminders'));
    await page.getByRole('button', { name: 'New reminder' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Pick up from school' }).click();
    await dialog.getByLabel('Date').fill(schoolDate(1));
    await dialog.getByLabel('Time').fill('13:30');
    await dialog.getByLabel('Repeat').selectOption({ label: 'Monday to Saturday' });
    await dialog.getByRole('button', { name: 'Set reminder' }).click();
    await expect(page.getByText(/Reminder set for Tomorrow, 1:30 PM/)).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Pick up from school' })).toContainText('Monday to Saturday');
  });

  test('results open with the performance charts', async ({ page }) => {
    await page.goto(school('/my/results'));
    await expect(page.getByRole('img', { name: /^Marks by subject:/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Progress:/ })).toBeVisible();
    await page.getByRole('button', { name: /^Mathematics/ }).click();
    await expect(page.getByRole('cell', { name: 'Unit Test 2' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Section avg.' })).toBeVisible();
  });

  test('attendance shows the whole session', async ({ page }) => {
    await page.goto(school('/my/attendance'));
    await expect(page.getByText('Classes held')).toBeVisible();
    await page.getByRole('tab', { name: 'Whole session' }).click();
    await expect(page.getByText('Month by month')).toBeVisible();
  });
});

test.describe(() => {
  test.use({ who: 'teacher' });

  test('a teacher books a video meeting; the parent sees it with its join time', async ({ page, browser }) => {
    await page.goto(school('/meetings'));
    await page.getByRole('button', { name: 'Schedule meeting' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Student name or admission number').fill('1501');
    await dialog.getByRole('button', { name: /Rahul Kumar/ }).click();
    await dialog.getByLabel('Title').fill('Science project check-in');
    await dialog.getByLabel('Date').fill(schoolDate(2));
    await dialog.getByLabel('Time').fill('16:30');
    await dialog.getByRole('button', { name: 'Book and notify parents' }).click();
    await expect(page.getByText('Meeting booked — the parents have been notified.')).toBeVisible();

    const parentSession = await browser.newContext(as('parent'));
    const parent = await parentSession.newPage();
    await parent.goto(school('/meetings'));
    const card = parent.locator('div.p-5').filter({ hasText: 'Science project check-in' });
    await expect(card).toContainText('Join opens 15 min before');
    await parentSession.close();
  });
});

test.describe(() => {
  test.use({ who: 'admin' });

  test("a student's profile tabs show attendance, exams and fees — and links keep the tab", async ({ page }) => {
    await page.goto(school('/students'));
    await page.getByRole('textbox', { name: 'Search students' }).fill('1501');
    await page.getByRole('row', { name: /Rahul Kumar/ }).click();
    await page.getByRole('tab', { name: 'Attendance' }).click();
    await expect(page).toHaveURL(/tab=attendance/);
    await expect(page.getByText('Classes held')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Classes held')).toBeVisible();
    await page.getByRole('tab', { name: 'Exams' }).click();
    await expect(page.getByRole('img', { name: /^Marks by subject:/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Fees' }).click();
    await expect(page.getByText('Paid this year')).toBeVisible();
  });
});
