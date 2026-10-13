/**
 * Attendance (Master Prompt §29) + the notification engine (§39): register, submit, edit window,
 * scopes, corrections audit, parent absence alerts (once per student per day), staff attendance.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { todayIn } from '../src/core/util/dates.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent' | 'accountant', string> = {} as never;
const today = todayIn('Asia/Kolkata');
const daysAgo = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'attn');
  for (const role of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 15_000): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
};
const parentInbox = async () => (await t.as(tok.parent, A.slug).get('/v1/notifications')).body.data as { id: string; event: string; title: string; readAt: string | null }[];

describe('daily register', () => {
  it('the class teacher opens an untaken register', async () => {
    const res = await t.as(tok.teacher, A.slug).get(`/v1/sections/${A.sectionA}/attendance`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ date: today, status: 'NOT_TAKEN', editable: true, counts: { unmarked: 2 } });
    expect(res.body.data.students.map((s: { studentId: string }) => s.studentId).sort()).toEqual([A.students.s1, A.students.s2].sort());
  });

  it("a teacher can't see or mark a section they don't teach", async () => {
    expect((await t.as(tok.teacher, A.slug).get(`/v1/sections/${A.sectionB}/attendance`)).status).toBe(404);
    const res = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionB}/attendance`, { date: today, records: [] });
    expect(res.status).toBe(404);
  });

  it('refuses to submit until every student is marked, but saves a draft', async () => {
    const partial = { date: today, records: [{ studentId: A.students.s1, status: 'PRESENT' }] };
    const res = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, partial);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ATTENDANCE_INCOMPLETE');

    const draft = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { ...partial, submit: false });
    expect(draft.status).toBe(200);
    expect(draft.body.data).toMatchObject({ status: 'DRAFT', counts: { PRESENT: 1, unmarked: 1 } });
  });

  it('rejects students who are not on the roll', async () => {
    const res = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: today, records: [{ studentId: A.students.s3, status: 'PRESENT' }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('submits and tells the absent child\'s parent — once', async () => {
    const body = { date: today, records: [{ studentId: A.students.s1, status: 'ABSENT' }, { studentId: A.students.s2, status: 'PRESENT' }], clientMutationId: 'device-1-abc' };
    const res = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, body);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'SUBMITTED', takenBy: 'Teacher', counts: { ABSENT: 1, PRESENT: 1, unmarked: 0 } });

    const alerts = await waitFor(async () => {
      const list = (await parentInbox()).filter((n) => n.event === 'attendance.absent');
      return list.length ? list : null;
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.title).toContain('marked absent');

    // Offline replay of the same submission is a no-op.
    const replay = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, body);
    expect(replay.status).toBe(200);
    // A correction re-runs the event; the parent is not alerted twice for the same day.
    await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: today, records: [{ studentId: A.students.s1, status: 'ABSENT', remark: 'Fever' }] });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await parentInbox()).filter((n) => n.event === 'attendance.absent')).toHaveLength(1);
  });

  it('audits corrections to a submitted register', async () => {
    const res = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: today, records: [{ studentId: A.students.s2, status: 'LATE' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
    const audit = await t.platform.auditLog.findFirst({ where: { schoolId: A.schoolId, action: 'attendance.edit' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.metadata).toMatchObject({ changes: { [A.students.s2]: { from: 'PRESENT', to: 'LATE' } } });
  });

  it('locks old and future dates for teachers; admins can fix old ones', async () => {
    const old = daysAgo(5);
    const records = [{ studentId: A.students.s1, status: 'PRESENT' }, { studentId: A.students.s2, status: 'PRESENT' }];
    const reg = await t.as(tok.teacher, A.slug).get(`/v1/sections/${A.sectionA}/attendance?date=${old}`);
    expect(reg.body.data).toMatchObject({ editable: false });
    expect(reg.body.data.lockedReason).toMatch(/admin/);
    const locked = await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: old, records });
    expect(locked.status).toBe(422);
    expect(locked.body.error.code).toBe('ATTENDANCE_LOCKED');
    expect((await t.as(tok.admin, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: old, records })).status).toBe(200);

    const future = await t.as(tok.admin, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: daysAgo(-1), records });
    expect(future.status).toBe(422);
  });

  it('a wider edit window from settings unlocks recent days', async () => {
    expect((await t.as(tok.teacher, A.slug).put('/v1/attendance/settings', { editWindowDays: 7 })).status).toBe(403);
    const res = await t.as(tok.admin, A.slug).put('/v1/attendance/settings', { editWindowDays: 7 });
    expect(res.body.data).toMatchObject({ editWindowDays: 7, markedBy: 'CLASS_TEACHER' });
    const reg = await t.as(tok.teacher, A.slug).get(`/v1/sections/${A.sectionA}/attendance?date=${daysAgo(5)}`);
    expect(reg.body.data.editable).toBe(true);
    await t.as(tok.admin, A.slug).put('/v1/attendance/settings', { editWindowDays: 2 });
  });
});

describe('views', () => {
  it('overview counts submitted sections', async () => {
    const res = await t.as(tok.admin, A.slug).get(`/v1/attendance/overview?date=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({ sectionsTaken: 1, sectionsTotal: 2, students: 3, ABSENT: 1, LATE: 1 });
    const a = res.body.data.sections.find((s: { sectionId: string }) => s.sectionId === A.sectionA);
    expect(a).toMatchObject({ label: '8-A', status: 'SUBMITTED', present: 1, absent: 1 });
    // The teacher sees only their section.
    const mine = await t.as(tok.teacher, A.slug).get('/v1/attendance/overview');
    expect(mine.body.data.sections.map((s: { sectionId: string }) => s.sectionId)).toEqual([A.sectionA]);
  });

  it('a parent sees their own child\'s history and nothing else', async () => {
    const res = await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s1}/attendance`);
    expect(res.status).toBe(200);
    expect(res.body.data.counts.ABSENT).toBe(1);
    // Earlier tests also took a past register; the summary and months must agree with the days.
    const { summary, months, days, counts } = res.body.data as { summary: Record<string, number>; months: { month: string; conducted: number; missed: number }[]; days: unknown[]; counts: Record<string, number> };
    expect(summary).toMatchObject({ conducted: days.length, missed: 1, attended: counts.PRESENT! + counts.LATE! + counts.HALF_DAY! });
    expect(months.reduce((n, m) => n + m.conducted, 0)).toBe(days.length);
    expect(months.find((m) => m.month === today.slice(0, 7))?.missed).toBe(1);
    expect(res.body.data.days.find((d: { date: string }) => d.date === today)).toMatchObject({ status: 'ABSENT', remark: 'Fever' });
    expect((await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s2}/attendance`)).status).toBe(404);
    expect((await t.as(tok.parent, A.slug).get(`/v1/sections/${A.sectionA}/attendance`)).status).toBe(404);
    expect((await t.as(tok.accountant, A.slug).get(`/v1/sections/${A.sectionA}/attendance`)).status).toBe(403);
  });

  it('monthly grid', async () => {
    const month = today.slice(0, 7);
    const res = await t.as(tok.teacher, A.slug).get(`/v1/sections/${A.sectionA}/attendance/month?month=${month}`);
    expect(res.status).toBe(200);
    expect(res.body.data.days).toContain(today);
    const s1 = res.body.data.students.find((s: { studentId: string }) => s.studentId === A.students.s1);
    expect(s1.marks[today]).toBe('ABSENT');
  });
});

describe('staff attendance', () => {
  it('admin marks staff; teachers cannot', async () => {
    const day = await t.as(tok.admin, A.slug).get('/v1/staff-attendance');
    expect(day.status).toBe(200);
    expect(day.body.data.counts.unmarked).toBe(2);
    const res = await t.as(tok.admin, A.slug).put('/v1/staff-attendance', { date: today, records: [{ teacherId: A.teacherId, status: 'PRESENT' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.counts).toMatchObject({ PRESENT: 1, unmarked: 1 });
    expect((await t.as(tok.teacher, A.slug).get('/v1/staff-attendance')).status).toBe(403);
  });
});

describe('notifications', () => {
  it('inbox: unread count, read one, read all', async () => {
    const count = await t.as(tok.parent, A.slug).get('/v1/notifications/unread-count');
    expect(count.body.data.count).toBe(1);
    const [first] = await parentInbox();
    expect((await t.as(tok.parent, A.slug).post(`/v1/notifications/${first!.id}/read`)).status).toBe(200);
    expect((await t.as(tok.parent, A.slug).get('/v1/notifications/unread-count')).body.data.count).toBe(0);
    // Someone else's notification is invisible.
    expect((await t.as(tok.teacher, A.slug).post(`/v1/notifications/${first!.id}/read`)).status).toBe(404);
    expect((await t.as(tok.admin, A.slug).post('/v1/notifications/read-all')).body.data.updated).toBe(1);
  });

  it('records a delivery per extra channel', async () => {
    const [first] = await parentInbox();
    const deliveries = await waitFor(async () => {
      const rows = await t.platform.notificationDelivery.findMany({ where: { notificationId: first!.id } });
      return rows.length && rows.every((r) => r.status !== 'QUEUED') ? rows : null;
    });
    expect(deliveries.map((d) => [d.channel, d.status])).toEqual([['PUSH', 'SKIPPED']]);
  });

  it('a school can switch an alert off', async () => {
    expect((await t.as(tok.teacher, A.slug).get('/v1/notification-rules')).status).toBe(403);
    const rules = await t.as(tok.admin, A.slug).get('/v1/notification-rules');
    expect(rules.body.data.find((r: { event: string }) => r.event === 'attendance.absent')).toMatchObject({ enabled: true, channels: ['IN_APP', 'PUSH'] });
    const off = await t.as(tok.admin, A.slug).put('/v1/notification-rules', { rules: [{ event: 'attendance.absent', enabled: false, channels: ['IN_APP', 'SMS'] }] });
    expect(off.status).toBe(200);
    expect(off.body.data.find((r: { event: string }) => r.event === 'attendance.absent')).toMatchObject({ enabled: false, channels: ['IN_APP', 'SMS'] });

    const yesterday = daysAgo(1);
    await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, {
      date: yesterday,
      records: [{ studentId: A.students.s1, status: 'ABSENT' }, { studentId: A.students.s2, status: 'PRESENT' }],
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await parentInbox()).filter((n) => n.event === 'attendance.absent')).toHaveLength(1);
  });
});

describe('arrived at school', () => {
  const arrivals = async () => (await parentInbox()).filter((n) => n.event === 'attendance.arrived');

  it("tells the parent when today's register marks the child in — once", async () => {
    // s1 turns up late: the register is corrected from absent to late.
    await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: today, records: [{ studentId: A.students.s1, status: 'LATE' }] });
    const alerts = await waitFor(async () => {
      const list = await arrivals();
      return list.length ? list : null;
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.title).toBe('Student1 has arrived at school');
    const full = (await t.as(tok.parent, A.slug).get('/v1/notifications')).body.data.find((n: { id: string }) => n.id === alerts[0]!.id);
    expect(full.body).toMatch(/^Student1 \(8-A\) was marked late at \d{1,2}:\d{2} (AM|PM) today, /);
    expect(full.data).toMatchObject({ studentId: A.students.s1, date: today, status: 'LATE' });

    // Another correction the same day doesn't send a second alert.
    await t.as(tok.teacher, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: today, records: [{ studentId: A.students.s1, status: 'PRESENT' }] });
    await new Promise((r) => setTimeout(r, 1500));
    expect(await arrivals()).toHaveLength(1);
  });

  it('marking a past day never says "arrived"', async () => {
    const day = daysAgo(1);
    const res = await t.as(tok.admin, A.slug).put(`/v1/sections/${A.sectionA}/attendance`, { date: day, submit: true, records: [{ studentId: A.students.s1, status: 'PRESENT' }, { studentId: A.students.s2, status: 'PRESENT' }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await arrivals()).toHaveLength(1);
  });
});
