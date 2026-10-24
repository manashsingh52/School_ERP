/** School profile, branding, onboarding checklist and year-end promotion. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let admin: string;
let teacher: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'sch');
  admin = (await t.login(A.users.admin, A.slug)).token;
  teacher = (await t.login(A.users.teacher, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const api = () => t.as(admin, A.slug);

describe('profile & branding', () => {
  it('every member can read the school profile; only admins can change it', async () => {
    const read = await t.as(teacher, A.slug).get('/v1/school');
    expect(read.body.data).toMatchObject({ slug: A.slug, currentAcademicYear: { id: A.yearId } });
    expect((await t.as(teacher, A.slug).patch('/v1/school', { city: 'Pune' })).status).toBe(403);

    const updated = await api().patch('/v1/school', { city: 'Pune', phone: '020 2612 3456', board: 'CBSE', postalCode: '411001' });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ board: 'CBSE', address: { city: 'Pune', postalCode: '411001' } });
  });

  it('sets the accent colour and rejects non-logo files as logos', async () => {
    const res = await api().patch('/v1/school/branding', { accentColor: '#16a34a' });
    expect(res.body.data.accentColor).toBe('#16A34A');
    const branding = await t.http.get(`/v1/public/schools/${A.slug}`);
    expect(branding.body.data.accentColor).toBe('#16A34A');
    expect((await api().patch('/v1/school/branding', { logoFileId: A.fileId })).status).toBe(422);
    expect((await api().patch('/v1/school/branding', { accentColor: 'green' })).status).toBe(422);
  });
});

describe('onboarding', () => {
  it('computes the checklist and goes live once required steps are done', async () => {
    const state = await api().get('/v1/onboarding');
    const byKey = Object.fromEntries(state.body.data.checklist.map((c: { key: string; done: boolean }) => [c.key, c.done]));
    expect(byKey).toMatchObject({ school: true, year: true, classes: true, sections: true, students: true, fees: true, admin: true });
    expect(state.body.data.canGoLive).toBe(true);

    await api().put('/v1/onboarding/step', { step: 4 });
    expect((await api().get('/v1/onboarding')).body.data.step).toBe(4);

    const live = await api().post('/v1/onboarding/go-live');
    expect(live.body.data.status).toBe('ACTIVE');
  });

  it('refuses to go live without an academic year', async () => {
    const fresh = await t.schools.createSchool({ slug: `fresh-${Date.now()}`, name: 'Fresh School' });
    await t.schools.addMember({ schoolId: fresh.id, name: 'New Admin', email: `new-${fresh.slug}@test.school`, password: 'Test@Pass123', roleKeys: ['school_admin'] });
    const token = (await t.login(`new-${fresh.slug}@test.school`, fresh.slug)).token;
    const res = await t.as(token, fresh.slug).post('/v1/onboarding/go-live');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('Academic year');
  });
});

describe('year-end promotion', () => {
  it('promotes, detains and graduates without overwriting last year', async () => {
    // Next year with Class 8 and Class 9 sections
    const next = await api().post('/v1/academic-years', { name: '2027–28', startDate: '2027-04-01', endDate: '2028-03-31' });
    const nextYear = next.body.data.id;
    await api().post('/v1/classes', { name: 'Class 9' });
    const classes = (await api().get(`/v1/classes?academicYearId=${nextYear}`)).body.data as { id: string; name: string }[];
    await api().post('/v1/sections/bulk', { academicYearId: nextYear, classIds: classes.map((c) => c.id), names: ['A', 'B'] });

    const plan = await api().post('/v1/promotions/preview', { fromYearId: A.yearId, toYearId: nextYear });
    expect(plan.status).toBe(200);
    const row8A = plan.body.data.rows.find((r: { fromSection: { label: string } }) => r.fromSection.label === '8-A');
    const nine = plan.body.data.toSections.find((s: { label: string }) => s.label === '9-A');
    expect(row8A).toMatchObject({ fromSection: { studentCount: 2 }, suggestedToSectionId: nine.id });

    const row8B = plan.body.data.rows.find((r: { fromSection: { label: string } }) => r.fromSection.label === '8-B');
    const body = {
      fromYearId: A.yearId,
      toYearId: nextYear,
      moves: [
        { fromSectionId: row8A.fromSection.id, toSectionId: nine.id },
        { fromSectionId: row8B.fromSection.id, toSectionId: null }, // graduate 8-B (pretend it's the last class)
      ],
      detainedStudentIds: [A.students.s2],
    };
    expect((await api().post('/v1/promotions/commit', body)).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const res = await api().post('/v1/promotions/commit', body).set('idempotency-key', 'promo-2027-0001');
    expect(res.body.data).toEqual({ promoted: 1, detained: 1, graduated: 1, skipped: 0 });

    const s1 = await t.platform.studentEnrollment.findMany({ where: { studentId: A.students.s1 }, orderBy: { enrolledOn: 'asc' } });
    expect(s1.map((e) => e.status)).toEqual(['PROMOTED', 'ENROLLED']); // history kept
    const s3 = await t.platform.student.findUniqueOrThrow({ where: { id: A.students.s3 } });
    expect(s3.status).toBe('ALUMNI');

    // Listing by section works for any year, not only the current one (the keep-back picker).
    const nineA = (await api().get(`/v1/students?sectionId=${nine.id}`)).body.data as { id: string }[];
    expect(nineA.map((s) => s.id)).toEqual([A.students.s1]);

    // Running again (new key) skips everyone already moved
    const again = await api().post('/v1/promotions/commit', body).set('idempotency-key', 'promo-2027-0002');
    expect(again.body.data).toEqual({ promoted: 0, detained: 0, graduated: 0, skipped: 0 });
  });

  it('only into a later year', async () => {
    const years = (await api().get('/v1/academic-years')).body.data as { id: string; name: string }[];
    const later = years.find((y) => y.name === '2027–28')!;
    const res = await api().post('/v1/promotions/preview', { fromYearId: later.id, toYearId: A.yearId });
    expect(res.status).toBe(422);
  });
});
