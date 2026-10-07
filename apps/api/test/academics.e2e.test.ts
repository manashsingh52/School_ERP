/** Academic structure: years, classes, sections, subjects, class subjects, assignments. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultClassOrder } from '../src/modules/academics/academics.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let admin: string;
let teacher: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'acad');
  admin = (await t.login(A.users.admin, A.slug)).token;
  teacher = (await t.login(A.users.teacher, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const api = () => t.as(admin, A.slug);

describe('academic years', () => {
  it('creates a planned year, then makes it current; history stays', async () => {
    const created = await api().post('/v1/academic-years', { name: '2027–28', startDate: '2027-04-01', endDate: '2028-03-31' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'PLANNED', isCurrent: false });

    const activated = await api().post(`/v1/academic-years/${created.body.data.id}/activate`);
    expect(activated.body.data).toMatchObject({ status: 'ACTIVE', isCurrent: true });

    const list = await api().get('/v1/academic-years');
    expect(list.body.data.filter((y: { isCurrent: boolean }) => y.isCurrent)).toHaveLength(1);

    // switch back so other tests use the seeded year
    await api().post(`/v1/academic-years/${A.yearId}/activate`);
  });

  it('refuses closing the current year and impossible dates', async () => {
    expect((await api().post(`/v1/academic-years/${A.yearId}/close`)).body.error.code).toBe('YEAR_IS_CURRENT');
    const bad = await api().post('/v1/academic-years', { name: '2029–30', startDate: '2029-04-01', endDate: '2029-03-01' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].field).toBe('endDate');
  });

  it('only admins can change structure; teachers can read it', async () => {
    expect((await t.as(teacher, A.slug).get('/v1/academic-years')).status).toBe(200);
    expect((await t.as(teacher, A.slug).post('/v1/classes', { name: 'Class 9' })).status).toBe(403);
  });
});

describe('classes & sections', () => {
  it('orders classes naturally', () => {
    expect([defaultClassOrder('Nursery'), defaultClassOrder('UKG'), defaultClassOrder('Class 1'), defaultClassOrder('10')]).toEqual([1, 3, 4, 13]);
    expect(defaultClassOrder('Montessori')).toBeNull();
  });

  it('bulk-creates classes and sections, skipping ones that exist', async () => {
    const classes = await api().post('/v1/classes/bulk', { names: ['Class 8', 'Class 9', 'Class 10', 'Nursery'] });
    expect(classes.body.data).toEqual({ created: 3, skipped: 1 });

    const list = await api().get('/v1/classes');
    const names = list.body.data.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Nursery', 'Class 8', 'Class 9', 'Class 10']);

    const ids = list.body.data.filter((c: { name: string }) => c.name !== 'Class 8').map((c: { id: string }) => c.id);
    const sections = await api().post('/v1/sections/bulk', { academicYearId: A.yearId, classIds: ids, names: ['A', 'b'] });
    expect(sections.body.data).toEqual({ created: 6, skipped: 0 });
    const again = await api().post('/v1/sections/bulk', { academicYearId: A.yearId, classIds: ids, names: ['A'] });
    expect(again.body.data).toEqual({ created: 0, skipped: 3 });
  });

  it('assigns a class teacher, shows counts, and blocks deleting sections with students', async () => {
    const updated = await api().patch(`/v1/sections/${A.sectionB}`, { classTeacherId: A.teacherId, room: '204' });
    expect(updated.body.data).toMatchObject({ room: '204', classTeacher: { id: A.teacherId }, studentCount: 1 });
    const del = await api().delete(`/v1/sections/${A.sectionA}`);
    expect(del.status).toBe(409);
    await api().patch(`/v1/sections/${A.sectionB}`, { classTeacherId: null }); // restore for later tests
  });

  it('rejects a class teacher from another school', async () => {
    const other = await createTenant(t, 'acad-other');
    const res = await api().patch(`/v1/sections/${A.sectionB}`, { classTeacherId: other.teacherId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });
});

describe('subjects & assignments', () => {
  it('sets the subjects a class studies', async () => {
    const created = await api().post('/v1/subjects/bulk', {
      subjects: [
        { name: 'English', code: 'eng' },
        { name: 'Science', code: 'SCI' },
        { name: 'Mathematics', code: 'MATH' },
      ],
    });
    expect(created.body.data).toEqual({ created: 2, skipped: 1 });
    const subjects = (await api().get('/v1/subjects')).body.data as { id: string; code: string }[];
    expect(subjects.map((s) => s.code)).toContain('ENG');

    const set = await api().put('/v1/class-subjects', {
      academicYearId: A.yearId,
      classIds: [A.classId],
      subjectIds: subjects.filter((s) => s.code !== 'SCI').map((s) => s.id),
      optionalSubjectIds: subjects.filter((s) => s.code === 'SCI').map((s) => s.id),
    });
    expect(set.status).toBe(200);
    expect(set.body.data).toHaveLength(3);
    expect(set.body.data.filter((r: { isOptional: boolean }) => r.isOptional)).toHaveLength(1);
  });

  it('assigning a teacher to a section widens what that teacher can see', async () => {
    const before = await t.as(teacher, A.slug).get('/v1/students');
    expect(before.body.page.total).toBe(2); // class teacher of 8-A only

    const created = await api().post('/v1/teaching-assignments', { sectionId: A.sectionB, subjectId: A.subjectId, teacherId: A.teacherId });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ section: { id: A.sectionB }, subject: { code: 'MATH' }, teacher: { id: A.teacherId } });

    const after = await t.as(teacher, A.slug).get('/v1/students');
    expect(after.body.page.total).toBe(3); // 8-A (class teacher) + 8-B (Maths)

    const dup = await api().post('/v1/teaching-assignments', { sectionId: A.sectionB, subjectId: A.subjectId, teacherId: A.teacherId });
    expect(dup.status).toBe(409);
    expect((await api().delete(`/v1/teaching-assignments/${created.body.data.id}`)).status).toBe(200);
    expect((await t.as(teacher, A.slug).get('/v1/students')).body.page.total).toBe(2);
  });

  it('audits structure changes', async () => {
    const logs = await t.platform.auditLog.findMany({ where: { schoolId: A.schoolId, action: { startsWith: 'section.' } } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['section.bulk_create', 'section.update']));
  });
});
