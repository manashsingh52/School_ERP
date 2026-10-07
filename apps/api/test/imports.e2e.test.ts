/** Excel/CSV import, end to end through the real upload pipeline and the background job. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let admin: string;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'imp');
  admin = (await t.login(A.users.admin, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const api = () => t.as(admin, A.slug);

async function uploadCsv(name: string, csv: string): Promise<string> {
  const body = Buffer.from(csv);
  const ticket = await api().post('/v1/files/upload-url', { purpose: 'import', fileName: name, mimeType: 'text/csv', sizeBytes: body.length });
  await t.http.put(ticket.body.data.upload.url).set(ticket.body.data.upload.headers).send(body);
  await api().post(`/v1/files/${ticket.body.data.fileId}/complete`);
  return ticket.body.data.fileId;
}

async function waitForStatus(id: string, status: string) {
  for (let i = 0; i < 150; i++) {
    const res = await api().get(`/v1/imports/${id}`);
    if (res.body.data.status === status) return res.body.data;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`import never reached ${status}`);
}

const STUDENTS_CSV = [
  'Adm No,Student Name,Class-Sec,DOB,Gender,Father Name,Father Mobile,Mother Name,Mother Mobile,Remarks',
  '2001,Aarav Mehta,8-A,14/03/2013,M,Raj Mehta,9811100001,Nina Mehta,9811100002,ok',
  '2002,Isha Rao,VIII-B,2013-05-01,F,Vikram Rao,9811100003,,,roman class',
  '2003,Kabir Das,9-A,01/01/2013,M,,,,,unknown class',
  '2004,Zoya Khan,8-A,31/02/2013,F,,98111,,,bad date and phone',
  '2001,Repeat Row,8-A,,,,,,,repeated admission no',
  '1,Existing Kid,8-A,,,,,,,already in the school',
  '2005,Diya Mehta,8-B,,F,Raj Mehta,9811100001,,,sibling: same father',
].join('\n');

describe('student import', () => {
  let importId: string;

  it('detects columns and suggests a mapping', async () => {
    const fileId = await uploadCsv('students.csv', STUDENTS_CSV);
    const res = await api().post('/v1/imports', { entity: 'STUDENTS', fileId });
    expect(res.status).toBe(201);
    importId = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: 'MAPPING', missingRequired: [] });
    expect(res.body.data.mapping).toMatchObject({
      'Adm No': 'admissionNo',
      'Student Name': 'fullName',
      'Class-Sec': 'classSection',
      'Father Mobile': 'fatherPhone',
      Remarks: '',
    });
    expect(res.body.data.sample).toHaveLength(5);
  });

  it('refuses a mapping without required fields', async () => {
    const res = await api().put(`/v1/imports/${importId}/mapping`, { mapping: { 'Student Name': 'fullName' } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MAPPING_INCOMPLETE');
  });

  it('validates every row and explains each problem', async () => {
    const job = (await api().get(`/v1/imports/${importId}`)).body.data;
    const res = await api().put(`/v1/imports/${importId}/mapping`, { mapping: job.mapping, inviteLogins: true });
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toMatchObject({ total: 7, valid: 3, invalid: 2, duplicate: 2 });

    const invalid = await api().get(`/v1/imports/${importId}/rows?status=INVALID`);
    const messages = invalid.body.data.flatMap((r: { errors: { message: string }[] }) => r.errors.map((e) => e.message));
    expect(messages).toEqual(
      expect.arrayContaining([
        `Class "9" doesn't exist this year`,
        `"31/02/2013" isn't a date (use DD/MM/YYYY)`,
        `"98111" isn't a valid mobile number`,
      ]),
    );
    const dups = await api().get(`/v1/imports/${importId}/rows?status=DUPLICATE`);
    expect(dups.body.data.map((r: { errors: { message: string }[] }) => r.errors[0]!.message)).toEqual([
      'Same admission number as row 2',
      'A student with admission number 1 already exists',
    ]);
  });

  it('imports only valid rows in the background, reusing a parent for siblings', async () => {
    const res = await api().post(`/v1/imports/${importId}/commit`);
    expect(res.body.data.status).toBe('IMPORTING');
    const done = await waitForStatus(importId, 'COMPLETED');
    expect(done.stats).toMatchObject({ imported: 3, invalid: 2, duplicate: 2, failed: 0 });

    const students = await api().get('/v1/students?q=mehta');
    expect(students.body.data.map((s: { firstName: string }) => s.firstName).sort()).toEqual(['Aarav', 'Diya']);
    const aarav = await api().get(`/v1/students/${students.body.data.find((s: { firstName: string }) => s.firstName === 'Aarav').id}`);
    expect(aarav.body.data).toMatchObject({ dateOfBirth: '2013-03-14', gender: 'MALE', className: 'Class 8', sectionName: 'A' });
    expect(aarav.body.data.guardians.map((g: { name: string }) => g.name)).toEqual(['Raj Mehta', 'Nina Mehta']);

    const raj = await api().get(`/v1/guardians/${aarav.body.data.guardians[0].guardianId}`);
    expect(raj.body.data.children).toHaveLength(2);

    const isha = await api().get('/v1/students?q=isha');
    expect(isha.body.data[0]).toMatchObject({ className: 'Class 8', sectionName: 'B' });
  });

  it('cannot be committed twice', async () => {
    const again = await api().post(`/v1/imports/${importId}/commit`);
    expect(again.status).toBe(409);
  });

  it('gives back the rows to fix as CSV', async () => {
    const res = await api().get(`/v1/imports/${importId}/problems`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.replace(/^\uFEFF/, '').trim().split('\n');
    expect(lines).toHaveLength(5); // header + 4 problem rows
    expect(lines[0]).toBe('Row,Problem,Adm No,Student Name,Class-Sec,DOB,Gender,Father Name,Father Mobile,Mother Name,Mother Mobile,Remarks');
  });
});

describe('teacher import & templates', () => {
  it('imports teachers with logins', async () => {
    const csv = ['Emp Code,Name,Mobile,Email,Department', 'EMP-501,Neha Joshi,9822200001,neha@x.in,English', 'EMP-502,Arun Pillai,9822200002,,Science', 'EMP-501,Dup Person,9822200003,,'].join('\n');
    const fileId = await uploadCsv('teachers.csv', csv);
    const created = await api().post('/v1/imports', { entity: 'TEACHERS', fileId });
    const validated = await api().put(`/v1/imports/${created.body.data.id}/mapping`, { mapping: created.body.data.mapping });
    expect(validated.body.data.stats).toMatchObject({ valid: 2, duplicate: 1 });
    await api().post(`/v1/imports/${created.body.data.id}/commit`);
    const done = await waitForStatus(created.body.data.id, 'COMPLETED');
    expect(done.stats.imported).toBe(2);
    const neha = await api().get('/v1/teachers?q=neha');
    expect(neha.body.data[0]).toMatchObject({ employeeId: 'EMP-501', department: 'English', login: 'INVITED' });
  });

  it('serves an Excel template', async () => {
    const res = await api().get('/v1/imports/templates/STUDENTS').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // .xlsx is a zip
  });
});
