import { Injectable } from '@nestjs/common';
import { formatRupees } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { PaymentsService } from '../finance/payments.service.js';
import { parseDate } from './parsing.js';
import type { Checked } from './setup-imports.js';

type In = { rowNumber: number; raw: Record<string, string>; values: Record<string, string> }[];
type Method = 'CASH' | 'UPI_DIRECT' | 'BANK_TRANSFER' | 'POS_CARD';
interface RowError {
  field?: string;
  message: string;
}

const MAX_PAISE = 10_00_000_00; // ₹10 lakh in one payment
const METHODS: [RegExp, Method][] = [
  [/^(cash|nakad|nagad)$/, 'CASH'],
  [/^(upi|gpay|google pay|phonepe|phone pe|paytm|bhim|qr)$/, 'UPI_DIRECT'],
  [/^(bank|bank transfer|neft|rtgs|imps|cheque|check|chq|dd|demand draft|online transfer|transfer)$/, 'BANK_TRANSFER'],
  [/^(card|pos|debit card|credit card|swipe)$/, 'POS_CARD'],
];
const LABEL: Record<Method, string> = { CASH: 'Cash', UPI_DIRECT: 'UPI', BANK_TRANSFER: 'Bank', POS_CARD: 'Card' };

/** "₹12,500" · "12500.50" · "Rs. 3,000/-" → paise, or null. */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/\/-$/, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function parseMethod(input: string): Method | null {
  const s = input.trim().toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return 'CASH';
  return METHODS.find(([re]) => re.test(s))?.[1] ?? null;
}

const todayInIndia = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const shortDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/**
 * "Fees already paid" import: payments a school took this year before it moved to Bastaa, so a
 * school that starts mid-year shows the right dues from day one.
 */
