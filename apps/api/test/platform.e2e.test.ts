import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/core/auth/password.service.js';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { EntitlementsService } from '../src/core/entitlements/entitlements.service.js';
import { SupportAccessService } from '../src/modules/platform/support-access.service.js';
import { PASSWORD, type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
const tok: Record<string, string> = {};
const run = randomInt(100_000, 999_999);
const supers = `super-${run}@schoolos.test`;
const support = `support-${run}@schoolos.test`;
let supportUserId = '';

const sa = () => t.as(tok.super!);
const sp = () => t.as(tok.support!);

async function platformUser(email: string, role: 'SUPER_ADMIN' | 'SUPPORT') {
  const passwordHash = await t.app.get(PasswordService).hash(PASSWORD);
  const user = await t.platform.user.create({ data: { name: role === 'SUPER_ADMIN' ? 'Super Admin' : 'Support Sam', email, passwordHash, status: 'ACTIVE' } });
  await t.platform.platformAdmin.create({ data: { userId: user.id, role } });
  return user.id;
}

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'plat-a');
  B = await createTenant(t, 'plat-b');
  await platformUser(supers, 'SUPER_ADMIN');
  supportUserId = await platformUser(support, 'SUPPORT');
  tok.super = (await t.login(supers)).token;
  tok.support = (await t.login(support)).token;
  tok.adminA = (await t.login(A.users.admin, A.slug)).token;
  tok.acctA = (await t.login(A.users.accountant, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

describe('platform access', () => {
  it('school users — even admins — cannot reach the console', async () => {
    expect((await t.as(tok.adminA!, A.slug).get('/v1/platform/dashboard')).status).toBe(403);
    expect((await t.as(tok.adminA!).get('/v1/platform/schools')).status).toBe(403);
  });

  it('support sees the dashboard and system but cannot manage', async () => {
    expect((await sp().get('/v1/platform/dashboard')).status).toBe(200);
    expect((await sp().get('/v1/platform/system')).status).toBe(200);
    expect((await sp().post('/v1/platform/schools', {})).status).toBe(403);
    expect((await sp().get('/v1/platform/audit')).status).toBe(403);
    expect((await sp().put(`/v1/platform/schools/${A.schoolId}/status`, { status: 'SUSPENDED', reason: 'nope' })).status).toBe(403);
  });

  it('dashboard and system report platform health', async () => {
    const d = (await sa().get('/v1/platform/dashboard')).body.data;
    expect(d.schools.total).toBeGreaterThanOrEqual(2);
    expect(d.health).toMatchObject({ failedJobs: expect.any(Number), outboxPending: expect.any(Number) });
    const s = (await sa().get('/v1/platform/system')).body.data;
    expect(s.database.ok).toBe(true);
    expect(s.queues.map((q: { queue: string }) => q.queue)).toContain('events');
  });
});

describe('schools', () => {
  let planId = '';
  let schoolId = '';
  const slug = `new-${run}`;

  it('creates a plan', async () => {
    const res = await sa().post('/v1/platform/plans', { code: `basic-${run}`, name: 'Basic', limits: { students: 3, storageGb: 1, smsPerMonth: 1, aiCallsPerMonth: 0 }, features: ['online_payments'], priceMonthlyPaise: 99_900 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    planId = res.body.data.id;
    expect((await sa().post('/v1/platform/plans', { code: `basic-${run}`, name: 'Again', limits: { students: 1, storageGb: 1, smsPerMonth: 0, aiCallsPerMonth: 0 } })).status).toBe(409);
  });

  it('onboards a school with an invited admin on a trial', async () => {
    const res = await sa().post('/v1/platform/schools', { name: 'Sunrise Public School', slug, board: 'CBSE', adminName: 'Meera Rao', adminPhone: `+9197${String(run).padStart(8, '0')}`, planId, trialDays: 14 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const s = res.body.data;
    schoolId = s.id;
    expect(s).toMatchObject({ slug, status: 'ONBOARDING', subscriptionStatus: 'TRIALING', plan: { code: `basic-${run}` } });
    expect(s.admins).toEqual([expect.objectContaining({ name: 'Meera Rao', status: 'INVITED' })]);
    expect(s.entitlements.limits.students).toBe(3);
    expect((await sa().post('/v1/platform/schools', { name: 'Dup', slug, adminName: 'X Y', adminPhone: '+919700000001' })).status).toBe(409);
    expect((await sa().post('/v1/platform/schools', { name: 'Reserved', slug: 'admin', adminName: 'X Y', adminPhone: '+919700000001' })).status).toBe(422);
  });

  it('lists and searches schools', async () => {
    const list = (await sa().get(`/v1/platform/schools?q=${slug}`)).body.data;
    expect(list.map((s: { id: string }) => s.id)).toEqual([schoolId]);
    expect((await sa().get(`/v1/platform/schools/${A.schoolId}`)).body.data.counts.teachers).toBeGreaterThan(0);
  });

  it('finds users by email or phone with their memberships', async () => {
    const res = await sa().get(`/v1/platform/users?q=${encodeURIComponent(A.users.admin)}`);
    expect(res.body.data[0].memberships[0]).toMatchObject({ schoolId: A.schoolId, roles: ['School Admin'] });
    expect((await sa().get(`/v1/platform/users?q=${run}`)).body.data.some((u: { name: string }) => u.name === 'Meera Rao')).toBe(true);
  });

  it('activates the school, then changes its subscription', async () => {
    expect((await sa().put(`/v1/platform/schools/${schoolId}/status`, { status: 'ACTIVE', reason: 'Onboarding done' })).body.data.status).toBe('ACTIVE');
    const res = await sa().put(`/v1/platform/schools/${schoolId}/subscription`, { planId, status: 'ACTIVE', currentPeriodStart: '2026-10-01', currentPeriodEnd: '2027-09-30', limitOverrides: { students: 500 }, notes: 'Paid annually by NEFT' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.subscription).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: '2027-09-30', limitOverrides: { students: 500 } });
    expect(res.body.data.entitlements.limits).toMatchObject({ students: 500, smsPerMonth: 1 });
  });
});

describe('entitlements', () => {
  let planId = '';
  beforeAll(async () => {
    planId = (await sa().post('/v1/platform/plans', { code: `tiny-${run}`, name: 'Tiny', limits: { students: 4, storageGb: 0.1, smsPerMonth: 2, aiCallsPerMonth: 0 } })).body.data.id;
    // A has 3 students: one more fits, then the plan is full.
    await sa().put(`/v1/platform/schools/${A.schoolId}/subscription`, { planId, status: 'ACTIVE' });
  });

  it('the school sees its plan and usage', async () => {
    const res = await t.as(tok.adminA!, A.slug).get('/v1/school/subscription');
    expect(res.body.data).toMatchObject({ plan: { code: `tiny-${run}` }, limits: { students: 4 }, usage: { students: 3 } });
    expect((await t.as(tok.acctA!, A.slug).get('/v1/school/subscription')).status).toBe(403);
  });

  it('stops adding students at the plan limit', async () => {
    const add = (n: string) => t.as(tok.adminA!, A.slug).post('/v1/students', { admissionNo: `L-${n}`, firstName: 'Limit', sectionId: A.sectionA });
    expect((await add('1')).status).toBe(201);
    const res = await add('2');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLAN_LIMIT_STUDENTS');
  });

  it('stops uploads past the storage limit', async () => {
    // 0.1 GB plan: ~100 MB already stored, so another 5 MB doesn't fit.
    await t.platform.file.create({ data: { schoolId: A.schoolId, bucket: 'local', objectKey: `schools/${A.schoolId}/document/full-${run}`, originalName: 'archive.zip', mimeType: 'application/zip', sizeBytes: BigInt(100 * 1024 ** 2), status: 'READY' } });
    const res = await t.as(tok.adminA!, A.slug).post('/v1/files/upload-url', { purpose: 'document', fileName: 'big.pdf', mimeType: 'application/pdf', sizeBytes: 5 * 1024 ** 2 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLAN_LIMIT_STORAGE');
  });

  it('counts SMS against the monthly allowance', async () => {
    const e = t.app.get(EntitlementsService);
    expect(await e.withinMonthly('sms', A.schoolId)).toBe(true);
    await e.record('sms', A.schoolId, 2);
    expect(await e.withinMonthly('sms', A.schoolId)).toBe(false);
    expect((await t.as(tok.adminA!, A.slug).get('/v1/school/subscription')).body.data.usage.smsThisMonth).toBe(2);
  });

  it('a per-school override lifts a limit', async () => {
    await sa().put(`/v1/platform/schools/${A.schoolId}/subscription`, { planId, status: 'ACTIVE', limitOverrides: { students: null } });
    expect((await t.as(tok.adminA!, A.slug).post('/v1/students', { admissionNo: 'L-3', firstName: 'Limit', sectionId: A.sectionA })).status).toBe(201);
  });

  it('a school with no subscription is never locked out', async () => {
    const res = await t.as((await t.login(B.users.admin, B.slug)).token, B.slug).get('/v1/school/subscription');
    expect(res.body.data).toMatchObject({ plan: null, limits: { students: null } });
  });
});

describe('feature flags', () => {
  const key = `beta.reports-${run}`;
  it('resolves kill switch > override > plan > default', async () => {
    expect((await sa().put('/v1/platform/flags', { key, description: 'New reports centre', defaultEnabled: false })).status).toBe(200);
    const features = () => t.as(tok.adminA!, A.slug).get('/v1/school/features').then((r) => r.body.data as string[]);
    expect(await features()).not.toContain(key);

    await sa().put(`/v1/platform/schools/${A.schoolId}/features/${key}`, { enabled: true });
    expect(await features()).toContain(key);
    const detail = (await sa().get(`/v1/platform/schools/${A.schoolId}`)).body.data;
    expect(detail.features.find((f: { key: string }) => f.key === key)).toMatchObject({ enabled: true, source: 'override' });

    await sa().put('/v1/platform/flags', { key, description: 'New reports centre', killSwitch: true });
    expect(await features()).not.toContain(key);
    await sa().put('/v1/platform/flags', { key, description: 'New reports centre', killSwitch: false, defaultEnabled: true });
    await sa().put(`/v1/platform/schools/${A.schoolId}/features/${key}`, { enabled: null });
    expect(await features()).toContain(key);
    expect((await sa().put(`/v1/platform/schools/${A.schoolId}/features/no-such-flag`, { enabled: true })).status).toBe(404);
  });
});

describe('suspension', () => {
  it('a suspended school’s members are locked out at once', async () => {
    const acct = t.as(tok.acctA!, A.slug);
    expect((await acct.get('/v1/payments')).status).toBe(200);
    await sa().put(`/v1/platform/schools/${A.schoolId}/status`, { status: 'SUSPENDED', reason: 'Unpaid for 3 months' });
    expect((await acct.get('/v1/payments')).status).toBe(403);
    await sa().put(`/v1/platform/schools/${A.schoolId}/status`, { status: 'ACTIVE', reason: 'Paid' });
    expect((await acct.get('/v1/payments')).status).toBe(200);
  });
});

describe('support access', () => {
  let grantId = '';
  const admin = () => t.as(tok.adminA!, A.slug);

  it('support asks; the school admin is notified', async () => {
    const res = await sp().post('/v1/platform/support-access', { schoolId: A.schoolId, reason: 'Fee receipts not printing for them', hours: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    grantId = res.body.data.id;
    expect(res.body.data.status).toBe('PENDING');
    expect((await sp().post('/v1/platform/support-access', { schoolId: A.schoolId, reason: 'Fee receipts not printing again', hours: 2 })).status).toBe(409);
    const inbox = (await admin().get('/v1/notifications?limit=50')).body.data as { event: string; body: string }[];
    expect(inbox.find((n) => n.event === 'support.access_requested')?.body).toContain('Fee receipts not printing');
  });

  it('without approval, support cannot enter the school', async () => {
    t.resetLimits();
    expect((await t.http.post('/v1/auth/login').send({ identifier: support, password: PASSWORD, schoolSlug: A.slug })).status).toBe(403);
  });

  it('only school admins see and approve requests', async () => {
    expect((await t.as(tok.acctA!, A.slug).get('/v1/school/support-access')).status).toBe(403);
    const list = (await admin().get('/v1/school/support-access')).body.data;
    expect(list).toContainEqual(expect.objectContaining({ id: grantId, status: 'PENDING', requestedBy: expect.objectContaining({ name: 'Support Sam' }) }));
    // Another school can't see or act on it.
    const bAdmin = t.as((await t.login(B.users.admin, B.slug)).token, B.slug);
    expect((await bAdmin.get('/v1/school/support-access')).body.data.map((g: { id: string }) => g.id)).not.toContain(grantId);
    expect((await bAdmin.post(`/v1/school/support-access/${grantId}/approve`)).status).toBe(404);

    const res = await admin().post(`/v1/school/support-access/${grantId}/approve`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ACTIVE', approvedBy: 'Admin' });
    expect(Date.parse(res.body.data.expiresAt) - Date.now()).toBeGreaterThan(1.9 * 3_600_000);
  });

  it('approved support can read but not change anything', async () => {
    const { token } = await t.login(support, A.slug);
    const s = t.as(token, A.slug);
    expect((await s.get('/v1/students')).status).toBe(200);
    expect((await s.get('/v1/payments')).status).toBe(200);
    expect((await s.post('/v1/students', { admissionNo: 'X-1', firstName: 'Nope', sectionId: A.sectionA })).status).toBe(403);
    expect((await s.get(`/v1/students/${A.students.s1}`)).body.data.guardians?.[0]?.phone ?? null).toBeNull();
    tok.supportInA = token;
  });

  it('the school can end it at any time', async () => {
    expect((await admin().post(`/v1/school/support-access/${grantId}/revoke`)).body.data.status).toBe('REVOKED');
    expect((await t.as(tok.supportInA!, A.slug).get('/v1/students')).status).toBe(403);
  });

  it('a grant ends by itself when time is up — and can be granted again later', async () => {
    const again = (await sp().post('/v1/platform/support-access', { schoolId: A.schoolId, reason: 'Following up on the receipts', hours: 1 })).body.data;
    await admin().post(`/v1/school/support-access/${again.id}/approve`);
    const { token } = await t.login(support, A.slug);
    expect((await t.as(token, A.slug).get('/v1/students')).status).toBe(200);

    await t.platform.supportAccessGrant.update({ where: { id: again.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const ended = await RequestContextStore.runAsSystem(A.schoolId, 'test', () => t.app.get(SupportAccessService).expireDue());
    expect(ended).toBe(1);
    expect((await t.as(token, A.slug).get('/v1/students')).status).toBe(403);
    expect((await admin().get('/v1/school/support-access')).body.data.find((g: { id: string }) => g.id === again.id).status).toBe('REVOKED');
    expect((await sp().get('/v1/platform/support-access')).body.data.length).toBe(2);
    const m = await t.platform.membership.findFirstOrThrow({ where: { schoolId: A.schoolId, userId: supportUserId } });
    expect(m.status).toBe('REMOVED');
  });
});

describe('platform audit', () => {
  it('records every console action, filterable by school', async () => {
    const res = await sa().get(`/v1/platform/audit?schoolId=${A.schoolId}&limit=100`);
    const actions = (res.body.data as { action: string; actor: { type: string } }[]).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['school.status', 'subscription.update', 'school.feature', 'support.request', 'support.approve', 'support.revoke', 'support.expire']));
    const status = res.body.data.find((a: { action: string }) => a.action === 'school.status');
    expect(status).toMatchObject({ actor: { type: 'PLATFORM', name: 'Super Admin' }, summary: 'Paid' });
    const page = await sa().get('/v1/platform/audit?limit=2');
    expect(page.body.page.nextCursor).toBeTruthy();
    const next = await sa().get(`/v1/platform/audit?limit=2&cursor=${page.body.page.nextCursor}`);
    expect(next.body.data[0].id).not.toBe(page.body.data[0].id);
  });
});
