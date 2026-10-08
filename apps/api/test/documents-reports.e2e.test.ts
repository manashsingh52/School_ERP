/**
 * Phase 6: documents (visibility by scope and "share with parents"), the report catalogue, async
 * exports in CSV / Excel / PDF (run as the requester, with their scopes), and the school audit log.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { neutralise } from '../src/modules/reports/report-export.js';
import { ReportRunsService } from '../src/modules/reports/report-runs.service.js';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function upload(name: string, body: Buffer, mimeType: string) {
  const ticket = await as('admin').post('/v1/files/upload-url', { purpose: 'document', fileName: name, mimeType, sizeBytes: body.length });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  const { fileId, upload: link } = ticket.body.data;
  expect((await t.http.put(link.url).set(link.headers).send(body)).status).toBe(200);
  expect((await as('admin').post(`/v1/files/${fileId}/complete`)).status).toBe(200);
  return fileId as string;
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'docs');
  for (const who of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;

  // Attendance in October: s1 present 3 of 4 days, s2 absent 3 of 4 (8-A).
  const db = t.platform;
  for (const [i, day] of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].entries()) {
    const session = await db.attendanceSession.create({ data: { schoolId: A.schoolId, sectionId: A.sectionA, date: d(day), status: 'SUBMITTED', takenByMemberId: A.adminMembershipId, submittedAt: new Date() } });
    await db.attendanceRecord.createMany({
      data: [
        { schoolId: A.schoolId, sessionId: session.id, studentId: A.students.s1, date: d(day), status: i === 0 ? 'ABSENT' : 'PRESENT' },
        { schoolId: A.schoolId, sessionId: session.id, studentId: A.students.s2, date: d(day), status: i === 0 ? 'PRESENT' : 'ABSENT' },
      ],
    });
  }
  // Exam: s1 45/50 (pass), s2 10/50 (fail) in 8-A; s3 30/50 in 8-B (not the teacher's section).
  for (const [studentId, marks] of [[A.students.s1, 45], [A.students.s2, 10], [A.students.s3, 30]] as const) {
    await db.mark.create({ data: { schoolId: A.schoolId, examSubjectId: A.examSubjectId, studentId, marksObtained: marks, enteredByMemberId: A.adminMembershipId } });
    await db.examResult.create({
      data: { schoolId: A.schoolId, examId: A.examId, studentId, sectionId: studentId === A.students.s3 ? A.sectionB : A.sectionA, totalObtained: marks, totalMax: 50, percentage: marks * 2, resultStatus: marks >= 17 ? 'PASS' : 'FAIL', computedAt: new Date() },
    });
  }
  await db.student.update({ where: { id: A.students.s2 }, data: { firstName: '=HYPERLINK("http://evil")', gender: 'FEMALE' } });
});

afterAll(async () => {
  await t?.close();
});

describe('documents', () => {
  let tcId = '';
  let privateId = '';

  it('the admin attaches documents to a student', async () => {
    const fileId = await upload('tc.pdf', PDF, 'application/pdf');
    const res = await as('admin').post('/v1/documents', { ownerType: 'STUDENT', ownerId: A.students.s1, category: 'transfer_certificate', title: 'TC from previous school', fileId, visibleToGuardian: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    tcId = res.body.data.id;
    expect(res.body.data).toMatchObject({ category: 'transfer_certificate', uploadedBy: 'Admin', file: { name: 'tc.pdf', mimeType: 'application/pdf' } });
    // The same file can't be attached twice.
    expect((await as('admin').post('/v1/documents', { ownerType: 'STUDENT', ownerId: A.students.s1, category: 'other', title: 'Again', fileId })).status).toBe(422);

    const medical = await upload('medical.pdf', PDF, 'application/pdf');
    privateId = (await as('admin').post('/v1/documents', { ownerType: 'STUDENT', ownerId: A.students.s1, category: 'medical', title: 'Allergy note', fileId: medical })).body.data.id;
  });

  it('only managers upload; files must be documents of this school', async () => {
    expect((await as('teacher').post('/v1/documents', { ownerType: 'STUDENT', ownerId: A.students.s1, category: 'other', title: 'x', fileId: A.fileId })).status).toBe(403);
    expect((await as('admin').post('/v1/documents', { ownerType: 'STUDENT', ownerId: A.students.s1, category: 'other', title: 'x', fileId: '00000000-0000-4000-8000-000000000000' })).status).toBe(422);
    expect((await as('admin').post('/v1/documents', { ownerType: 'STUDENT', category: 'other', title: 'x', fileId: A.fileId })).status).toBe(422);
  });

  it('the class teacher sees their students’ documents, not others', async () => {
    const mine = await as('teacher').get(`/v1/documents?ownerType=STUDENT&ownerId=${A.students.s1}`);
    expect(mine.body.data.map((x: { title: string }) => x.title)).toEqual(expect.arrayContaining(['TC from previous school', 'Allergy note']));
    expect((await as('teacher').get(`/v1/documents?ownerType=STUDENT&ownerId=${A.students.s3}`)).status).toBe(404);
  });

  it('parents see only what the school shared, for their own child', async () => {
    const list = (await as('parent').get(`/v1/documents?ownerType=STUDENT&ownerId=${A.students.s1}`)).body.data.map((x: { id: string }) => x.id);
    expect(list).toContain(tcId);
    expect(list).not.toContain(privateId);
    expect((await as('parent').get(`/v1/documents/${privateId}/download`)).status).toBe(404);
    const link = await as('parent').get(`/v1/documents/${tcId}/download`);
    expect(link.status).toBe(200);
    expect((await t.http.get(link.body.data.url)).status).toBe(200);
    expect((await as('parent').get(`/v1/documents?ownerType=STUDENT&ownerId=${A.students.s2}`)).status).toBe(404);
  });

  it('sharing, renaming and deleting are audited', async () => {
    expect((await as('admin').patch(`/v1/documents/${privateId}`, { visibleToGuardian: true, title: 'Allergy note (shared)' })).body.data.visibleToGuardian).toBe(true);
    expect((await as('parent').get(`/v1/documents/${privateId}/download`)).status).toBe(200);
    expect((await as('admin').delete(`/v1/documents/${privateId}`)).status).toBe(200);
    expect((await as('admin').get(`/v1/documents/${privateId}/download`)).status).toBe(404);
    const audit = (await as('admin').get('/v1/audit?entityType=Document')).body.data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['document.create', 'document.update', 'document.delete']));
  });

  it('school documents: staff see all, parents only shared ones', async () => {
    const fileId = await upload('fees-policy.pdf', PDF, 'application/pdf');
    await as('admin').post('/v1/documents', { ownerType: 'SCHOOL', category: 'policy', title: 'Fee policy 2026–27', fileId, visibleToGuardian: false });
    expect((await as('teacher').get('/v1/documents?ownerType=SCHOOL')).body.data).toHaveLength(1);
    expect((await as('parent').get('/v1/documents?ownerType=SCHOOL')).body.data).toHaveLength(0);
  });
});

describe('report catalogue', () => {
  it('each role sees the reports it may run', async () => {
    const keys = async (who: string) => (await as(who).get('/v1/reports/catalog')).body.data.map((r: { key: string }) => r.key);
    expect(await keys('admin')).toEqual(expect.arrayContaining(['student_strength', 'exam_summary', 'collection']));
    expect(await keys('accountant')).toEqual(['collection', 'outstanding', 'defaulters', 'heads', 'concessions', 'reconciliation']);
    expect(await keys('teacher')).not.toContain('collection');
    expect(await keys('parent')).toEqual([]);
    expect((await as('accountant').get('/v1/reports/preview?report=student_strength')).status).toBe(403);
  });

  it('class strength counts by gender with totals', async () => {
    const r = (await as('admin').get('/v1/reports/preview?report=student_strength')).body.data;
    expect(r.rows).toEqual([expect.objectContaining({ section: '8-A', girls: 1, total: 2 }), expect.objectContaining({ section: '8-B', total: 1 })]);
    expect(r.totals.total).toBe(3);
  });

  it('monthly attendance and low attendance', async () => {
    const m = (await as('admin').get('/v1/reports/preview?report=attendance_monthly&month=2026-10')).body.data;
    expect(m.rows.find((r: { section: string }) => r.section === '8-A')).toMatchObject({ days: 4, students: 2, average: 50, absences: 4, low: 1 });
    const low = (await as('admin').get('/v1/reports/preview?report=attendance_low&from=2026-10-01&to=2026-10-31&threshold=75')).body.data;
    expect(low.rows).toEqual([expect.objectContaining({ admissionNo: '2', percent: 25, absent: 3 })]);
  });

  it('exam reports — teachers see only their sections', async () => {
    const all = (await as('admin').get(`/v1/reports/preview?report=exam_summary&examId=${A.examId}`)).body.data;
    expect(all.rows.find((r: { section: string }) => r.section === '8-A')).toMatchObject({ appeared: 2, passed: 1, passPercent: 50, average: 55 });
    expect(all.totals).toMatchObject({ appeared: 3, passed: 2 });
    const mine = (await as('teacher').get(`/v1/reports/preview?report=exam_summary&examId=${A.examId}`)).body.data;
    expect(mine.rows.map((r: { section: string }) => r.section)).toEqual(['8-A']);
    const subj = (await as('admin').get(`/v1/reports/preview?report=exam_subjects&examId=${A.examId}`)).body.data;
    expect(subj.rows[0]).toMatchObject({ subject: 'Mathematics', appeared: 3, highest: 45, maxMarks: 50 });
    expect((await as('admin').get('/v1/reports/preview?report=exam_summary')).status).toBe(422);
  });

  it('student list hides phone numbers from people without contact access', async () => {
    const admin = (await as('admin').get('/v1/reports/preview?report=student_list')).body.data;
    expect(admin.columns.map((c: { key: string }) => c.key)).toContain('phone');
    const teacher = (await as('teacher').get('/v1/reports/preview?report=student_list')).body.data;
    expect(teacher.rows.map((r: { class: string }) => r.class)).toEqual(['8-A', '8-A']);
  });

  it('finance reports come through the same catalogue', async () => {
    const r = (await as('accountant').get('/v1/reports/preview?report=outstanding')).body.data;
    expect(r.columns.length).toBeGreaterThan(2);
    expect(r.key).toBe('outstanding');
  });
});

describe('exports', () => {
  const run = async (who: string, report: string, format: string, params: object = {}) => {
    const res = await as(who).post('/v1/reports/runs', { report, format, params });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe('QUEUED');
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => t.app.get(ReportRunsService).process(res.body.data.id));
    const done = (await as(who).get(`/v1/reports/runs/${res.body.data.id}`)).body.data;
    return done as { id: string; status: string; error: string | null };
  };
  const fetchFile = async (who: string, id: string) => {
    const link = await as(who).get(`/v1/reports/runs/${id}/download`);
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const file = await t.http.get(link.body.data.url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    return file.body as Buffer;
  };

  it('CSV: rupees, BOM, and no spreadsheet formulas from data', async () => {
    const r = await run('admin', 'student_list', 'CSV');
    expect(r.status).toBe('DONE');
    const csv = (await fetchFile('admin', r.id)).toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")`);
    expect(neutralise('-5 cmd')).toBe("'-5 cmd");
  });

  it('Excel and PDF files are real', async () => {
    const x = await run('accountant', 'defaulters', 'XLSX');
    expect(x.status).toBe('DONE');
    expect((await fetchFile('accountant', x.id)).subarray(0, 2).toString()).toBe('PK');
    const p = await run('admin', 'exam_summary', 'PDF', { examId: A.examId });
    expect(p.status).toBe('DONE');
    expect((await fetchFile('admin', p.id)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('a run fails clearly when the report can’t be made', async () => {
    const r = await run('admin', 'exam_summary', 'CSV', {});
    expect(r).toMatchObject({ status: 'FAILED', error: 'Choose an exam.' });
    expect((await as('admin').get(`/v1/reports/runs/${r.id}/download`)).status).toBe(409);
  });

  it('exports are private to whoever asked, and only for permitted reports', async () => {
    const mine = (await as('admin').get('/v1/reports/runs')).body.data.map((x: { id: string }) => x.id);
    const theirs = (await as('accountant').get('/v1/reports/runs')).body.data.map((x: { id: string }) => x.id);
    expect(mine.some((id: string) => theirs.includes(id))).toBe(false);
    expect((await as('accountant').get(`/v1/reports/runs/${mine[0]}`)).status).toBe(404);
    expect((await as('accountant').post('/v1/reports/runs', { report: 'student_list', format: 'CSV' })).status).toBe(403);
    expect((await as('teacher').post('/v1/reports/runs', { report: 'student_list', format: 'CSV' })).status).toBe(403);
  });
});

describe('school audit log', () => {
  it('admins and principals read it; others cannot', async () => {
    expect((await as('accountant').get('/v1/audit')).status).toBe(403);
    const res = await as('admin').get('/v1/audit?action=report.export&limit=2');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ action: 'report.export', actor: { type: 'USER' } });
    expect(res.body.page.nextCursor).toBeTruthy();
  });
});
