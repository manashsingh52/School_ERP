/**
 * School calendar: holidays and events from the office, exam dates straight from the exams, and a
 * parent's own view (their children's classes, each paper on its day).
 * Fixture: Class 8 (A, B); the parent's child s1 is in 8-A; a "Founders Day" holiday on 14 Nov.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CalendarItem } from '@schoolos/contracts';
import { type Tenant, type TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const range = '/v1/calendar?from=2026-10-01&to=2027-03-31';

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'cal');
  for (const who of ['admin', 'teacher', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

describe('school calendar', () => {
  let diwali = '';

  it('the office adds a vacation and tells everyone', async () => {
    const res = await as('admin').post('/v1/calendar', { title: 'Diwali break', kind: 'VACATION', startDate: '2026-11-07', endDate: '2026-11-10', description: 'School reopens on 11 Nov.', notify: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    diwali = res.body.data.id;
    expect(res.body.data).toMatchObject({ source: 'CALENDAR', kind: 'VACATION', audience: 'Whole school', startDate: '2026-11-07', endDate: '2026-11-10', canEdit: true });
    const inbox = (await as('parent').get('/v1/notifications')).body.data as { event: string; title: string; body: string }[];
    const alert = inbox.find((n) => n.event === 'calendar.added')!;
    expect(alert.title).toBe('Vacation: Diwali break');
    expect(alert.body).toBe('Sat, 7 Nov – Tue, 10 Nov. School reopens on 11 Nov.');
  });

  it('only the office manages it; dates must make sense', async () => {
    expect((await as('teacher').post('/v1/calendar', { title: 'Picnic', startDate: '2026-12-01' })).status).toBe(403);
    expect((await as('parent').post('/v1/calendar', { title: 'Picnic', startDate: '2026-12-01' })).status).toBe(403);
    expect((await as('admin').post('/v1/calendar', { title: 'Picnic', startDate: '2026-12-05', endDate: '2026-12-01' })).status).toBe(422);
  });

  it("parents see whole-school entries and their child's class — not other classes", async () => {
    const nine = await t.platform.schoolClass.create({ data: { schoolId: A.schoolId, name: 'Class 9', displayOrder: 9 } });
    await as('admin').post('/v1/calendar', { title: 'Class 8 science fair', kind: 'EVENT', startDate: '2026-12-02', classIds: [A.classId] });
    await as('admin').post('/v1/calendar', { title: 'Class 9 field trip', kind: 'EVENT', startDate: '2026-12-03', classIds: [nine.id] });
    const parent = ((await as('parent').get(range)).body.data as CalendarItem[]).map((i) => i.title);
    expect(parent).toEqual(expect.arrayContaining(['Founders Day', 'Diwali break', 'Class 8 science fair']));
    expect(parent).not.toContain('Class 9 field trip');
    const teacher = ((await as('teacher').get(range)).body.data as CalendarItem[]).map((i) => i.title);
    expect(teacher).toContain('Class 9 field trip');
    expect(((await as('teacher').get(range)).body.data as CalendarItem[]).every((i) => !i.canEdit)).toBe(true);
  });

  it("exam dates come from the exam; a parent also gets their child's papers", async () => {
    await t.platform.exam.update({ where: { id: A.examId }, data: { startDate: new Date('2026-12-14T00:00:00Z'), endDate: new Date('2026-12-16T00:00:00Z') } });
    await t.platform.examSubject.update({ where: { id: A.examSubjectId }, data: { examDate: new Date('2026-12-15T00:00:00Z'), startTime: '09:00', endTime: '10:30' } });
    const items = (await as('parent').get(range)).body.data as CalendarItem[];
    expect(items.find((i) => i.source === 'EXAM')).toMatchObject({ kind: 'EXAM', title: 'Unit Test 1', startDate: '2026-12-14', endDate: '2026-12-16', audience: '8' });
    expect(items.find((i) => i.source === 'PAPER')).toMatchObject({ title: 'Mathematics paper', startDate: '2026-12-15', time: '09:00–10:30', description: 'Unit Test 1' });
    // A draft exam isn't shown to parents yet.
    await t.platform.exam.update({ where: { id: A.examId }, data: { status: 'DRAFT' } });
    expect(((await as('parent').get(range)).body.data as CalendarItem[]).some((i) => i.source !== 'CALENDAR')).toBe(false);
    expect(((await as('admin').get(range)).body.data as CalendarItem[]).some((i) => i.source === 'EXAM')).toBe(true);
    await t.platform.exam.update({ where: { id: A.examId }, data: { status: 'MARKS_ENTRY' } });
  });

  it('edits and removals are audited', async () => {
    const moved = await as('admin').patch(`/v1/calendar/${diwali}`, { endDate: '2026-11-11' });
    expect(moved.body.data.endDate).toBe('2026-11-11');
    expect((await as('admin').delete(`/v1/calendar/${diwali}`)).status).toBe(200);
    expect((await as('admin').patch(`/v1/calendar/${diwali}`, { title: 'Xmas' })).status).toBe(404);
    const audit = (await as('admin').get('/v1/audit?action=calendar')).body.data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['calendar.create', 'calendar.update', 'calendar.delete']));
  });
});
