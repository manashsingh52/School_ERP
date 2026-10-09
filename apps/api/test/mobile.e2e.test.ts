/** Mobile support (docs/01 §7): app config gate, push-token registration, OpenAPI. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const TOKEN = 'fcm-token-'.padEnd(64, 'x');

beforeAll(async () => {
  t = await createTestApp({ MOBILE_MIN_VERSION: '1.2.0', MOBILE_LATEST_VERSION: '1.4.0' });
  A = await createTenant(t, 'mob');
});

afterAll(async () => {
  await t?.close();
});

async function mobileLogin(identifier: string) {
  t.resetLimits();
  const res = await t.http.post('/v1/auth/login').send({ identifier, password: PASSWORD, schoolSlug: A.slug, platform: 'ANDROID', deviceName: 'Pixel 9' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.tokens as { accessToken: string; refreshToken: string };
}

describe('app config', () => {
  it('tells the app its minimum version and checkout, without signing in', async () => {
    const res = await t.http.get('/v1/app/config');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ minVersion: '1.2.0', latestVersion: '1.4.0', storeUrls: { android: null, ios: null }, paymentsDriver: 'mock' });
  });
});

describe('push tokens', () => {
  it('registers a phone and moves the token to whoever signs in next on it', async () => {
    const parent = await mobileLogin(A.users.parent);
    expect((await t.as(parent.accessToken).put('/v1/me/devices', { token: TOKEN, platform: 'ANDROID' })).status).toBe(200);
    expect((await t.as(parent.accessToken).put('/v1/me/devices', { token: 'short', platform: 'ANDROID' })).status).toBe(422);
    const row = await t.platform.deviceToken.findUniqueOrThrow({ where: { token: TOKEN }, include: { user: { select: { email: true } } } });
    expect(row.user.email).toBe(A.users.parent);

    const teacher = await mobileLogin(A.users.teacher);
    await t.as(teacher.accessToken).put('/v1/me/devices', { token: TOKEN, platform: 'ANDROID' });
    expect((await t.platform.deviceToken.findUniqueOrThrow({ where: { token: TOKEN }, include: { user: { select: { email: true } } } })).user.email).toBe(A.users.teacher);
  });

  it('signing out stops pushes to that phone — even after token refreshes', async () => {
    const s = await mobileLogin(A.users.accountant);
    await t.as(s.accessToken).put('/v1/me/devices', { token: `${TOKEN}-acct`, platform: 'IOS' });
    const refreshed = await t.http.post('/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(refreshed.status).toBe(200);
    expect((await t.as(refreshed.body.tokens.accessToken).post('/v1/auth/logout')).status).toBeLessThan(300);
    expect(await t.platform.deviceToken.count({ where: { token: `${TOKEN}-acct` } })).toBe(0);
  });

  it('a user can only remove their own token', async () => {
    const admin = await mobileLogin(A.users.admin);
    await t.as(admin.accessToken).delete('/v1/me/devices').send({ token: TOKEN });
    expect(await t.platform.deviceToken.count({ where: { token: TOKEN } })).toBe(1); // still the teacher's
  });

  it('records the phone as a mobile session', async () => {
    const s = await mobileLogin(A.users.parent);
    const sessions = (await t.as(s.accessToken).get('/v1/me/sessions')).body.data as { platform: string; deviceName: string | null }[];
    expect(sessions.some((x) => x.platform === 'ANDROID' && x.deviceName === 'Pixel 9')).toBe(true);
  });
});

describe('teacher home data', () => {
  it('lists the marks sheets a teacher can still fill in', async () => {
    const teacher = await mobileLogin(A.users.teacher);
    const res = await t.as(teacher.accessToken).get('/v1/exams/marks/mine');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ exam: { id: A.examId, name: 'Unit Test 1' }, sheets: [expect.objectContaining({ section: expect.objectContaining({ label: '8-A' }), subject: expect.objectContaining({ name: 'Mathematics' }) })] })]);
    const parent = await mobileLogin(A.users.parent);
    expect((await t.as(parent.accessToken).get('/v1/exams/marks/mine')).status).toBe(403);
  });
});

describe('openapi', () => {
  it('describes every route with its access rule and request schema', async () => {
    const res = await t.http.get('/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    const collect = res.body.paths['/v1/payments/collect'].post;
    expect(collect['x-access']).toBe('permission:payment.collect');
    expect(collect.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header' }));
    expect(collect.requestBody.content['application/json'].schema.properties).toHaveProperty('invoiceIds');
    expect(res.body.paths['/v1/students/{id}'].get).toBeTruthy();
    expect(res.body.paths['/v1/app/config'].get.security).toEqual([]);
  });
});
