/**
 * Tenant isolation over HTTP (docs/03-multi-tenancy.md §7) — "School A user must NEVER be able
 * to retrieve School B data by modifying an ID". Runs the full app against real Postgres + RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RouteAccessCheck } from '../src/core/auth/route-access.check.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
const tokens: Record<'adminA' | 'teacherA' | 'parentA' | 'accountantA' | 'adminB', string> = {} as never;

/**
 * Every route with an :id parameter must be listed here with a B-owned id to probe.
 * A new module that adds an :id route without an entry FAILS the "registry is complete" test,
 * so cross-tenant coverage can't be forgotten.
 */
type Probe = string | { id: string; body: object };
const CROSS_TENANT_PROBES: Record<string, (b: Tenant) => Probe> = {
  'GET /v1/students/:id': (b) => b.students.s1,
  'PATCH /v1/students/:id': (b) => b.students.s1,
  'PATCH /v1/academic-years/:id': (b) => b.yearId,
  'POST /v1/academic-years/:id/activate': (b) => b.yearId,
  'POST /v1/academic-years/:id/close': (b) => b.yearId,
  'PATCH /v1/classes/:id': (b) => b.classId,
  'DELETE /v1/classes/:id': (b) => b.classId,
  'PATCH /v1/sections/:id': (b) => b.sectionA,
  'DELETE /v1/sections/:id': (b) => b.sectionA,
  'PATCH /v1/subjects/:id': (b) => b.subjectId,
  'DELETE /v1/teaching-assignments/:id': (b) => b.assignmentId,
  'GET /v1/teachers/:id': (b) => b.teacherId,
  'PATCH /v1/teachers/:id': (b) => b.teacherId,
  'POST /v1/teachers/:id/invite': (b) => b.teacherId,
  'GET /v1/guardians/:id': (b) => b.guardianId,
  'PATCH /v1/guardians/:id': (b) => b.guardianId,
  'POST /v1/guardians/:id/children': (b) => ({ id: b.guardianId, body: { studentId: b.students.s1, relation: 'FATHER' } }),
  'DELETE /v1/guardians/:id/children/:studentId': (b) => b.guardianId,
  'POST /v1/guardians/:id/invite': (b) => b.guardianId,
  'PATCH /v1/members/:id': (b) => b.adminMembershipId,
  'PATCH /v1/roles/:id': (b) => b.teacherRoleId,
  'PUT /v1/roles/:id/permissions': (b) => ({ id: b.teacherRoleId, body: { permissions: [] } }),
  'DELETE /v1/roles/:id': (b) => b.teacherRoleId,
  'POST /v1/files/:id/complete': (b) => b.fileId,
  'GET /v1/files/:id/download-url': (b) => b.fileId,
};

