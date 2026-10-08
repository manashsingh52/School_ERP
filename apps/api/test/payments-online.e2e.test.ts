/**
 * Online payments (docs/11 §11): connect keys, verify via webhook, checkout → verify,
 * webhook-before/after-verify, duplicate & forged webhooks, cross-school webhook, reconciliation,
 * two tabs paying the same invoice (→ credit), amount mismatch, failed payment, refunds.
 * Uses the sandbox gateway — same signatures and states as Razorpay.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGatewayClient, GatewayClient } from '../src/core/payments/gateway-client.js';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
const tok: Record<'admin' | 'accountant' | 'parent' | 'adminB', string> = {} as never;
let secretA: string;
let secretB: string;
let urlA: string;
let urlB: string;
const KEY = { keyId: 'rzp_test_AbCdEf123456', keySecret: 'sandbox-secret-a' };

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  [A, B] = [await createTenant(t, 'pay'), await createTenant(t, 'payb')];
  for (const role of ['admin', 'accountant', 'parent'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  tok.adminB = (await t.login(B.users.admin, B.slug)).token;
});

afterAll(async () => {
  MockGatewayClient.down = false;
  await t?.close();
});

const as = (who: keyof typeof tok) => t.as(tok[who], who === 'adminB' ? B.slug : A.slug);
const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
};
const order = (invoiceIds: string[], studentId = A.students.s1) => as('parent').post('/v1/payments/online/orders', { studentId, invoiceIds }).set('idempotency-key', randomUUID());
const pathOf = (url: string) => new URL(url).pathname;
const sendWebhook = (url: string, secret: string, event: object, eventId = `evt_${randomUUID()}`) => {
  const body = JSON.stringify(event);
  return t.http.post(pathOf(url)).set('content-type', 'application/json').set('x-razorpay-event-id', eventId).set('x-razorpay-signature', createHmac('sha256', secret).update(body).digest('hex')).send(body);
};
const paymentsOf = (studentId: string) => t.platform.payment.findMany({ where: { studentId }, include: { allocations: true, credits: true } });
const mock = () => t.app.get(GatewayClient) as MockGatewayClient;

describe('connecting Razorpay', () => {
  it('checks the keys and returns the webhook secret once', async () => {
    expect((await as('accountant').put('/v1/payments/gateway', { mode: 'TEST', ...KEY })).status).toBe(403);
    expect((await as('admin').put('/v1/payments/gateway', { mode: 'LIVE', ...KEY })).status).toBe(422); // test key in live mode
    const bad = await as('admin').put('/v1/payments/gateway', { mode: 'TEST', keyId: KEY.keyId, keySecret: 'wrong-secret' });
    expect(bad.body.error.code).toBe('GATEWAY_KEYS_INVALID');
    const res = await as('admin').put('/v1/payments/gateway', { mode: 'TEST', ...KEY });
    expect(res.status).toBe(200);
    secretA = res.body.data.webhookSecret;
    urlA = res.body.data.account.webhookUrl;
    expect(res.body.data.events).toContain('payment.captured');
    const status = await as('admin').get('/v1/payments/gateway');
    expect(JSON.stringify(status.body)).not.toContain(KEY.keySecret);
    expect(JSON.stringify(status.body)).not.toContain(secretA);
    const row = await t.platform.paymentGatewayAccount.findFirstOrThrow({ where: { schoolId: A.schoolId } });
    expect(row.keySecretEnc).not.toContain(KEY.keySecret);

    const b = await as('adminB').put('/v1/payments/gateway', { mode: 'TEST', keyId: 'rzp_test_BbBbBb123456', keySecret: 'sandbox-secret-b' });
    secretB = b.body.data.webhookSecret;
    urlB = b.body.data.account.webhookUrl;
  });

  it('online payments turn on only after a verified webhook', async () => {
    expect((await order([A.invoiceId])).body.error.code).toBe('ONLINE_PAYMENTS_OFF');
    expect((await as('admin').post('/v1/payments/gateway/activate', { mode: 'TEST', active: true })).body.error.code).toBe('WEBHOOK_NOT_VERIFIED');
    const ping = await as('admin').post('/v1/payments/gateway/test-webhook', { mode: 'TEST' });
    expect(ping.body.data.accounts[0].verifiedAt).toBeTruthy();
    const on = await as('admin').post('/v1/payments/gateway/activate', { mode: 'TEST', active: true });
    expect(on.body.data.activeMode).toBe('TEST');
    await sendWebhook(urlB, secretB, { event: 'mock.ping' });
    await as('adminB').post('/v1/payments/gateway/activate', { mode: 'TEST', active: true });
  });
});

describe('webhook security', () => {
  it('rejects a forged signature and a cross-school replay; ignores duplicates', async () => {
    const forged = await sendWebhook(urlA, 'not-the-secret', { event: 'payment.captured', payload: {} });
    expect(forged.status).toBe(401);
    expect(await t.platform.webhookEvent.count({ where: { schoolId: A.schoolId, signatureValid: false } })).toBe(1);
    // School B's URL with a body signed by School A's secret.
    const cross = await sendWebhook(urlB, secretA, { event: 'payment.captured', payload: {} });
    expect(cross.status).toBe(401);
    const id = `evt_${randomUUID()}`;
    expect((await sendWebhook(urlA, secretA, { event: 'mock.ping' }, id)).body.data.status).toBe('queued');
    expect((await sendWebhook(urlA, secretA, { event: 'mock.ping' }, id)).body.data.status).toBe('duplicate');
    expect((await t.http.post('/v1/webhooks/razorpay/unknown-public-id').send('{}')).status).toBe(404);
  });
});

describe('paying online', () => {
  let payId: string;

  it('a parent pays for their own child only; the amount is the full balance', async () => {
    expect((await order([A.invoiceId], A.students.s2)).status).toBe(404);
    const noKey = await as('parent').post('/v1/payments/online/orders', { studentId: A.students.s1, invoiceIds: [A.invoiceId] });
    expect(noKey.status).toBe(400);
    const res = await order([A.invoiceId]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amountPaise: 600_000, mode: 'TEST', driver: 'mock', keyId: KEY.keyId });
  });

  it('checkout → verify settles at once; the webhook that follows is a no-op', async () => {
    const o = (await order([A.invoiceId])).body.data;
    const checkout = await as('parent').post('/v1/payments/online/mock-checkout', { providerOrderId: o.providerOrderId, outcome: 'success' });
    const tampered = await as('parent').post('/v1/payments/online/verify', { ...checkout.body.data, signature: 'f'.repeat(64) });
    expect(tampered.status).toBe(400);
    const res = await as('parent').post('/v1/payments/online/verify', checkout.body.data);
    expect(res.body.data).toMatchObject({ status: 'PAID' });
    expect(res.body.data.receiptNo).toMatch(/^RCPT\//);
    payId = res.body.data.paymentId;
    // The webhook arrives ~0.4s later and must not double-count.
    await waitFor(async () => (await t.platform.webhookEvent.count({ where: { schoolId: A.schoolId, eventType: 'payment.captured', status: 'PROCESSED' } })) > 0);
    expect((await paymentsOf(A.students.s1)).length).toBe(1);
    const inv = await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } });
    expect(inv).toMatchObject({ status: 'PAID', balancePaise: 0 });
  });

  it('webhook only (parent closed the app): the webhook settles it', async () => {
    const term2 = await as('admin').post('/v1/invoices/generate', { installmentId: A.installmentId });
    expect(term2.status).toBe(202);
    const inv = await waitFor(async () => t.platform.invoice.findFirst({ where: { studentId: A.students.s1, installmentId: A.installmentId } }));
    const o = (await order([inv.id])).body.data;
    await as('parent').post('/v1/payments/online/mock-checkout', { providerOrderId: o.providerOrderId, outcome: 'success' }); // no verify call
    await waitFor(async () => (await t.platform.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status === 'PAID');
  });

  it('a failed checkout leaves the invoice open and the order ATTEMPTED', async () => {
    await as('admin').post(`/v1/invoices/${A.invoiceId}/adjustments`, { amountPaise: 5_000, reason: 'Late fee (manual)' });
    const o = (await order([A.invoiceId])).body.data;
    const failed = await as('parent').post('/v1/payments/online/mock-checkout', { providerOrderId: o.providerOrderId, outcome: 'failure' });
    const res = await as('parent').post('/v1/payments/online/verify', failed.body.data);
    expect(res.body.data.status).toBe('FAILED');
    expect((await t.platform.gatewayOrder.findFirstOrThrow({ where: { providerOrderId: o.providerOrderId } })).status).toBe('ATTEMPTED');
    expect((await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } })).balancePaise).toBe(5_000);
  });

  it('two tabs pay the same invoice: one allocation, the second becomes credit', async () => {
    const [o1, o2] = [(await order([A.invoiceId])).body.data, (await order([A.invoiceId])).body.data];
    const c1 = await as('parent').post('/v1/payments/online/mock-checkout', { providerOrderId: o1.providerOrderId, outcome: 'success' });
    const c2 = await as('parent').post('/v1/payments/online/mock-checkout', { providerOrderId: o2.providerOrderId, outcome: 'success' });
    const [r1, r2] = await Promise.all([as('parent').post('/v1/payments/online/verify', c1.body.data), as('parent').post('/v1/payments/online/verify', c2.body.data)]);
    expect([r1.body.data.status, r2.body.data.status]).toEqual(['PAID', 'PAID']);
    const inv = await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } });
    expect(inv).toMatchObject({ balancePaise: 0, paidPaise: 605_000 });
    const st = await as('parent').get(`/v1/students/${A.students.s1}/fees`);
    expect(st.body.data.totals.creditPaise).toBe(5_000);
  });

  it('nobody called back: reconciliation finds the captured payment', async () => {
    const inv = await t.platform.invoice.findFirstOrThrow({ where: { studentId: A.students.s1, installmentId: A.installmentId } });
    await as('admin').post(`/v1/invoices/${inv.id}/adjustments`, { amountPaise: 7_000, reason: 'Transport top-up' });
    const o = (await order([inv.id])).body.data;
    const row = await t.platform.gatewayOrder.findFirstOrThrow({ where: { providerOrderId: o.providerOrderId }, include: { gatewayAccount: true } });
    mock().simulate({ keyId: row.gatewayAccount.keyId, keySecret: KEY.keySecret }, o.providerOrderId, 'success', 'upi'); // no verify, no webhook
    await t.platform.gatewayOrder.update({ where: { id: row.id }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
    const res = await as('admin').post('/v1/payments/online/reconcile');
    expect(res.body.data).toMatchObject({ applied: 1 });
    expect((await t.platform.invoice.findUniqueOrThrow({ where: { id: inv.id } })).balancePaise).toBe(0);
  });

  it('an amount that differs from the order is held as credit and flagged', async () => {
    await as('admin').post(`/v1/invoices/${A.invoiceId}/adjustments`, { amountPaise: 3_000, reason: 'Exam fee' });
    const o = (await order([A.invoiceId])).body.data;
    const row = await t.platform.gatewayOrder.findFirstOrThrow({ where: { providerOrderId: o.providerOrderId }, include: { gatewayAccount: true } });
    const { payment, signature } = mock().simulate({ keyId: row.gatewayAccount.keyId, keySecret: KEY.keySecret }, o.providerOrderId, 'success', 'card', 100);
    const res = await as('parent').post('/v1/payments/online/verify', { providerOrderId: o.providerOrderId, providerPaymentId: payment.id, signature });
    expect(res.body.data.status).toBe('PAID');
    expect((await t.platform.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } })).balancePaise).toBe(3_000);
    expect(await t.platform.auditLog.count({ where: { schoolId: A.schoolId, action: 'security.payment_amount_mismatch' } })).toBe(1);
  });

  it('refund: reopens the balance, completes by webhook and tells the parent', async () => {
    expect((await as('accountant').post(`/v1/payments/${payId}/refunds`, { amountPaise: 999_999_99, reason: 'x' }).set('idempotency-key', randomUUID())).status).toBe(422);
    const res = await as('accountant').post(`/v1/payments/${payId}/refunds`, { amountPaise: 100_000, reason: 'Fee waiver' }).set('idempotency-key', randomUUID());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedPaise: 100_000 });
    const refund = await waitFor(async () => {
      const r = await t.platform.refund.findFirst({ where: { paymentId: payId } });
      return r?.status === 'PROCESSED' ? r : null;
    });
    expect(refund.amountPaise).toBe(100_000);
    await waitFor(async () => ((await as('parent').get('/v1/notifications')).body.data as { event: string }[]).some((n) => n.event === 'refund.processed'));
  });

  it('gateway down: a clear message, nothing recorded', async () => {
    MockGatewayClient.down = true;
    const res = await order([A.invoiceId]);
    MockGatewayClient.down = false;
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GATEWAY_UNAVAILABLE');
  });
});
