/**
 * Tenant isolation over HTTP (docs/03-multi-tenancy.md §7) — "School A user must NEVER be able
 * to retrieve School B data by modifying an ID". Runs the full app against real Postgres + RLS.
 */
import { randomUUID } from 'node:crypto';
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
type Probe = string | { id: string; body?: object; query?: string };
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
  'GET /v1/imports/:id': (b) => b.importJobId,
  'PUT /v1/imports/:id/mapping': (b) => ({ id: b.importJobId, body: { mapping: {} } }),
  'GET /v1/imports/:id/rows': (b) => b.importJobId,
  'POST /v1/imports/:id/commit': (b) => b.importJobId,
  'GET /v1/imports/:id/problems': (b) => b.importJobId,
  'POST /v1/files/:id/complete': (b) => b.fileId,
  'GET /v1/files/:id/download-url': (b) => b.fileId,
  'GET /v1/sections/:id/attendance': (b) => b.sectionA,
  'PUT /v1/sections/:id/attendance': (b) => ({ id: b.sectionA, body: { date: '2026-06-01', records: [] } }),
  'GET /v1/sections/:id/attendance/month': (b) => ({ id: b.sectionA, query: 'month=2026-06' }),
  'GET /v1/students/:id/attendance': (b) => b.students.s1,
  'POST /v1/notifications/:id/read': (b) => b.notificationId,
  'GET /v1/homework/:id': (b) => b.homeworkId,
  'PATCH /v1/homework/:id': (b) => ({ id: b.homeworkId, body: { title: 'x' } }),
  'POST /v1/homework/:id/publish': (b) => b.homeworkId,
  'DELETE /v1/homework/:id': (b) => b.homeworkId,
  'GET /v1/homework/:id/attachments/:fileId': (b) => b.homeworkId,
  'PUT /v1/bell-schedules/:id': (b) => ({ id: b.bellScheduleId, body: { name: 'X', periods: [{ name: 'P1', startTime: '08:00', endTime: '08:40' }] } }),
  'DELETE /v1/bell-schedules/:id': (b) => b.bellScheduleId,
  'PUT /v1/timetables/:id/entries': (b) => ({ id: b.timetableId, body: { entries: [] } }),
  'POST /v1/timetables/:id/publish': (b) => b.timetableId,
  'DELETE /v1/timetables/:id': (b) => b.timetableId,
  'GET /v1/teachers/:id/timetable': (b) => b.teacherId,
  'GET /v1/notices/:id': (b) => b.noticeId,
  'PATCH /v1/fee-heads/:id': (b) => ({ id: b.feeHeadId, body: { name: 'X', code: 'XX', type: 'OTHER' } }),
  'GET /v1/fee-structures/:id': (b) => b.feeStructureId,
  'PUT /v1/fee-structures/:id': (b) => ({ id: b.feeStructureId, body: { name: 'X', classIds: [b.classId], items: [{ feeHeadId: b.feeHeadId, amountPaise: 100 }], installments: [{ name: 'X', dueDate: '2026-05-01', splits: { [b.feeHeadId]: 100 } }] } }),
  'POST /v1/fee-structures/:id/publish': (b) => b.feeStructureId,
  'DELETE /v1/fee-structures/:id': (b) => b.feeStructureId,
  'PATCH /v1/concession-types/:id': (b) => ({ id: b.concessionTypeId, body: { name: 'X', kind: 'OTHER', calc: 'FLAT', valuePaise: 100 } }),
  'POST /v1/concessions/:id/decision': (b) => ({ id: b.concessionId, body: { decision: 'APPROVED' } }),
  'GET /v1/students/:id/fee-options': (b) => b.students.s1,
  'PUT /v1/students/:id/fee-options': (b) => ({ id: b.students.s1, body: { optedOptionalItemIds: [] } }),
  'GET /v1/invoices/:id': (b) => b.invoiceId,
  'POST /v1/invoices/:id/adjustments': (b) => ({ id: b.invoiceId, body: { amountPaise: 100, reason: 'test' } }),
  'POST /v1/invoices/:id/cancel': (b) => ({ id: b.invoiceId, body: { reason: 'test' } }),
  'GET /v1/payments/:id': (b) => b.paymentId,
  'GET /v1/payments/:id/receipt': (b) => b.paymentId,
  'POST /v1/payments/:id/void': (b) => ({ id: b.paymentId, body: { reason: 'test' } }),
  'GET /v1/students/:id/fees': (b) => b.students.s1,
  'POST /v1/payments/:id/refunds': (b) => ({ id: b.paymentId, body: { amountPaise: 100, reason: 'test' } }),
  'POST /v1/students/:id/credits/apply': (b) => ({ id: b.students.s1, body: { invoiceId: b.invoiceId } }),
  'PUT /v1/grading-scales/:id': (b) => ({ id: b.gradingScaleId, body: { name: 'X', bands: [] } }),
  'DELETE /v1/grading-scales/:id': (b) => b.gradingScaleId,
  'GET /v1/exams/:id': (b) => b.examId,
  'PATCH /v1/exams/:id': (b) => ({ id: b.examId, body: { name: 'X' } }),
  'DELETE /v1/exams/:id': (b) => b.examId,
  'PUT /v1/exams/:id/subjects': (b) => ({ id: b.examId, body: { classIds: [b.classId], rows: [] } }),
  'GET /v1/exams/:id/progress': (b) => b.examId,
  'POST /v1/exams/:id/subjects/:examSubjectId/lock': (b) => b.examId,
  'POST /v1/exams/:id/subjects/:examSubjectId/unlock': (b) => b.examId,
  'POST /v1/exams/:id/results/compute': (b) => b.examId,
  'GET /v1/exams/:id/results': (b) => b.examId,
  'PATCH /v1/exams/:id/results/:studentId': (b) => ({ id: b.examId, body: { teacherRemark: 'x' } }),
  'POST /v1/exams/:id/results/publish': (b) => b.examId,
  'POST /v1/exams/:id/results/unpublish': (b) => b.examId,
  'GET /v1/students/:id/results': (b) => b.students.s1,
  'POST /v1/exams/:id/report-cards': (b) => ({ id: b.examId, body: { sectionId: b.sectionA } }),
  'GET /v1/exams/:id/report-cards': (b) => ({ id: b.examId, query: `sectionId=${b.sectionA}` }),
  'GET /v1/exams/:id/report-cards/bundle': (b) => ({ id: b.examId, query: `sectionId=${b.sectionA}` }),
  'GET /v1/exams/:id/report-cards/:studentId': (b) => b.examId,
  'PATCH /v1/notices/:id': (b) => ({ id: b.noticeId, body: { title: 'x' } }),
  'POST /v1/notices/:id/publish': (b) => b.noticeId,
  'DELETE /v1/notices/:id': (b) => b.noticeId,
  'POST /v1/notices/:id/read': (b) => b.noticeId,
  'GET /v1/notices/:id/stats': (b) => b.noticeId,
  'GET /v1/notices/:id/attachments/:fileId': (b) => b.noticeId,
  'GET /v1/exams/:id/co-scholastic': (b) => ({ id: b.examId, query: `sectionId=${b.sectionA}` }),
  'PUT /v1/exams/:id/co-scholastic': (b) => ({ id: b.examId, body: { sectionId: b.sectionA, entries: [{ studentId: b.students.s1, subjectId: b.subjectId, grade: 'A' }] } }),
  'PUT /v1/exam-terms/:id': (b) => ({ id: b.termId, body: { name: 'X', gradingScaleId: b.gradingScaleId, components: [{ examId: b.examId, weight: 100 }] } }),
  'DELETE /v1/exam-terms/:id': (b) => b.termId,
  'GET /v1/exam-terms/:id/results': (b) => b.termId,
  'POST /v1/exam-terms/:id/publish': (b) => b.termId,
  'POST /v1/exam-terms/:id/unpublish': (b) => b.termId,
  'GET /v1/exam-terms/:id/report-cards/:studentId': (b) => b.termId,
  'GET /v1/students/:id/term-results': (b) => b.students.s1,
  'GET /v1/homework/:id/submissions': (b) => b.homeworkId,
  'PUT /v1/homework/:id/submissions': (b) => ({ id: b.homeworkId, body: { entries: [{ studentId: b.students.s1, status: 'SUBMITTED' }] } }),
  'POST /v1/homework/:id/seen': (b) => ({ id: b.homeworkId, body: { studentId: b.students.s1 } }),
  'PATCH /v1/documents/:id': (b) => ({ id: b.documentId, body: { title: 'x' } }),
  'DELETE /v1/documents/:id': (b) => b.documentId,
  'GET /v1/documents/:id/download': (b) => b.documentId,
  'GET /v1/reports/runs/:id': (b) => b.reportRunId,
  'GET /v1/reports/runs/:id/download': (b) => b.reportRunId,
  'POST /v1/school/support-access/:id/approve': (b) => b.supportGrantId,
  'POST /v1/school/support-access/:id/revoke': (b) => b.supportGrantId,
};

