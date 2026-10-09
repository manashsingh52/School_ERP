/** Duplicate receipts: staff reprints are stamped DUPLICATE COPY and audited; parents' copies never are. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { PdfRenderer } from '../src/core/pdf/pdf-renderer.js';
import { PaymentsService } from '../src/modules/finance/payments.service.js';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const html: string[] = [];
const as = (who: string) => t.as(tok[who]!, A.slug);

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'reprint');
  for (const who of ['admin', 'accountant', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
  // The fixture payment is for s2; make the parent s2's guardian too so they can see it.
  await t.platform.studentGuardian.create({ data: { schoolId: A.schoolId, studentId: A.students.s2, guardianId: A.guardianId, relation: 'FATHER' } });
  const pdf = t.app.get(PdfRenderer);
  const original = pdf.render.bind(pdf);
  pdf.render = async (h: string) => {
    html.push(h);
    return original(h);
  };
  const payments = t.app.get(PaymentsService) as unknown as { renderReceipt(id: string): Promise<void> };
  await RequestContextStore.runAsSystem(A.schoolId, 'test', () => payments.renderReceipt(A.paymentId));
});

afterAll(async () => {
  await t?.close();
});

describe('receipt reprints', () => {
  it("parents always get their own copy, and it doesn't count as a print", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await as('parent').get(`/v1/payments/${A.paymentId}/receipt`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.duplicate).toBe(false);
    }
    expect((await t.platform.receipt.findUniqueOrThrow({ where: { paymentId: A.paymentId } })).printCount).toBe(0);
  });

  it('the first staff print is the original; later ones are duplicates, made once', async () => {
    const first = await as('accountant').get(`/v1/payments/${A.paymentId}/receipt`);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.duplicate).toBe(false);
    expect(html.at(-1)).not.toContain('DUPLICATE');

    const second = await as('admin').get(`/v1/payments/${A.paymentId}/receipt`);
    expect(second.body.data.duplicate).toBe(true);
    expect(html.at(-1)).toContain('DUPLICATE COPY');
    const rendered = html.length;
    const third = await as('accountant').get(`/v1/payments/${A.paymentId}/receipt`);
    expect(third.body.data.duplicate).toBe(true);
    expect(html.length).toBe(rendered); // reused, not rendered again
    expect((await t.http.get(third.body.data.url)).status).toBe(200);
  });

  it('every reprint is in the audit log', async () => {
    const audit = (await as('admin').get('/v1/audit?action=receipt.reprint')).body.data as { metadata: { print: number } }[];
    expect(audit.map((a) => a.metadata.print).sort()).toEqual([2, 3]);
    const receipt = await t.platform.receipt.findUniqueOrThrow({ where: { paymentId: A.paymentId } });
    expect(receipt.printCount).toBe(3);
  });

  it('a void re-makes the receipt and drops the old duplicate', async () => {
    const res = await as('admin').post(`/v1/payments/${A.paymentId}/void`, { reason: 'Wrong student' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const payments = t.app.get(PaymentsService) as unknown as { renderReceipt(id: string): Promise<void> };
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => payments.renderReceipt(A.paymentId));
    expect((await t.platform.receipt.findUniqueOrThrow({ where: { paymentId: A.paymentId } })).duplicateFileId).toBeNull();
    expect(html.at(-1)).toContain('CANCELLED');
  });
});
