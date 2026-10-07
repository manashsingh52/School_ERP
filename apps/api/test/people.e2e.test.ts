/** Teachers, parents, full student records, members, roles and search. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let admin: string;
let parent: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'people');
  admin = (await t.login(A.users.admin, A.slug)).token;
  parent = (await t.login(A.users.parent, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const api = () => t.as(admin, A.slug);

describe('teachers', () => {
  it('adds a teacher with a login invitation; the teacher activates by signing in with a code', async () => {
    const res = await api().post('/v1/teachers', {
      employeeId: 'EMP-77',
      firstName: 'Meera',
      lastName: 'Iyer',
      phone: '98450 12345',
      department: 'Science',
      inviteToLogin: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ employeeId: 'EMP-77', phone: '+919845012345', login: 'INVITED' });

    // assign as class teacher of 8-B, then sign in with OTP → sees only 8-B
    await api().patch(`/v1/sections/${A.sectionB}`, { classTeacherId: res.body.data.id });
    t.resetLimits();
    const sent = await t.http.post('/v1/auth/otp/send').send({ phone: '+919845012345' });
    const code = t.otp.sent.get('+919845012345')!;
    const login = await t.http.post('/v1/auth/otp/verify').send({ challengeId: sent.body.challengeId, code, schoolSlug: A.slug });
    expect(login.status).toBe(200);
    const students = await t.as(login.body.tokens.accessToken, A.slug).get('/v1/students');
    expect(students.body.data.map((s: { id: string }) => s.id)).toEqual([A.students.s3]);

    const detail = await api().get(`/v1/teachers/${res.body.data.id}`);
    expect(detail.body.data).toMatchObject({ login: 'ACTIVE', classTeacherOf: ['8-B'] });
    await api().patch(`/v1/sections/${A.sectionB}`, { classTeacherId: null });
  });

  it('rejects a duplicate employee id', async () => {
    const res = await api().post('/v1/teachers', { employeeId: 'T1', firstName: 'Dup', phone: '9845099999', inviteToLogin: false });
    expect(res.status).toBe(409);
  });

  it("marking a teacher as left ends their access", async () => {
    const res = await api().patch(`/v1/teachers/${A.teacherId}`, { status: 'LEFT' });
    expect(res.status).toBe(200);
    t.clearAccessCache();
    t.resetLimits();
    const login = await t.http.post('/v1/auth/login').send({ identifier: A.users.teacher, password: 'Test@Pass123', schoolSlug: A.slug });
    expect(login.body.error.code).toBe('NO_SCHOOL_ACCESS');
    await api().patch(`/v1/teachers/${A.teacherId}`, { status: 'ACTIVE' });
  });

  it("parents see their child's teachers without personal contact details", async () => {
    const res = await t.as(parent, A.slug).get('/v1/teachers');
    expect(res.body.data.map((x: { id: string }) => x.id)).toEqual([A.teacherId]); // class teacher of 8-A
    const detail = await t.as(parent, A.slug).get(`/v1/teachers/${A.teacherId}`);
    expect(detail.body.data.phone).toBe('');
    expect(detail.body.data.email).toBeNull();
  });
});

describe('students with parents', () => {
  it('creates a student with both parents, reusing an existing parent for a sibling', async () => {
    const first = await api().post('/v1/students', {
      admissionNo: 'SIB-1',
      firstName: 'Kabir',
      lastName: 'Rao',
      sectionId: A.sectionA,
      bloodGroup: 'B+',
      city: 'Pune',
      guardians: [
        { name: 'Anil Rao', phone: '9822000001', relation: 'FATHER', isPrimary: true },
        { name: 'Sunita Rao', phone: '9822000002', relation: 'MOTHER' },
      ],
    });
    expect(first.status).toBe(201);
    expect(first.body.data.guardians).toHaveLength(2);
    expect(first.body.data.guardians[0]).toMatchObject({ name: 'Anil Rao', isPrimary: true, login: 'INVITED' });
    expect(first.body.data).toMatchObject({ bloodGroup: 'B+', address: { city: 'Pune' } });

    const sibling = await api().post('/v1/students', {
      admissionNo: 'SIB-2',
      firstName: 'Diya',
      sectionId: A.sectionB,
      guardians: [{ name: 'Anil R.', phone: '+91 98220 00001', relation: 'FATHER', isPrimary: true }],
    });
    expect(sibling.body.data.guardians[0].guardianId).toBe(first.body.data.guardians[0].guardianId);

    const anil = await api().get(`/v1/guardians/${first.body.data.guardians[0].guardianId}`);
    expect(anil.body.data.children.map((c: { name: string }) => c.name).sort()).toEqual(['Diya', 'Kabir Rao']);
  });

  it('only one primary guardian per student', async () => {
    const created = await api().post('/v1/students', {
      admissionNo: 'PRI-1',
      firstName: 'Ira',
      sectionId: A.sectionA,
      guardians: [
        { name: 'Dad', phone: '9822000011', relation: 'FATHER', isPrimary: true },
        { name: 'Mum', phone: '9822000012', relation: 'MOTHER', isPrimary: true },
      ],
    });
    expect(created.body.data.guardians.filter((g: { isPrimary: boolean }) => g.isPrimary)).toHaveLength(1);
  });

  it('a parent sees only their own guardian record', async () => {
    const res = await t.as(parent, A.slug).get('/v1/guardians');
    expect(res.body.data.map((g: { id: string }) => g.id)).toEqual([A.guardianId]);
  });

  it('attaching a photo requires a verified upload of the right kind', async () => {
    const res = await api().patch(`/v1/students/${A.students.s1}`, { photoFileId: A.fileId }); // a document, not a photo
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });
});

describe('members & roles', () => {
  it('invites staff with a role and lists them', async () => {
    const roles = (await api().get('/v1/roles')).body.data as { id: string; key: string; memberCount: number }[];
    const accountant = roles.find((r) => r.key === 'accountant')!;
    const res = await api().post('/v1/members', { name: 'Fee Clerk', email: 'clerk@test.school', roleIds: [accountant.id] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'INVITED', roles: [{ key: 'accountant' }] });
    const list = await api().get(`/v1/members?roleId=${accountant.id}`);
    expect(list.body.page.total).toBe(2);
  });

  it("won't remove the school's last role manager", async () => {
    const roles = (await api().get('/v1/roles')).body.data as { id: string; key: string }[];
    const teacherRole = roles.find((r) => r.key === 'teacher')!;
    const demote = await api().patch(`/v1/members/${A.adminMembershipId}`, { roleIds: [teacherRole.id] });
    expect(demote.status).toBe(422);
    expect(demote.body.error.code).toBe('LAST_ADMIN');
    const suspend = await api().patch(`/v1/members/${A.adminMembershipId}`, { status: 'SUSPENDED' });
    expect(suspend.body.error.code).toBe('LAST_ADMIN');

    const adminRole = roles.find((r) => r.key === 'school_admin')!;
    const strip = await api().put(`/v1/roles/${adminRole.id}/permissions`, { permissions: [{ permission: 'dashboard.view', scope: 'ALL' }] });
    expect(strip.body.error.code).toBe('LAST_ADMIN');
  });

  it('custom roles: copy, edit with confirmation for broad student access, delete', async () => {
    const roles = (await api().get('/v1/roles')).body.data as { id: string; key: string; permissions: { permission: string; scope: string }[] }[];
    const teacherRole = roles.find((r) => r.key === 'teacher')!;
    const created = await api().post('/v1/roles', { name: 'Vice Principal', copyFromRoleId: teacherRole.id });
    expect(created.status).toBe(201);
    expect(created.body.data.permissions.length).toBe(teacherRole.permissions.length);

    const broad = [...created.body.data.permissions.filter((p: { permission: string }) => p.permission !== 'student.view'), { permission: 'student.view', scope: 'ALL' }];
    const blocked = await api().put(`/v1/roles/${created.body.data.id}/permissions`, { permissions: broad });
    expect(blocked.body.error.code).toBe('CONFIRM_REQUIRED');
    const ok = await api().put(`/v1/roles/${created.body.data.id}/permissions`, { permissions: broad, confirmBroaden: true });
    expect(ok.status).toBe(200);

    const badScope = await api().put(`/v1/roles/${created.body.data.id}/permissions`, { permissions: [{ permission: 'role.manage', scope: 'ASSIGNED' }] });
    expect(badScope.status).toBe(422);

    expect((await api().delete(`/v1/roles/${created.body.data.id}`)).status).toBe(200);
    expect((await api().delete(`/v1/roles/${teacherRole.id}`)).body.error.code).toBe('SYSTEM_ROLE');
  });

  it('role changes take effect immediately', async () => {
    const roles = (await api().get('/v1/roles')).body.data as { id: string; key: string; permissions: { permission: string; scope: string }[] }[];
    const parentRole = roles.find((r) => r.key === 'parent')!;
    const withoutStudents = parentRole.permissions.filter((p) => p.permission !== 'student.view');
    await api().put(`/v1/roles/${parentRole.id}/permissions`, { permissions: withoutStudents });
    expect((await t.as(parent, A.slug).get('/v1/students')).status).toBe(403);
    await api().put(`/v1/roles/${parentRole.id}/permissions`, { permissions: parentRole.permissions });
    expect((await t.as(parent, A.slug).get('/v1/students')).status).toBe(200);
  });
});

describe('search', () => {
  it('finds students, teachers and parents for staff', async () => {
    const res = await api().get('/v1/search?q=rao');
    expect(res.body.data.students.map((s: { name: string }) => s.name)).toContain('Kabir Rao');
    expect(res.body.data.guardians.map((g: { name: string }) => g.name)).toEqual(expect.arrayContaining(['Anil Rao', 'Sunita Rao']));
  });

  it('parents get only their own children, no teacher or parent directory', async () => {
    const res = await t.as(parent, A.slug).get('/v1/search?q=student');
    expect(res.body.data.students.map((s: { id: string }) => s.id)).toEqual([A.students.s1]);
    expect(res.body.data.teachers).toEqual([]);
    expect(res.body.data.guardians).toEqual([]);
  });
});