@Injectable()
export class PaymentImports {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async checkPastPayments(rows: In): Promise<Checked[]> {
    const school = await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { currentAcademicYearId: true } });
    const year = school?.currentAcademicYearId ? await this.prisma.db.academicYear.findUnique({ where: { id: school.currentAcademicYearId } }) : null;
    if (!year) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create the academic year first (Settings → Academic year).');
    const yearStart = year.startDate.toISOString().slice(0, 10);
    const today = todayInIndia();

    const nos = [...new Set(rows.map((r) => r.values.admissionNo?.trim()).filter(Boolean) as string[])];
    const students = await this.prisma.db.student.findMany({ where: { admissionNo: { in: nos }, archivedAt: null }, select: { id: true, admissionNo: true, firstName: true, lastName: true } });
    const ids = students.map((s) => s.id);
    const dues = await this.prisma.db.invoice.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, _sum: { balancePaise: true } });
    const left = new Map(dues.map((d) => [d.studentId, Math.max(0, d._sum.balancePaise ?? 0)]));
    const earlier = await this.prisma.db.payment.findMany({
      where: { studentId: { in: ids }, status: { not: 'VOIDED' } },
      select: { studentId: true, amountPaise: true, receivedAt: true, referenceNo: true, receipt: { select: { number: true } } },
    });

    const seen = new Map<string, number>();
    return rows.map(({ rowNumber, raw, values: v }) => {
      const errors: RowError[] = [];
      const admissionNo = v.admissionNo?.trim() ?? '';
      const student = students.find((s) => s.admissionNo === admissionNo);
      if (!admissionNo) errors.push({ field: 'admissionNo', message: 'Admission number is missing' });
      else if (!student) errors.push({ field: 'admissionNo', message: `No student with admission number ${admissionNo}` });

      const amountPaise = parseAmount(v.amount ?? '');
      if (!v.amount?.trim()) errors.push({ field: 'amount', message: 'Amount is missing' });
      else if (amountPaise === null) errors.push({ field: 'amount', message: `"${v.amount}" isn't an amount (write it like 12500)` });
      else if (amountPaise <= 0) errors.push({ field: 'amount', message: 'Amount must be more than ₹0' });
      else if (amountPaise > MAX_PAISE) errors.push({ field: 'amount', message: 'More than ₹10,00,000 in one payment: check the amount' });

      const paidOn = parseDate(v.paidOn ?? '');
      if (!v.paidOn?.trim()) errors.push({ field: 'paidOn', message: 'Date is missing' });
      else if (!paidOn) errors.push({ field: 'paidOn', message: `"${v.paidOn}" isn't a date (write it like 15/07/2026)` });
      else if (paidOn > today) errors.push({ field: 'paidOn', message: 'This date is in the future' });
      else if (paidOn < yearStart) errors.push({ field: 'paidOn', message: `Before this school year (${year.name} starts ${shortDate(yearStart)})` });

      const method = parseMethod(v.method ?? '');
      if (!method) errors.push({ field: 'method', message: `"${v.method}" isn't a way of paying (cash, UPI, bank or card)` });
      const referenceNo = v.reference?.trim().slice(0, 60) || null;
      const note = v.note?.trim().slice(0, 240) || null;

      const key = [admissionNo, paidOn, amountPaise, referenceNo ?? ''].join('|');
      const already = !errors.length && student
        ? earlier.find((p) => p.studentId === student.id && p.amountPaise === amountPaise && new Date(p.receivedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10) === paidOn && (p.referenceNo ?? null) === referenceNo)
        : undefined;
      const due = student ? (left.get(student.id) ?? 0) : 0;
      if (student && !errors.length && !already && !seen.has(key) && !left.has(student.id)) {
        errors.push({ field: 'admissionNo', message: 'Nothing is due for this student: set up the fee structure and optional fees first, or check the admission number' });
      }

      let status: Checked['status'] = errors.length ? 'INVALID' : 'VALID';
      if (status === 'VALID' && already) {
        status = 'DUPLICATE';
        errors.unshift({ message: `Already recorded${already.receipt ? ` (receipt ${already.receipt.number})` : ''}` });
      } else if (status === 'VALID' && seen.has(key)) {
        status = 'DUPLICATE';
        errors.unshift({ message: `Same payment as row ${seen.get(key)}` });
      }
      if (status === 'VALID') seen.set(key, rowNumber);

      // What's left after this row, so the summary can say when money goes to advance.
      let extraPaise = 0;
      if (status === 'VALID' && student && amountPaise) {
        extraPaise = Math.max(0, amountPaise - due);
        left.set(student.id, Math.max(0, due - amountPaise));
      }
      const normalized = {
        studentId: student?.id ?? null,
        name: student ? [student.firstName, student.lastName].filter(Boolean).join(' ') : '',
        admissionNo,
        amountPaise,
        paidOn,
        method,
        referenceNo,
        notes: note,
        extraPaise,
      };
      return { rowNumber, raw, normalized, errors, status };
    });
  }

  async importPastPayment(n: { studentId: string; amountPaise: number; paidOn: string; method: Method; referenceNo: string | null; notes: string | null }): Promise<string> {
    const notes = ['From the school’s earlier records', n.notes].filter(Boolean).join(' · ');
    return this.payments.recordPast({ ...n, notes });
  }
}

/** "Ananya Mishra · 1376 · ₹12,500 on 15 Jul 2026 · Cash · ₹500 kept as advance" */
export function summarizePayment(n: Record<string, unknown>): string | null {
  if (!n.name || typeof n.amountPaise !== 'number' || typeof n.paidOn !== 'string') return null;
  const extra = typeof n.extraPaise === 'number' && n.extraPaise > 0 ? `${formatRupees(n.extraPaise)} kept as advance` : null;
  return [n.name, n.admissionNo, `${formatRupees(n.amountPaise)} on ${shortDate(n.paidOn)}`, n.method ? LABEL[n.method as Method] : null, extra].filter(Boolean).join(' · ');
}
