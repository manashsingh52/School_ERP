/** RATE_LIMIT_STORE=postgres: limits hold across API instances (production runs up to 3). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PostgresRateLimitStore } from '../src/core/rate-limit/rate-limit.js';
import { createTestApp, type TestApp } from './helpers.js';

let one: TestApp;
let two: TestApp;

beforeAll(async () => {
  one = await createTestApp({ RATE_LIMIT_STORE: 'postgres' });
  two = await createTestApp({ RATE_LIMIT_STORE: 'postgres' });
  await one.platform.rateLimitCounter.deleteMany({});
});

afterAll(async () => {
  await one?.close();
  await two?.close();
});

it('counts sign-in attempts on every instance together', async () => {
  const attempt = (t: TestApp) => t.http.post('/v1/auth/login').send({ identifier: 'shared-flood@test.school', password: 'x' });
  const statuses: number[] = [];
  for (let i = 0; i < 3; i++) statuses.push((await attempt(one)).status, (await attempt(two)).status);
  expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
  expect(statuses[5]).toBe(429);
});

it('starts a fresh window when the old one is over', async () => {
  const store = one.app.get(PostgresRateLimitStore);
  expect((await store.hit('window-test', 1)).count).toBe(1);
  expect((await store.hit('window-test', 1)).count).toBe(2);
  await new Promise((r) => setTimeout(r, 1100));
  const next = await store.hit('window-test', 1);
  expect(next.count).toBe(1);
  expect(next.resetInSeconds).toBe(1);
});
