/** Settings sections (general, fees, examinations, branding): defaults, permissions, validation, audit — and that they take effect. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { PdfRenderer } from '../src/core/pdf/pdf-renderer.js';
import { PaymentsService } from '../src/modules/finance/payments.service.js';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'set');
  for (const who of ['admin', 'teacher', 'accountant', 'parent'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

describe('settings', () => {
  it('starts with sensible defaults', async () => {
    const res = await as('admin').get('/v1/school/settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      general: { principalName: null, workingDays: [1, 2, 3, 4, 5, 6] },
      fees: { reminderDaysBefore: [7, 1], overdueReminderEveryDays: 7, maxOverdueReminders: 4, receiptNote: null },
      examinations: { showAttendanceOnReportCard: true },
      branding: { signatureFileId: null, signatureUrl: null, showLogoOnReceipts: true },
    });
    expect((await as('teacher').get('/v1/school/settings')).status).toBe(403);
  });

  it('only admins change settings; values are validated', async () => {
    expect((await as('accountant').put('/v1/school/settings/fees', { receiptNote: 'x' })).status).toBe(403);
    expect((await as('admin').put('/v1/school/settings/fees', { reminderDaysBefore: [0] })).status).toBe(422);
    expect((await as('admin').put('/v1/school/settings/nope', {})).status).toBe(422);
    const res = await as('admin').put('/v1/school/settings/general', { principalName: 'Dr. Meera Iyer', affiliation: 'Affiliated to CBSE · No. 1130456', workingDays: [1, 2, 3, 4, 5] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.general).toMatchObject({ principalName: 'Dr. Meera Iyer', workingDays: [1, 2, 3, 4, 5] });
  });

  it('the signature must be an uploaded signature image of this school', async () => {
    expect((await as('admin').put('/v1/school/settings/branding', { signatureFileId: A.fileId })).status).toBe(422); // a document, not a signature
    const ticket = await as('admin').post('/v1/files/upload-url', { purpose: 'signature', fileName: 'sign.png', mimeType: 'image/png', sizeBytes: PNG.length });
    expect(ticket.status).toBe(200);
    await t.http.put(ticket.body.data.upload.url).set(ticket.body.data.upload.headers).send(PNG);
    expect((await as('admin').post(`/v1/files/${ticket.body.data.fileId}/complete`)).status).toBe(200);
    const res = await as('admin').put('/v1/school/settings/branding', { signatureFileId: ticket.body.data.fileId, showLogoOnReceipts: false });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.branding.signatureUrl).toBeTruthy();
  });

  it('changes are audited with what changed', async () => {
    const audit = (await as('admin').get('/v1/audit?action=settings.general')).body.data;
    expect(audit[0]).toMatchObject({ before: { principalName: null }, after: { principalName: 'Dr. Meera Iyer' } });
  });

  it('fee reminders follow Settings → Fees', async () => {
    await as('admin').put('/v1/school/settings/fees', { reminderDaysBefore: [3], overdueReminderEveryDays: 2, maxOverdueReminders: 2, receiptNote: 'Fees once paid are not refundable.' });
    const run = async (date: string) => (await as('admin').post('/v1/finance/jobs/run', { job: 'fee-reminders', date })).body.data;
    // s1's invoice is due 10 Apr.
    expect(await run('2026-04-03')).toEqual({ dueSoon: 0, overdue: 0 }); // 7 days before: no longer a reminder day
    expect(await run('2026-04-07')).toEqual({ dueSoon: 1, overdue: 0 });
    expect(await run('2026-04-11')).toEqual({ dueSoon: 0, overdue: 1 });
    expect(await run('2026-04-12')).toEqual({ dueSoon: 0, overdue: 0 });
    expect(await run('2026-04-13')).toEqual({ dueSoon: 0, overdue: 1 });
    expect(await run('2026-04-15')).toEqual({ dueSoon: 0, overdue: 0 }); // max 2 overdue reminders
  });

  it('receipts carry the affiliation, note and signature', async () => {
    const pdf = t.app.get(PdfRenderer);
    const seen: string[] = [];
    const original = pdf.render.bind(pdf);
    pdf.render = async (html: string) => {
      seen.push(html);
      return original(html);
    };
    const payments = t.app.get(PaymentsService) as unknown as { renderReceipt(id: string): Promise<void> };
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => payments.renderReceipt(A.paymentId));
    pdf.render = original;
    expect(seen[0]).toContain('Affiliated to CBSE · No. 1130456');
    expect(seen[0]).toContain('Fees once paid are not refundable.');
    expect(seen[0]).toContain('class="sig" src="data:image/png;base64,');
    expect((await as('admin').get(`/v1/payments/${A.paymentId}/receipt`)).status).toBe(200);
  });

  it('a stored value that no longer validates falls back to its default only', async () => {
    await t.platform.schoolSettings.update({ where: { schoolId: A.schoolId }, data: { fees: { reminderDaysBefore: 'weekly', maxOverdueReminders: 3 } } });
    const fees = (await as('admin').get('/v1/school/settings')).body.data.fees;
    expect(fees).toMatchObject({ reminderDaysBefore: [7, 1], maxOverdueReminders: 3 });
  });
});
