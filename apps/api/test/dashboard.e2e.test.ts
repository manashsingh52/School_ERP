/**
 * Dashboard v1 (Master Prompt §21): role-aware numbers, attention items and "my day".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIn } from '../src/core/util/dates.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent', string> = {} as never;
const today = todayIn('Asia/Kolkata');
const keys = (res: { body: { data: { attention: { key: string }[] } } }) => res.body.data.attention.map((a) => a.key);

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'dash');
  for (const role of ['admin', 'teacher', 'parent'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  // Every day is a school day here, so the test doesn't depend on the weekday it runs.
  await t.as(tok.admin, A.slug).put('/v1/attendance/settings', { weeklyOffDays: [] });
});

afterAll(async () => {
  await t?.close();
});

describe('dashboard', () => {
  it('admin sees school numbers and pending registers', async () => {
    const res = await t.as(tok.admin, A.slug).get('/v1/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ date: today, isWeeklyOff: false, kpis: { students: 3, teachers: 2, registers: { taken: 0, total: 2 }, absentToday: null } });
    expect(keys(res)).toContain('attendance.pending');
    expect(keys(res)).toContain('timetable.unpublished');
    expect(res.body.data.myRegisters).toEqual([]);
  });

  it('the class teacher sees their open register, then it clears', async () => {
    const before = await t.as(tok.teacher, A.slug).get('/v1/dashboard');
    expect(before.body.data.myRegisters).toEqual([{ sectionId: A.sectionA, label: '8-A', status: 'NOT_TAKEN' }]);
    expect(before.body.data.kpis.registers).toBeNull();
    expect(before.body.data.today).toMatchObject({ for: { kind: 'teacher' } });

    await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, {
      date: today,
      records: [{ studentId: A.students.s1, status: 'ABSENT' }, { studentId: A.students.s2, status: 'PRESENT' }],
    });
    expect((await t.as(tok.teacher, A.slug).get('/v1/dashboard')).body.data.myRegisters).toEqual([]);

    const admin = await t.as(tok.admin, A.slug).get('/v1/dashboard');
    expect(admin.body.data.kpis).toMatchObject({ absentToday: 1, presentPercent: 50, registers: { taken: 1, total: 2 } });
    expect(keys(admin)).toContain('attendance.absent');
  });

  it('flags students below 75% this month', async () => {
    const dayOfMonth = Number(today.slice(8));
    if (dayOfMonth < 5) return; // not enough days in this month yet
    for (let d = 1; d <= 4; d++) {
      const date = `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
      const res = await t.as(tok.admin, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, {
        date,
        records: [{ studentId: A.students.s1, status: 'ABSENT' }, { studentId: A.students.s2, status: 'PRESENT' }],
      });
      expect(res.status).toBe(200);
    }
    const res = await t.as(tok.admin, A.slug).get('/v1/dashboard');
    const low = res.body.data.attention.find((a: { key: string }) => a.key === 'attendance.low');
    expect(low).toMatchObject({ tone: 'danger', title: '1 student below 75% attendance this month', detail: 'Student1' });
  });

  it('parents get an empty staff dashboard', async () => {
    const res = await t.as(tok.parent, A.slug).get('/v1/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kpis: { students: null, teachers: null, registers: null }, attention: [], myRegisters: [], today: null });
  });
});
