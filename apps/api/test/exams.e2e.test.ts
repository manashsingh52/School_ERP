/**
 * Exams (Master Prompt §33), setup and marks entry: grading scales, exams, the class × subject
 * grid, who may enter marks where, validation, edit conflicts, lock/unlock, progress.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent' | 'accountant' | 'adminB', string> = {} as never;

beforeAll(async () => {
  t = await createTestApp();
  [A, B] = [await createTenant(t, 'exm'), await createTenant(t, 'exmb')];
  for (const role of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  tok.adminB = (await t.login(B.users.admin, B.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const sheet = (who: keyof typeof tok, sectionId = A.sectionA, examSubjectId = A.examSubjectId) =>
  t.as(tok[who], who === 'adminB' ? B.slug : A.slug).get(`/v1/exams/marks?examSubjectId=${examSubjectId}&sectionId=${sectionId}`);

describe('grading scales', () => {
  it('adds presets once and validates bands', async () => {
    const preset = await t.as(tok.admin, A.slug).post('/v1/grading-scales/presets', { preset: 'A_TO_E' });
    expect(preset.status).toBe(201);
    expect(preset.body.data.bands.map((b: { label: string }) => b.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    const again = await t.as(tok.admin, A.slug).post('/v1/grading-scales/presets', { preset: 'A_TO_E' });
    expect(again.body.data.id).toBe(preset.body.data.id);

    const overlap = await t.as(tok.admin, A.slug).post('/v1/grading-scales', {
      name: 'Bad',
      bands: [{ label: 'A', minPercent: 50, maxPercent: 100 }, { label: 'B', minPercent: 0, maxPercent: 60 }],
    });
    expect(overlap.status).toBe(422);
    expect((await t.as(tok.teacher, A.slug).post('/v1/grading-scales/presets', { preset: 'CBSE_9' })).status).toBe(403);
    expect((await t.as(tok.admin, A.slug).delete(`/v1/grading-scales/${A.gradingScaleId}`)).status).toBe(409); // used by Unit Test 1
  });
});

describe('exam setup', () => {
  let examId: string;

  it('creates an exam and sets the class × subject grid', async () => {
    const res = await t.as(tok.admin, A.slug).post('/v1/exams', { name: 'Half-Yearly', term: 'Term 1', gradingScaleId: A.gradingScaleId, startDate: '2026-09-20', endDate: '2026-09-30', rankingEnabled: true });
    expect(res.status).toBe(201);
    examId = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: 'DRAFT', classes: [], subjects: [] });
    expect((await t.as(tok.admin, A.slug).post('/v1/exams', { name: 'half-yearly', gradingScaleId: A.gradingScaleId })).status).toBe(409);

    const bad = await t.as(tok.admin, A.slug).put(`/v1/exams/${examId}/subjects`, { classIds: [A.classId], rows: [{ classId: A.classId, subjectId: A.subjectId, maxMarks: 80, passMarks: 90 }] });
    expect(bad.status).toBe(422);
    const grid = await t.as(tok.admin, A.slug).put(`/v1/exams/${examId}/subjects`, {
      classIds: [A.classId],
      rows: [{ classId: A.classId, subjectId: A.subjectId, maxMarks: 80, passMarks: 27, examDate: '2026-09-21', startTime: '09:00', endTime: '12:00' }],
    });
    expect(grid.status).toBe(200);
    expect(grid.body.data.classes).toEqual([{ id: A.classId, name: 'Class 8', subjects: 1 }]);
    expect(grid.body.data.subjects[0]).toMatchObject({ subject: { name: 'Mathematics' }, maxMarks: 80, passMarks: 27, examDate: '2026-09-21' });
  });

  it('drafts are hidden from teachers and parents until scheduled', async () => {
    const ids = async (who: keyof typeof tok) => ((await t.as(tok[who], A.slug).get('/v1/exams')).body.data as { id: string }[]).map((e) => e.id);
    expect(await ids('teacher')).not.toContain(examId);
    expect(await ids('parent')).not.toContain(examId);
    const scheduled = await t.as(tok.admin, A.slug).patch(`/v1/exams/${examId}`, { status: 'SCHEDULED' });
    expect(scheduled.body.data.status).toBe('SCHEDULED');
    expect(await ids('parent')).toContain(examId);
    const forChild = await t.as(tok.parent, A.slug).get(`/v1/exams/${examId}?studentId=${A.students.s1}`);
    expect(forChild.body.data.subjects).toHaveLength(1);
    expect((await t.as(tok.parent, A.slug).get(`/v1/exams?studentId=${A.students.s2}`)).status).toBe(404);
    expect((await t.as(tok.accountant, A.slug).get('/v1/exams')).status).toBe(403);
  });

  it('a draft exam is deleted; one with marks is archived', async () => {
    const tmp = await t.as(tok.admin, A.slug).post('/v1/exams', { name: 'Temp', gradingScaleId: A.gradingScaleId });
    expect((await t.as(tok.admin, A.slug).delete(`/v1/exams/${tmp.body.data.id}`)).status).toBe(200);
    expect(await t.platform.exam.count({ where: { id: tmp.body.data.id } })).toBe(0);
  });
});

describe('marks entry', () => {
  it('the class teacher opens the 8-A sheet; 8-B is someone else\'s', async () => {
    const res = await sheet('teacher');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ editable: true, section: { label: '8-A' }, examSubject: { maxMarks: 50 }, stats: { entered: 0, total: 2 } });
    expect((await sheet('teacher', A.sectionB)).status).toBe(404);
    expect((await sheet('parent')).status).toBe(404);
    expect((await sheet('admin', A.sectionB)).status).toBe(200);
  });

  it('validates marks and saves with absent / exempt', async () => {
    const { version } = (await sheet('teacher')).body.data;
    const tooMany = await t.as(tok.teacher, A.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, entries: [{ studentId: A.students.s1, marks: 51 }] });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.details[0]).toEqual({ field: 'entries.0.marks', message: 'More than 50' });
    const outsider = await t.as(tok.teacher, A.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, entries: [{ studentId: A.students.s3, marks: 10 }] });
    expect(outsider.status).toBe(422);

    const ok = await t.as(tok.teacher, A.slug).put('/v1/exams/marks', {
      examSubjectId: A.examSubjectId,
      sectionId: A.sectionA,
      version,
      entries: [{ studentId: A.students.s1, marks: 42.5 }, { studentId: A.students.s2, marks: null, absent: true }],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.stats).toMatchObject({ entered: 2, total: 2, average: 42.5, highest: 42.5, passed: 1 });
    expect(ok.body.data.students.find((s: { studentId: string }) => s.studentId === A.students.s2)).toMatchObject({ absent: true, marks: null });

    // A stale sheet can't overwrite newer marks.
    const stale = await t.as(tok.admin, A.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, version, entries: [{ studentId: A.students.s1, marks: 10 }] });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('records corrections in the audit log', async () => {
    const res = await t.as(tok.teacher, A.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, entries: [{ studentId: A.students.s1, marks: 44 }] });
    expect(res.status).toBe(200);
    const audit = await t.platform.auditLog.findFirst({ where: { schoolId: A.schoolId, action: 'marks.correct' } });
    expect(audit?.metadata).toMatchObject({ corrections: { Student1: { from: '42.5', to: '44' } } });
  });

  it('progress shows each teacher their own sheets', async () => {
    const mine = await t.as(tok.teacher, A.slug).get(`/v1/exams/${A.examId}/progress`);
    expect(mine.body.data).toEqual([expect.objectContaining({ section: { id: A.sectionA, label: '8-A' }, entered: 2, total: 2, locked: false, teacher: 'Teacher' })]);
    const all = await t.as(tok.admin, A.slug).get(`/v1/exams/${A.examId}/progress`);
    expect(all.body.data.map((r: { section: { label: string }; teacher: string }) => [r.section.label, r.teacher])).toEqual([['8-A', 'Teacher'], ['8-B', 'Second']]);
  });

  it('locking stops edits; only the exam office unlocks', async () => {
    // The class teacher doesn't cover 8-B, so only the office can lock the whole subject.
    expect((await t.as(tok.teacher, A.slug).post(`/v1/exams/${A.examId}/subjects/${A.examSubjectId}/lock`)).status).toBe(403);
    expect((await t.as(tok.admin, A.slug).post(`/v1/exams/${A.examId}/subjects/${A.examSubjectId}/lock`)).status).toBe(200);
    const locked = await sheet('teacher');
    expect(locked.body.data).toMatchObject({ editable: false });
    expect(locked.body.data.lockedReason).toMatch(/locked/);
    const refused = await t.as(tok.teacher, A.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, entries: [{ studentId: A.students.s1, marks: 1 }] });
    expect(refused.status).toBe(422);
    expect((await sheet('admin')).body.data.editable).toBe(true); // admins have "edit locked marks"
    expect((await t.as(tok.teacher, A.slug).post(`/v1/exams/${A.examId}/subjects/${A.examSubjectId}/unlock`)).status).toBe(403);
    expect((await t.as(tok.admin, A.slug).post(`/v1/exams/${A.examId}/subjects/${A.examSubjectId}/unlock`)).status).toBe(200);
  });

  it("a subject with marks can't be removed from the grid", async () => {
    const res = await t.as(tok.admin, A.slug).put(`/v1/exams/${A.examId}/subjects`, { classIds: [A.classId], rows: [] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MARKS_ENTERED');
  });

  it("another school's sheet is invisible", async () => {
    expect((await sheet('adminB', A.sectionA, A.examSubjectId)).status).toBe(404);
    const write = await t.as(tok.adminB, B.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, entries: [{ studentId: A.students.s1, marks: 1 }] });
    expect(write.status).toBe(404);
  });
});
