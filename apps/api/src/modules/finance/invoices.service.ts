import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import type {
  InvoiceDetail,
  InvoiceItem,
  InvoicePreview,
  PageResponse,
  adjustInvoiceSchema,
  cancelInvoiceSchema,
  listInvoicesQuerySchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { fromDate, fullName, toDate, todayIn } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FeesService } from '../fees/fees.service.js';
import { nextNumber, yearKey } from './sequence.js';

type In<T extends z.ZodType> = z.output<T>;
const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const NONE = '00000000-0000-0000-0000-000000000000';

export const invoiceInclude = {
  installment: { select: { id: true, name: true } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: { select: { academicYearId: true, section: { select: { name: true, class: { select: { name: true } } } } } },
    },
  },
} satisfies Prisma.InvoiceInclude;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

interface DraftLine {
  kind: 'FEE' | 'CONCESSION';
  feeHeadId: string;
  description: string;
  amountPaise: number;
}

/**
 * Invoices (docs/11 §7): built per installment from the class's fee structure, minus approved
 * concessions, plus optional fees the student opted into. Issued invoices are append-only:
 * corrections are ADJUSTMENT lines; totals are kept in step inside the same transaction.
 */
@Injectable()
export class InvoicesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly queues: QueueService,
    private readonly fees: FeesService,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.finance, 'invoices.generate', async (data) => {
      await this.generateNow(String(data.installmentId), data.classIds ? String(data.classIds).split(',') : undefined, String(data.memberId));
    });
  }

  // ---------------------------------------------------------------- mapping & visibility

  toItem(i: InvoiceRow, today = todayIn()): InvoiceItem {
    const sec = i.student.enrollments.find((e) => e.academicYearId === i.academicYearId)?.section;
    return {
      id: i.id,
      number: i.number,
      student: { id: i.student.id, name: fullName(i.student.firstName, i.student.lastName), admissionNo: i.student.admissionNo, classLabel: sec ? label(sec.class.name, sec.name) : null },
      installment: i.installment,
      issueDate: fromDate(i.issueDate)!,
      dueDate: fromDate(i.dueDate)!,
      status: i.status,
      overdue: (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID') && i.balancePaise > 0 && fromDate(i.dueDate)! < today,
      subtotalPaise: i.subtotalPaise,
      concessionPaise: i.concessionPaise,
      lateFeePaise: i.lateFeePaise,
      adjustmentPaise: i.adjustmentPaise,
      totalPaise: i.totalPaise,
      paidPaise: i.paidPaise,
      balancePaise: i.balancePaise,
      version: i.version,
    };
  }

  /** Invoices the caller may see: finance staff all; parents their children's (issued ones). */
  async visibleWhere(): Promise<Prisma.InvoiceWhereInput> {
    const scope = RequestContextStore.tenant().permissions['invoice.view'];
    if (scope === 'ALL') return {};
    if (scope === 'OWN_CHILDREN') return { studentId: { in: await this.scope.childStudentIds() }, status: { not: 'DRAFT' } };
    return { id: NONE };
  }

  // ---------------------------------------------------------------- building

  /** Lines for one student's invoice for an installment (pure; no writes). */
  private buildLines(
    structure: { items: { id: string; feeHeadId: string; isOptional: boolean; feeHead: { name: string } }[] },
    splits: Map<string, number>,
    opted: Set<string>,
    concessions: { type: { name: string; calc: string; valuePaise: number | null; valueBasisPoints: number | null; feeHeadIds: string[] }; overrideValue: number | null }[],
  ): DraftLine[] {
    const lines: DraftLine[] = [];
    for (const item of structure.items) {
      const amount = splits.get(item.id) ?? 0;
      if (!amount || (item.isOptional && !opted.has(item.id))) continue;
      lines.push({ kind: 'FEE', feeHeadId: item.feeHeadId, description: item.feeHead.name, amountPaise: amount });
      let remaining = amount;
      for (const c of concessions) {
        if (c.type.feeHeadIds.length && !c.type.feeHeadIds.includes(item.feeHeadId)) continue;
        const value = c.overrideValue ?? (c.type.calc === 'PERCENT' ? c.type.valueBasisPoints : c.type.valuePaise) ?? 0;
        const off = Math.min(remaining, c.type.calc === 'PERCENT' ? Math.floor((amount * value) / 10_000) : value);
        if (off <= 0) continue;
        remaining -= off;
        lines.push({ kind: 'CONCESSION', feeHeadId: item.feeHeadId, description: `${c.type.name} (${item.feeHead.name})`, amountPaise: -off });
      }
    }
    return lines;
  }

  private async plan(installmentId: string, classIds?: string[]) {
    const yearId = await this.fees.yearId();
    const installment = await this.prisma.db.feeInstallment.findUnique({
      where: { id: installmentId },
      include: {
        splits: true,
        feeStructure: { include: { classes: true, items: { include: { feeHead: { select: { name: true } } } }, academicYear: { select: { name: true } } } },
      },
    });
    if (!installment || installment.feeStructure.academicYearId !== yearId) throw AppError.notFound('installment');
    if (installment.feeStructure.status !== 'PUBLISHED') throw new AppError('STRUCTURE_NOT_PUBLISHED', 422, 'Publish the fee structure before making invoices.');
    const structureClasses = installment.feeStructure.classes.map((c) => c.classId);
    const targetClasses = classIds?.length ? classIds.filter((c) => structureClasses.includes(c)) : structureClasses;
    if (classIds?.length && targetClasses.length !== new Set(classIds).size) throw AppError.invalidReference('classIds', 'class');

    const enrollments = await this.prisma.db.studentEnrollment.findMany({
      where: { academicYearId: yearId, classId: { in: targetClasses }, status: 'ENROLLED', student: { status: 'ACTIVE', archivedAt: null } },
      include: { student: { select: { id: true, firstName: true, lastName: true } }, section: { select: { name: true, class: { select: { name: true, displayOrder: true } } } } },
    });
    enrollments.sort((a, b) => a.section.class.displayOrder - b.section.class.displayOrder || a.section.name.localeCompare(b.section.name) || (a.rollNo ?? 9999) - (b.rollNo ?? 9999));
    const ids = enrollments.map((e) => e.studentId);
    const [existing, assignments, concessions] = await Promise.all([
      this.prisma.db.invoice.findMany({ where: { installmentId, studentId: { in: ids }, status: { not: 'CANCELLED' } }, select: { studentId: true } }),
      this.prisma.db.studentFeeAssignment.findMany({ where: { studentId: { in: ids }, academicYearId: yearId, feeStructureId: installment.feeStructureId } }),
      this.prisma.db.studentConcession.findMany({ where: { studentId: { in: ids }, academicYearId: yearId, status: 'APPROVED', concessionType: { isActive: true } }, include: { concessionType: true } }),
    ]);
    const invoiced = new Set(existing.map((e) => e.studentId));
    const splits = new Map(installment.splits.map((s) => [s.itemId, s.amountPaise]));
    const drafts = enrollments
      .filter((e) => !invoiced.has(e.studentId))
      .map((e) => {
        const opted = new Set(assignments.find((a) => a.studentId === e.studentId)?.optedOptionalItemIds ?? []);
        const mine = concessions.filter((c) => c.studentId === e.studentId).map((c) => ({ type: c.concessionType, overrideValue: c.overrideValue }));
        const lines = this.buildLines(installment.feeStructure, splits, opted, mine);
        return {
          studentId: e.studentId,
          student: fullName(e.student.firstName, e.student.lastName),
          classLabel: label(e.section.class.name, e.section.name),
          lines,
          totalPaise: lines.reduce((a, l) => a + l.amountPaise, 0),
        };
      })
      .filter((d) => d.lines.length);
    return { installment, enrollments, drafts, alreadyInvoiced: invoiced.size };
  }

  async preview(installmentId: string, classIds?: string[]): Promise<InvoicePreview> {
    const { installment, enrollments, drafts, alreadyInvoiced } = await this.plan(installmentId, classIds);
    return {
      installment: { id: installment.id, name: installment.name, dueDate: fromDate(installment.dueDate)!, structure: installment.feeStructure.name },
      students: enrollments.length,
      toCreate: drafts.length,
      alreadyInvoiced,
      totalPaise: drafts.reduce((a, d) => a + d.totalPaise, 0),
      concessionPaise: -drafts.reduce((a, d) => a + d.lines.filter((l) => l.kind === 'CONCESSION').reduce((x, l) => x + l.amountPaise, 0), 0),
      sample: drafts.slice(0, 3).map((d) => ({ student: d.student, classLabel: d.classLabel, lines: d.lines.map((l) => ({ description: l.description, amountPaise: l.amountPaise })), totalPaise: d.totalPaise })),
    };
  }

  /** Queue issuing (a whole school can be hundreds of invoices). */
  async generate(installmentId: string, classIds?: string[]): Promise<{ queued: number }> {
    const p = await this.preview(installmentId, classIds);
    if (!p.toCreate) throw new AppError('NOTHING_TO_INVOICE', 422, p.alreadyInvoiced ? 'Every student here already has this invoice.' : 'No students to invoice.');
    const { schoolId } = RequestContextStore.school();
    const { membershipId } = RequestContextStore.tenant();
    await this.queues.add(
      QUEUES.finance,
      'invoices.generate',
      { schoolId, installmentId, classIds: classIds?.join(',') ?? null, memberId: membershipId },
      { jobId: `invoices-${installmentId}-${Date.now()}`, attempts: 3 },
    );
    return { queued: p.toCreate };
  }

  /** Worker: issue invoices in small transactions. Safe to re-run — skips students already invoiced. */
  async generateNow(installmentId: string, classIds: string[] | undefined, memberId: string): Promise<number> {
    const { installment, drafts } = await this.plan(installmentId, classIds);
    const year = yearKey(installment.feeStructure.academicYear.name);
    const today = toDate(todayIn())!;
    let made = 0;
    for (let i = 0; i < drafts.length; i += 50) {
      const batch = drafts.slice(i, i + 50);
      await this.prisma.tenantTx(
        async (tx) => {
          for (const d of batch) {
            const number = await nextNumber(tx, `INVOICE:${year}`, `INV/${year}/`);
            const subtotal = d.lines.filter((l) => l.kind === 'FEE').reduce((a, l) => a + l.amountPaise, 0);
            const concession = -d.lines.filter((l) => l.kind === 'CONCESSION').reduce((a, l) => a + l.amountPaise, 0);
            const total = subtotal - concession;
            await tx.invoice.create({
              data: {
                number,
                studentId: d.studentId,
                academicYearId: installment.feeStructure.academicYearId,
                installmentId,
                issueDate: today,
                dueDate: installment.dueDate,
                status: total === 0 ? 'PAID' : 'ISSUED',
                subtotalPaise: subtotal,
                concessionPaise: concession,
                totalPaise: total,
                balancePaise: total,
                createdByMemberId: memberId,
                lines: { create: d.lines.map((l) => ({ ...l, schoolId: RequestContextStore.school().schoolId, createdByMemberId: memberId })) },
              } as Prisma.InvoiceUncheckedCreateInput,
            });
            made++;
          }
          await this.audit.record(tx, { action: 'invoices.generate', entityType: 'FeeInstallment', entityId: installmentId, metadata: { invoices: batch.length } });
        },
        { timeout: 60_000 },
      );
    }
    return made;
  }

  // ---------------------------------------------------------------- read

  async list(query: In<typeof listInvoicesQuerySchema>): Promise<PageResponse<InvoiceItem>> {
    const yearId = await this.fees.yearId();
    const today = todayIn();
    const filters: Prisma.InvoiceWhereInput[] = [await this.visibleWhere(), { academicYearId: yearId }];
    if (query.status) filters.push({ status: query.status });
    else filters.push({ status: { notIn: ['DRAFT', 'CANCELLED'] } });
    if (query.overdue === 'true') filters.push({ status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, balancePaise: { gt: 0 }, dueDate: { lt: toDate(today) } });
    if (query.studentId) filters.push({ studentId: query.studentId });
    if (query.installmentId) filters.push({ installmentId: query.installmentId });
    if (query.classId || query.sectionId) {
      filters.push({ student: { enrollments: { some: { academicYearId: yearId, ...(query.classId ? { classId: query.classId } : {}), ...(query.sectionId ? { sectionId: query.sectionId } : {}) } } } });
    }
    if (query.q) {
      const words = query.q.split(/\s+/).filter(Boolean);
      filters.push({
        AND: words.map((w) => ({
          OR: [
            { number: { contains: w, mode: 'insensitive' as const } },
            { student: { firstName: { contains: w, mode: 'insensitive' as const } } },
            { student: { lastName: { contains: w, mode: 'insensitive' as const } } },
            { student: { admissionNo: { contains: w, mode: 'insensitive' as const } } },
          ],
        })),
      });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.invoice.findMany({ where, include: invoiceInclude, orderBy: [{ dueDate: 'asc' }, { number: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.db.invoice.count({ where }),
    ]);
    return { data: rows.map((r) => this.toItem(r, today)), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string): Promise<InvoiceDetail> {
    const row = await this.prisma.db.invoice.findFirst({
      where: { AND: [{ id }, await this.visibleWhere()] },
      include: {
        ...invoiceInclude,
        lines: { orderBy: { createdAt: 'asc' } },
        allocations: { include: { payment: { select: { id: true, method: true, receivedAt: true, voidedAt: true, receipt: { select: { number: true } } } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw AppError.notFound('invoice');
    const byPayment = new Map<string, { paymentId: string; receiptNo: string | null; method: string; amountPaise: number; receivedAt: string; voided: boolean }>();
    for (const a of row.allocations) {
      const cur = byPayment.get(a.paymentId) ?? { paymentId: a.paymentId, receiptNo: a.payment.receipt?.number ?? null, method: a.payment.method, amountPaise: 0, receivedAt: a.payment.receivedAt.toISOString(), voided: !!a.payment.voidedAt };
      cur.amountPaise += a.amountPaise;
      byPayment.set(a.paymentId, cur);
    }
    return {
      ...this.toItem(row),
      lines: row.lines.map((l) => ({ id: l.id, kind: l.kind, description: l.description, amountPaise: l.amountPaise, reason: l.reason, createdAt: l.createdAt.toISOString() })),
      payments: [...byPayment.values()].filter((p) => p.amountPaise !== 0 || p.voided),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
    };
  }

  // ---------------------------------------------------------------- write

  /** Recompute an invoice's totals from its lines and allocations (call inside the transaction). */
  async recalc(tx: TenantTx, invoiceId: string): Promise<void> {
    const [lines, alloc, inv] = await Promise.all([
      tx.invoiceLine.groupBy({ by: ['kind'], where: { invoiceId }, _sum: { amountPaise: true } }),
      tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amountPaise: true } }),
      tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { status: true } }),
    ]);
    const sum = (k: string) => lines.find((l) => l.kind === k)?._sum.amountPaise ?? 0;
    const subtotal = sum('FEE');
    const concession = -sum('CONCESSION');
    const lateFee = sum('LATE_FEE');
    const adjustment = sum('ADJUSTMENT');
    const total = subtotal - concession + lateFee + adjustment;
    const paid = alloc._sum.amountPaise ?? 0;
    const balance = total - paid;
    const status = inv.status === 'CANCELLED' ? 'CANCELLED' : balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { subtotalPaise: subtotal, concessionPaise: concession, lateFeePaise: lateFee, adjustmentPaise: adjustment, totalPaise: total, paidPaise: paid, balancePaise: balance, status, version: { increment: 1 } },
    });
  }

  private async editable(id: string, version?: number) {
    const inv = await this.prisma.db.invoice.findUnique({ where: { id } });
    if (!inv) throw AppError.notFound('invoice');
    if (inv.status === 'CANCELLED') throw new AppError('INVOICE_CANCELLED', 422, 'This invoice is cancelled.');
    if (version !== undefined && version !== inv.version) throw new AppError('VERSION_CONFLICT', 409, 'This invoice changed since you opened it. Reload and try again.');
    return inv;
  }

  async adjust(id: string, input: In<typeof adjustInvoiceSchema>): Promise<InvoiceDetail> {
    const inv = await this.editable(id, input.version);
    if (inv.balancePaise + input.amountPaise < 0) {
      throw new AppError('ADJUSTMENT_TOO_LARGE', 422, 'That would take the balance below zero. Refund the payment instead.', [{ field: 'amountPaise', message: 'More than the balance' }]);
    }
    const { membershipId } = RequestContextStore.tenant();
    await this.prisma.tenantTx(async (tx) => {
      await tx.invoiceLine.create({
        data: { invoiceId: id, kind: 'ADJUSTMENT', description: input.amountPaise > 0 ? 'Additional charge' : 'Reduction', amountPaise: input.amountPaise, reason: input.reason, createdByMemberId: membershipId } as Prisma.InvoiceLineUncheckedCreateInput,
      });
      await this.recalc(tx, id);
      await this.audit.record(tx, { action: 'invoice.adjust', entityType: 'Invoice', entityId: id, metadata: { number: inv.number, amountPaise: input.amountPaise, reason: input.reason } });
    });
    return this.get(id);
  }

  async cancel(id: string, input: In<typeof cancelInvoiceSchema>): Promise<InvoiceDetail> {
    const inv = await this.editable(id, input.version);
    if (inv.paidPaise !== 0) throw new AppError('INVOICE_HAS_PAYMENTS', 409, 'Payments are recorded against this invoice. Void or refund them first.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason, balancePaise: 0, version: { increment: 1 } } });
      await this.audit.record(tx, { action: 'invoice.cancel', entityType: 'Invoice', entityId: id, metadata: { number: inv.number, reason: input.reason } });
    });
    return this.get(id);
  }
}
