import { Injectable } from '@nestjs/common';
import type { FinanceReport, FinanceReportKey } from '@schoolos/contracts';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fromDate, fullName, toDate, todayIn } from '../../core/util/dates.js';

const NONE = '00000000-0000-0000-0000-000000000000';
const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const METHOD: Record<string, string> = { ONLINE: 'Online', CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', UPI_DIRECT: 'UPI', POS_CARD: 'Card (POS)' };
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const istDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(at);

interface Range {
  from: string;
  to: string;
  classId?: string;
}

/** Finance reports (docs/11 §10). Read-only; money in paise; CSV comes from the same rows. */
@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async run(key: FinanceReportKey, q: { from?: string; to?: string; classId?: string }): Promise<FinanceReport> {
    const today = todayIn();
    const range: Range = { from: q.from ?? `${today.slice(0, 8)}01`, to: q.to ?? today, classId: q.classId };
    switch (key) {
      case 'collection':
        return this.collection(range);
      case 'outstanding':
        return this.outstanding(range);
      case 'defaulters':
        return this.defaulters(range);
      case 'heads':
        return this.heads(range);
      case 'concessions':
        return this.concessions(range);
      case 'reconciliation':
        return this.reconciliation(range);
    }
  }

  private async yearId() {
    return (await this.scope.currentAcademicYearId()) ?? NONE;
  }

  private studentInClass(yearId: string, classId?: string) {
    return classId ? { student: { enrollments: { some: { academicYearId: yearId, classId } } } } : {};
  }

  /** Money received per day, by method. Voided payments excluded; refunds shown. */
  private async collection(r: Range): Promise<FinanceReport> {
    const yearId = await this.yearId();
    const payments = await this.prisma.db.payment.findMany({
      where: { receivedAt: { gte: istStart(r.from), lt: new Date(istStart(r.to).getTime() + 86_400_000) }, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, ...this.studentInClass(yearId, r.classId) },
      select: { receivedAt: true, method: true, amountPaise: true, refundedPaise: true },
    });
    const methods = [...new Set(payments.map((p) => p.method))].sort();
    const byDay = new Map<string, Record<string, number>>();
    for (const p of payments) {
      const d = istDay(p.receivedAt);
      const row = byDay.get(d) ?? { count: 0, total: 0, refunded: 0 };
      row[p.method] = (row[p.method] ?? 0) + p.amountPaise;
      row.count! += 1;
      row.total! += p.amountPaise;
      row.refunded! += p.refundedPaise;
      byDay.set(d, row);
    }
    const rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, count: v.count!, ...Object.fromEntries(methods.map((m) => [m, v[m] ?? 0])), refunded: v.refunded!, net: v.total! - v.refunded!, total: v.total! }));
    const sum = (k: string) => rows.reduce((a, x) => a + Number((x as Record<string, unknown>)[k] ?? 0), 0);
    return {
      key: 'collection',
      title: 'Daily collection',
      description: 'Money received each day by payment method (voided receipts excluded).',
      range: r,
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'count', label: 'Payments', type: 'number' },
        ...methods.map((m) => ({ key: m, label: METHOD[m] ?? m, type: 'money' as const })),
        { key: 'total', label: 'Received', type: 'money' },
        { key: 'refunded', label: 'Refunded', type: 'money' },
        { key: 'net', label: 'Net', type: 'money' },
      ],
      rows,
      totals: Object.fromEntries(['count', ...methods, 'total', 'refunded', 'net'].map((k) => [k, sum(k)])),
    };
  }

  /** Billed, paid and due per section this year. */
  private async outstanding(r: Range): Promise<FinanceReport> {
    const yearId = await this.yearId();
    const today = toDate(todayIn())!;
    const invoices = await this.prisma.db.invoice.findMany({
      where: { academicYearId: yearId, status: { notIn: ['DRAFT', 'CANCELLED'] }, ...this.studentInClass(yearId, r.classId) },
      select: { totalPaise: true, paidPaise: true, balancePaise: true, dueDate: true, studentId: true, student: { select: { enrollments: { where: { academicYearId: yearId }, select: { section: { select: { id: true, name: true, class: { select: { name: true, displayOrder: true } } } } } } } } },
    });
    const bySection = new Map<string, { section: string; order: number; students: Set<string>; billed: number; paid: number; due: number; overdue: number }>();
    for (const i of invoices) {
      const sec = i.student.enrollments[0]?.section;
      const key = sec?.id ?? 'none';
      const row = bySection.get(key) ?? { section: sec ? label(sec.class.name, sec.name) : '—', order: (sec?.class.displayOrder ?? 99) * 100 + (sec?.name.charCodeAt(0) ?? 0), students: new Set(), billed: 0, paid: 0, due: 0, overdue: 0 };
      row.students.add(i.studentId);
      row.billed += i.totalPaise;
      row.paid += i.paidPaise;
      row.due += i.balancePaise;
      if (i.balancePaise > 0 && i.dueDate < today) row.overdue += i.balancePaise;
      bySection.set(key, row);
    }
    const rows = [...bySection.values()]
      .sort((a, b) => a.order - b.order)
      .map((v) => ({ section: v.section, students: v.students.size, billed: v.billed, paid: v.paid, due: v.due, overdue: v.overdue, collected: v.billed ? Math.round((v.paid / v.billed) * 1000) / 10 : null }));
    const total = (k: 'billed' | 'paid' | 'due' | 'overdue' | 'students') => rows.reduce((a, x) => a + x[k], 0);
    const billed = total('billed');
    return {
      key: 'outstanding',
      title: 'Outstanding by class',
      description: "This year's billed, paid and due amounts per section.",
      range: null,
      columns: [
        { key: 'section', label: 'Section', type: 'text' },
        { key: 'students', label: 'Students', type: 'number' },
        { key: 'billed', label: 'Billed', type: 'money' },
        { key: 'paid', label: 'Paid', type: 'money' },
        { key: 'due', label: 'Due', type: 'money' },
        { key: 'overdue', label: 'Overdue', type: 'money' },
        { key: 'collected', label: 'Collected', type: 'percent' },
      ],
      rows,
      totals: { students: total('students'), billed, paid: total('paid'), due: total('due'), overdue: total('overdue'), collected: billed ? Math.round((total('paid') / billed) * 1000) / 10 : 0 },
    };
  }

  /** Students with overdue fees, worst first, with a contact number for follow-up. */
  private async defaulters(r: Range): Promise<FinanceReport> {
    const yearId = await this.yearId();
    const todayStr = todayIn();
    const invoices = await this.prisma.db.invoice.findMany({
      where: { academicYearId: yearId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, balancePaise: { gt: 0 }, dueDate: { lt: toDate(todayStr) }, ...this.studentInClass(yearId, r.classId) },
      select: {
        balancePaise: true,
        dueDate: true,
        studentId: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: { where: { academicYearId: yearId }, select: { section: { select: { name: true, class: { select: { name: true } } } } } },
            guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { name: true, phone: true } } } },
          },
        },
      },
    });
    const byStudent = new Map<string, { name: string; admissionNo: string; section: string; guardian: string; phone: string; invoices: number; overdue: number; oldest: string }>();
    for (const i of invoices) {
      const sec = i.student.enrollments[0]?.section;
      const g = i.student.guardians[0]?.guardian;
      const due = fromDate(i.dueDate)!;
      const row = byStudent.get(i.studentId) ?? { name: fullName(i.student.firstName, i.student.lastName), admissionNo: i.student.admissionNo, section: sec ? label(sec.class.name, sec.name) : '—', guardian: g?.name ?? '—', phone: g?.phone ?? '—', invoices: 0, overdue: 0, oldest: due };
      row.invoices++;
      row.overdue += i.balancePaise;
      if (due < row.oldest) row.oldest = due;
      byStudent.set(i.studentId, row);
    }
    const rows = [...byStudent.values()]
      .map((v) => ({ ...v, days: Math.round((Date.parse(todayStr) - Date.parse(v.oldest)) / 86_400_000) }))
      .sort((a, b) => b.overdue - a.overdue);
    return {
      key: 'defaulters',
      title: 'Defaulters',
      description: 'Students with overdue fees, largest amount first.',
      range: null,
      columns: [
        { key: 'name', label: 'Student', type: 'text' },
        { key: 'admissionNo', label: 'Adm. no.', type: 'text' },
        { key: 'section', label: 'Class', type: 'text' },
        { key: 'guardian', label: 'Parent', type: 'text' },
        { key: 'phone', label: 'Mobile', type: 'text' },
        { key: 'invoices', label: 'Invoices', type: 'number' },
        { key: 'oldest', label: 'Oldest due', type: 'date' },
        { key: 'days', label: 'Days late', type: 'number' },
        { key: 'overdue', label: 'Overdue', type: 'money' },
      ],
      rows,
      totals: { invoices: rows.reduce((a, x) => a + x.invoices, 0), overdue: rows.reduce((a, x) => a + x.overdue, 0) },
    };
  }

  /** Collection split by fee head: each allocation is shared across the invoice's fees pro rata. */
  private async heads(r: Range): Promise<FinanceReport> {
    const yearId = await this.yearId();
    const allocations = await this.prisma.db.paymentAllocation.findMany({
      where: { createdAt: { gte: istStart(r.from), lt: new Date(istStart(r.to).getTime() + 86_400_000) }, invoice: { academicYearId: yearId, ...this.studentInClass(yearId, r.classId) } },
      select: { amountPaise: true, invoiceId: true },
    });
    const invoiceIds = [...new Set(allocations.map((a) => a.invoiceId))];
    const lines = await this.prisma.db.invoiceLine.findMany({ where: { invoiceId: { in: invoiceIds } }, select: { invoiceId: true, kind: true, description: true, amountPaise: true, feeHead: { select: { name: true } } } });
    const heads = new Map<string, number>();
    for (const id of invoiceIds) {
      const mine = lines.filter((l) => l.invoiceId === id);
      const parts = new Map<string, number>();
      for (const l of mine) {
        const name = l.kind === 'LATE_FEE' ? 'Late fees' : l.kind === 'ADJUSTMENT' ? 'Adjustments' : (l.feeHead?.name ?? l.description);
        parts.set(name, (parts.get(name) ?? 0) + l.amountPaise);
      }
      const total = [...parts.values()].reduce((a, b) => a + b, 0);
      const paid = allocations.filter((a) => a.invoiceId === id).reduce((a, x) => a + x.amountPaise, 0);
      if (!total || !paid) continue;
      for (const [name, amount] of parts) heads.set(name, (heads.get(name) ?? 0) + Math.round((paid * amount) / total));
    }
    const rows = [...heads.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([head, amount]) => ({ head, amount }));
    return {
      key: 'heads',
      title: 'Head-wise collection',
      description: 'Money collected per fee, after concessions (shared pro rata within each invoice).',
      range: r,
      columns: [
        { key: 'head', label: 'Fee', type: 'text' },
        { key: 'amount', label: 'Collected', type: 'money' },
      ],
      rows,
      totals: { amount: rows.reduce((a, x) => a + x.amount, 0) },
    };
  }

  private async concessions(r: Range): Promise<FinanceReport> {
    const yearId = await this.yearId();
    const lines = await this.prisma.db.invoiceLine.findMany({
      where: { kind: 'CONCESSION', invoice: { academicYearId: yearId, status: { not: 'CANCELLED' }, ...this.studentInClass(yearId, r.classId) } },
      select: { description: true, amountPaise: true, invoice: { select: { studentId: true } } },
    });
    const byType = new Map<string, { students: Set<string>; amount: number }>();
    for (const l of lines) {
      const type = l.description.replace(/\s*\([^)]*\)\s*$/, '');
      const row = byType.get(type) ?? { students: new Set(), amount: 0 };
      row.students.add(l.invoice.studentId);
      row.amount += -l.amountPaise;
      byType.set(type, row);
    }
    const rows = [...byType.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([concession, v]) => ({ concession, students: v.students.size, amount: v.amount }));
    return {
      key: 'concessions',
      title: 'Concessions given',
      description: "This year's concessions on issued invoices.",
      range: null,
      columns: [
        { key: 'concession', label: 'Concession', type: 'text' },
        { key: 'students', label: 'Students', type: 'number' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows,
      totals: { students: rows.reduce((a, x) => a + x.students, 0), amount: rows.reduce((a, x) => a + x.amount, 0) },
    };
  }

  /** Online payments health: orders by outcome, webhook problems, refunds pending, flags. */
  private async reconciliation(r: Range): Promise<FinanceReport> {
    const window = { gte: istStart(r.from), lt: new Date(istStart(r.to).getTime() + 86_400_000) };
    const [orders, webhooks, refunds, flags, credits] = await Promise.all([
      this.prisma.db.gatewayOrder.groupBy({ by: ['status'], where: { createdAt: window }, _count: { _all: true }, _sum: { amountPaise: true } }),
      this.prisma.db.webhookEvent.groupBy({ by: ['status', 'signatureValid'], where: { receivedAt: window }, _count: { _all: true } }),
      this.prisma.db.refund.groupBy({ by: ['status'], where: { createdAt: window }, _count: { _all: true }, _sum: { amountPaise: true } }),
      this.prisma.db.auditLog.count({ where: { createdAt: window, action: { in: ['security.payment_amount_mismatch', 'security.payment_signature_invalid'] } } }),
      this.prisma.db.studentCredit.aggregate({ where: { createdAt: window }, _sum: { amountPaise: true, consumedPaise: true } }),
    ]);
    const o = (s: string) => orders.find((x) => x.status === s);
    const rows = [
      { item: 'Orders paid', count: o('PAID')?._count._all ?? 0, amount: o('PAID')?._sum.amountPaise ?? 0 },
      { item: 'Orders awaiting payment', count: (o('CREATED')?._count._all ?? 0) + (o('ATTEMPTED')?._count._all ?? 0), amount: (o('CREATED')?._sum.amountPaise ?? 0) + (o('ATTEMPTED')?._sum.amountPaise ?? 0) },
      { item: 'Orders expired', count: o('EXPIRED')?._count._all ?? 0, amount: o('EXPIRED')?._sum.amountPaise ?? 0 },
      { item: 'Webhooks processed', count: webhooks.filter((w) => w.status === 'PROCESSED' || w.status === 'IGNORED').reduce((a, w) => a + w._count._all, 0), amount: null },
      { item: 'Webhooks failed or with bad signature', count: webhooks.filter((w) => w.status === 'FAILED' || !w.signatureValid).reduce((a, w) => a + w._count._all, 0), amount: null },
      { item: 'Refunds pending', count: refunds.find((x) => x.status === 'PENDING')?._count._all ?? 0, amount: refunds.find((x) => x.status === 'PENDING')?._sum.amountPaise ?? 0 },
      { item: 'Refunds processed', count: refunds.find((x) => x.status === 'PROCESSED')?._count._all ?? 0, amount: refunds.find((x) => x.status === 'PROCESSED')?._sum.amountPaise ?? 0 },
      { item: 'Refunds failed', count: refunds.find((x) => x.status === 'FAILED')?._count._all ?? 0, amount: refunds.find((x) => x.status === 'FAILED')?._sum.amountPaise ?? 0 },
      { item: 'Security flags (mismatch / bad signature)', count: flags, amount: null },
      { item: 'Unused student credit created', count: null, amount: (credits._sum.amountPaise ?? 0) - (credits._sum.consumedPaise ?? 0) },
    ];
    return {
      key: 'reconciliation',
      title: 'Online payments reconciliation',
      description: 'Gateway orders, webhooks and refunds in the period. Anything failed or flagged needs a look.',
      range: r,
      columns: [
        { key: 'item', label: 'Item', type: 'text' },
        { key: 'count', label: 'Count', type: 'number' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows,
      totals: null,
    };
  }
}

/** CSV with rupee amounts (Excel-friendly, UTF-8 BOM). */
export function reportCsv(report: FinanceReport): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const value = (type: string, v: string | number | null | undefined) => (type === 'money' && typeof v === 'number' ? (v / 100).toFixed(2) : v);
  const lines = [report.columns.map((c) => cell(c.type === 'money' ? `${c.label} (₹)` : c.label)).join(',')];
  for (const row of report.rows) lines.push(report.columns.map((c) => cell(value(c.type, row[c.key]))).join(','));
  if (report.totals) lines.push(report.columns.map((c, i) => cell(i === 0 ? 'Total' : value(c.type, report.totals![c.key] ?? null))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
