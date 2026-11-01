/** "Fees already paid" import: a school that starts mid-year brings in the payments it already took. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { parseAmount, parseMethod } from '../src/modules/imports/payment-imports.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let admin: string;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'payimp');
  admin = (await t.login(A.users.admin, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const api = (token = admin) => t.as(token, A.slug);

async function upload(csv: string, token = admin) {
  const body = Buffer.from(csv);
  const ticket = await api(token).post('/v1/files/upload-url', { purpose: 'import', fileName: 'paid.csv', mimeType: 'text/csv', sizeBytes: body.length });
  await t.http.put(ticket.body.data.upload.url).set(ticket.body.data.upload.headers).send(body);
  await api(token).post(`/v1/files/${ticket.body.data.fileId}/complete`);
  return api(token).post('/v1/imports', { entity: 'FEE_PAYMENTS', fileId: ticket.body.data.fileId });
}

async function run(csv: string) {
  const created = await upload(csv);
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

const CSV = [
  'Adm No,Amount,Date,Mode,Receipt No,Remarks',
  '1,"₹4,000",15/07/2026,Cash,R-101,Quarter 1',
  '1,3000,01/08/2026,GPay,UTR123,',
  '1,"₹4,000",15/07/2026,Cash,R-101,',
  '2,6000,10/04/2026,Cash,,',
  '999,100,10/04/2026,,,',
  '1,abc,10/04/2026,,,',
  '1,500,01/01/2030,,,',
  '1,500,01/03/2026,Cheque,,',
  '1,500,10/05/2026,Bitcoin,,',
].join('\n');

describe('fees already paid', () => {
  it('reads amounts and ways of paying the way school registers write them', () => {
    expect(parseAmount('₹12,500')).toBe(1_250_000);
    expect(parseAmount('Rs. 3,000/-')).toBe(300_000);
    expect(parseAmount('99.5')).toBe(9_950);
    expect(parseAmount('12,5OO')).toBeNull();
    expect(parseMethod('')).toBe('CASH');
    expect(parseMethod('PhonePe')).toBe('UPI_DIRECT');
    expect(parseMethod('NEFT')).toBe('BANK_TRANSFER');
    expect(parseMethod('Debit card')).toBe('POS_CARD');
    expect(parseMethod('barter')).toBeNull();
  });

  it('checks every row, then pays the oldest dues first; extra money is kept as advance', async () => {
    const notificationsBefore = await t.platform.notification.count({ where: { schoolId: A.schoolId, event: 'payment.received' } });
    const r = await run(CSV);
    expect(r.stats).toMatchObject({ total: 9, valid: 2, duplicate: 1, invalid: 6 });
    const problems = Object.fromEntries(r.rows.filter((x) => x.errors.length).map((x) => [x.rowNumber, x.errors[0]!.message]));
    expect(problems[4]).toBe('Same payment as row 2');
    expect(problems[5]).toMatch(/^Nothing is due for this student/);
    expect(problems[6]).toBe('No student with admission number 999');
    expect(problems[7]).toBe('"abc" isn\'t an amount (write it like 12500)');
    expect(problems[8]).toBe('This date is in the future');
    expect(problems[9]).toMatch(/^Before this school year/);
    expect(problems[10]).toBe('"Bitcoin" isn\'t a way of paying (cash, UPI, bank or card)');
    expect(r.rows.find((x) => x.rowNumber === 2)!.summary).toBe('Student1 · 1 · ₹4,000 on 15 Jul 2026 · Cash');
    expect(r.rows.find((x) => x.rowNumber === 3)!.summary).toBe('Student1 · 1 · ₹3,000 on 1 Aug 2026 · UPI · ₹1,000 kept as advance');

    const done = await commit(r.id);
    expect(done.stats).toMatchObject({ imported: 2, failed: 0 });
    const invoice = await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } });
    expect(invoice).toMatchObject({ status: 'PAID', balancePaise: 0 });
    const payments = await t.platform.payment.findMany({ where: { studentId: A.students.s1 }, include: { receipt: true }, orderBy: { receivedAt: 'asc' } });
    expect(payments.map((p) => [p.amountPaise, p.method, p.referenceNo, p.receivedAt.toISOString().slice(0, 10)])).toEqual([
      [400_000, 'CASH', 'R-101', '2026-07-15'],
      [300_000, 'UPI_DIRECT', 'UTR123', '2026-08-01'],
    ]);
    expect(payments.every((p) => p.receipt?.number.startsWith('RCPT/'))).toBe(true);
    expect(payments[0]!.notes).toBe('From the school’s earlier records · Quarter 1');
    const credit = await t.platform.studentCredit.findFirstOrThrow({ where: { studentId: A.students.s1 } });
    expect(credit.amountPaise).toBe(100_000);
    // Old payments don't message parents.
    expect(await t.platform.notification.count({ where: { schoolId: A.schoolId, event: 'payment.received' } })).toBe(notificationsBefore);

    // The receipt is made when it's first opened.
    let res = await api().get(`/v1/payments/${payments[0]!.id}/receipt`);
    for (let i = 0; i < 100 && res.status === 409; i++) {
      await new Promise((r) => setTimeout(r, 150));
      res = await api().get(`/v1/payments/${payments[0]!.id}/receipt`);
    }
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('importing the same file again adds nothing', async () => {
    const r = await run(CSV);
    expect(r.stats.valid).toBe(0);
    expect(r.rows.find((x) => x.rowNumber === 2)!.errors[0]!.message).toMatch(/^Already recorded \(receipt RCPT\//);
  });

  it('importing payments needs permission to collect fees, not only to import', async () => {
    // Staff who can import lists but not take money (here: the admin's role without payment.collect).
    const role = await t.platform.role.findFirstOrThrow({ where: { schoolId: A.schoolId, key: 'school_admin' } });
    await t.platform.rolePermission.deleteMany({ where: { roleId: role.id, permission: 'payment.collect' } });
    await t.platform.role.update({ where: { id: role.id }, data: { version: { increment: 1 } } });
    t.clearAccessCache();
    const res = await upload('Adm No,Amount,Date\n1,100,10/04/2026');
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error.message).toBe('Importing payments needs permission to collect fees.');
  });
});
