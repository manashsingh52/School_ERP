/**
 * Consolidated term results: exams combined with weights. Numbers are worked out by hand:
 *   Unit Test 1 (20%): Maths /50 — s1 45, s2 10, s3 30
 *   Half-Yearly (80%): Maths /100 — s1 80, s2 40, s3 absent; English /100 — s1 70, s2 exempt, s3 50
 * s1: Maths 0.2×90 + 0.8×80 = 82; English 70 (only in the half-yearly); overall (82×90 + 70×100)/190 = 75.7
 * s2: Maths 0.2×20 + 0.8×40 = 36 (pass mark 0.2×34 + 0.8×33 = 33.2); English exempt → left out; overall 36
 * s3: Maths 0.2×60 + 0 = 12 → not passed
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PdfRenderer } from '../src/core/pdf/pdf-renderer.js';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let hyId = '';
let termId = '';
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const html: string[] = [];

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'terms');
  for (const who of ['admin', 'teacher', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
  const db = t.platform;
  const sid = A.schoolId;
  const english = await db.subject.create({ data: { schoolId: sid, name: 'English', code: 'ENG' } });
  const hy = await db.exam.create({ data: { schoolId: sid, academicYearId: A.yearId, gradingScaleId: A.gradingScaleId, name: 'Half-Yearly', status: 'RESULTS_PUBLISHED', publishedAt: new Date() } });
  hyId = hy.id;
  const hyMaths = await db.examSubject.create({ data: { schoolId: sid, examId: hy.id, classId: A.classId, subjectId: A.subjectId, maxMarks: 100, passMarks: 33 } });
  const hyEng = await db.examSubject.create({ data: { schoolId: sid, examId: hy.id, classId: A.classId, subjectId: english.id, maxMarks: 100, passMarks: 33 } });
  const mark = (examSubjectId: string, studentId: string, m: number | null, extra: { isAbsent?: boolean; isExempt?: boolean } = {}) =>
    db.mark.create({ data: { schoolId: sid, examSubjectId, studentId, marksObtained: m, enteredByMemberId: A.adminMembershipId, ...extra } });
  const result = (examId: string, studentId: string, sectionId: string, obtained: number, max: number) =>
    db.examResult.create({ data: { schoolId: sid, examId, studentId, sectionId, totalObtained: obtained, totalMax: max, percentage: (obtained / max) * 100, resultStatus: 'PASS', computedAt: new Date(), publishedAt: new Date() } });
  const { s1, s2, s3 } = A.students;
  await mark(A.examSubjectId, s1, 45); await mark(A.examSubjectId, s2, 10); await mark(A.examSubjectId, s3, 30);
  await mark(hyMaths.id, s1, 80); await mark(hyMaths.id, s2, 40); await mark(hyMaths.id, s3, null, { isAbsent: true });
  await mark(hyEng.id, s1, 70); await mark(hyEng.id, s2, null, { isExempt: true }); await mark(hyEng.id, s3, 50);
  await result(A.examId, s1, A.sectionA, 45, 50); await result(A.examId, s2, A.sectionA, 10, 50); await result(A.examId, s3, A.sectionB, 30, 50);
  await result(hy.id, s1, A.sectionA, 150, 200); await result(hy.id, s2, A.sectionA, 40, 100); await result(hy.id, s3, A.sectionB, 50, 200);
  const pdf = t.app.get(PdfRenderer);
  const original = pdf.render.bind(pdf);
  pdf.render = async (h: string) => {
    html.push(h);
    return original(h);
  };
});

afterAll(async () => {
  await t?.close();
});

describe('setting up a term', () => {
  it('weights must add up to 100, each exam once', async () => {
    const bad = await as('admin').post('/v1/exam-terms', { name: 'Term A', gradingScaleId: A.gradingScaleId, components: [{ examId: A.examId, weight: 30 }, { examId: hyId, weight: 50 }] });
    expect(bad.status).toBe(422);
    expect((await as('teacher').post('/v1/exam-terms', { name: 'Term A', gradingScaleId: A.gradingScaleId, components: [{ examId: hyId, weight: 100 }] })).status).toBe(403);
    const res = await as('admin').post('/v1/exam-terms', { name: 'Term A', gradingScaleId: A.gradingScaleId, components: [{ examId: A.examId, weight: 20 }, { examId: hyId, weight: 80 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    termId = res.body.data.id;
    expect(res.body.data).toMatchObject({ ready: false, publishedAt: null }); // Unit Test 1 isn't published yet
  });
});

describe('weighted results', () => {
  it('works out each subject and the term, with ranks', async () => {
    const res = await as('admin').get(`/v1/exam-terms/${termId}/results`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = res.body.data.rows as { studentId: string; percentage: number | null; status: string; rankInSection: number | null; subjects: { subject: { name: string }; percent: number | null; passed: boolean | null }[] }[];
    const by = (id: string) => rows.find((r) => r.studentId === id)!;
    const subj = (id: string, name: string) => by(id).subjects.find((s) => s.subject.name === name)!;
    expect(subj(A.students.s1, 'Mathematics').percent).toBe(82);
    expect(subj(A.students.s1, 'English').percent).toBe(70);
    expect(by(A.students.s1)).toMatchObject({ percentage: 75.7, status: 'PASS', rankInSection: 1 });
    expect(subj(A.students.s2, 'Mathematics')).toMatchObject({ percent: 36, passed: true });
    expect(subj(A.students.s2, 'English')).toMatchObject({ percent: null, passed: null });
    expect(by(A.students.s2)).toMatchObject({ percentage: 36, status: 'PASS', rankInSection: 2 });
    expect(subj(A.students.s3, 'Mathematics')).toMatchObject({ percent: 12, passed: false });
    expect(by(A.students.s3).status).toBe('FAIL');
  });

  it('teachers see only their sections', async () => {
    const rows = (await as('teacher').get(`/v1/exam-terms/${termId}/results`)).body.data.rows as { section: { label: string } }[];
    expect([...new Set(rows.map((r) => r.section.label))]).toEqual(['8-A']);
  });
});

describe('publishing', () => {
  it('needs every exam published first', async () => {
    const res = await as('admin').post(`/v1/exam-terms/${termId}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TERM_NOT_READY');
    expect((await as('parent').get(`/v1/students/${A.students.s1}/term-results`)).body.data).toEqual([]);
  });

  it('parents see the term and are told; the report card is made', async () => {
    await t.platform.exam.update({ where: { id: A.examId }, data: { status: 'RESULTS_PUBLISHED', publishedAt: new Date() } });
    const res = await as('admin').post(`/v1/exam-terms/${termId}/publish`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mine = (await as('parent').get(`/v1/students/${A.students.s1}/term-results`)).body.data;
    expect(mine).toEqual([expect.objectContaining({ term: expect.objectContaining({ name: 'Term A', components: [{ name: 'Unit Test 1', weight: 20 }, { name: 'Half-Yearly', weight: 80 }] }), result: expect.objectContaining({ percentage: 75.7 }) })]);
    expect((await as('parent').get(`/v1/students/${A.students.s2}/term-results`)).status).toBe(404);
    const inbox = (await as('parent').get('/v1/notifications')).body.data as { event: string; title: string }[];
    expect(inbox.some((n) => n.event === 'exam.results_published' && n.title.includes('Term A'))).toBe(true);

    const card = await as('parent').get(`/v1/exam-terms/${termId}/report-cards/${A.students.s1}`);
    expect(card.status, JSON.stringify(card.body)).toBe(200);
    expect((await t.http.get(card.body.data.url)).status).toBe(200);
    const page = html.at(-1)!;
    expect(page).toContain('Report card · Term A');
    expect(page).toContain('Unit Test 1<br><small>20%</small>');
    expect(page).toContain('82%');
    expect(page).toContain('75.7%');
    expect((await as('parent').get(`/v1/exam-terms/${termId}/report-cards/${A.students.s2}`)).status).toBe(404);
  });

  it('a published term is locked; unpublishing hides it and allows changes', async () => {
    expect((await as('admin').put(`/v1/exam-terms/${termId}`, { name: 'Term A', gradingScaleId: A.gradingScaleId, components: [{ examId: hyId, weight: 100 }] })).status).toBe(409);
    expect((await as('admin').post(`/v1/exam-terms/${termId}/unpublish`)).status).toBe(200);
    expect((await as('parent').get(`/v1/students/${A.students.s1}/term-results`)).body.data).toEqual([]);
    expect((await as('parent').get(`/v1/exam-terms/${termId}/report-cards/${A.students.s1}`)).status).toBe(404);
    const res = await as('admin').put(`/v1/exam-terms/${termId}`, { name: 'Term A', gradingScaleId: A.gradingScaleId, components: [{ examId: hyId, weight: 100 }] });
    expect(res.status).toBe(200);
    expect(await t.platform.termReportCard.count({ where: { termId } })).toBe(0); // old cards dropped
    const audit = (await as('admin').get('/v1/audit?action=exam_term')).body.data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['exam_term.create', 'exam_term.publish', 'exam_term.unpublish', 'exam_term.update']));
  });
});
