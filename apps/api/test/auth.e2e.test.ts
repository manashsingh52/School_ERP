/** Authentication & sessions (docs/09 §1). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, PASSWORD, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'auth-a');
  B = await createTenant(t, 'auth-b');
});

afterAll(async () => {
  await t?.close();
});

const phoneOf = async (email: string) => (await t.platform.user.findUniqueOrThrow({ where: { email } })).phone!;

describe('password login', () => {
  it('gives the same error for a wrong password and an unknown account', async () => {
    t.resetLimits();
    const wrong = await t.http.post('/v1/auth/login').send({ identifier: A.users.admin, password: 'nope-nope' });
    const unknown = await t.http.post('/v1/auth/login').send({ identifier: 'ghost@test.school', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('logs in by phone in any common format', async () => {
    const phone = await phoneOf(A.users.admin);
    const local = phone.replace('+91', '0'); // "098…"
    const { body } = await t.login(local, A.slug);
    expect(body.activeMembershipId).toBeTruthy();
  });

  it("refuses a school the user doesn't belong to", async () => {
    t.resetLimits();
    const res = await t.http.post('/v1/auth/login').send({ identifier: A.users.admin, password: PASSWORD, schoolSlug: B.slug });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_SCHOOL_ACCESS');
  });

  it('rate-limits repeated attempts', async () => {
    t.resetLimits();
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await t.http.post('/v1/auth/login').send({ identifier: 'flood@test.school', password: 'x' })).status;
    }
    expect(last).toBe(429);
  });

  it('locks the account after 10 failures, even for the right password', async () => {
    const victim = await createTenant(t, 'lock');
    for (let i = 0; i < 10; i++) {
      t.resetLimits();
      await t.http.post('/v1/auth/login').send({ identifier: victim.users.admin, password: 'wrong-pass' });
    }
    t.resetLimits();
    const res = await t.http.post('/v1/auth/login').send({ identifier: victim.users.admin, password: PASSWORD });
    expect(res.status).toBe(401);
  });
});

describe('schools & memberships', () => {
  it('a user in two schools picks one; school routes need a school first', async () => {
    const shared = `shared-${A.slug}@test.school`;
    await t.schools.addMember({ schoolId: A.schoolId, name: 'Shared', email: shared, password: PASSWORD, roleKeys: ['school_admin'] });
    await t.schools.addMember({ schoolId: B.schoolId, name: 'Shared', email: shared, roleKeys: ['accountant'] });

    const { body, token } = await t.login(shared);
    expect(body.memberships).toHaveLength(2);
    expect(body.activeMembershipId).toBeNull();

    const blocked = await t.as(token).get('/v1/students');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('SCHOOL_NOT_SELECTED');

    const inB = body.memberships.find((m: { school: { slug: string } }) => m.school.slug === B.slug);
    const selected = await t.as(token).post('/v1/auth/select-school', { membershipId: inB.membershipId });
    expect(selected.status).toBe(200);

    const me = await t.as(selected.body.accessToken, B.slug).get('/v1/me');
    expect(me.body.data.membership.school.slug).toBe(B.slug);
    expect(me.body.data.membership.permissions['payment.collect']).toBe('ALL'); // accountant in B
    expect(me.body.data.membership.permissions['role.manage']).toBeUndefined();

    // The B token must not work on A's subdomain
    const wrongHost = await t.as(selected.body.accessToken, A.slug).get('/v1/students');
    expect(wrongHost.body.error.code).toBe('TENANT_MISMATCH');
  });

  it("can't select a membership that belongs to someone else", async () => {
    const other = await t.platform.membership.findFirstOrThrow({ where: { schoolId: B.schoolId } });
    const { token } = await t.login(A.users.admin, A.slug);
    const res = await t.as(token).post('/v1/auth/select-school', { membershipId: other.id });
    expect(res.status).toBe(403);
  });
});

describe('refresh tokens', () => {
  it('rotates on every use', async () => {
    const { refreshToken } = await t.login(A.users.teacher, A.slug);
    const first = await t.http.post('/v1/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.tokens.refreshToken).not.toBe(refreshToken);
    const access = await t.as(first.body.tokens.accessToken, A.slug).get('/v1/students');
    expect(access.status).toBe(200);
  });

  it('revokes the whole session when an old refresh token is reused (theft signal)', async () => {
    const { refreshToken } = await t.login(A.users.teacher, A.slug);
    const rotated = await t.http.post('/v1/auth/refresh').send({ refreshToken });
    // Pretend the old token was replayed a minute later (outside the concurrent-refresh grace).
    await t.platform.session.updateMany({
      where: { rotatedAt: { not: null }, revokedAt: null },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    const replay = await t.http.post('/v1/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);

    const legit = await t.http.post('/v1/auth/refresh').send({ refreshToken: rotated.body.tokens.refreshToken });
    expect(legit.status).toBe(401);
    const access = await t.as(rotated.body.tokens.accessToken, A.slug).get('/v1/students');
    expect(access.status).toBe(401);
  });

  it('logout kills both tokens', async () => {
    const { token, refreshToken } = await t.login(A.users.teacher, A.slug);
    expect((await t.as(token).post('/v1/auth/logout')).status).toBe(200);
    expect((await t.as(token, A.slug).get('/v1/students')).status).toBe(401);
    expect((await t.http.post('/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  it('lists devices and can sign one out', async () => {
    const one = await t.login(A.users.accountant, A.slug);
    const two = await t.login(A.users.accountant, A.slug);
    const list = await t.as(one.token).get('/v1/me/sessions');
    const others = list.body.data.filter((s: { current: boolean }) => !s.current);
    expect(others.length).toBeGreaterThanOrEqual(1);
    for (const s of others) await t.as(one.token).delete(`/v1/me/sessions/${s.id}`);
    expect((await t.as(two.token, A.slug).get('/v1/students')).status).toBe(401);
    expect((await t.as(one.token, A.slug).get('/v1/students')).status).toBe(200);
  });
});

describe('OTP', () => {
  it('logs in with a code sent to a known phone', async () => {
    t.resetLimits();
    const phone = await phoneOf(A.users.parent);
    const sent = await t.http.post('/v1/auth/otp/send').send({ phone });
    expect(sent.status).toBe(200);
    const code = t.otp.sent.get(phone)!;
    expect(code).toMatch(/^\d{6}$/);

    const ok = await t.http
      .post('/v1/auth/otp/verify')
      .send({ challengeId: sent.body.challengeId, code, schoolSlug: A.slug, platform: 'ANDROID' });
    expect(ok.status).toBe(200);
    expect(ok.body.activeMembershipId).toBeTruthy();

    const reuse = await t.http.post('/v1/auth/otp/verify').send({ challengeId: sent.body.challengeId, code });
    expect(reuse.status).toBe(401);
  });

  it('sends nothing to unknown numbers but answers the same way', async () => {
    t.resetLimits();
    const phone = '+919999999999';
    const res = await t.http.post('/v1/auth/otp/send').send({ phone });
    expect(res.status).toBe(200);
    expect(res.body.challengeId).toBeTruthy();
    expect(t.otp.sent.has(phone)).toBe(false);
  });

  it('caps wrong guesses at 5 per code', async () => {
    t.resetLimits();
    const phone = await phoneOf(A.users.accountant);
    const sent = await t.http.post('/v1/auth/otp/send').send({ phone });
    const code = t.otp.sent.get(phone)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await t.http.post('/v1/auth/otp/verify').send({ challengeId: sent.body.challengeId, code: wrong });
    }
    const right = await t.http.post('/v1/auth/otp/verify').send({ challengeId: sent.body.challengeId, code });
    expect(right.status).toBe(401);
  });

  it('enforces the resend wait', async () => {
    t.resetLimits();
    const phone = await phoneOf(B.users.parent);
    expect((await t.http.post('/v1/auth/otp/send').send({ phone })).status).toBe(200);
    const again = await t.http.post('/v1/auth/otp/send').send({ phone });
    expect(again.status).toBe(429);
  });

  it('resets a password and signs out every device', async () => {
    t.resetLimits();
    const old = await t.login(B.users.teacher, B.slug);
    const phone = await phoneOf(B.users.teacher);
    const sent = await t.http.post('/v1/auth/otp/send').send({ phone, purpose: 'RESET_PASSWORD' });
    const code = t.otp.sent.get(phone)!;
    const reset = await t.http
      .post('/v1/auth/password/reset')
      .send({ challengeId: sent.body.challengeId, code, newPassword: 'Brand-New-Pass-42' });
    expect(reset.status).toBe(200);

    expect((await t.as(old.token, B.slug).get('/v1/students')).status).toBe(401);
    t.resetLimits();
    const withOld = await t.http.post('/v1/auth/login').send({ identifier: B.users.teacher, password: PASSWORD });
    expect(withOld.status).toBe(401);
    await t.login(B.users.teacher, B.slug, 'Brand-New-Pass-42');
  });
});
