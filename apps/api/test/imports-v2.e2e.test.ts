/** Import v2: classes + sections, subjects + the classes they're taught in, students' optional fees, and the "rows to fix" Excel. */
import readXlsxFile from 'read-excel-file/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { parseClassList, parseSections } from '../src/modules/imports/setup-imports.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let admin: string;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'imp2');
  admin = (await t.login(A.users.admin, A.slug)).token;
  // An optional Transport fee on the Class 8 structure, for the fee import.
  const head = await t.platform.feeHead.create({ data: { schoolId: A.schoolId, name: 'Transport', code: 'TRN', type: 'TRANSPORT', frequency: 'RECURRING', isOptional: true } });
  await t.platform.feeStructureItem.create({ data: { schoolId: A.schoolId, feeStructureId: A.feeStructureId, feeHeadId: head.id, amountPaise: 900_000, isOptional: true } });
});

afterAll(async () => {
  await t?.close();
});

const api = () => t.as(admin, A.slug);

async function run(entity: string, name: string, csv: string) {
  const body = Buffer.from(csv);
  const ticket = await api().post('/v1/files/upload-url', { purpose: 'import', fileName: name, mimeType: 'text/csv', sizeBytes: body.length });
  await t.http.put(ticket.body.data.upload.url).set(ticket.body.data.upload.headers).send(body);
  await api().post(`/v1/files/${ticket.body.data.fileId}/complete`);
  const created = await api().post('/v1/imports', { entity, fileId: ticket.body.data.fileId });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const job = created.body.data;
  expect(job.missingRequired).toEqual([]);
  const checked = await api().put(`/v1/imports/${job.id}/mapping`, { mapping: job.mapping });
  expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  const rows = (await api().get(`/v1/imports/${job.id}/rows?pageSize=100`)).body.data as { rowNumber: number; status: string; summary: string; errors: { message: string }[] }[];
  return { id: job.id as string, stats: checked.body.data.stats, rows };
}

