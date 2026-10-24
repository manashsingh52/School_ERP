/** Saved reports, and weekly / monthly ones that export on their own and tell their owner. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { QueueService } from '../src/core/queue/queue.service.js';
import { SavedReportsService, nextRunAt, scheduledParams } from '../src/modules/reports/saved-reports.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

describe('schedule maths (school-local dates)', () => {
  it('weekly runs on the next Monday for the week before; monthly on the 1st for the month before', () => {
    expect(nextRunAt('WEEKLY', '2026-10-21')?.toISOString()).toBe('2026-10-26T02:00:00.000Z'); // Wed → Mon 07:30 IST
    expect(nextRunAt('WEEKLY', '2026-10-26')?.toISOString()).toBe('2026-11-02T02:00:00.000Z'); // Mon → next Mon
    expect(nextRunAt('MONTHLY', '2026-12-15')?.toISOString()).toBe('2027-01-01T02:00:00.000Z');
    expect(nextRunAt('NONE', '2026-10-21')).toBeNull();

    expect(scheduledParams('WEEKLY', { classId: 'c' }, ['range', 'class'], '2026-10-26').params).toEqual({ classId: 'c', from: '2026-10-19', to: '2026-10-25' });
    expect(scheduledParams('MONTHLY', {}, ['month'], '2026-11-01').params).toEqual({ month: '2026-10' });
    expect(scheduledParams('MONTHLY', {}, ['range'], '2027-03-01').params).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });
});

describe('saved reports', () => {
  let t: TestApp;
  let A: Tenant;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp({ RUN_WORKERS: 'true' });
    await t.app.get(QueueService).startWorkers();
    A = await createTenant(t, 'saved');
    admin = (await t.login(A.users.admin, A.slug)).token;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('saves with filters, lists only your own, and runs now', async () => {
    const res = await t.as(admin, A.slug).post('/v1/reports/saved', { name: 'Weekly collection', report: 'collection', params: { classId: undefined }, format: 'XLSX', schedule: 'WEEKLY' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Weekly collection', report: 'collection', title: 'Daily collection', schedule: 'WEEKLY' });
    expect(new Date(res.body.data.nextRunAt).getUTCDay()).toBe(1);

    const teacher = (await t.login(A.users.teacher, A.slug)).token;
    expect((await t.as(teacher, A.slug).get('/v1/reports/saved')).status).toBe(403); // no report.export
    const mine = (await t.as(admin, A.slug).get('/v1/reports/saved')).body.data as { name: string }[];
    expect(mine.map((s) => s.name)).toEqual(['Weekly collection', 'Strength']);

    const run = await t.as(admin, A.slug).post(`/v1/reports/saved/${res.body.data.id}/run`);
    expect(run.status).toBe(201);
    expect(run.body.data).toMatchObject({ report: 'collection', format: 'XLSX' });

    const off = await t.as(admin, A.slug).patch(`/v1/reports/saved/${res.body.data.id}`, { schedule: 'NONE' });
    expect(off.body.data).toMatchObject({ schedule: 'NONE', nextRunAt: null });
    expect((await t.as(admin, A.slug).delete(`/v1/reports/saved/${res.body.data.id}`)).status).toBe(200);
  });

  it('a due schedule exports for the period before, as its owner, and notifies them', async () => {
    const saved = await t.as(admin, A.slug).post('/v1/reports/saved', { name: 'Monthly strength', report: 'student_strength', format: 'CSV', schedule: 'MONTHLY' });
    await t.platform.savedReport.update({ where: { id: saved.body.data.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    const service = t.app.get(SavedReportsService);
    const queued = await RequestContextStore.runAsSystem(A.schoolId, 'test-saved', () => service.runDue());
    expect(queued).toBe(1);

    const after = await t.platform.savedReport.findUniqueOrThrow({ where: { id: saved.body.data.id } });
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    let run = null;
    for (let i = 0; i < 75 && run?.status !== 'DONE'; i++) {
      run = await t.platform.reportRun.findFirst({ where: { savedReportId: saved.body.data.id } });
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(run?.status).toBe('DONE');
    const adminM = await t.platform.membership.findFirstOrThrow({ where: { schoolId: A.schoolId, user: { email: A.users.admin } } });
    const notice = await t.platform.notification.findFirst({ where: { membershipId: adminM.id, event: 'report.ready' } });
    expect(notice?.title).toBe('Monthly strength is ready');
  });
});
