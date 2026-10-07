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
    expect(first.body.page.total).toBeGreaterThanOrEqual(6);
    const ids = [...first.body.data, ...second.body.data].map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('rejects junk query parameters with a friendly error', async () => {
    const res = await t.as(token, A.slug).get('/v1/students?pageSize=5000');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('Idempotency-Key', () => {
  const create = (key: string, body: object) =>
    t.as(token, A.slug).post('/v1/students', body).set('idempotency-key', key);

  it('replays the first result instead of creating twice', async () => {
    const body = { admissionNo: 'IDEM-1', firstName: 'Once', sectionId: A.sectionA };
    const first = await create('key-idem-0001', body);
    const second = await create('key-idem-0001', body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    const list = await t.as(token, A.slug).get('/v1/students?q=IDEM-1');
    expect(list.body.page.total).toBe(1);
  });

  it('refuses the same key for a different request', async () => {
    await create('key-idem-0002', { admissionNo: 'IDEM-2', firstName: 'A', sectionId: A.sectionA });
    const other = await create('key-idem-0002', { admissionNo: 'IDEM-3', firstName: 'B', sectionId: A.sectionA });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('replays business errors too', async () => {
    const body = { admissionNo: 'S-101', firstName: 'Dup', sectionId: A.sectionA };
    const first = await create('key-idem-0003', body);
    const again = await create('key-idem-0003', body);
    expect(first.status).toBe(409);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('STUDENT_ADMISSION_NO_TAKEN');
  });
});
