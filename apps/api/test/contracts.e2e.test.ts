/** The API description (packages/contracts ENDPOINTS → openapi.json) must match the real routes. */
import { ENDPOINTS } from '@schoolos/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RouteAccessCheck } from '../src/core/auth/route-access.check.js';
import { createTestApp, type TestApp } from './helpers.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t?.close();
});

describe('API contract registry', () => {
  it('lists every route, and nothing that does not exist', () => {
    const routes = t.app.get(RouteAccessCheck).routes().map((r) => `${r.method} ${r.path}`).sort();
    expect(Object.keys(ENDPOINTS).sort()).toEqual(routes);
  });

  it('declares the same access rule as the code', () => {
    for (const route of t.app.get(RouteAccessCheck).routes()) {
      const key = `${route.method} ${route.path}`;
      const expected = route.rule?.kind === 'permission' || route.rule?.kind === 'platform' ? `${route.rule.kind}:${route.rule.permission}` : route.rule?.kind;
      expect(ENDPOINTS[key]?.access, key).toBe(expected);
    }
  });
});
