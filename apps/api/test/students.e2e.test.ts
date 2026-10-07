/** Students module behaviour (isolation lives in isolation.e2e.test.ts). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let token: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'stu');
  token = (await t.login(A.users.admin, A.slug)).token;
  for (const [admissionNo, firstName, lastName] of [
    ['S-101', 'Rahul', 'Kumar'],
    ['S-102', 'Rahul', 'Malhotra'],
    ['S-103', 'Kumar', 'Sanu'],
  ] as const) {
    const res = await t.as(token, A.slug).post('/v1/students', { admissionNo, firstName, lastName, sectionId: A.sectionB });
    expect(res.status).toBe(201);
  }
});

afterAll(async () => {
  await t?.close();
});

const names = (res: { body: { data: { firstName: string; lastName: string | null }[] } }) =>
  res.body.data.map((s) => `${s.firstName} ${s.lastName ?? ''}`.trim());

describe('student search', () => {
  it('matches every word across first and last name', async () => {
    const res = await t.as(token, A.slug).get('/v1/students?q=rahul%20ku');
    expect(names(res)).toEqual(['Rahul Kumar']);
  });

  it('matches admission number prefixes', async () => {
    const res = await t.as(token, A.slug).get('/v1/students?q=S-10');
    expect(res.body.page.total).toBe(3);
  });

  it('paginates with a stable order', async () => {
    const first = await t.as(token, A.slug).get('/v1/students?pageSize=2&page=1');
    const second = await t.as(token, A.slug).get('/v1/students?pageSize=2&page=2');
    expect(first.body.page.total).toBe(6);
    const ids = [...first.body.data, ...second.body.data].map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('rejects junk query parameters with a friendly error', async () => {
    const res = await t.as(token, A.slug).get('/v1/students?pageSize=5000');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
