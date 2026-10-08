/**
 * Timetable (Master Prompt §31): bell schedules, weekly grid, teacher clash detection by clock
 * time (across different bell schedules), publishing, teacher week and "today" views.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent' | 'accountant', string> = {} as never;
let periods: { id: string; name: string; isBreak: boolean }[];
let teacher2: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'tt');
  for (const role of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  teacher2 = (await t.platform.teacher.findFirstOrThrow({ where: { schoolId: A.schoolId, employeeId: 'T2' } })).id;
  periods = (await t.platform.period.findMany({ where: { bellScheduleId: A.bellScheduleId }, orderBy: { order: 'asc' } })).map((p) => ({ id: p.id, name: p.name, isBreak: p.isBreak }));
});

afterAll(async () => {
  await t?.close();
});

const P = (name: string) => periods.find((p) => p.name === name)!.id;
// today() is asked for a fixed Monday so the test doesn't depend on the current weekday.
const MONDAY = '2026-10-05';

describe('bell schedules', () => {
  it('validates periods and lists schedules with usage', async () => {
    const bad = await t.as(tok.admin, A.slug).post('/v1/bell-schedules', {
      name: 'Bad',
      periods: [{ name: 'P1', startTime: '09:00', endTime: '08:00' }],
    });
    expect(bad.status).toBe(422);
    const list = await t.as(tok.admin, A.slug).get('/v1/bell-schedules');
    expect(list.body.data[0]).toMatchObject({ name: 'Regular', isDefault: true, usedBy: 1 });
    expect(list.body.data[0].periods.map((p: { name: string }) => p.name)).toEqual(['P1', 'P2', 'Break', 'P3']);
    expect((await t.as(tok.teacher, A.slug).post('/v1/bell-schedules', { name: 'X', periods: [{ name: 'P1', startTime: '08:00', endTime: '08:40' }] })).status).toBe(403);
  });

  it("won't delete a schedule in use", async () => {
    const res = await t.as(tok.admin, A.slug).delete(`/v1/bell-schedules/${A.bellScheduleId}`);
    expect(res.status).toBe(409);
  });
});

describe('section timetable', () => {
  let ttB: string;

  it('saves a grid for 8-A and refuses classes in a break', async () => {
    const brk = await t.as(tok.admin, A.slug).put(`/v1/timetables/${A.timetableId}/entries`, {
      entries: [{ dayOfWeek: 1, periodId: P('Break'), subjectId: A.subjectId }],
    });
    expect(brk.status).toBe(422);

    const res = await t.as(tok.admin, A.slug).put(`/v1/timetables/${A.timetableId}/entries`, {
      entries: [
        { dayOfWeek: 1, periodId: P('P1'), subjectId: A.subjectId, teacherId: A.teacherId, room: '101' },
        { dayOfWeek: 1, periodId: P('P3'), subjectId: A.subjectId, teacherId: A.teacherId },
        { dayOfWeek: 3, periodId: P('P2'), subjectId: A.subjectId, teacherId: A.teacherId },
        { dayOfWeek: 2, periodId: P('P1') }, // empty slot is dropped
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'DRAFT', section: { label: '8-A' }, days: [1, 2, 3, 4, 5, 6] });
    expect(res.body.data.entries).toHaveLength(3);
  });

  it('detects a teacher clash in another section — even on a different bell schedule', async () => {
    // 8-B runs a shifted schedule: S1 08:20–09:00 overlaps 8-A's P1 (08:00–08:40).
    const shifted = await t.as(tok.admin, A.slug).post('/v1/bell-schedules', {
      name: 'Senior',
      periods: [
        { name: 'S1', startTime: '08:20', endTime: '09:00' },
        { name: 'S2', startTime: '09:00', endTime: '09:40' },
      ],
    });
    expect(shifted.status).toBe(201);
    const [s1, s2] = shifted.body.data.periods as { id: string }[];
    const created = await t.as(tok.admin, A.slug).post('/v1/timetables', { sectionId: A.sectionB, bellScheduleId: shifted.body.data.id });
    expect(created.status).toBe(201);
    ttB = created.body.data.id;
    expect((await t.as(tok.admin, A.slug).post('/v1/timetables', { sectionId: A.sectionB, bellScheduleId: shifted.body.data.id })).status).toBe(409);

    const clash = await t.as(tok.admin, A.slug).put(`/v1/timetables/${ttB}/entries`, {
      entries: [
        { dayOfWeek: 1, periodId: s1!.id, subjectId: A.subjectId, teacherId: A.teacherId },
        { dayOfWeek: 1, periodId: s2!.id, subjectId: A.subjectId, teacherId: teacher2 },
      ],
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('TEACHER_CLASH');
    expect(clash.body.error.details).toEqual([{ field: 'entries.0.teacherId', message: 'Teacher is with 8-A on Monday (P1, 08:00–08:40)' }]);

    // The same teacher on a day with no overlap is fine (Tuesday has nothing in 8-A).
    const ok = await t.as(tok.admin, A.slug).put(`/v1/timetables/${ttB}/entries`, {
      entries: [
        { dayOfWeek: 2, periodId: s1!.id, subjectId: A.subjectId, teacherId: A.teacherId },
        { dayOfWeek: 1, periodId: s2!.id, subjectId: A.subjectId, teacherId: teacher2 },
      ],
    });
    expect(ok.status).toBe(200);
  });

  it('only published timetables reach teachers and parents', async () => {
    expect((await t.as(tok.parent, A.slug).get(`/v1/timetables?sectionId=${A.sectionA}`)).body.data).toBeNull();
    const pub = await t.as(tok.admin, A.slug).post(`/v1/timetables/${A.timetableId}/publish`);
    expect(pub.body.data.status).toBe('PUBLISHED');
    const seen = await t.as(tok.parent, A.slug).get(`/v1/timetables?sectionId=${A.sectionA}`);
    expect(seen.body.data.entries).toHaveLength(3);
    expect((await t.as(tok.parent, A.slug).get(`/v1/timetables?sectionId=${A.sectionB}`)).status).toBe(404);
    expect((await t.as(tok.accountant, A.slug).get(`/v1/timetables?sectionId=${A.sectionA}`)).status).toBe(403);
  });

  it('overview lists sections with status (drafts only for managers)', async () => {
    const admin = await t.as(tok.admin, A.slug).get('/v1/timetables/overview');
    expect(admin.body.data.map((s: { label: string; status: string }) => [s.label, s.status])).toEqual([['8-A', 'PUBLISHED'], ['8-B', 'DRAFT']]);
    const teacher = await t.as(tok.teacher, A.slug).get('/v1/timetables/overview');
    expect(teacher.body.data.find((s: { label: string }) => s.label === '8-B').status).toBeNull();
  });

  it("teacher week and today's classes", async () => {
    const week = await t.as(tok.admin, A.slug).get(`/v1/teachers/${A.teacherId}/timetable`);
    expect(week.status).toBe(200);
    expect(week.body.data.periodsPerWeek).toBe(4); // 3 in 8-A + 1 draft in 8-B (admins see drafts)
    const mine = await t.as(tok.teacher, A.slug).get(`/v1/teachers/${A.teacherId}/timetable`);
    expect(mine.body.data.periodsPerWeek).toBe(3);

    const today = await t.as(tok.teacher, A.slug).get(`/v1/timetables/today?date=${MONDAY}`);
    expect(today.body.data).toMatchObject({ dayOfWeek: 1, isWeeklyOff: false, for: { kind: 'teacher', label: 'Teacher' } });
    expect(today.body.data.slots.map((s: { periodName: string }) => s.periodName)).toEqual(['P1', 'P3']);

    const child = await t.as(tok.parent, A.slug).get(`/v1/timetables/today?date=${MONDAY}`);
    expect(child.body.data.for).toEqual({ kind: 'section', label: '8-A' });
    expect(child.body.data.slots.map((s: { periodName: string; subject: { name: string } | null }) => [s.periodName, s.subject?.name ?? null])).toEqual([
      ['P1', 'Mathematics'],
      ['P2', null],
      ['Break', null],
      ['P3', 'Mathematics'],
    ]);
    const sunday = await t.as(tok.parent, A.slug).get('/v1/timetables/today?date=2026-10-11');
    expect(sunday.body.data).toMatchObject({ isWeeklyOff: true, slots: [] });
    expect((await t.as(tok.parent, A.slug).get(`/v1/timetables/today?studentId=${A.students.s2}`)).status).toBe(404);
  });

  it('editing a period keeps entries; removing a used period is refused', async () => {
    const res = await t.as(tok.admin, A.slug).put(`/v1/bell-schedules/${A.bellScheduleId}`, {
      name: 'Regular',
      periods: [
        { name: 'P1', startTime: '08:00', endTime: '08:45' },
        { name: 'P2', startTime: '08:45', endTime: '09:25' },
        { name: 'Break', startTime: '09:25', endTime: '09:45', isBreak: true },
        { name: 'P3', startTime: '09:45', endTime: '10:25' },
      ],
    });
    expect(res.status).toBe(200);
    expect((await t.as(tok.admin, A.slug).get(`/v1/timetables?sectionId=${A.sectionA}`)).body.data.entries).toHaveLength(3);
    const drop = await t.as(tok.admin, A.slug).put(`/v1/bell-schedules/${A.bellScheduleId}`, {
      name: 'Regular',
      periods: [{ name: 'P1', startTime: '08:00', endTime: '08:45' }],
    });
    expect(drop.status).toBe(409);
    expect(drop.body.error.code).toBe('PERIOD_IN_USE');
  });

  it('deletes a timetable', async () => {
    expect((await t.as(tok.admin, A.slug).delete(`/v1/timetables/${ttB}`)).status).toBe(200);
    expect((await t.as(tok.admin, A.slug).get(`/v1/timetables?sectionId=${A.sectionB}`)).body.data).toBeNull();
  });
});
