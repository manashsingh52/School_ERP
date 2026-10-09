/** Marks from a spreadsheet: download the class list, fill in, upload — checked row by row before saving. */
import readXlsxFile from 'read-excel-file/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const q = () => `examSubjectId=${A.examSubjectId}&sectionId=${A.sectionA}`;

async function upload(who: string, csv: string, purpose = 'marks_import') {
  const body = Buffer.from(csv);
  const ticket = await as(who).post('/v1/files/upload-url', { purpose, fileName: 'marks.csv', mimeType: 'text/csv', sizeBytes: body.length });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  await t.http.put(ticket.body.data.upload.url).set(ticket.body.data.upload.headers).send(body);
  expect((await as(who).post(`/v1/files/${ticket.body.data.fileId}/complete`)).status).toBe(200);
  return ticket.body.data.fileId as string;
}
const run = (who: string, fileId: string, extra: object = {}) => as(who).post('/v1/exams/marks/import', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, fileId, ...extra });

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'mkimp');
  for (const who of ['admin', 'teacher', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
  // s2 has a remark the import must keep.
  await t.platform.mark.create({ data: { schoolId: A.schoolId, examSubjectId: A.examSubjectId, studentId: A.students.s2, marksObtained: 20, remarks: 'Retest pending', enteredByMemberId: A.adminMembershipId } });
});

afterAll(async () => {
  await t?.close();
});

describe('marks import', () => {
  it('the template is the class list with current marks', async () => {
    const res = await as('teacher').get(`/v1/exams/marks/template?${q()}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('Unit Test 1 - Mathematics - 8-A.xlsx');
    const sheet = await readXlsxFile(res.body as Buffer);
    const rows = (Array.isArray(sheet[0]) ? sheet : (sheet as unknown as { data: unknown[][] }[])[0]!.data) as unknown[][];
    expect(rows[0]).toEqual(['Admission no', 'Roll no', 'Student', 'Marks (out of 50)']);
    expect(rows.find((r) => r[0] === '2')?.[3]).toBe(20);
    expect((await as('parent').get(`/v1/exams/marks/template?${q()}`)).status).toBe(403);
  });

  it('every row is checked; nothing is saved while any row has a problem', async () => {
    const fileId = await upload('teacher', 'Admission no,Marks\n1,45\n2,A\n999,10\n1,30\n2,60\n');
    const res = await run('teacher', fileId, { apply: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const r = res.body.data;
    expect(r.applied).toBe(false);
    expect(r.errors).toBe(3);
    const errors = r.rows.filter((x: { error: string | null }) => x.error).map((x: { row: number; error: string }) => `${x.row}: ${x.error}`);
    expect(errors).toEqual(['4: No student with admission no. 999 in 8-A', '5: Same student as row 2', '6: Same student as row 3']);
    expect((await t.platform.mark.findFirst({ where: { examSubjectId: A.examSubjectId, studentId: A.students.s1 } }))).toBeNull();
  });

  it('a clean sheet saves the changes and keeps remarks', async () => {
    const opened = (await as('teacher').get(`/v1/exams/marks?${q()}`)).body.data.version;
    const fileId = await upload('teacher', 'Adm No,Marks obtained\n1,45.5\n2,ab\n');
    const check = (await run('teacher', fileId)).body.data;
    expect(check).toMatchObject({ applied: false, errors: 0, changes: 2, missing: [] });
    expect(check.rows.map((x: { change: string }) => x.change)).toEqual(['new', 'changed']);
    const res = await run('teacher', fileId, { apply: true, version: opened });
    expect(res.body.data.applied).toBe(true);
    const s2 = res.body.data.sheet.students.find((s: { studentId: string }) => s.studentId === A.students.s2);
    expect(s2).toMatchObject({ absent: true, marks: null, remarks: 'Retest pending' });
    expect(res.body.data.sheet.students.find((s: { studentId: string }) => s.studentId === A.students.s1).marks).toBe(45.5);
    const audit = (await as('admin').get('/v1/audit?action=marks.')).body.data.map((a: { action: string }) => a.action);
    expect(audit).toContain('marks.correct'); // s2 went from 20 to absent
  });

  it('a stale sheet is refused; values out of range are explained', async () => {
    const fileId = await upload('teacher', 'Admission no,Marks\n1,40\n');
    const res = await run('teacher', fileId, { apply: true, version: 'stale-version' });
    expect(res.status).toBe(409);
    const bad = await upload('teacher', 'Admission no,Marks\n1,51\n2,x\n');
    const r = (await run('teacher', bad)).body.data;
    expect(r.rows.map((x: { error: string }) => x.error)).toEqual(['51 is outside 0–50', '"x" isn\'t a number (use A for absent, E for exempt)']);
  });

  it('only the uploader’s own marks sheets are accepted', async () => {
    const adminFile = await upload('admin', 'Admission no,Marks\n1,40\n');
    expect((await run('teacher', adminFile)).status).toBe(422);
    const wrongPurpose = await upload('admin', 'Admission no,Marks\n1,40\n', 'import');
    expect((await run('admin', wrongPurpose)).status).toBe(422);
    const noColumns = await upload('teacher', 'Name,Score\nA,1\n');
    expect((await run('teacher', noColumns)).body.error.code).toBe('COLUMNS_MISSING');
  });
});
