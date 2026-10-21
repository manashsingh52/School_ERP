/** Quiet hours hold app pushes and SMS until the morning; a daily SMS limit caps a school's SMS. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { QueueService } from '../src/core/queue/queue.service.js';
import { NotificationsService, quietHoursDelayMs } from '../src/modules/notifications/notifications.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

const at = (utc: string) => new Date(`2026-10-21T${utc}Z`);
const quiet = { enabled: true, start: '21:00', end: '07:00' };
const minutes = (ms: number) => ms / 60_000;

describe('quiet hours (school time, Asia/Kolkata = UTC+5:30)', () => {
  it('sends at once during the day', () => {
    expect(quietHoursDelayMs(at('06:30:00'), 'Asia/Kolkata', quiet)).toBe(0); // 12:00 IST
    expect(quietHoursDelayMs(at('15:29:00'), 'Asia/Kolkata', quiet)).toBe(0); // 20:59 IST
  });

  it('holds a late-evening message until 07:00, across midnight', () => {
    expect(minutes(quietHoursDelayMs(at('15:30:00'), 'Asia/Kolkata', quiet))).toBe(600); // 21:00 → 07:00
    expect(minutes(quietHoursDelayMs(at('20:00:00'), 'Asia/Kolkata', quiet))).toBe(330); // 01:30 → 07:00
    expect(quietHoursDelayMs(at('01:30:00'), 'Asia/Kolkata', quiet)).toBe(0); // 07:00 sharp
  });

  it('works for a window inside one day, and can be switched off', () => {
    expect(minutes(quietHoursDelayMs(at('08:30:00'), 'Asia/Kolkata', { enabled: true, start: '13:00', end: '15:00' }))).toBe(60); // 14:00
    expect(quietHoursDelayMs(at('20:00:00'), 'Asia/Kolkata', { ...quiet, enabled: false })).toBe(0);
  });
});

describe('settings and the daily SMS limit', () => {
  let t: TestApp;
  let A: Tenant;

  beforeAll(async () => {
    t = await createTestApp({ RUN_WORKERS: 'true', SMS_PROVIDER: 'console' });
    await t.app.get(QueueService).startWorkers();
    A = await createTenant(t, 'quiet');
  });

  afterAll(async () => {
    await t?.close();
  });

  it('only people who manage notifications can change them', async () => {
    const admin = (await t.login(A.users.admin, A.slug)).token;
    const teacher = (await t.login(A.users.teacher, A.slug)).token;
    const body = { quietHours: { enabled: true, start: '22:00', end: '06:30' }, dailySmsLimit: 1 };
    expect((await t.as(teacher, A.slug).put('/v1/school/settings/notifications', body)).status).toBe(403);
    expect((await t.as(admin, A.slug).put('/v1/school/settings/notifications', { ...body, quietHours: { enabled: true, start: '9pm', end: '07:00' } })).status).toBe(422);
    const res = await t.as(admin, A.slug).put('/v1/school/settings/notifications', body);
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toEqual(body);
  });

  it('stops SMS for the day at the limit; the inbox still gets everything', async () => {
    const db = t.platform;
    await db.schoolSettings.update({ where: { schoolId: A.schoolId }, data: { notifications: { quietHours: { enabled: false, start: '21:00', end: '07:00' }, dailySmsLimit: 1 } } });
    await db.notificationRule.upsert({ where: { schoolId_event: { schoolId: A.schoolId, event: 'attendance.absent' } }, create: { schoolId: A.schoolId, event: 'attendance.absent', enabled: true, channels: ['IN_APP', 'SMS'] }, update: { enabled: true, channels: ['IN_APP', 'SMS'] } });
    const parent = await db.membership.findFirstOrThrow({ where: { schoolId: A.schoolId, user: { email: A.users.parent } } });
    const notifications = t.app.get(NotificationsService);
    for (const day of ['1 Oct', '2 Oct']) {
      await RequestContextStore.runAsSystem(A.schoolId, `test-${day}`, () => notifications.notify({ event: 'attendance.absent', recipients: [{ membershipId: parent.id, vars: { student: 'Rahul', class: '8-A', date: day } }] }));
    }
    const deadline = Date.now() + 15_000;
    let rows: { status: string; lastError: string | null }[] = [];
    while (Date.now() < deadline) {
      rows = await db.notificationDelivery.findMany({ where: { channel: 'SMS', notification: { schoolId: A.schoolId } }, orderBy: { id: 'asc' } });
      if (rows.length === 2 && rows.every((r) => r.status !== 'QUEUED')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(rows.map((r) => r.status).sort()).toEqual(['SENT', 'SKIPPED']);
    expect(rows.find((r) => r.status === 'SKIPPED')!.lastError).toBe("The school's daily SMS limit is reached");
    expect(await db.notification.count({ where: { schoolId: A.schoolId, membershipId: parent.id, event: 'attendance.absent' } })).toBe(2);
  });
});