/** Routes with :id that are not tenant data (e.g. scoped to the signed-in user). */
const NON_TENANT_ID_ROUTES = new Set([
  'DELETE /v1/me/sessions/:id',
  'GET /v1/public/schools/:slug',
  // Signed-token routes: authorised by an HMAC token, not by tenant id (dev storage only)
  'PUT /v1/files/local/:token',
  'GET /v1/files/local/:token',
]);

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'iso-a');
  B = await createTenant(t, 'iso-b');
  tokens.adminA = (await t.login(A.users.admin, A.slug)).token;
  tokens.teacherA = (await t.login(A.users.teacher, A.slug)).token;
  tokens.parentA = (await t.login(A.users.parent, A.slug)).token;
  tokens.accountantA = (await t.login(A.users.accountant, A.slug)).token;
  tokens.adminB = (await t.login(B.users.admin, B.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((s) => s.id);

describe('cross-tenant access (School A → School B)', () => {
  it("returns 404 for B's student by id", async () => {
    const res = await t.as(tokens.adminA, A.slug).get(`/v1/students/${B.students.s1}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it("can't edit B's student, and B's data is unchanged", async () => {
    const res = await t.as(tokens.adminA, A.slug).patch(`/v1/students/${B.students.s1}`, { firstName: 'Hacked' });
    expect(res.status).toBe(404);
    const check = await t.as(tokens.adminB, B.slug).get(`/v1/students/${B.students.s1}`);
    expect(check.body.data.firstName).not.toBe('Hacked');
  });

  it("never lists B's students", async () => {
    const res = await t.as(tokens.adminA, A.slug).get('/v1/students?pageSize=100');
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual(Object.values(A.students).sort());
    expect(ids(res)).not.toContain(B.students.s1);
  });

  it("rejects creating a student in B's section", async () => {
    const res = await t
      .as(tokens.adminA, A.slug)
      .post('/v1/students', { admissionNo: 'X-1', firstName: 'Mallory', sectionId: B.sectionA });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it("blocks an A token used on B's subdomain", async () => {
    const res = await t.as(tokens.adminA, B.slug).get('/v1/students');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('probe registry covers every :id route', () => {
    const routes = t.app.get(RouteAccessCheck).routes();
    const idRoutes = routes
      .filter((r) => r.path.includes('/:'))
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => !NON_TENANT_ID_ROUTES.has(key));
    const missing = idRoutes.filter((key) => !CROSS_TENANT_PROBES[key]);
    expect(missing, 'add these routes to CROSS_TENANT_PROBES').toEqual([]);
  });

  it.each(Object.keys(CROSS_TENANT_PROBES))('%s with a B id → 404', async (key) => {
    const [method, path] = key.split(' ') as [string, string];
    const probe = CROSS_TENANT_PROBES[key]!(B);
    const { id, body } = typeof probe === 'string' ? { id: probe, body: {} } : probe;
    const url = path.replace(':id', id).replace(':studentId', B.students.s1);
    const client = t.as(tokens.adminA, A.slug);
    const res =
      method === 'GET' ? await client.get(url)
      : method === 'PATCH' ? await client.patch(url, body)
      : method === 'PUT' ? await client.put(url, body)
      : method === 'DELETE' ? await client.delete(url)
      : await client.post(url, body);
    expect(res.status).toBe(404);
  });
});

describe('data scopes inside one school', () => {
  it('a teacher sees only students of their assigned section', async () => {
    const res = await t.as(tokens.teacherA, A.slug).get('/v1/students?pageSize=100');
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual([A.students.s1, A.students.s2].sort());
    const outside = await t.as(tokens.teacherA, A.slug).get(`/v1/students/${A.students.s3}`);
    expect(outside.status).toBe(404);
  });

  it("a teacher can't edit students (no student.edit permission)", async () => {
    const res = await t.as(tokens.teacherA, A.slug).patch(`/v1/students/${A.students.s1}`, { firstName: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('a parent sees only their own child', async () => {
    const res = await t.as(tokens.parentA, A.slug).get('/v1/students');
    expect(ids(res)).toEqual([A.students.s1]);
    const sibling = await t.as(tokens.parentA, A.slug).get(`/v1/students/${A.students.s2}`);
    expect(sibling.status).toBe(404);
    const own = await t.as(tokens.parentA, A.slug).get(`/v1/students/${A.students.s1}`);
    expect(own.status).toBe(200);
  });

  it("an accountant can't create students", async () => {
    const res = await t
      .as(tokens.accountantA, A.slug)
      .post('/v1/students', { admissionNo: 'Y-1', firstName: 'New', sectionId: A.sectionA });
    expect(res.status).toBe(403);
  });
});

describe('writes are audited in the right school', () => {
  it('records student.create with actor and school', async () => {
    const res = await t
      .as(tokens.adminA, A.slug)
      .post('/v1/students', { admissionNo: 'NEW-1', firstName: 'Kabir', sectionId: A.sectionA, rollNo: 9 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ admissionNo: 'NEW-1', className: 'Class 8', sectionName: 'A', rollNo: 9 });

    const audit = await t.platform.auditLog.findFirst({ where: { entityId: res.body.data.id } });
    expect(audit).toMatchObject({ schoolId: A.schoolId, action: 'student.create', actorType: 'USER' });

    const dup = await t
      .as(tokens.adminA, A.slug)
      .post('/v1/students', { admissionNo: 'NEW-1', firstName: 'Again', sectionId: A.sectionA });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('STUDENT_ADMISSION_NO_TAKEN');
  });

  it('records only changed fields on update', async () => {
    const res = await t.as(tokens.adminA, A.slug).patch(`/v1/students/${A.students.s2}`, { firstName: 'Renamed' });
    expect(res.status).toBe(200);
    const audit = await t.platform.auditLog.findFirst({
      where: { entityId: A.students.s2, action: 'student.update' },
    });
    expect(audit?.before).toEqual({ firstName: 'Student2' });
    expect(audit?.after).toEqual({ firstName: 'Renamed' });
  });
});

describe('route access rules', () => {
  it('every route declares an access rule, and only allow-listed routes are public', () => {
    const routes = t.app.get(RouteAccessCheck).routes();
    expect(routes.filter((r) => !r.rule)).toEqual([]);
    const publicRoutes = routes.filter((r) => r.rule?.kind === 'public').map((r) => `${r.method} ${r.path}`);
    expect(publicRoutes.sort()).toEqual(
      [
        'GET /health',
        'GET /v1/files/local/:token',
        'GET /v1/public/schools/:slug',
        'PUT /v1/files/local/:token',
        'POST /v1/auth/login',
        'POST /v1/auth/otp/send',
        'POST /v1/auth/otp/verify',
        'POST /v1/auth/password/reset',
        'POST /v1/auth/refresh',
      ].sort(),
    );
  });
});
