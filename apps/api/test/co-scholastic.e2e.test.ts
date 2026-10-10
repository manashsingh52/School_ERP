/** Co-scholastic areas: class teachers grade them on the school's scale; they reach report cards and parents. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { PdfRenderer } from '../src/core/pdf/pdf-renderer.js';
import { ReportCardsService } from '../src/modules/exams/report-cards.service.js';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let art = '';
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const path = (section = A.sectionA) => `/v1/exams/${A.examId}/co-scholastic?sectionId=${section}`;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'cosch');
  for (const who of ['admin', 'teacher', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
  art = (await t.platform.subject.create({ data: { schoolId: A.schoolId, name: 'Art Education', code: 'ART', type: 'CO_SCHOLASTIC' } })).id;
  await t.platform.subject.create({ data: { schoolId: A.schoolId, name: 'Work Education', code: 'WE', type: 'CO_SCHOLASTIC' } });
  // Only Art is linked to Class 8, so Class 8's grid shows Art alone.
  await t.platform.classSubject.create({ data: { schoolId: A.schoolId, academicYearId: A.yearId, classId: A.classId, subjectId: art } });
});

afterAll(async () => {
  await t?.close();
});

describe('co-scholastic grades', () => {
  it("the class teacher's grid: their section, the class's areas, the school's scale", async () => {
    const res = await as('teacher').get(path());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ editable: true, grades: ['A', 'B', 'C'], areas: [{ id: art, name: 'Art Education' }] });
    expect(res.body.data.students).toHaveLength(2);
    expect((await as('teacher').get(path(A.sectionB))).status).toBe(404); // not their class
    expect((await as('admin').get(path(A.sectionB))).status).toBe(200);
    expect((await as('parent').get(path())).status).toBe(403);
  });

  it('only grades on the scale, only the class’s areas', async () => {
    const bad = await as('teacher').put(`/v1/exams/${A.examId}/co-scholastic`, { sectionId: A.sectionA, entries: [{ studentId: A.students.s1, subjectId: art, grade: 'Z' }] });
    expect(bad.status).toBe(422);
    const res = await as('teacher').put(`/v1/exams/${A.examId}/co-scholastic`, {
      sectionId: A.sectionA,
      entries: [{ studentId: A.students.s1, subjectId: art, grade: 'A' }, { studentId: A.students.s2, subjectId: art, grade: 'B' }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.students.find((s: { studentId: string }) => s.studentId === A.students.s1).grades[art]).toBe('A');
    const cleared = await as('teacher').put(`/v1/exams/${A.examId}/co-scholastic`, { sectionId: A.sectionA, entries: [{ studentId: A.students.s2, subjectId: art, grade: null }] });
    expect(cleared.body.data.students.find((s: { studentId: string }) => s.studentId === A.students.s2).grades[art]).toBeNull();
  });

  it('the scale comes from Settings → Examinations', async () => {
    await as('admin').put('/v1/school/settings/examinations', { coScholasticGrades: ['A+', 'A', 'B'] });
    expect((await as('teacher').get(path())).body.data.grades).toEqual(['A+', 'A', 'B']);
    expect((await as('teacher').put(`/v1/exams/${A.examId}/co-scholastic`, { sectionId: A.sectionA, entries: [{ studentId: A.students.s2, subjectId: art, grade: 'A+' }] })).status).toBe(200);
  });

  it('grades reach the report card and the parent, and lock with the results', async () => {
    await t.platform.examResult.create({ data: { schoolId: A.schoolId, examId: A.examId, studentId: A.students.s1, sectionId: A.sectionA, totalObtained: 40, totalMax: 50, percentage: 80, resultStatus: 'PASS', computedAt: new Date(), publishedAt: new Date() } });
    await t.platform.exam.update({ where: { id: A.examId }, data: { status: 'RESULTS_PUBLISHED', publishedAt: new Date() } });
    const results = (await as('parent').get(`/v1/students/${A.students.s1}/results`)).body.data;
    expect(results[0].coScholastic).toEqual([{ area: 'Art Education', grade: 'A' }]);
    expect((await as('teacher').put(`/v1/exams/${A.examId}/co-scholastic`, { sectionId: A.sectionA, entries: [{ studentId: A.students.s1, subjectId: art, grade: 'B' }] })).status).toBe(422);

    const pdf = t.app.get(PdfRenderer);
    const html: string[] = [];
    const original = pdf.render.bind(pdf);
    pdf.render = async (h: string) => (html.push(h), original(h));
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => t.app.get(ReportCardsService).generateNow(A.examId, A.sectionA, [A.students.s1], A.adminMembershipId));
    pdf.render = original;
    expect(html[0]).toContain('Co-scholastic area');
    expect(html[0]).toContain('Art Education');
  });
});
