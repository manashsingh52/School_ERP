/**
 * E-certificates: the office or a teacher issues participation and achievement certificates,
 * parents are told and see them under Achievements, and the PDF is drawn once and kept.
 * Fixture: s1 and s2 in 8-A (the teacher's class), s3 in 8-B; the parent's child is s1, who
 * already has a "Science Fair" participation certificate from the admin.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CertificateItem } from '@schoolos/contracts';
import { certificateHtml } from '../src/modules/certificates/certificate.template.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const quiz = { kind: 'ACHIEVEMENT', eventName: 'Inter-school Quiz', eventDate: '2026-10-20', position: '1st place', note: 'District level' };

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'certs');
  for (const who of ['admin', 'teacher', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

describe('certificates', () => {
  let teamIds: string[] = [];

  it('the office awards a whole team at once, numbered in turn, and parents are told', async () => {
    const res = await as('admin').post('/v1/certificates', { ...quiz, studentIds: [A.students.s1, A.students.s3] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const items = res.body.data as CertificateItem[];
    teamIds = items.map((c) => c.id);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'ACHIEVEMENT', eventName: 'Inter-school Quiz', eventDate: '2026-10-20', position: '1st place', note: 'District level', issuedBy: 'Admin', canDelete: true });
    expect(items[0]!.student).toMatchObject({ id: A.students.s1, name: 'Student1', classLabel: 'Class 8 - A' });
    expect(items[1]!.student.classLabel).toBe('Class 8 - B');
    expect(items[0]!.serialNo).toMatch(/^CERT\/.+\/0001$/);
    expect(items[1]!.serialNo).toMatch(/^CERT\/.+\/0002$/);

    const inbox = (await as('parent').get('/v1/notifications')).body.data as { event: string; title: string; body: string; data: Record<string, unknown> }[];
    const alert = inbox.find((n) => n.event === 'certificate.issued')!;
    expect(alert.title).toBe('Student1 received a certificate');
    expect(alert.body).toBe('1st place in Inter-school Quiz, 20 Oct. Open Achievements to see and download it.');
    expect(alert.data).toMatchObject({ route: '/certificates', studentId: A.students.s1 });
  });

  it('asks for a position on achievements, and at least one student', async () => {
    expect((await as('admin').post('/v1/certificates', { ...quiz, position: undefined, studentIds: [A.students.s1] })).status).toBe(422);
    expect((await as('admin').post('/v1/certificates', { ...quiz, studentIds: [] })).status).toBe(422);
    // Participation needs no position (and ignores one).
    const p = await as('admin').post('/v1/certificates', { kind: 'PARTICIPATION', eventName: 'Annual Sports Day', eventDate: '2026-10-05', position: 'Winner', studentIds: [A.students.s2] });
    expect(p.status).toBe(201);
    expect(p.body.data[0].position).toBeNull();
  });

  it("teachers award their own class's students only", async () => {
    const mine = await as('teacher').post('/v1/certificates', { kind: 'PARTICIPATION', eventName: 'Class debate', eventDate: '2026-10-22', studentIds: [A.students.s2] });
    expect(mine.status).toBe(201);
    expect(mine.body.data[0].issuedBy).toBe('Teacher');
    const other = await as('teacher').post('/v1/certificates', { kind: 'PARTICIPATION', eventName: 'Class debate', eventDate: '2026-10-22', studentIds: [A.students.s3] });
    expect(other.status).toBe(422);

    const seen = ((await as('teacher').get('/v1/certificates?pageSize=100')).body.data as CertificateItem[]).map((c) => c.student.id);
    expect(seen).toContain(A.students.s1);
    expect(seen).not.toContain(A.students.s3);
    const own = (await as('teacher').get('/v1/certificates?mine=true')).body.data as CertificateItem[];
    expect(own.map((c) => c.eventName)).toEqual(['Class debate']);
  });

  it("parents see their child's achievements, nobody else's, and can't issue", async () => {
    const list = await as('parent').get(`/v1/certificates?studentId=${A.students.s1}`);
    expect(list.status).toBe(200);
    expect((list.body.data as CertificateItem[]).map((c) => c.eventName)).toEqual(['Inter-school Quiz', 'Science Fair']);
    expect((list.body.data as CertificateItem[]).every((c) => !c.canDelete)).toBe(true);
    expect(((await as('parent').get('/v1/certificates')).body.data as CertificateItem[]).every((c) => c.student.id === A.students.s1)).toBe(true);
    expect((await as('parent').get(`/v1/certificates?studentId=${A.students.s2}`)).status).toBe(404);
    expect((await as('parent').post('/v1/certificates', { ...quiz, studentIds: [A.students.s1] })).status).toBe(403);
    expect((await as('parent').get(`/v1/certificates/${teamIds[1]}/download`)).status).toBe(404);
  });

  it('filters by type and searches by event or name', async () => {
    const ach = (await as('admin').get('/v1/certificates?kind=ACHIEVEMENT')).body.data as CertificateItem[];
    expect(ach.every((c) => c.kind === 'ACHIEVEMENT')).toBe(true);
    expect(((await as('admin').get('/v1/certificates?q=debate')).body.data as CertificateItem[]).map((c) => c.eventName)).toEqual(['Class debate']);
    expect(((await as('admin').get('/v1/certificates?q=student3')).body.data as CertificateItem[]).map((c) => c.student.id)).toEqual([A.students.s3]);
  });

  it('the PDF is drawn on first download and kept', async () => {
    const link = await as('parent').get(`/v1/certificates/${teamIds[0]}/download`);
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const file = await t.http.get(link.body.data.url);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const stored = await t.platform.certificate.findUniqueOrThrow({ where: { id: teamIds[0] } });
    expect(stored.fileId).toBeTruthy();
    expect((await as('admin').get(`/v1/certificates/${teamIds[0]}/download`)).status).toBe(200);
    expect((await t.platform.certificate.findUniqueOrThrow({ where: { id: teamIds[0] } })).fileId).toBe(stored.fileId);
  });

  it('a teacher withdraws only their own; the office any; both audited', async () => {
    expect((await as('teacher').delete(`/v1/certificates/${teamIds[0]}`)).status).toBe(403);
    const own = ((await as('teacher').get('/v1/certificates?mine=true')).body.data as CertificateItem[])[0]!;
    expect(own.canDelete).toBe(true);
    expect((await as('teacher').delete(`/v1/certificates/${own.id}`)).status).toBe(200);
    expect((await as('admin').delete(`/v1/certificates/${teamIds[1]}`)).status).toBe(200);
    expect((await as('admin').get(`/v1/certificates/${teamIds[1]}/download`)).status).toBe(404);
    const audit = (await as('admin').get('/v1/audit?action=certificate')).body.data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['certificate.issue', 'certificate.delete']));
  });
});

describe('certificate template', () => {
  const base = {
    school: { name: 'Green Valley School', address: 'Ranchi', accent: '#2F6FEB', logoDataUri: null, affiliation: null },
    principal: { name: 'Dr. Mehta', signatureDataUri: null },
    serialNo: 'CERT/2026-27/0001',
    classLabel: 'Class 8 - A',
    eventName: 'Inter-school Quiz',
    eventDate: '20 October 2026',
    issuedOn: '21 October 2026',
    note: null,
    issuedBy: 'Ms. Rao',
  };

  it('says what it is for', () => {
    const a = certificateHtml({ ...base, kind: 'ACHIEVEMENT', studentName: 'Ananya Mishra', position: '1st place' });
    expect(a).toContain('Certificate of Achievement');
    expect(a).toContain('for securing <b>1st place</b> in <b>Inter-school Quiz</b>');
    const p = certificateHtml({ ...base, kind: 'PARTICIPATION', studentName: 'Ananya Mishra', position: null });
    expect(p).toContain('Certificate of Participation');
    expect(p).toContain('for taking part in <b>Inter-school Quiz</b>');
  });

  it('escapes user text', () => {
    const html = certificateHtml({ ...base, kind: 'ACHIEVEMENT', studentName: '<script>x</script>', position: '"1st"', school: { ...base.school, accent: 'red;}</style>' } });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;1st&quot;');
    expect(html).not.toContain('red;}');
  });
});
