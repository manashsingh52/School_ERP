/**
 * Exam results (Master Prompt §33): compute → preview → publish snapshot, grades, pass/fail,
 * ranks with ties, absent/exempt handling, remarks, withholding, parent visibility and alerts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent', string> = {} as never;
let examId: string;
let maths: string;
let english: string;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'res');
  for (const role of ['admin', 'teacher', 'parent'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  const eng = await t.platform.subject.create({ data: { schoolId: A.schoolId, name: 'English', code: 'ENG' } });
  const exam = await t.as(tok.admin, A.slug).post('/v1/exams', { name: 'Term 1', gradingScaleId: A.gradingScaleId, rankingEnabled: true, endDate: '2026-09-30' });
  examId = exam.body.data.id;
  const grid = await t.as(tok.admin, A.slug).put(`/v1/exams/${examId}/subjects`, {
    classIds: [A.classId],
    rows: [
      { classId: A.classId, subjectId: A.subjectId, maxMarks: 50, passMarks: 17 },
      { classId: A.classId, subjectId: eng.id, maxMarks: 50, passMarks: 17 },
    ],
  });
  maths = grid.body.data.subjects.find((s: { subject: { name: string } }) => s.subject.name === 'Mathematics').id;
  english = grid.body.data.subjects.find((s: { subject: { name: string } }) => s.subject.name === 'English').id;
});

afterAll(async () => {
  await t?.close();
});

const enter = (examSubjectId: string, sectionId: string, entries: object[]) =>
  t.as(tok.admin, A.slug).put('/v1/exams/marks', { examSubjectId, sectionId, entries });
const compute = (force = false) => t.as(tok.admin, A.slug).post(`/v1/exams/${examId}/results/compute`, { force });
const results = async (who: keyof typeof tok = 'admin', q = '') => (await t.as(tok[who], A.slug).get(`/v1/exams/${examId}/results${q}`)).body;
const row = async (studentId: string) => (await results()).data.find((r: { studentId: string }) => r.studentId === studentId);

describe('results', () => {
  it('needs marks entry to be open', async () => {
    expect((await compute()).status).toBe(422);
    await t.as(tok.admin, A.slug).patch(`/v1/exams/${examId}`, { status: 'MARKS_ENTRY' });
  });

  it('missing marks make a result incomplete and block publishing', async () => {
    await enter(maths, A.sectionA, [{ studentId: A.students.s1, marks: 45 }]);
    const summary = await compute();
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ students: 3, incomplete: 3, passed: 0 });
    const pub = await t.as(tok.admin, A.slug).post(`/v1/exams/${examId}/results/publish`);
    expect(pub.status).toBe(422);
    expect(pub.body.error.code).toBe('RESULTS_INCOMPLETE');
  });

  it('computes totals, grades, pass/fail and ranks (absent fails, exempt is left out)', async () => {
    await enter(english, A.sectionA, [{ studentId: A.students.s1, marks: 40 }, { studentId: A.students.s2, marks: 30 }]);
    await enter(maths, A.sectionA, [{ studentId: A.students.s2, marks: null, absent: true }]);
    await enter(maths, A.sectionB, [{ studentId: A.students.s3, marks: 45 }]);
    await enter(english, A.sectionB, [{ studentId: A.students.s3, marks: null, exempt: true }]);
    const res = await compute();
    expect(res.body.data).toMatchObject({ students: 3, passed: 2, failed: 1, incomplete: 0 });

    expect(await row(A.students.s1)).toMatchObject({ totalObtained: 85, totalMax: 100, percentage: 85, grade: 'A2', status: 'PASS', rankInSection: 1, rankInClass: 2 });
    expect(await row(A.students.s2)).toMatchObject({ totalObtained: 30, totalMax: 100, percentage: 30, grade: 'E', status: 'FAIL', rankInSection: 2, rankInClass: 3 });
    const s3 = await row(A.students.s3);
    expect(s3).toMatchObject({ totalObtained: 45, totalMax: 50, percentage: 90, grade: 'A2', status: 'PASS', rankInSection: 1, rankInClass: 1 });
    expect(s3.subjects.find((s: { subject: { name: string } }) => s.subject.name === 'English')).toMatchObject({ exempt: true, passed: null });
    const s2 = await row(A.students.s2);
    expect(s2.subjects.find((s: { subject: { name: string } }) => s.subject.name === 'Mathematics')).toMatchObject({ absent: true, passed: false });
  });

  it('ties share a rank', async () => {
    await enter(english, A.sectionA, [{ studentId: A.students.s2, marks: 40 }]);
    await enter(maths, A.sectionA, [{ studentId: A.students.s2, marks: 45, absent: false }]);
    await compute();
    expect((await row(A.students.s1)).rankInSection).toBe(1);
    expect((await row(A.students.s2)).rankInSection).toBe(1);
    expect((await row(A.students.s1)).rankInClass).toBe(2);
  });

  it('the class teacher sees their section and writes remarks', async () => {
    const mine = await results('teacher');
    expect(mine.data.map((r: { studentId: string }) => r.studentId).sort()).toEqual([A.students.s1, A.students.s2].sort());
    const remark = await t.as(tok.teacher, A.slug).patch(`/v1/exams/${examId}/results/${A.students.s1}`, { teacherRemark: 'Consistent effort.' });
    expect(remark.status).toBe(200);
    expect(remark.body.data.teacherRemark).toBe('Consistent effort.');
    expect((await t.as(tok.teacher, A.slug).patch(`/v1/exams/${examId}/results/${A.students.s1}`, { principalRemark: 'x' })).status).toBe(403);
    expect((await t.as(tok.teacher, A.slug).patch(`/v1/exams/${examId}/results/${A.students.s3}`, { teacherRemark: 'x' })).status).toBe(404);
    expect((await results('parent')).data).toEqual([]);
  });

  it('marks changed after computing must be recomputed before publishing', async () => {
    await enter(maths, A.sectionA, [{ studentId: A.students.s1, marks: 46 }]);
    const pub = await t.as(tok.admin, A.slug).post(`/v1/exams/${examId}/results/publish`);
    expect(pub.status).toBe(422);
    expect(pub.body.error.code).toBe('STALE_RESULTS');
    await compute();
  });

  it('withholding one result keeps it from parents', async () => {
    const res = await t.as(tok.admin, A.slug).patch(`/v1/exams/${examId}/results/${A.students.s2}`, { withheld: true });
    expect(res.body.data.status).toBe('WITHHELD');
  });

  it('publishing locks marks, shows results to parents and tells them', async () => {
    expect((await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s1}/results`)).body.data).toEqual([]);
    const pub = await t.as(tok.admin, A.slug).post(`/v1/exams/${examId}/results/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.publishedAt).toBeTruthy();

    const sheet = await t.as(tok.admin, A.slug).get(`/v1/exams/marks?examSubjectId=${maths}&sectionId=${A.sectionA}`);
    expect(sheet.body.data.editable).toBe(false);
    expect(sheet.body.data.examSubject.lockedAt).toBeTruthy();

    const mine = await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s1}/results`);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ exam: { name: 'Term 1' }, result: { percentage: 86, status: 'PASS', teacherRemark: 'Consistent effort.' } });
    expect((await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s2}/results`)).status).toBe(404);

    const until = Date.now() + 15_000;
    let alert;
    while (!alert && Date.now() < until) {
      const inbox = (await t.as(tok.parent, A.slug).get('/v1/notifications')).body.data as { event: string; title: string }[];
      alert = inbox.find((n) => n.event === 'exam.results_published');
      if (!alert) await new Promise((r) => setTimeout(r, 100));
    }
    expect(alert?.title).toBe('Term 1 results are out');
  });

  it('corrections: forced recompute keeps it published; unpublish reopens it', async () => {
    expect((await compute()).status).toBe(422);
    const forced = await compute(true);
    expect(forced.status).toBe(200);
    expect(forced.body.data.publishedAt).toBeTruthy();
    const un = await t.as(tok.admin, A.slug).post(`/v1/exams/${examId}/results/unpublish`);
    expect(un.body.data.publishedAt).toBeNull();
    expect((await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s1}/results`)).body.data).toEqual([]);
    expect((await t.platform.exam.findUniqueOrThrow({ where: { id: examId } })).status).toBe('MARKS_ENTRY');
  });
});
