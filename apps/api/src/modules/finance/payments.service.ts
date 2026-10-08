import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import {
  formatRupees,
  type DayClose,
  type DownloadLink,
  type PageResponse,
  type PaymentItem,
  type StudentFeeStatement,
  type collectPaymentSchema,
  type listPaymentsQuerySchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { PdfRenderer } from '../../core/pdf/pdf-renderer.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { fullName, todayIn } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InvoicesService, invoiceInclude } from './invoices.service.js';
import { receiptHtml } from './receipt.template.js';
import { nextNumber, yearKey } from './sequence.js';

type In<T extends z.ZodType> = z.output<T>;
type Method = 'ONLINE' | 'CASH' | 'BANK_TRANSFER' | 'UPI_DIRECT' | 'POS_CARD';
const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const METHOD_LABEL: Record<Method, string> = { ONLINE: 'Online', CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', UPI_DIRECT: 'UPI', POS_CARD: 'Card (POS)' };
const NONE = '00000000-0000-0000-0000-000000000000';

export interface ApplyPayment {
  studentId: string;
  amountPaise: number;
  method: Method;
  /** In the order they should be paid. */
  invoiceIds: string[];
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayMethod?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  collectedByMemberId?: string | null;
  receivedAt?: Date;
  /** Counter payments: refuse (instead of crediting) if the invoices changed since they were chosen. */
  exact?: boolean;
}

const paymentInclude = {
  student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, enrollments: { select: { academicYearId: true, section: { select: { name: true, class: { select: { name: true } } } } } } } },
  receipt: { select: { number: true, fileId: true } },
  allocations: { select: { invoiceId: true, amountPaise: true, invoice: { select: { number: true } } } },
  credits: { select: { amountPaise: true } },
} satisfies Prisma.PaymentInclude;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