async function commit(id: string) {
  expect((await api().post(`/v1/imports/${id}/commit`)).status).toBe(200);
  for (let i = 0; i < 150; i++) {
    const res = await api().get(`/v1/imports/${id}`);
    if (res.body.data.status === 'COMPLETED') return res.body.data;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('import never completed');
}

describe('parsers', () => {
  it('reads sections and class lists the way schools write them', () => {
    expect(parseSections('A, B, C')).toEqual(['A', 'B', 'C']);
    expect(parseSections('a-d')).toEqual(['A', 'B', 'C', 'D']);
    expect(parseSections('3')).toEqual(['A', 'B', 'C']);
    expect(parseSections('Rose / Lily')).toEqual(['ROSE', 'LILY']);
    expect(parseSections('A-')).toBeNull();
    expect(parseClassList('1-3, VIII, LKG').keys).toEqual(['1', '2', '3', '8', 'lkg']);
    expect(parseClassList('All').keys).toBeNull();
  });
});

describe('classes', () => {
  it('creates classes and sections; existing ones are skipped or extended', async () => {
    const r = await run('CLASSES', 'classes.csv', ['Class,Sections,Seats', 'Class 9,"A, B",40', '8,A-C,35', '8,A,', 'LKG,2,25', 'Class 8,A,', ',A,'].join('\n'));
    expect(r.stats).toMatchObject({ total: 6, valid: 3, duplicate: 2, invalid: 1 });
    expect(r.rows.find((x) => x.rowNumber === 3)!.summary).toBe('Class 8 · sections C'); // A and B exist already
    expect(r.rows.find((x) => x.rowNumber === 7)!.errors[0]!.message).toBe('Class is missing');
    await commit(r.id);
    const classes = (await api().get('/v1/classes')).body.data as { name: string; displayOrder: number; sections: { name: string; capacity: number | null }[] }[];
    const labels = classes.flatMap((c) => c.sections.map((s) => `${c.name}-${s.name}`));
    expect(labels).toEqual(expect.arrayContaining(['Class 9-A', 'Class 9-B', 'Class 8-C', 'LKG-A', 'LKG-B']));
    expect(classes.find((c) => c.name === 'Class 9')!.sections.find((s) => s.name === 'A')!.capacity).toBe(40);
    expect(classes.find((c) => c.name === 'LKG')!.displayOrder).toBe(2);
  });
});

describe('subjects', () => {
  it('creates subjects and links them to classes for this year', async () => {
    const r = await run('SUBJECTS', 'subjects.csv', ['Subject,Code,Type,Classes', 'Science,SCI,Core,8-9', 'Mathematics,,,9', 'Art,ART,Activity,All', 'Hindi,HIN,Core,Class 12', 'Music,MATH,,8', 'science,,,8'].join('\n'));
    expect(r.stats).toMatchObject({ total: 6, valid: 3, invalid: 2, duplicate: 1 });
    const problems = Object.fromEntries(r.rows.filter((x) => x.errors.length).map((x) => [x.rowNumber, x.errors[0]!.message]));
    expect(problems[5]).toBe('No class called "12"');
    expect(problems[6]).toBe('Code MATH is already used by Mathematics');
    await commit(r.id);
    const links = (await api().get('/v1/class-subjects')).body.data as { classId: string; subjectId: string }[];
    const subjects = (await api().get('/v1/subjects')).body.data as { id: string; name: string; type: string }[];
    const sci = subjects.find((s) => s.name === 'Science')!;
    expect(links.filter((l) => l.subjectId === sci.id)).toHaveLength(2);
    expect(subjects.find((s) => s.name === 'Art')!.type).toBe('CO_SCHOLASTIC');
    expect(links.filter((l) => l.subjectId === subjects.find((s) => s.name === 'Mathematics')!.id).map((l) => l.classId)).toContain(
      (await api().get('/v1/classes')).body.data.find((c: { name: string }) => c.name === 'Class 9').id,
    );
  });
});

describe('optional fees', () => {
  it('sets students’ optional fees by admission number', async () => {
    const r = await run('FEE_ASSIGNMENTS', 'transport.csv', ['Adm No,Optional fees', '1,Transport', '2,none', '999,Transport', '3,Swimming', '1,Transport'].join('\n'));
    expect(r.stats).toMatchObject({ total: 5, valid: 2, invalid: 2, duplicate: 1 });
    const problems = Object.fromEntries(r.rows.filter((x) => x.errors.length).map((x) => [x.rowNumber, x.errors[0]!.message]));
    expect(problems[4]).toBe('No student with admission number 999');
    expect(problems[5]).toMatch(/^"Swimming" isn't an optional fee for .* \(choose from Transport\)$/);
    await commit(r.id);
    const opts = (await api().get(`/v1/students/${A.students.s1}/fee-options`)).body.data;
    expect(opts.optional).toEqual([expect.objectContaining({ name: 'Transport', opted: true })]);
  });

  it('rows to fix come back as an Excel file with the reasons', async () => {
    const r = await run('FEE_ASSIGNMENTS', 'transport2.csv', ['Adm No,Optional fees', '=cmd|calc,Transport', '3,Swimming'].join('\n'));
    const res = await api().get(`/v1/imports/${r.id}/problems?format=xlsx`).buffer(true).parse((resp, cb) => {
      const chunks: Buffer[] = [];
      resp.on('data', (c: Buffer) => chunks.push(c));
      resp.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('rows to fix.xlsx');
    const sheet = await readXlsxFile(res.body as Buffer);
    const rows = (Array.isArray(sheet[0]) ? sheet : (sheet as unknown as { data: unknown[][] }[])[0]!.data) as unknown[][];
    expect(rows[0]).toEqual(['Adm No', 'Optional fees', 'Row in your file', 'What to fix']);
    expect(rows[1]![0]).toBe("'=cmd|calc");
    expect(String(rows[2]![3])).toContain('Swimming');
    expect((await api().get(`/v1/imports/${r.id}/problems`)).text).toContain('Row,Problem');
  });
});
