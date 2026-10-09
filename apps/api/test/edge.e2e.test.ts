/** Behind Cloudflare (docs/10 §3 option B): only requests carrying the edge secret are served. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

const EDGE = 'e'.repeat(40);
let t: TestApp;
let A: Tenant;

beforeAll(async () => {
  t = await createTestApp({ EDGE_SHARED_SECRET: EDGE });
  A = await createTenant(t, 'edge');
});

afterAll(async () => {
  await t?.close();
});

describe('edge secret', () => {
  it('the public run.app URL answers 404 without it; health checks stay open', async () => {
    expect((await t.http.get('/v1/app/config')).status).toBe(404);
    expect((await t.http.get('/v1/app/config').set('x-edge-secret', 'wrong'.padEnd(40, 'x'))).status).toBe(404);
    expect((await t.http.get('/health')).status).toBe(200);
    expect((await t.http.get('/v1/app/config').set('x-edge-secret', EDGE)).status).toBe(200);
  });

  it("uses Cloudflare's client IP only when the secret matches", async () => {
    t.resetLimits();
    const login = await t.http.post('/v1/auth/login').set('x-edge-secret', EDGE).set('cf-connecting-ip', '203.0.113.7').send({ identifier: A.users.admin, password: PASSWORD, schoolSlug: A.slug, platform: 'ANDROID' });
    expect(login.status).toBe(200);
    const sessions = await t.http.get('/v1/me/sessions').set('x-edge-secret', EDGE).set('authorization', `Bearer ${login.body.tokens.accessToken}`);
    expect(sessions.body.data.find((s: { current: boolean }) => s.current).ip).toBe('203.0.113.7');
  });
});
