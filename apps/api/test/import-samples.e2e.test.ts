/**
 * The sample sheets in docs/samples/imports go through the real importer in onboarding order and
 * not one row may be rejected. If this fails after changing the importer, update build.py there,
 * rebuild the sheets (python3 docs/samples/imports/build.py) and run this again.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/samples/imports');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let t: TestApp;
let A: Tenant;
let admin: string;
const api = () => t.as(admin, A.slug);

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'samples');
  admin = (await t.login(A.users.admin, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

async function uploadFile(name: string, purpose: string) {
  const body = readFileSync(join(DIR, name));
  const ticket = await api().post('/v1/files/upload-url', { purpose, fileName: name, mimeType: XLSX, sizeBytes: body.length });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  await t.http.put(ticket.body.data.upload.url).set(ticket.body.data.upload.headers).send(body);
  expect((await api().post(`/v1/files/${ticket.body.data.fileId}/complete`)).status).toBe(200);
  return ticket.body.data.fileId as string;
}

/** Upload, check every column mapped by itself, no rejected rows, import, and wait for it. */
async function importSample(entity: string, name: string) {
  const created = await api().post('/v1/imports', { entity, fileId: await uploadFile(name, 'import') });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const job = created.body.data;
  expect(job.missingRequired, name).toEqual([]);
  const unmapped = Object.entries(job.mapping as Record<string, string>).filter(([, key]) => !key).map(([header]) => header);
  expect(unmapped, `${name}: columns not recognised`).toEqual([]);
  const checked = await api().put(`/v1/imports/${job.id}/mapping`, { mapping: job.mapping, inviteLogins: false });
  expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  const rows = (await api().get(`/v1/imports/${job.id}/rows?pageSize=200`)).body.data as { rowNumber: number; status: string; errors: { message: string }[] }[];
  const problems = rows.filter((r) => r.status === 'INVALID').map((r) => `row ${r.rowNumber}: ${r.errors.map((e) => e.message).join('; ')}`);
  expect(problems, name).toEqual([]);
  expect((await api().post(`/v1/imports/${job.id}/commit`)).status).toBe(200);
  for (let i = 0; i < 300; i++) {
    const res = await api().get(`/v1/imports/${job.id}`);
    if (res.body.data.status === 'COMPLETED') {
      expect(res.body.data.stats.failed, name).toBe(0);
      return res.body.data.stats as { total: number; imported: number; duplicate: number };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${name} never finished importing`);
}

describe('sample sheets (docs/samples/imports)', () => {
  it('1 Classes: every class and section goes in', async () => {
    const stats = await importSample('CLASSES', '1-Classes.xlsx');
    expect(stats.total).toBe(13);
    const classes = (await api().get('/v1/classes')).body.data as { name: string; sections: { name: string }[] }[];
    expect(classes.find((c) => c.name === 'Class 8')!.sections.map((s) => s.name).sort()).toEqual(['A', 'B', 'C']);
    expect(classes.find((c) => c.name === 'LKG')!.sections).toHaveLength(2);
  });

  it('2 Subjects', async () => {
    await importSample('SUBJECTS', '2-Subjects.xlsx');
    const subjects = (await api().get('/v1/subjects')).body.data as { name: string; type: string }[];
    expect(subjects.find((s) => s.name === 'Art')!.type).toBe('CO_SCHOLASTIC');
  });

  it('3 Teachers', async () => {
    const stats = await importSample('TEACHERS', '3-Teachers.xlsx');
    expect(stats.imported).toBe(10);
  });

  it('4 Students, with brothers and sisters linked to one parent', async () => {
    const stats = await importSample('STUDENTS', '4-Students.xlsx');
    expect(stats.imported).toBe(20);
    const found = (await api().get('/v1/students?q=Mishra')).body.data as { id: string; admissionNo: string }[];
    const [ananya, rahul] = await Promise.all(['1006', '1007'].map(async (no) => (await api().get(`/v1/students/${found.find((s) => s.admissionNo === no)!.id}`)).body.data));
    const father = (s: { guardians: { name: string; guardianId: string }[] }) => s.guardians.find((g) => g.name === 'Rajesh Mishra')!.guardianId;
    expect(father(ananya)).toBe(father(rahul));
  });

  it('5 Optional fees and 6 Fees already paid, once the fee structures are set up', async () => {
    // What the school sets up in Fees: optional Transport and Computer Lab on every class's
    // structure (Class 8 has one in the test school; one more covers the other classes).
    const db = t.platform;
    const head = (name: string, code: string) => db.feeHead.create({ data: { schoolId: A.schoolId, name, code, type: code === 'TRN' ? 'TRANSPORT' : 'OTHER', frequency: 'RECURRING', isOptional: true } });
    const [trn, lab] = [await head('Transport', 'TRN'), await head('Computer Lab', 'LAB')];
    const classes = await db.schoolClass.findMany({ where: { schoolId: A.schoolId, id: { not: A.classId } }, select: { id: true } });
    const others = await db.feeStructure.create({ data: { schoolId: A.schoolId, academicYearId: A.yearId, name: 'Other classes', status: 'PUBLISHED', classes: { create: classes.map((c) => ({ schoolId: A.schoolId, classId: c.id })) } } });
    const tuition = await db.feeStructureItem.create({ data: { schoolId: A.schoolId, feeStructureId: others.id, feeHeadId: A.feeHeadId, amountPaise: 1_200_000 } });
    const term1 = await db.feeInstallment.create({ data: { schoolId: A.schoolId, feeStructureId: others.id, name: 'Term 1', dueDate: new Date('2026-04-10T00:00:00Z'), order: 1, splits: { create: [{ schoolId: A.schoolId, itemId: tuition.id, amountPaise: 600_000 }] } } });
    for (const structure of [A.feeStructureId, others.id]) {
      for (const h of [trn, lab]) await db.feeStructureItem.create({ data: { schoolId: A.schoolId, feeStructureId: structure, feeHeadId: h.id, amountPaise: 300_000, isOptional: true } });
    }

    await importSample('FEE_ASSIGNMENTS', '5-Optional-fees.xlsx');

    // The bills (Fees → Invoices → Generate), then last year's payments against them.
    for (const installmentId of [A.installmentId, term1.id]) {
      const gen = await api().post('/v1/invoices/generate', { installmentId });
      expect(gen.status, JSON.stringify(gen.body)).toBe(202);
      // Bills are made in the background: wait for them, as the office does before uploading payments
      const before = await db.invoice.count({ where: { installmentId } });
      for (let i = 0; i < 300 && (await db.invoice.count({ where: { installmentId } })) < before + gen.body.data.queued; i++) await new Promise((r) => setTimeout(r, 100));
    }
    const stats = await importSample('FEE_PAYMENTS', '6-Fees-already-paid.xlsx');
    expect(stats.imported).toBe(9);
    const rahul = (await api().get('/v1/students?q=1007')).body.data[0];
    const statement = (await api().get(`/v1/students/${rahul.id}/fees`)).body.data as { payments: { amountPaise: number }[] };
    expect(statement.payments.map((p) => p.amountPaise).sort()).toEqual([250_000, 350_000]);
  });

  it('7 Exam marks for Class 8-A', async () => {
    const fileId = await uploadFile('7-Exam-marks.xlsx', 'marks_import');
    const res = await api().post('/v1/exams/marks/import', { examSubjectId: A.examSubjectId, sectionId: A.sectionA, fileId, apply: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.rows.filter((r: { error: string | null }) => r.error)).toEqual([]);
    expect(res.body.data.applied).toBe(true);
  });
});
