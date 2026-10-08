/**
 * Fees & payments (docs/11): setup, concessions, invoice generation (preview → issue, gap-free
 * numbers), counter collection (whole invoices only, idempotent, concurrency-safe), void,
 * adjustments, cancellation, statements, receipts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'accountant' | 'teacher' | 'parent', string> = {} as never;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'fin');
  for (const role of ['admin', 'accountant', 'teacher', 'parent'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
};
const as = (who: keyof typeof tok) => t.as(tok[who], A.slug);
const collect = (body: object, key = randomUUID()) => as('accountant').post('/v1/payments/collect', body).set('idempotency-key', key);
const invoicesOf = async (studentId: string) =>
  (await as('admin').get(`/v1/invoices?studentId=${studentId}&pageSize=50`)).body.data as { id: string; number: string; installment: { name: string }; totalPaise: number; balancePaise: number; status: string }[];

describe('fee setup', () => {
  it('fee heads: codes are unique; teachers cannot manage fees', async () => {
    const res = await as('accountant').post('/v1/fee-heads', { name: 'Transport', code: 'trn', type: 'TRANSPORT', isOptional: true });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TRN');
    expect((await as('accountant').post('/v1/fee-heads', { name: 'Other', code: 'TRN', type: 'OTHER' })).status).toBe(409);
    expect((await as('teacher').post('/v1/fee-heads', { name: 'X', code: 'X1', type: 'OTHER' })).status).toBe(403);
  });

  it('structures must split each fee exactly across installments, one structure per class', async () => {
    const bad = await as('accountant').post('/v1/fee-structures', {
      name: 'Bad', classIds: [A.classId], items: [{ feeHeadId: A.feeHeadId, amountPaise: 1000 }],
      installments: [{ name: 'Q1', dueDate: '2026-05-01', splits: { [A.feeHeadId]: 900 } }],
    });
    expect(bad.status).toBe(422);
    const taken = await as('accountant').post('/v1/fee-structures', {
      name: 'Another', classIds: [A.classId], items: [{ feeHeadId: A.feeHeadId, amountPaise: 1000 }],
      installments: [{ name: 'Q1', dueDate: '2026-05-01', splits: { [A.feeHeadId]: 1000 } }],
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('CLASS_HAS_STRUCTURE');
    const s = await as('accountant').get(`/v1/fee-structures/${A.feeStructureId}`);
    expect(s.body.data).toMatchObject({ status: 'PUBLISHED', annualPaise: 1_200_000, installments: [{ name: 'Term 1', amountPaise: 600_000 }, { name: 'Term 2', amountPaise: 600_000 }] });
  });

  it('concessions: requests wait for approval; approvers are auto-approved', async () => {
    expect((await as('accountant').post(`/v1/concessions/${A.concessionId}/decision`, { decision: 'APPROVED' })).status).toBe(403);
    const ok = await as('admin').post(`/v1/concessions/${A.concessionId}/decision`, { decision: 'APPROVED' });
    expect(ok.body.data.status).toBe('APPROVED');
    const type = await as('accountant').post('/v1/concession-types', { name: 'Scholarship ₹500', kind: 'SCHOLARSHIP', calc: 'FLAT', valuePaise: 50_000, feeHeadIds: [A.feeHeadId] });
    const req = await as('accountant').post('/v1/concessions', { studentId: A.students.s1, concessionTypeId: type.body.data.id, reason: 'Merit' });
    expect(req.body.data.status).toBe('PENDING');
    await as('admin').post(`/v1/concessions/${req.body.data.id}/decision`, { decision: 'APPROVED' });
    expect((await as('accountant').post('/v1/concessions', { studentId: A.students.s1, concessionTypeId: type.body.data.id })).status).toBe(409);
  });
});

describe('invoices', () => {
  it('previews then issues one invoice per student with concessions applied', async () => {
    const preview = await as('accountant').post('/v1/invoices/preview', { installmentId: A.installmentId });
    expect(preview.status).toBe(200);
    // s1: 6000 − 500 (flat) · s2: 6000 · s3: 6000 − 10%
    expect(preview.body.data).toMatchObject({ students: 3, toCreate: 3, alreadyInvoiced: 0, totalPaise: 600_000 * 3 - 50_000 - 60_000, concessionPaise: 110_000 });

    const gen = await as('accountant').post('/v1/invoices/generate', { installmentId: A.installmentId });
    expect(gen.status).toBe(202);
    const term2 = await waitFor(async () => {
      const all = (await as('admin').get(`/v1/invoices?installmentId=${A.installmentId}`)).body.data as { number: string; student: { id: string }; totalPaise: number }[];
      return all.length === 3 ? all : null;
    });
    expect(term2.map((i) => i.number).sort()).toEqual(['INV/2026-27/000001', 'INV/2026-27/000002', 'INV/2026-27/000003']);
    expect(term2.find((i) => i.student.id === A.students.s1)!.totalPaise).toBe(550_000);

    const again = await as('accountant').post('/v1/invoices/generate', { installmentId: A.installmentId });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('NOTHING_TO_INVOICE');
  });

  it('parents see only their child\'s invoices and statement', async () => {
    const mine = (await as('parent').get('/v1/invoices')).body.data as { student: { id: string } }[];
    expect(mine.length).toBe(2);
    expect(mine.every((i) => i.student.id === A.students.s1)).toBe(true);
    const st = await as('parent').get(`/v1/students/${A.students.s1}/fees`);
    expect(st.body.data.totals).toMatchObject({ invoicedPaise: 1_150_000, paidPaise: 0, balancePaise: 1_150_000, overduePaise: 600_000 });
    expect((await as('parent').get(`/v1/students/${A.students.s2}/fees`)).status).toBe(404);
  });

  it('adjustments are appended with a reason; cancellation needs no payments', async () => {
    const [inv] = (await invoicesOf(A.students.s3)).filter((i) => i.installment.name === 'Term 2');
    const add = await as('accountant').post(`/v1/invoices/${inv!.id}/adjustments`, { amountPaise: 10_000, reason: 'Lost library book' });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ adjustmentPaise: 10_000, totalPaise: 550_000, balancePaise: 550_000 });
    expect(add.body.data.lines.at(-1)).toMatchObject({ kind: 'ADJUSTMENT', reason: 'Lost library book' });
    const tooMuch = await as('accountant').post(`/v1/invoices/${inv!.id}/adjustments`, { amountPaise: -999_999, reason: 'Oops' });
    expect(tooMuch.status).toBe(422);
    const stale = await as('accountant').post(`/v1/invoices/${inv!.id}/adjustments`, { amountPaise: 100, reason: 'Stale', version: 1 });
    expect(stale.status).toBe(409);
    expect((await as('accountant').post(`/v1/invoices/${inv!.id}/cancel`, { reason: 'Test' })).status).toBe(403); // accountant can't cancel
    const cancel = await as('admin').post(`/v1/invoices/${inv!.id}/cancel`, { reason: 'Left school' });
    expect(cancel.body.data.status).toBe('CANCELLED');
  });
});

describe('counter payments', () => {
  let paymentId: string;

  it('whole invoices only, Idempotency-Key required', async () => {
    const ids = (await invoicesOf(A.students.s1)).map((i) => i.id);
    const part = await collect({ studentId: A.students.s1, invoiceIds: ids, amountPaise: 100_000, method: 'CASH' });
    expect(part.status).toBe(422);
    expect(part.body.error.code).toBe('AMOUNT_MISMATCH');
    const noKey = await as('accountant').post('/v1/payments/collect', { studentId: A.students.s1, invoiceIds: ids, amountPaise: 1_150_000, method: 'CASH' });
    expect(noKey.status).toBe(400);
    const upiNoRef = await collect({ studentId: A.students.s1, invoiceIds: ids, amountPaise: 1_150_000, method: 'UPI_DIRECT' });
    expect(upiNoRef.status).toBe(422);
  });

  it('collects, issues a gap-free receipt, and a double submit returns the same payment', async () => {
    const ids = (await invoicesOf(A.students.s1)).map((i) => i.id);
    const key = randomUUID();
    const body = { studentId: A.students.s1, invoiceIds: ids, amountPaise: 1_150_000, method: 'CASH', notes: 'Paid by father' };
    const res = await collect(body, key);
    expect(res.status).toBe(201);
    paymentId = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: 'CAPTURED', receiptNo: 'RCPT/2026-27/000001', collectedBy: 'Accountant', creditPaise: 0 });
    expect(res.body.data.allocations).toHaveLength(2);
    const replay = await collect(body, key);
    expect(replay.body.data.id).toBe(paymentId);
    expect(await t.platform.payment.count({ where: { schoolId: A.schoolId, studentId: A.students.s1 } })).toBe(1);
    expect((await invoicesOf(A.students.s1)).every((i) => i.status === 'PAID' && i.balancePaise === 0)).toBe(true);
    const paidAgain = await collect({ ...body, amountPaise: 600_000, invoiceIds: [ids[0]] });
    expect(paidAgain.status).toBe(409);
  });

  it('the receipt PDF is generated in the background and parents can download it', async () => {
    await waitFor(async () => (await as('admin').get(`/v1/payments/${paymentId}`)).body.data.receiptReady);
    const link = await as('parent').get(`/v1/payments/${paymentId}/receipt`);
    expect(link.status).toBe(200);
    const file = await t.http.get(link.body.data.url);
    expect(Buffer.from(file.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const alert = await waitFor(async () => ((await as('parent').get('/v1/notifications')).body.data as { event: string; title: string }[]).find((n) => n.event === 'payment.received'));
    expect(alert.title).toBe('Payment received: ₹11,500');
  });

  it('two counters collecting the same invoice at once: exactly one succeeds', async () => {
    const [inv] = (await invoicesOf(A.students.s2)).filter((i) => i.installment.name === 'Term 2');
    const body = { studentId: A.students.s2, invoiceIds: [inv!.id], amountPaise: 600_000, method: 'CASH' };
    const results = await Promise.all([collect(body), collect(body), collect(body)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const after = (await invoicesOf(A.students.s2)).find((i) => i.id === inv!.id)!;
    expect(after.balancePaise).toBe(0);
    expect(await t.platform.studentCredit.count({ where: { schoolId: A.schoolId } })).toBe(0);
    // Receipt numbers stay gap-free: 000001 (s1), 000002 (s2).
    const receipts = (await t.platform.receipt.findMany({ where: { schoolId: A.schoolId, number: { startsWith: 'RCPT/2026' } }, orderBy: { number: 'asc' } })).map((r) => r.number);
    expect(receipts).toEqual(['RCPT/2026-27/000001', 'RCPT/2026-27/000002']);
  });

  it('voiding reopens the invoices and cancels the receipt (number kept)', async () => {
    expect((await as('accountant').post(`/v1/payments/${paymentId}/void`, { reason: 'Wrong student' })).status).toBe(403);
    const res = await as('admin').post(`/v1/payments/${paymentId}/void`, { reason: 'Wrong student' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'VOIDED', voidReason: 'Wrong student', receiptNo: 'RCPT/2026-27/000001' });
    expect((await invoicesOf(A.students.s1)).every((i) => i.balancePaise > 0 && i.status === 'ISSUED')).toBe(true);
    expect((await t.platform.receipt.findUniqueOrThrow({ where: { paymentId } })).cancelledAt).toBeTruthy();
    expect((await as('admin').post(`/v1/payments/${paymentId}/void`, { reason: 'Again' })).status).toBe(422);
  });

  it('day close totals by method and collector (voided shown separately)', async () => {
    const res = await as('accountant').get('/v1/payments/day-close');
    expect(res.status).toBe(200);
    expect(res.body.data.totalPaise).toBeGreaterThanOrEqual(600_000);
    expect(res.body.data.voided).toMatchObject({ count: 1, amountPaise: 1_150_000 });
    expect(res.body.data.byCollector.find((c: { collector: string }) => c.collector === 'Accountant')).toBeTruthy();
    expect((await as('parent').get('/v1/payments/day-close')).status).toBe(403);
  });
});

describe('finance reports', () => {
  const report = (name: string, extra = '') => as('accountant').get(`/v1/finance/reports?report=${name}${extra}`);

  it('collection, outstanding, defaulters, heads, concessions, reconciliation', async () => {
    const collection = await report('collection');
    expect(collection.status).toBe(200);
    expect(collection.body.data.columns.map((c: { key: string }) => c.key)).toContain('CASH');
    expect(collection.body.data.totals.total).toBeGreaterThanOrEqual(1_200_000);

    const outstanding = (await report('outstanding')).body.data;
    // 8-B's only open invoice was cancelled above, so it has nothing outstanding.
    expect(outstanding.rows.map((r: { section: string }) => r.section)).toEqual(['8-A']);
    expect(outstanding.rows[0]).toMatchObject({ students: 2, billed: 2_350_000 }); // s1: 6,000 + 5,500 · s2: 6,000 + 6,000
    const defaulters = (await report('defaulters')).body.data;
    expect(defaulters.rows[0]).toMatchObject({ name: 'Student1', section: '8-A', guardian: 'Parent' });

    const heads = (await report('heads')).body.data;
    expect(heads.rows.find((r: { head: string }) => r.head === 'Tuition Fee')).toBeTruthy();
    const concessions = (await report('concessions')).body.data;
    // The sibling concession was on s3's invoice, which was cancelled — so only the scholarship counts.
    expect(concessions.rows).toEqual([{ concession: 'Scholarship ₹500', students: 1, amount: 50_000 }]);
    expect((await report('reconciliation')).body.data.rows).toHaveLength(10);
    expect((await t.as(tok.teacher, A.slug).get('/v1/finance/reports?report=collection')).status).toBe(403);
  });

  it('exports CSV in rupees', async () => {
    const res = await report('defaulters', '&format=csv');
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('Overdue (₹)');
    expect(res.text).toContain('6000.00');
  });
});
