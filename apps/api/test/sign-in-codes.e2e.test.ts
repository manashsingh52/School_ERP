/** Sign-in without SMS: codes from the school office, and OTP_PROVIDER=none. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChannelGateway } from '../src/core/notify/channel-gateway.js';
import { createTenant, createTestApp, testEnv, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
let admin: string;

beforeAll(async () => {
  t = await createTestApp({ OTP_PROVIDER: 'none' });
  A = await createTenant(t, 'codes-a');
  B = await createTenant(t, 'codes-b');
  admin = (await t.login(A.users.admin, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const roles = async () => (await t.as(admin).get('/v1/roles')).body.data as { id: string; key: string }[];
const phone = () => `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function invite(name: string) {
  const parentRole = (await roles()).find((r) => r.key === 'parent')!;
  const p = phone();
  const res = await t.as(admin).post('/v1/members', { name, phone: p, roleIds: [parentRole.id] });
  expect(res.status).toBe(201);
  return { id: res.body.data.id as string, phone: p };
}

const redeem = (identifier: string, code: string, newPassword = 'Fresh-start-42') => {
  t.resetLimits();
  return t.http.post('/v1/auth/code/redeem').send({ identifier, code, newPassword, schoolSlug: A.slug });
};

describe('codes from the school office', () => {
  it('lets an invited parent sign in once, set a password, and activates the invitation', async () => {
    const m = await invite('Meera Shah');
    const issued = await t.as(admin).post(`/v1/members/${m.id}/sign-in-code`);
    expect(issued.status).toBe(201);
    expect(issued.body.data.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(issued.body.data.signInWith).toBe(m.phone);

    const res = await redeem(m.phone.replace('+91', ''), issued.body.data.code.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.activeMembershipId).toBe(m.id);
    expect((await t.platform.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('ACTIVE');

    // The password works afterwards; the code doesn't work twice.
    expect((await t.login(m.phone, A.slug, 'Fresh-start-42')).body.activeMembershipId).toBe(m.id);
    expect((await redeem(m.phone, issued.body.data.code)).status).toBe(401);
  });

  it('a new code replaces the old one, and wrong codes are refused', async () => {
    const m = await invite('Arun Rao');
    const first = (await t.as(admin).post(`/v1/members/${m.id}/sign-in-code`)).body.data.code as string;
    const second = (await t.as(admin).post(`/v1/members/${m.id}/sign-in-code`)).body.data.code as string;
    expect((await redeem(m.phone, first)).status).toBe(401);
    expect((await redeem(m.phone, 'ZZZZZZZZ')).status).toBe(401);
    expect((await redeem(m.phone, second)).status).toBe(200);
  });

  it('stops after 5 wrong tries on the same code', async () => {
    const m = await invite('Kavya Iyer');
    const code = (await t.as(admin).post(`/v1/members/${m.id}/sign-in-code`)).body.data.code as string;
    for (let i = 0; i < 5; i++) await redeem(m.phone, 'WRONGWRG');
    expect((await redeem(m.phone, code)).status).toBe(401);
  });

  it('needs user.manage, and refuses someone who uses Bastaa at another school', async () => {
    const teacher = (await t.login(A.users.teacher, A.slug)).token;
    const m = await invite('Dev Patel');
    expect((await t.as(teacher).post(`/v1/members/${m.id}/sign-in-code`)).status).toBe(403);

    // B's parent also joins A: A must not be able to reset B's active account.
    const bParent = await t.platform.user.findUniqueOrThrow({ where: { email: B.users.parent } });
    const parentRole = (await roles()).find((r) => r.key === 'parent')!;
    const joined = await t.as(admin).post('/v1/members', { name: bParent.name, phone: bParent.phone, roleIds: [parentRole.id] });
    const res = await t.as(admin).post(`/v1/members/${joined.body.data.id}/sign-in-code`);
    expect(res.status).toBe(409);
  });

  it('is written to the audit log', async () => {
    const m = await invite('Isha Gupta');
    await t.as(admin).post(`/v1/members/${m.id}/sign-in-code`);
    const audit = await t.platform.auditLog.findFirst({ where: { action: 'member.sign_in_code', entityId: m.id } });
    expect(audit).toBeTruthy();
  });
});

describe('OTP_PROVIDER=none', () => {
  it('refuses to send SMS codes and tells the app and login page', async () => {
    const parentPhone = (await t.platform.user.findUniqueOrThrow({ where: { email: A.users.parent } })).phone!;
    t.resetLimits();
    const send = await t.http.post('/v1/auth/otp/send').send({ phone: parentPhone, purpose: 'LOGIN' });
    expect(send.status).toBe(409);
    expect(send.body.error.code).toBe('OTP_UNAVAILABLE');
    expect((await t.http.get('/v1/app/config')).body.data.otpLogin).toBe(false);
    expect((await t.http.get(`/v1/public/schools/${A.slug}`)).body.data.otpLogin).toBe(false);
  });

  it('is allowed in production, unlike the console sender', () => {
    const prod = { NODE_ENV: 'production', PAYMENTS_GATEWAY: 'razorpay', STORAGE_DRIVER: 'gcs', GCS_PROJECT_ID: 'p', GCS_PRIVATE_BUCKET: 'b', AI_PROVIDER: 'none', SMS_PROVIDER: 'none' };
    expect(() => testEnv({ ...prod, OTP_PROVIDER: 'none' })).not.toThrow();
    expect(() => testEnv({ ...prod, OTP_PROVIDER: 'console' })).toThrow(/OTP_PROVIDER=console/);
    expect(() => testEnv({ ...prod, OTP_PROVIDER: 'none', SMS_PROVIDER: 'console' })).toThrow(/SMS_PROVIDER=console/);
  });
});

describe('MSG91', () => {
  let server: Server;
  const calls: { url: string; headers: Record<string, unknown>; body: string }[] = [];
  let m: TestApp;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        calls.push({ url: req.url!, headers: req.headers, body });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ type: 'success', message: 'req-1' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    m = await createTestApp({ OTP_PROVIDER: 'msg91', SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'auth-key', MSG91_OTP_TEMPLATE_ID: 'otp-tpl', MSG91_SMS_TEMPLATE_ID: 'sms-tpl', MSG91_BASE_URL: base });
  });

  afterAll(async () => {
    await m?.close();
    server?.close();
  });

  it('sends the sign-in code through the OTP API, never to the log', async () => {
    const tenant = await createTenant(m, 'codes-msg91');
    const parentPhone = (await m.platform.user.findUniqueOrThrow({ where: { email: tenant.users.parent } })).phone!;
    m.resetLimits();
    const res = await m.http.post('/v1/auth/otp/send').send({ phone: parentPhone, purpose: 'LOGIN' });
    expect(res.status).toBe(200);
    const call = calls.find((c) => c.url.startsWith('/api/v5/otp'))!;
    const query = new URL(call.url, 'http://x').searchParams;
    expect(query.get('template_id')).toBe('otp-tpl');
    expect(query.get('mobile')).toBe(parentPhone.slice(1));
    expect(query.get('otp')).toMatch(/^\d{6}$/);
    expect(call.headers.authkey).toBe('auth-key');
  });

  it('sends notification SMS through the DLT template', async () => {
    const result = await m.app.get(ChannelGateway).send({ channel: 'SMS', userId: 'u1', phone: '+919812345678', email: null, title: 'Absent today', body: 'Rahul was marked absent today.', data: {} });
    expect(result.status).toBe('SENT');
    const call = calls.find((c) => c.url === '/api/v5/flow')!;
    expect(JSON.parse(call.body)).toEqual({ template_id: 'sms-tpl', short_url: '0', recipients: [{ mobiles: '919812345678', message: 'Rahul was marked absent today.' }] });
  });
});
