/** Printable student ID cards: a section's sheet or one card, office-only, never another school's. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idCardsHtml } from '../src/modules/students/id-card.template.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
let admin: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'idcards-a');
  B = await createTenant(t, 'idcards-b');
  admin = (await t.login(A.users.admin, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const pdf = (token: string, query: string) => t.as(token).get(`/v1/students/id-cards?${query}`).buffer(true).parse((res, cb) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

describe('student ID cards', () => {
  it('prints a whole section as one PDF', async () => {
    const res = await pdf(admin, `sectionId=${A.sectionA}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('ID cards - Class 8 - A.pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('prints one student', async () => {
    const res = await pdf(admin, `studentId=${A.students.s1}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/ID card - .+\.pdf/);
  });

  it('needs exactly one of section or student', async () => {
    expect((await t.as(admin).get('/v1/students/id-cards')).status).toBe(422);
    expect((await t.as(admin).get(`/v1/students/id-cards?sectionId=${A.sectionA}&studentId=${A.students.s1}`)).status).toBe(422);
  });

  it("is for the office: teachers and parents can't print", async () => {
    for (const who of [A.users.teacher, A.users.parent]) {
      const token = (await t.login(who, A.slug)).token;
      expect((await t.as(token).get(`/v1/students/id-cards?sectionId=${A.sectionA}`)).status).toBe(403);
    }
  });

  it("answers 404 for another school's section or student", async () => {
    expect((await t.as(admin).get(`/v1/students/id-cards?sectionId=${B.sectionA}`)).status).toBe(404);
    expect((await t.as(admin).get(`/v1/students/id-cards?studentId=${B.students.s1}`)).status).toBe(404);
  });
});

describe('ID card template', () => {
  const base = {
    school: { name: 'Demo Public School', address: 'MG Road, Pune', phone: '+91 90000 00001', accent: '#16A34A', logoDataUri: null },
    principal: { signatureDataUri: null },
    academicYear: '2026-27',
  };
  const student = {
    name: 'Ananya Kumar',
    admissionNo: 'DPS-1042',
    classSection: 'Class 5 - B',
    rollNo: 7,
    dateOfBirth: '12 Mar 2015',
    bloodGroup: 'B+',
    guardian: { name: 'Raj Kumar', relation: 'FATHER', phone: '+91 90000 00005' },
    address: '14 Lake View, Pune',
    photoDataUri: null,
  };

  it('shows the details that belong on a card, in the school colour', () => {
    const html = idCardsHtml({ ...base, students: [student] });
    for (const text of ['Demo Public School', 'Ananya Kumar', 'DPS-1042', 'Class 5 - B · Roll 7', 'B+', 'Raj Kumar (Father)', 'Valid 2026-27', 'If found, please call +91 90000 00001']) expect(html).toContain(text);
    expect(html).toContain('#16A34A');
    // No photo: the student's initials instead.
    expect(html).toContain('>AK</div>');
  });

  it('escapes user text and ignores a bad colour', () => {
    const html = idCardsHtml({ ...base, school: { ...base.school, accent: 'red;}</style><script>' }, students: [{ ...student, name: '<img src=x onerror=alert(1)>' }] });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('#2F6FEB');
  });

  it('leaves out what the school has not filled in', () => {
    const html = idCardsHtml({ ...base, students: [{ ...student, bloodGroup: null, dateOfBirth: null, guardian: null, address: null }] });
    expect(html).not.toContain('Blood group');
    expect(html).not.toContain('Date of birth');
    expect(html).not.toContain('Parent');
  });
});