/** Routes with :id that are not tenant data (e.g. scoped to the signed-in user). */
const NON_TENANT_ID_ROUTES = new Set([
  'DELETE /v1/me/sessions/:id',
  'GET /v1/public/schools/:slug',
  'GET /v1/imports/templates/:entity', // template download, not a record
  'PUT /v1/school/settings/:section', // a settings section name, not a record
  // Signed-token routes: authorised by an HMAC token, not by tenant id (dev storage only)
  'PUT /v1/files/local/:token',
  // Authorised by the HMAC signature against the account the opaque id names (tested in payments-online)
  'POST /v1/webhooks/razorpay/:publicId',
  'GET /v1/files/local/:token',
  // Platform console: cross-school by design, guarded by platform roles (tested in platform.e2e)
  'GET /v1/platform/schools/:id',
  'PUT /v1/platform/schools/:id/status',
  'PUT /v1/platform/schools/:id/subscription',
  'PUT /v1/platform/schools/:id/features/:key',
  'PUT /v1/platform/plans/:id',
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
    const { id, body = {}, query } = typeof probe === 'string' ? { id: probe } : probe;
    const url = path.replace(':id', id).replace(':studentId', B.students.s1).replace(':fileId', B.fileId).replace(':examSubjectId', B.examSubjectId) + (query ? `?${query}` : '');
    const client = t.as(tokens.adminA, A.slug);
    const res =
      method === 'GET' ? await client.get(url)
      : method === 'PATCH' ? await client.patch(url, body)
      : method === 'PUT' ? await client.put(url, body).set('idempotency-key', randomUUID())
      : method === 'DELETE' ? await client.delete(url)
      : await client.post(url, body).set('idempotency-key', randomUUID());
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
        'GET /v1/app/config', // mobile version gate: versions and store links only
        'GET /v1/openapi.json', // route descriptions only; 404 in production
        'GET /v1/files/local/:token',
        'GET /v1/public/schools/:slug',
        'PUT /v1/files/local/:token',
        // Authorised by the HMAC signature against the account the opaque id names (tested in payments-online)
        'POST /v1/webhooks/razorpay/:publicId',
        'POST /v1/auth/login',
        'POST /v1/auth/otp/send',
        'POST /v1/auth/otp/verify',
        'POST /v1/auth/password/reset',
        'POST /v1/auth/refresh',
      ].sort(),
    );
  });
});
