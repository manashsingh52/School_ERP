/**
 * Scheduled finance jobs (docs/11 §9): late fees by rule (grace, per-day with cap, structure
 * rule over school default, idempotent re-runs), due/overdue reminders once each, scheduler tick.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SchedulerService } from '../src/core/queue/scheduler.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent', string> = {} as never;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'fjob');
  for (const role of ['admin', 'teacher', 'parent'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  // School default: ₹10/day after 5 days' grace, at most ₹100.
  await t.platform.lateFeeRule.create({ data: { schoolId: A.schoolId, graceDays: 5, calc: 'PER_DAY', valuePaise: 1_000, maxPaise: 10_000 } });
});

afterAll(async () => {
  await t?.close();
});

const run = (job: 'late-fees' | 'fee-reminders', date: string, who: keyof typeof tok = 'admin') => t.as(tok[who], A.slug).post('/v1/finance/jobs/run', { job, date });
const lateFee = async () => (await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } })).lateFeePaise;

describe('late fees', () => {
  it('nothing within the grace period', async () => {
    expect((await run('late-fees', '2026-04-14')).body.data).toEqual({ invoices: 0, addedPaise: 0 });
    expect((await run('late-fees', '2026-04-14', 'teacher')).status).toBe(403);
  });

  it('per day after grace, idempotent the same day, capped', async () => {
    expect((await run('late-fees', '2026-04-18')).body.data).toEqual({ invoices: 1, addedPaise: 3_000 }); // 8 days late − 5 grace
    expect((await run('late-fees', '2026-04-18')).body.data).toEqual({ invoices: 0, addedPaise: 0 });
    expect(await lateFee()).toBe(3_000);
    await run('late-fees', '2026-05-30');
    expect(await lateFee()).toBe(10_000); // capped
    const inv = await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } });
    expect(inv).toMatchObject({ totalPaise: 610_000, balancePaise: 610_000 });
    // The paid invoice (s2) never gets a late fee.
    expect(await t.platform.invoiceLine.count({ where: { schoolId: A.schoolId, kind: 'LATE_FEE' } })).toBe(2);
  });

  it("a structure's own rule wins over the school default", async () => {
    await t.platform.lateFeeRule.create({ data: { schoolId: A.schoolId, feeStructureId: A.feeStructureId, graceDays: 0, calc: 'FLAT', valuePaise: 25_000 } });
    expect((await run('late-fees', '2026-06-01')).body.data).toEqual({ invoices: 1, addedPaise: 15_000 });
    expect(await lateFee()).toBe(25_000);
  });
});

describe('reminders', () => {
  it('due in 7 days and overdue weekly — each sent once', async () => {
    expect((await run('fee-reminders', '2026-04-03')).body.data).toEqual({ dueSoon: 1, overdue: 0 });
    expect((await run('fee-reminders', '2026-04-03')).body.data).toEqual({ dueSoon: 0, overdue: 0 });
    expect((await run('fee-reminders', '2026-04-11')).body.data).toEqual({ dueSoon: 0, overdue: 1 });
    expect((await run('fee-reminders', '2026-04-12')).body.data).toEqual({ dueSoon: 0, overdue: 0 });
    const inbox = (await t.as(tok.parent, A.slug).get('/v1/notifications')).body.data as { event: string; title: string }[];
    expect(inbox.filter((n) => n.event === 'fee.due')).toHaveLength(1);
    expect(inbox.find((n) => n.event === 'fee.overdue')?.title).toBe('Fee overdue for Student1');
  });
});

describe('scheduler', () => {
  it('00:30 IST queues late fees and reconciliation for every school, once per slot', async () => {
    const scheduler = t.app.get(SchedulerService);
    const at = new Date('2026-10-08T19:00:00Z'); // 00:30 IST on 9 Oct
    const queued = await scheduler.tick(at);
    // 00:31: only the every-minute jobs (reminders, meeting alerts) — not late fees or reconciliation.
    const everyMinute = await scheduler.tick(new Date('2026-10-08T19:01:00Z'));
    expect(queued - everyMinute).toBeGreaterThanOrEqual(2);
  });
});
