import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { formatRupees, type OnlineOrder, type OnlinePaymentResult, type PaymentItem, type mockCheckoutSchema, type verifyOnlinePaymentSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { GatewayClient, GatewayUnavailableError, MockGatewayClient, hmacHex, safeEqualHex, type GatewayCreds, type GatewayPayment } from '../../core/payments/gateway-client.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { fullName } from '../../core/util/dates.js';
import type { GatewayOrder, Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { GatewayService } from './gateway.service.js';
import { InvoicesService } from './invoices.service.js';
import { PaymentsService } from './payments.service.js';

type In<T extends z.ZodType> = z.output<T>;
const ORDER_TTL_MS = 72 * 3600_000;
const RECONCILE_AFTER_MS = 15 * 60_000;

/**
 * Online payments (docs/11 §3–6). The client is never trusted: money counts only after the
 * checkout signature verifies AND the gateway confirms the payment, or after a verified webhook.
 * Both paths — and the reconciliation job — end in the same idempotent apply().
 */
@Injectable()
export class OnlinePaymentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly queues: QueueService,
    private readonly client: GatewayClient,
    private readonly gateway: GatewayService,
    private readonly payments: PaymentsService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.finance, 'webhook.process', (data) => this.processWebhook(String(data.webhookEventId)));
    this.queues.handle(QUEUES.finance, 'reconcile', async () => {
      await this.reconcile();
    });
  }

  // ---------------------------------------------------------------- checkout

  async createOrder(studentId: string, invoiceIds: string[]): Promise<OnlineOrder> {
    const mine = (await this.scope.canAccessStudent('payment.pay_online', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!mine) throw AppError.notFound('student');
    const { account, creds } = await this.gateway.active();
    const { invoices, due } = await this.payments.openInvoices(studentId, invoiceIds);
    const { schoolId } = RequestContextStore.school();
    const { membershipId, userId } = RequestContextStore.tenant();
    const [student, user, school] = await Promise.all([
      this.prisma.db.student.findUniqueOrThrow({ where: { id: studentId }, select: { firstName: true, lastName: true, admissionNo: true } }),
      this.prisma.db.membership.findUniqueOrThrow({ where: { id: membershipId }, select: { user: { select: { name: true, email: true, phone: true } } } }),
      this.prisma.db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
    ]);
    const orderId = crypto.randomUUID();
    let provider: { id: string };
    try {
      provider = await this.client.createOrder(creds, { amountPaise: due, receipt: orderId, notes: { schoolId, studentId, admissionNo: student.admissionNo } });
    } catch (err) {
      this.logger.error({ err, schoolId }, 'gateway order failed');
      throw new AppError('GATEWAY_UNAVAILABLE', 503, 'Online payment is temporarily unavailable. Please try again later or pay at the school office.');
    }
    await this.prisma.tenantTx(async (tx) => {
      await tx.gatewayOrder.create({
        data: {
          id: orderId,
          gatewayAccountId: account.id,
          studentId,
          providerOrderId: provider.id,
          amountPaise: due,
          createdByMemberId: membershipId,
          expiresAt: new Date(Date.now() + ORDER_TTL_MS),
          items: { create: invoices.map((i) => ({ invoiceId: i.id, amountPaise: i.balancePaise, schoolId })) },
        } as Prisma.GatewayOrderUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'online.order', entityType: 'GatewayOrder', entityId: orderId, metadata: { amountPaise: due, invoices: invoices.map((i) => i.number), userId } });
    });
    return {
      orderId,
      providerOrderId: provider.id,
      keyId: account.keyId,
      amountPaise: due,
      currency: 'INR',
      mode: account.mode,
      driver: this.client.driver,
      schoolName: school.name,
      prefill: { name: user.user.name, email: user.user.email, contact: user.user.phone },
      description: `Fees for ${fullName(student.firstName, student.lastName)} (${invoices.map((i) => i.number).join(', ')})`,
    };
  }

  private async orderFor(providerOrderId: string) {
    const order = await this.prisma.db.gatewayOrder.findUnique({ where: { providerOrderId }, include: { items: { include: { invoice: { select: { dueDate: true, number: true } } } } } });
    if (!order) throw AppError.notFound('order');
    return order;
  }

  /** The browser's "payment done" callback. Trusted only after signature + gateway confirmation. */
  async verify(input: In<typeof verifyOnlinePaymentSchema>): Promise<OnlinePaymentResult> {
    const order = await this.orderFor(input.providerOrderId);
    const mine = await this.scope.canAccessStudent('payment.view', order.studentId);
    if (!mine) throw AppError.notFound('order');
    const { creds } = await this.gateway.byId(order.gatewayAccountId);
    const expected = hmacHex(creds.keySecret, `${input.providerOrderId}|${input.providerPaymentId}`);
    if (!safeEqualHex(expected, input.signature)) {
      await this.prisma.tenantTx((tx) => this.audit.record(tx, { action: 'security.payment_signature_invalid', entityType: 'GatewayOrder', entityId: order.id, metadata: { providerPaymentId: input.providerPaymentId } }));
      this.logger.warn({ orderId: order.id }, 'checkout signature invalid');
      throw new AppError('SIGNATURE_INVALID', 400, "We couldn't confirm this payment. If money was taken, it will show up within a few minutes.");
    }
    let gw: GatewayPayment;
    try {
      gw = await this.client.fetchPayment(creds, input.providerPaymentId);
    } catch (err) {
      if (err instanceof GatewayUnavailableError) return { status: 'PENDING', paymentId: null, receiptNo: null, message: "We're confirming your payment with the bank. You'll get a notification when it's done." };
      throw err;
    }
    return this.settle(order, gw, creds);
  }

  /** Apply a gateway payment to its order (idempotent), whatever path found it. */
  private async settle(order: GatewayOrder & { items: { invoiceId: string; invoice: { dueDate: Date } }[] }, gw: GatewayPayment, creds: GatewayCreds): Promise<OnlinePaymentResult> {
    if (gw.status === 'authorized') {
      try {
        gw = await this.client.capture(creds, gw.id, gw.amountPaise); // safety net if auto-capture is off
      } catch (err) {
        this.logger.error({ err, paymentId: gw.id }, 'capture failed');
      }
    }
    if (gw.status === 'failed') {
      if (order.status === 'CREATED') await this.prisma.tenantTx((tx) => tx.gatewayOrder.update({ where: { id: order.id }, data: { status: 'ATTEMPTED' } }));
      return { status: 'FAILED', paymentId: null, receiptNo: null, message: 'The payment did not go through. No money was taken — please try again.' };
    }
    if (gw.status !== 'captured') return { status: 'PENDING', paymentId: null, receiptNo: null, message: "Your bank hasn't confirmed the payment yet. You'll get a notification when it's done." };

    const mismatch = gw.orderId !== order.providerOrderId || gw.amountPaise !== order.amountPaise;
    const invoiceIds = mismatch ? [] : [...order.items].sort((a, b) => a.invoice.dueDate.getTime() - b.invoice.dueDate.getTime()).map((i) => i.invoiceId);
    const { paymentId } = await this.prisma.tenantTx(
      async (tx) => {
        const res = await this.payments.apply(tx, {
          studentId: order.studentId,
          amountPaise: gw.amountPaise,
          method: 'ONLINE',
          invoiceIds,
          gatewayOrderId: order.id,
          gatewayPaymentId: gw.id,
          gatewayMethod: gw.method,
        });
        if (res.created) {
          await tx.gatewayOrder.update({ where: { id: order.id }, data: { status: 'PAID' } });
          if (mismatch) {
            // Captured money is never rejected — it's held as credit and flagged for the accountant.
            await this.audit.record(tx, { action: 'security.payment_amount_mismatch', entityType: 'GatewayOrder', entityId: order.id, metadata: { expected: order.amountPaise, got: gw.amountPaise, gatewayOrderId: gw.orderId } });
          }
        }
        return res;
      },
      { timeout: 20_000 },
    );
    this.outbox.flush();
    const receipt = await this.prisma.db.receipt.findUnique({ where: { paymentId }, select: { number: true } });
    return { status: 'PAID', paymentId, receiptNo: receipt?.number ?? null, message: `Payment of ${formatRupees(gw.amountPaise)} received. Thank you!` };
  }

  // ---------------------------------------------------------------- webhooks & reconciliation

  async processWebhook(webhookEventId: string): Promise<void> {
    const event = await this.prisma.db.webhookEvent.findUnique({ where: { id: webhookEventId } });
    if (!event || event.status !== 'RECEIVED' || !event.signatureValid) return;
    const body = event.payload as { event?: string; payload?: { payment?: { entity?: Record<string, unknown> }; refund?: { entity?: Record<string, unknown> } } };
    const mark = (status: 'PROCESSED' | 'IGNORED', error?: string) =>
      this.prisma.tenantTx((tx) => tx.webhookEvent.update({ where: { id: webhookEventId }, data: { status, processedAt: new Date(), error: error ?? null } }));
    try {
      const p = body.payload?.payment?.entity as { id: string; order_id: string | null; amount: number; status: GatewayPayment['status']; method?: string } | undefined;
      switch (body.event) {
        case 'payment.captured':
        case 'payment.authorized':
        case 'payment.failed':
        case 'order.paid': {
          if (!p?.order_id) return void (await mark('IGNORED', 'No order on the payment'));
          const order = await this.prisma.db.gatewayOrder.findUnique({ where: { providerOrderId: p.order_id }, include: { items: { include: { invoice: { select: { dueDate: true } } } } } });
          if (!order) return void (await mark('IGNORED', 'Unknown order'));
          const { creds } = await this.gateway.byId(order.gatewayAccountId);
          // The webhook body is signed, but we still confirm the current state with the gateway.
          const gw = await this.client.fetchPayment(creds, p.id);
          await this.settle(order, gw, creds);
          return void (await mark('PROCESSED'));
        }
        case 'refund.processed':
        case 'refund.failed': {
          const r = body.payload?.refund?.entity as { id: string } | undefined;
          const refund = r ? await this.prisma.db.refund.findUnique({ where: { providerRefundId: r.id }, include: { payment: { include: { student: { select: { firstName: true } } } } } }) : null;
          if (!refund) return void (await mark('IGNORED', 'Unknown refund'));
          const processed = body.event === 'refund.processed';
          await this.prisma.tenantTx(async (tx) => {
            await tx.refund.update({ where: { id: refund.id }, data: { status: processed ? 'PROCESSED' : 'FAILED', processedAt: new Date() } });
            await this.audit.record(tx, { action: processed ? 'refund.processed' : 'refund.failed', entityType: 'Refund', entityId: refund.id, metadata: { amountPaise: refund.amountPaise } });
          });
          if (processed) await this.notifyRefund(refund.payment.studentId, refund.payment.student.firstName, refund.amountPaise, refund.id);
          else this.logger.error({ refundId: refund.id }, 'refund failed at the gateway — needs manual follow-up');
          return void (await mark('PROCESSED'));
        }
        default:
          return void (await mark('IGNORED', 'Event not used'));
      }
    } catch (err) {
      await this.prisma.tenantTx((tx) => tx.webhookEvent.update({ where: { id: webhookEventId }, data: { error: err instanceof Error ? err.message.slice(0, 300) : 'error' } }));
      throw err; // retried by the queue
    }
  }

  /** Second safety net (docs/11 §4): ask the gateway about orders we haven't heard back on. */
  async reconcile(): Promise<{ checked: number; applied: number; expired: number }> {
    const now = Date.now();
    const open = await this.prisma.db.gatewayOrder.findMany({
      where: { status: { in: ['CREATED', 'ATTEMPTED'] }, createdAt: { lt: new Date(now - RECONCILE_AFTER_MS) } },
      include: { items: { include: { invoice: { select: { dueDate: true } } } } },
      take: 200,
    });
    let applied = 0;
    let expired = 0;
    for (const order of open) {
      const { creds } = await this.gateway.byId(order.gatewayAccountId);
      let payments: GatewayPayment[];
      try {
        payments = await this.client.fetchOrderPayments(creds, order.providerOrderId);
      } catch (err) {
        this.logger.warn({ err, orderId: order.id }, 'reconcile: gateway unavailable');
        continue;
      }
      const captured = payments.filter((p) => p.status === 'captured' || p.status === 'authorized');
      for (const gw of captured) {
        await this.settle(order, gw, creds);
        applied++;
      }
      const isExpired = order.expiresAt.getTime() < now;
      await this.prisma.tenantTx((tx) =>
        tx.gatewayOrder.update({ where: { id: order.id }, data: { lastReconciledAt: new Date(), ...(!captured.length && isExpired ? { status: 'EXPIRED' } : {}) } }),
      );
      if (!captured.length && isExpired) expired++;
    }
    return { checked: open.length, applied, expired };
  }

  // ---------------------------------------------------------------- refunds

  async refund(paymentId: string, amountPaise: number, reason: string): Promise<PaymentItem> {
    const payment = await this.prisma.db.payment.findUnique({ where: { id: paymentId }, include: { allocations: { orderBy: { createdAt: 'desc' } }, credits: true, student: { select: { firstName: true } } } });
    if (!payment) throw AppError.notFound('payment');
    if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') throw new AppError('INVALID_STATE', 422, 'Only a received payment can be refunded.');
    const refundable = payment.amountPaise - payment.refundedPaise;
    if (amountPaise > refundable) throw new AppError('REFUND_TOO_LARGE', 422, `At most ${formatRupees(refundable)} can be refunded.`, [{ field: 'amountPaise', message: `Up to ${formatRupees(refundable)}` }]);

    // Online: ask the gateway first, so we never record a refund the gateway refused.
    let providerRefundId: string | null = null;
    if (payment.method === 'ONLINE') {
      const order = await this.prisma.db.gatewayOrder.findUniqueOrThrow({ where: { id: payment.gatewayOrderId! } });
      const { creds } = await this.gateway.byId(order.gatewayAccountId);
      try {
        providerRefundId = (await this.client.refund(creds, payment.gatewayPaymentId!, amountPaise, { reason: reason.slice(0, 200) })).id;
      } catch (err) {
        this.logger.error({ err, paymentId }, 'gateway refund failed');
        throw new AppError('GATEWAY_REFUND_FAILED', 502, "Razorpay didn't accept the refund. Nothing was changed — try again later.");
      }
    }
    const { membershipId } = RequestContextStore.tenant();
    const refundId = await this.prisma.tenantTx(async (tx) => {
      // Take it from unused credit first, then reopen invoice balances (latest allocation first).
      let left = amountPaise;
      for (const c of payment.credits) {
        const free = c.amountPaise - c.consumedPaise;
        if (free <= 0 || left <= 0) continue;
        const take = Math.min(free, left);
        await tx.studentCredit.update({ where: { id: c.id }, data: { consumedPaise: { increment: take } } });
        left -= take;
      }
      const net = new Map<string, number>();
      for (const a of [...payment.allocations].reverse()) net.set(a.invoiceId, (net.get(a.invoiceId) ?? 0) + a.amountPaise);
      for (const [invoiceId, amount] of [...net.entries()].reverse()) {
        if (left <= 0 || amount <= 0) continue;
        const take = Math.min(amount, left);
        await tx.paymentAllocation.create({ data: { paymentId, invoiceId, amountPaise: -take } as Prisma.PaymentAllocationUncheckedCreateInput });
        await this.invoices.recalc(tx, invoiceId);
        left -= take;
      }
      const refunded = payment.refundedPaise + amountPaise;
      await tx.payment.update({ where: { id: paymentId }, data: { refundedPaise: refunded, status: refunded >= payment.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      const r = await tx.refund.create({
        data: { paymentId, amountPaise, reason, providerRefundId, status: payment.method === 'ONLINE' ? 'PENDING' : 'PROCESSED', processedAt: payment.method === 'ONLINE' ? null : new Date(), initiatedByMemberId: membershipId } as Prisma.RefundUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'payment.refund', entityType: 'Payment', entityId: paymentId, metadata: { amountPaise, reason, refundId: r.id, providerRefundId } });
      return r.id;
    });
    if (payment.method !== 'ONLINE') await this.notifyRefund(payment.studentId, payment.student.firstName, amountPaise, refundId);
    else if (this.client instanceof MockGatewayClient) this.mockWebhookLater(payment.gatewayOrderId!, { event: 'refund.processed', payload: { refund: { entity: { id: providerRefundId, payment_id: payment.gatewayPaymentId, amount: amountPaise } } } });
    return this.payments.get(paymentId);
  }

  private async notifyRefund(studentId: string, firstName: string, amountPaise: number, refundId: string) {
    const guardians = await this.notifications.guardiansOf([studentId]);
    await this.notifications.notify({
      event: 'refund.processed',
      recipients: guardians.map((g) => ({ membershipId: g.membershipId, vars: { amount: formatRupees(amountPaise), student: firstName }, data: { route: '/my/fees', refundId } })),
      dedupeKey: () => `refund:${refundId}`,
    });
  }

  // ---------------------------------------------------------------- sandbox

  /** Development only: play the gateway — finish checkout and send the webhook a moment later. */
  async mockCheckout(input: In<typeof mockCheckoutSchema>) {
    if (!(this.client instanceof MockGatewayClient)) throw AppError.notFound('route');
    const order = await this.orderFor(input.providerOrderId);
    if (!(await this.scope.canAccessStudent('payment.view', order.studentId))) throw AppError.notFound('order');
    const { creds } = await this.gateway.byId(order.gatewayAccountId);
    const { payment, signature } = this.client.simulate(creds, order.providerOrderId, input.outcome === 'success' ? 'success' : 'failure', input.method);
    this.mockWebhookLater(order.id, {
      event: input.outcome === 'success' ? 'payment.captured' : 'payment.failed',
      payload: { payment: { entity: { id: payment.id, order_id: payment.orderId, amount: payment.amountPaise, status: payment.status, method: payment.method } } },
    });
    return { providerOrderId: order.providerOrderId, providerPaymentId: payment.id, signature, status: payment.status };
  }

  private mockWebhookLater(gatewayOrderId: string, event: object) {
    const { schoolId } = RequestContextStore.school();
    setTimeout(() => {
      void RequestContextStore.runAsSystem(schoolId, `mock-webhook-${Date.now()}`, async () => {
        try {
          const order = await this.prisma.db.gatewayOrder.findUnique({ where: { id: gatewayOrderId }, include: { gatewayAccount: true } });
          if (order) await this.gateway.deliver(order.gatewayAccount, { entity: 'event', ...event, created_at: Math.floor(Date.now() / 1000) });
        } catch (err) {
          this.logger.warn({ err }, 'mock webhook delivery failed');
        }
      });
    }, 400);
  }
}
