import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/core/auth/password.service.js';
import { createOwner } from '../src/ops/owner.js';
import { TestApp, createTestApp } from './helpers.js';

let t: TestApp;
const email = `owner-${randomInt(100_000, 999_999)}@bastaa.test`;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('owner account for a live server (pnpm owner:create)', () => {
  it('refuses a short or common password and a bad email', async () => {
    const passwords = t.app.get(PasswordService);
    await expect(createOwner(t.platform, passwords, { email, password: 'short' })).rejects.toThrow(/12 characters/);
    await expect(createOwner(t.platform, passwords, { email: 'not-an-email', password: 'Long-enough-pass-1' })).rejects.toThrow(/OWNER_EMAIL/);
    await expect(createOwner(t.platform, passwords, { email, password: 'Long-enough-pass-1', phone: '98765' })).rejects.toThrow(/OWNER_PHONE/);
  });

  it('creates a super admin who can sign in to the console, with plans in place', async () => {
    const res = await createOwner(t.platform, t.app.get(PasswordService), { email: email.toUpperCase(), name: 'Asha Owner', password: 'First-Owner-Pass-1' });
    expect(res.created).toBe(true);
    expect(await t.platform.plan.count()).toBeGreaterThan(0);
    const login = await t.login(email, undefined, 'First-Owner-Pass-1');
    const me = await t.as(login.token).get('/v1/me').expect(200);
    expect(me.body.data.platformRole).toBe('SUPER_ADMIN');
    await t.as(login.token).get('/v1/platform/schools').expect(200);
  });

  it('running it again sets a new password and signs the old sessions out', async () => {
    const old = await t.login(email, undefined, 'First-Owner-Pass-1');
    const res = await createOwner(t.platform, t.app.get(PasswordService), { email, password: 'Second-Owner-Pass-2' });
    expect(res.created).toBe(false);
    await t.http.post('/v1/auth/refresh').send({ refreshToken: old.refreshToken }).expect(401);
    t.resetLimits();
    await t.http.post('/v1/auth/login').send({ identifier: email, password: 'First-Owner-Pass-1' }).expect(401);
    await t.login(email, undefined, 'Second-Owner-Pass-2');
  });
});