/**
 * Payments (docs/11): one allocation routine for counter and online money. Captured money is
 * never rejected — whatever can't go to an open invoice becomes student credit. Every payment
 * gets a gap-free receipt number in the same transaction.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly queues: QueueService,
    private readonly files: FilesService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly pdf: PdfRenderer,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.outbox.on('payment.captured', async (event) => {
      const paymentId = String(event.payload.paymentId);
      await this.queues.add(QUEUES.documents, 'receipt', { schoolId: event.schoolId ?? undefined, paymentId }, { jobId: `receipt-${paymentId}-1` });
      await this.notifyParents(paymentId);
    });
    this.outbox.on('payment.voided', async (event) => {
      const paymentId = String(event.payload.paymentId);
      await this.queues.add(QUEUES.documents, 'receipt', { schoolId: event.schoolId ?? undefined, paymentId }, { jobId: `receipt-${paymentId}-void` });
    });
    this.queues.handle(QUEUES.documents, 'receipt', (data) => this.renderReceipt(String(data.paymentId)));
  }

  // ---------------------------------------------------------------- core

  /**
   * Record captured money (call inside a tenant transaction). Idempotent per gateway payment id:
   * a second call returns the first payment. Invoices are locked in a fixed order.
   */
  async apply(tx: TenantTx, p: ApplyPayment): Promise<{ paymentId: string; created: boolean }> {
    if (p.gatewayPaymentId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${p.gatewayPaymentId}`}))`;
      const existing = await tx.payment.findUnique({ where: { gatewayPaymentId: p.gatewayPaymentId }, select: { id: true } });
      if (existing) return { paymentId: existing.id, created: false };
    }
    const sorted = [...new Set(p.invoiceIds)].sort();
    if (sorted.length) await tx.$queryRaw`SELECT id FROM invoices WHERE id = ANY(${sorted}::uuid[]) ORDER BY id FOR UPDATE`;
    const invoices = await tx.invoice.findMany({ where: { id: { in: sorted }, studentId: p.studentId } });
    if (p.exact) {
      const open = invoices.filter((i) => i.status !== 'CANCELLED').reduce((a, i) => a + Math.max(0, i.balancePaise), 0);
      if (open !== p.amountPaise) throw new AppError('INVOICE_CHANGED', 409, 'These invoices were just paid or changed by someone else. Reload and check before collecting.');
    }

    const payment = await tx.payment.create({
      data: {
        studentId: p.studentId,
        amountPaise: p.amountPaise,
        method: p.method,
        status: 'CAPTURED',
        gatewayOrderId: p.gatewayOrderId ?? null,
        gatewayPaymentId: p.gatewayPaymentId ?? null,
        gatewayMethod: p.gatewayMethod ?? null,
        referenceNo: p.referenceNo ?? null,
        notes: p.notes ?? null,
        receivedAt: p.receivedAt ?? new Date(),
        collectedByMemberId: p.collectedByMemberId ?? null,
      } as Prisma.PaymentUncheckedCreateInput,
    });
    let remaining = p.amountPaise;
    for (const id of p.invoiceIds) {
      const inv = invoices.find((i) => i.id === id);
      if (!inv || remaining <= 0 || inv.status === 'CANCELLED' || inv.balancePaise <= 0) continue;
      const amount = Math.min(remaining, inv.balancePaise);
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: id, amountPaise: amount } as Prisma.PaymentAllocationUncheckedCreateInput });
      await this.invoices.recalc(tx, id);
      remaining -= amount;
    }
    if (remaining > 0) {
      await tx.studentCredit.create({
        data: { studentId: p.studentId, paymentId: payment.id, amountPaise: remaining, source: 'OVERPAYMENT', note: 'More than the open balance at the time of payment' } as Prisma.StudentCreditUncheckedCreateInput,
      });
    }
    const yearName = await this.currentYearName(tx);
    const receiptNo = await nextNumber(tx, `RECEIPT:${yearKey(yearName)}`, `RCPT/${yearKey(yearName)}/`);
    await tx.receipt.create({ data: { number: receiptNo, paymentId: payment.id } as Prisma.ReceiptUncheckedCreateInput });
    await this.audit.record(tx, {
      action: 'payment.capture',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { receiptNo, amountPaise: p.amountPaise, method: p.method, invoices: p.invoiceIds.length, creditPaise: remaining, gatewayPaymentId: p.gatewayPaymentId },
    });
    await this.outbox.publish(tx, 'payment.captured', { paymentId: payment.id });
    return { paymentId: payment.id, created: true };
  }

  private async currentYearName(tx: TenantTx): Promise<string> {
    const school = await tx.school.findUniqueOrThrow({ where: { id: RequestContextStore.school().schoolId }, select: { currentAcademicYearId: true } });
    const year = school.currentAcademicYearId ? await tx.academicYear.findUnique({ where: { id: school.currentAcademicYearId }, select: { name: true } }) : null;
    return year?.name ?? String(new Date().getFullYear());
  }

  /** Open invoices of a student, checked for a whole-invoice payment of exactly `amountPaise`. */
  async openInvoices(studentId: string, invoiceIds: string[], amountPaise?: number) {
    const ids = [...new Set(invoiceIds)];
    const invoices = await this.prisma.db.invoice.findMany({ where: { id: { in: ids }, studentId } });
    if (invoices.length !== ids.length) throw AppError.invalidReference('invoiceIds', 'invoice');
    const closed = invoices.find((i) => i.status === 'CANCELLED' || i.balancePaise <= 0);
    if (closed) throw new AppError('INVOICE_NOT_OPEN', 409, `Invoice ${closed.number} has nothing left to pay.`);
    const due = invoices.reduce((a, i) => a + i.balancePaise, 0);
    if (amountPaise !== undefined && amountPaise !== due) {
      throw new AppError('AMOUNT_MISMATCH', 422, `Part payments aren't accepted. The selected invoices total ${formatRupees(due)}.`, [{ field: 'amountPaise', message: `Must be ${formatRupees(due)}` }]);
    }
    // Pay the oldest dues first.
    invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.number.localeCompare(b.number));
    return { invoices, due };
  }

  // ---------------------------------------------------------------- counter

  async collect(input: In<typeof collectPaymentSchema>): Promise<PaymentItem> {
    const { invoices } = await this.openInvoices(input.studentId, input.invoiceIds, input.amountPaise);
    const { membershipId } = RequestContextStore.tenant();
    const { paymentId } = await this.prisma.tenantTx(
      (tx) =>
        this.apply(tx, {
          studentId: input.studentId,
          amountPaise: input.amountPaise,
          method: input.method,
          invoiceIds: invoices.map((i) => i.id),
          referenceNo: input.referenceNo ?? null,
          notes: input.notes ?? null,
          collectedByMemberId: membershipId,
          exact: true,
        }),
      { timeout: 20_000 },
    );
    this.outbox.flush();
    return this.get(paymentId);
  }

  /** Cancel a counter receipt: allocations are reversed (append-only) and balances reopen. */
  async void(id: string, reason: string): Promise<PaymentItem> {
    const payment = await this.prisma.db.payment.findUnique({ where: { id }, include: { allocations: true, credits: true } });
    if (!payment) throw AppError.notFound('payment');
    if (payment.method === 'ONLINE') throw new AppError('CANNOT_VOID_ONLINE', 422, "Online payments can't be voided — refund them instead.");
    if (payment.status !== 'CAPTURED') throw new AppError('INVALID_STATE', 422, 'Only an active payment can be voided.');
    if (payment.credits.some((c) => c.consumedPaise > 0)) throw new AppError('CREDIT_USED', 409, 'Part of this payment was held as credit and has been used. Reverse that first.');
    const { membershipId } = RequestContextStore.tenant();
    await this.prisma.tenantTx(async (tx) => {
      const net = new Map<string, number>();
      for (const a of payment.allocations) net.set(a.invoiceId, (net.get(a.invoiceId) ?? 0) + a.amountPaise);
      for (const [invoiceId, amount] of net) {
        if (amount === 0) continue;
        await tx.paymentAllocation.create({ data: { paymentId: id, invoiceId, amountPaise: -amount } as Prisma.PaymentAllocationUncheckedCreateInput });
        await this.invoices.recalc(tx, invoiceId);
      }
      for (const c of payment.credits) await tx.studentCredit.update({ where: { id: c.id }, data: { consumedPaise: c.amountPaise, note: `Voided with payment: ${reason}` } });
      await tx.payment.update({ where: { id }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason, voidedByMemberId: membershipId } });
      await tx.receipt.update({ where: { paymentId: id }, data: { cancelledAt: new Date() } });
      await this.audit.record(tx, { action: 'payment.void', entityType: 'Payment', entityId: id, metadata: { amountPaise: payment.amountPaise, reason } });
      await this.outbox.publish(tx, 'payment.voided', { paymentId: id });
    });
    this.outbox.flush();
    return this.get(id);
  }

  /** Use a student's credit (excess from an earlier payment) to pay an invoice. */
  async applyCredit(studentId: string, invoiceId: string) {
    if (!(await this.prisma.db.student.count({ where: { id: studentId } }))) throw AppError.notFound('student');
    const { invoices } = await this.openInvoices(studentId, [invoiceId]);
    const inv = invoices[0]!;
    await this.prisma.tenantTx(async (tx) => {
      const credits = await tx.studentCredit.findMany({ where: { studentId, paymentId: { not: null } }, orderBy: { createdAt: 'asc' } });
      let need = inv.balancePaise;
      let used = 0;
      for (const c of credits) {
        const free = c.amountPaise - c.consumedPaise;
        if (free <= 0 || need <= 0) continue;
        const take = Math.min(free, need);
        await tx.paymentAllocation.create({ data: { paymentId: c.paymentId!, invoiceId, amountPaise: take } as Prisma.PaymentAllocationUncheckedCreateInput });
        await tx.studentCredit.update({ where: { id: c.id }, data: { consumedPaise: { increment: take } } });
        need -= take;
        used += take;
      }
      if (!used) throw new AppError('NO_CREDIT', 422, 'This student has no credit to use.');
      await this.invoices.recalc(tx, invoiceId);
      await this.audit.record(tx, { action: 'credit.apply', entityType: 'Invoice', entityId: invoiceId, metadata: { number: inv.number, amountPaise: used } });
    });
    return this.statement(studentId);
  }

  // ---------------------------------------------------------------- read

  private toItem(p: PaymentRow, collectors: Map<string, string>): PaymentItem {
    const sec = p.student.enrollments.at(-1)?.section;
    const net = new Map<string, { invoiceId: string; invoiceNumber: string; amountPaise: number }>();
    for (const a of p.allocations) {
      const cur = net.get(a.invoiceId) ?? { invoiceId: a.invoiceId, invoiceNumber: a.invoice.number, amountPaise: 0 };
      cur.amountPaise += a.amountPaise;
      net.set(a.invoiceId, cur);
    }
    return {
      id: p.id,
      student: { id: p.student.id, name: fullName(p.student.firstName, p.student.lastName), admissionNo: p.student.admissionNo, classLabel: sec ? label(sec.class.name, sec.name) : null },
      amountPaise: p.amountPaise,
      method: p.method,
      gatewayMethod: p.gatewayMethod,
      status: p.status,
      referenceNo: p.referenceNo,
      gatewayPaymentId: p.gatewayPaymentId,
      receiptNo: p.receipt?.number ?? null,
      receiptReady: !!p.receipt?.fileId,
      receivedAt: p.receivedAt.toISOString(),
      collectedBy: p.collectedByMemberId ? (collectors.get(p.collectedByMemberId) ?? null) : null,
      refundedPaise: p.refundedPaise,
      creditPaise: p.credits.reduce((a, c) => a + c.amountPaise, 0),
      allocations: [...net.values()],
      voidReason: p.voidReason,
    };
  }

  private async collectors(rows: { collectedByMemberId: string | null }[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.collectedByMemberId).filter((x): x is string => !!x))];
    if (!ids.length) return new Map();
    const members = await this.prisma.db.membership.findMany({ where: { id: { in: ids } }, select: { id: true, user: { select: { name: true } } } });
    return new Map(members.map((m) => [m.id, m.user.name]));
  }

  private async visibleWhere(): Promise<Prisma.PaymentWhereInput> {
    const scope = RequestContextStore.tenant().permissions['payment.view'];
    if (scope === 'ALL') return {};
    if (scope === 'OWN_CHILDREN') return { studentId: { in: await this.scope.childStudentIds() } };
    return { id: NONE };
  }

  async get(id: string): Promise<PaymentItem> {
    const row = await this.prisma.db.payment.findFirst({ where: { AND: [{ id }, await this.visibleWhere()] }, include: paymentInclude });
    if (!row) throw AppError.notFound('payment');
    return this.toItem(row, await this.collectors([row]));
  }

  async list(query: In<typeof listPaymentsQuerySchema>): Promise<PageResponse<PaymentItem>> {
    const filters: Prisma.PaymentWhereInput[] = [await this.visibleWhere(), { status: query.status ?? { in: ['CAPTURED', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED'] } }];
    if (query.from || query.to) filters.push({ receivedAt: { gte: query.from ? new Date(`${query.from}T00:00:00+05:30`) : undefined, lt: query.to ? new Date(Date.parse(`${query.to}T00:00:00+05:30`) + 86_400_000) : undefined } });
    if (query.method) filters.push({ method: query.method });
    if (query.studentId) filters.push({ studentId: query.studentId });
    if (query.q) {
      filters.push({
        OR: [
          { receipt: { number: { contains: query.q, mode: 'insensitive' } } },
          { referenceNo: { contains: query.q, mode: 'insensitive' } },
          { gatewayPaymentId: { contains: query.q } },
          { student: { OR: [{ firstName: { contains: query.q, mode: 'insensitive' } }, { admissionNo: { contains: query.q, mode: 'insensitive' } }] } },
        ],
      });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.payment.findMany({ where, include: paymentInclude, orderBy: { receivedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.db.payment.count({ where }),
    ]);
    const names = await this.collectors(rows);
    return { data: rows.map((r) => this.toItem(r, names)), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** The accountant's day close: money received today by method and by collector. */
  async dayClose(date?: string): Promise<DayClose> {
    const day = date ?? todayIn();
    const start = new Date(`${day}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await this.prisma.db.payment.findMany({ where: { receivedAt: { gte: start, lt: end }, status: { not: 'FAILED' } }, include: paymentInclude, orderBy: { receivedAt: 'asc' } });
    const names = await this.collectors(rows);
    const items = rows.map((r) => this.toItem(r, names));
    const live = items.filter((i) => i.status !== 'VOIDED');
    const group = (key: (i: PaymentItem) => string) => {
      const m = new Map<string, { count: number; amountPaise: number }>();
      for (const i of live) {
        const k = key(i);
        const cur = m.get(k) ?? { count: 0, amountPaise: 0 };
        cur.count++;
        cur.amountPaise += i.amountPaise;
        m.set(k, cur);
      }
      return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.amountPaise - a.amountPaise);
    };
    const voided = items.filter((i) => i.status === 'VOIDED');
    return {
      date: day,
      totalPaise: live.reduce((a, i) => a + i.amountPaise, 0),
      count: live.length,
      byMethod: group((i) => METHOD_LABEL[i.method]).map(({ k, ...v }) => ({ method: k, ...v })),
      byCollector: group((i) => i.collectedBy ?? 'Online (parents)').map(({ k, ...v }) => ({ collector: k, ...v })),
      voided: { count: voided.length, amountPaise: voided.reduce((a, i) => a + i.amountPaise, 0) },
      payments: items,
    };
  }

  async statement(studentId: string): Promise<StudentFeeStatement> {
    const ok = (await this.scope.canAccessStudent('invoice.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!ok) throw AppError.notFound('student');
    const yearId = await this.scope.currentAcademicYearId();
    const today = todayIn();
    const [student, invoiceRows, paymentRows, credits, gateway] = await Promise.all([
      this.prisma.db.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true, admissionNo: true, enrollments: { where: { academicYearId: yearId ?? NONE }, select: { section: { select: { name: true, class: { select: { name: true } } } } } } } }),
      this.prisma.db.invoice.findMany({ where: { studentId, academicYearId: yearId ?? NONE, status: { notIn: ['DRAFT', 'CANCELLED'] } }, include: invoiceInclude, orderBy: [{ dueDate: 'asc' }, { number: 'asc' }] }),
      this.prisma.db.payment.findMany({ where: { studentId, status: { not: 'FAILED' } }, include: paymentInclude, orderBy: { receivedAt: 'desc' } }),
      this.prisma.db.studentCredit.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.db.paymentGatewayAccount.count({ where: { isActive: true } }),
    ]);
    const invoices = invoiceRows.map((i) => this.invoices.toItem(i, today));
    const names = await this.collectors(paymentRows);
    const sec = student.enrollments[0]?.section;
    return {
      student: { id: student.id, name: fullName(student.firstName, student.lastName), admissionNo: student.admissionNo, classLabel: sec ? label(sec.class.name, sec.name) : null },
      totals: {
        invoicedPaise: invoices.reduce((a, i) => a + i.totalPaise, 0),
        paidPaise: invoices.reduce((a, i) => a + i.paidPaise, 0),
        balancePaise: invoices.reduce((a, i) => a + i.balancePaise, 0),
        overduePaise: invoices.filter((i) => i.overdue).reduce((a, i) => a + i.balancePaise, 0),
        creditPaise: credits.reduce((a, c) => a + c.amountPaise - c.consumedPaise, 0),
      },
      invoices,
      payments: paymentRows.map((p) => this.toItem(p, names)),
      credits: credits.map((c) => ({ id: c.id, amountPaise: c.amountPaise, consumedPaise: c.consumedPaise, source: c.source, note: c.note, createdAt: c.createdAt.toISOString() })),
      onlinePayments: gateway > 0,
    };
  }

  async receiptLink(paymentId: string): Promise<DownloadLink> {
    await this.get(paymentId); // visibility
    const receipt = await this.prisma.db.receipt.findUnique({ where: { paymentId } });
    if (!receipt?.fileId) throw new AppError('RECEIPT_NOT_READY', 409, 'The receipt is still being prepared. Try again in a moment.');
    return this.files.attachedLink(receipt.fileId);
  }

  // ---------------------------------------------------------------- receipt PDF & notifications

  private async renderReceipt(paymentId: string): Promise<void> {
    const p = await this.prisma.db.payment.findUnique({
      where: { id: paymentId },
      include: {
        ...paymentInclude,
        receipt: true,
        allocations: { include: { invoice: { select: { number: true, installment: { select: { name: true } } } } } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { name: true } } } }, enrollments: { select: { academicYearId: true, section: { select: { name: true, class: { select: { name: true } } } } } } } },
      },
    });
    if (!p?.receipt) return;
    const school = await this.prisma.db.school.findUniqueOrThrow({ where: { id: RequestContextStore.school().schoolId } });
    const names = await this.collectors([p]);
    const net = new Map<string, { description: string; amountPaise: number }>();
    for (const a of p.allocations) {
      const key = a.invoiceId;
      const cur = net.get(key) ?? { description: `${a.invoice.installment?.name ?? 'Fees'} · ${a.invoice.number}`, amountPaise: 0 };
      // The receipt shows what this payment paid, even after a void (voids are negative rows).
      if (a.amountPaise > 0) cur.amountPaise += a.amountPaise;
      net.set(key, cur);
    }
    const sec = p.student.enrollments.at(-1)?.section;
    const html = receiptHtml({
      school: {
        name: school.name,
        address: [school.addressLine1, school.city, school.state].filter(Boolean).join(', ') || null,
        contact: [school.phone, school.email].filter(Boolean).join(' · ') || null,
        accent: school.accentColor,
        logoDataUri: null,
      },
      receiptNo: p.receipt.number,
      date: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(p.receivedAt),
      student: {
        name: fullName(p.student.firstName, p.student.lastName),
        admissionNo: p.student.admissionNo,
        classLabel: sec ? label(sec.class.name, sec.name) : null,
        guardian: p.student.guardians[0]?.guardian.name ?? null,
      },
      lines: [...net.values()],
      creditPaise: p.credits.reduce((a, c) => a + c.amountPaise, 0),
      amountPaise: p.amountPaise,
      method: p.method === 'ONLINE' ? `Online${p.gatewayMethod ? ` (${p.gatewayMethod.toUpperCase()})` : ''}` : METHOD_LABEL[p.method],
      reference: p.gatewayPaymentId ?? p.referenceNo,
      collector: p.collectedByMemberId ? (names.get(p.collectedByMemberId) ?? null) : null,
      cancelled: p.voidedAt ? { at: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(p.voidedAt), reason: p.voidReason } : null,
    });
    const data = await this.pdf.render(html);
    const fileId = await this.files.storeGenerated({
      purpose: 'receipt',
      fileName: `Receipt ${p.receipt.number.replace(/\//g, '-')}.pdf`,
      mimeType: 'application/pdf',
      data,
      memberId: p.collectedByMemberId ?? (await this.anyAdmin()),
    });
    await this.prisma.tenantTx((tx) => tx.receipt.update({ where: { id: p.receipt!.id }, data: { fileId } }));
    this.logger.info({ paymentId, receipt: p.receipt.number }, 'receipt generated');
  }

  /** Generated files need an owner; online receipts are attributed to the school's first admin. */
  private async anyAdmin(): Promise<string> {
    const m = await this.prisma.db.membership.findFirst({ where: { roles: { some: { role: { key: 'school_admin' } } } }, select: { id: true }, orderBy: { createdAt: 'asc' } });
    return m!.id;
  }

  private async notifyParents(paymentId: string): Promise<void> {
    const p = await this.prisma.db.payment.findUnique({ where: { id: paymentId }, include: { receipt: true, student: { select: { firstName: true } } } });
    if (!p || p.status !== 'CAPTURED') return;
    const guardians = await this.notifications.guardiansOf([p.studentId]);
    await this.notifications.notify({
      event: 'payment.received',
      recipients: guardians.map((g) => ({
        membershipId: g.membershipId,
        vars: { amount: formatRupees(p.amountPaise), student: p.student.firstName, receipt: p.receipt?.number ?? '' },
        data: { route: '/my/fees', paymentId },
      })),
      dedupeKey: () => `payment:${paymentId}`,
    });
  }
}

