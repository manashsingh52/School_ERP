import { z } from 'zod';
import { pageQuerySchema, uuidSchema } from './common.js';

/** All money is integer paise (₹1 = 100 paise) — never floats. */
const paise = z.number().int().min(0).max(1_000_000_000);
const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });

// ---------------------------------------------------------------- fee heads

export const feeHeadTypeSchema = z.enum(['TUITION', 'ADMISSION', 'EXAM', 'TRANSPORT', 'ACTIVITY', 'OTHER']);
export const feeHeadSchema = z.object({
  name: z.string().trim().min(1, 'Name the fee').max(60),
  code: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Z0-9_-]+$/i, 'Letters, digits, - or _')
    .transform((v) => v.toUpperCase()),
  type: feeHeadTypeSchema,
  frequency: z.enum(['ONE_TIME', 'RECURRING']).default('RECURRING'),
  isOptional: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type FeeHeadRequest = z.input<typeof feeHeadSchema>;

export interface FeeHeadItem {
  id: string;
  name: string;
  code: string;
  type: z.infer<typeof feeHeadTypeSchema>;
  frequency: 'ONE_TIME' | 'RECURRING';
  isOptional: boolean;
  isActive: boolean;
}

// ---------------------------------------------------------------- fee structures

export const lateFeeRuleSchema = z
  .object({
    graceDays: z.number().int().min(0).max(90).default(0),
    calc: z.enum(['FLAT', 'PER_DAY', 'PERCENT']),
    /** FLAT / PER_DAY amount in paise. */
    valuePaise: paise.nullable().optional(),
    /** PERCENT in basis points (1% = 100). */
    valueBasisPoints: z.number().int().min(1).max(10_000).nullable().optional(),
    /** Cap for PER_DAY (and PERCENT). */
    maxPaise: paise.nullable().optional(),
  })
  .refine((r) => (r.calc === 'PERCENT' ? !!r.valueBasisPoints : !!r.valuePaise), { path: ['valuePaise'], message: 'Enter the late fee amount' });

export const feeStructureSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the structure').max(80),
    classIds: z.array(uuidSchema).min(1, 'Choose at least one class').max(30),
    items: z
      .array(z.object({ feeHeadId: uuidSchema, amountPaise: paise.positive('More than 0'), isOptional: z.boolean().default(false) }))
      .min(1, 'Add at least one fee')
      .max(30),
    installments: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Name the installment').max(40),
          dueDate: dateOnly,
          /** feeHeadId → amount (paise) of that fee due in this installment. */
          splits: z.record(z.string(), paise),
        }),
      )
      .min(1, 'Add at least one installment')
      .max(12),
    lateFee: lateFeeRuleSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const heads = new Set<string>();
    v.items.forEach((it, i) => {
      if (heads.has(it.feeHeadId)) ctx.addIssue({ code: 'custom', path: ['items', i, 'feeHeadId'], message: 'Added twice' });
      heads.add(it.feeHeadId);
      const split = v.installments.reduce((sum, ins) => sum + (ins.splits[it.feeHeadId] ?? 0), 0);
      if (split !== it.amountPaise) ctx.addIssue({ code: 'custom', path: ['items', i, 'amountPaise'], message: 'Installments must add up to this amount' });
    });
    v.installments.forEach((ins, i) => {
      for (const id of Object.keys(ins.splits)) if (!heads.has(id)) ctx.addIssue({ code: 'custom', path: ['installments', i, 'splits'], message: 'Uses a fee that is not in the structure' });
      const prev = v.installments[i - 1];
      if (prev && ins.dueDate < prev.dueDate) ctx.addIssue({ code: 'custom', path: ['installments', i, 'dueDate'], message: 'Due before the previous installment' });
    });
  });
export type FeeStructureRequest = z.input<typeof feeStructureSchema>;

export interface FeeStructureItem {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  classes: { id: string; name: string }[];
  items: { id: string; feeHead: { id: string; name: string; code: string }; amountPaise: number; isOptional: boolean }[];
  installments: { id: string; name: string; dueDate: string; order: number; amountPaise: number; splits: Record<string, number> }[];
  lateFee: z.output<typeof lateFeeRuleSchema> | null;
  /** Mandatory fees per student per year. */
  annualPaise: number;
  invoices: number;
  createdAt: string;
}

// ---------------------------------------------------------------- concessions

export const concessionKindSchema = z.enum(['SIBLING', 'SCHOLARSHIP', 'STAFF_WARD', 'MERIT', 'NEED_BASED', 'OTHER']);
export const concessionTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: concessionKindSchema,
    calc: z.enum(['FLAT', 'PERCENT']),
    /** FLAT: paise off each invoice, per fee it applies to. */
    valuePaise: paise.nullable().optional(),
    valueBasisPoints: z.number().int().min(1).max(10_000).nullable().optional(),
    /** Empty = every fee. */
    feeHeadIds: z.array(uuidSchema).max(30).default([]),
    requiresApproval: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine((c) => (c.calc === 'PERCENT' ? !!c.valueBasisPoints : !!c.valuePaise), { path: ['valuePaise'], message: 'Enter the concession amount' });
export type ConcessionTypeRequest = z.input<typeof concessionTypeSchema>;

export interface ConcessionTypeItem {
  id: string;
  name: string;
  kind: z.infer<typeof concessionKindSchema>;
  calc: 'FLAT' | 'PERCENT';
  valuePaise: number | null;
  valueBasisPoints: number | null;
  feeHeadIds: string[];
  requiresApproval: boolean;
  isActive: boolean;
}

export const requestConcessionSchema = z.object({
  studentId: uuidSchema,
  concessionTypeId: uuidSchema,
  /** Optional per-student value (paise or basis points, per the type). */
  overrideValue: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
  reason: z.string().trim().max(300).optional(),
});

export const decideConcessionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'REVOKED']), note: z.string().trim().max(300).optional() });
export const listConcessionsQuerySchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']).optional(), studentId: uuidSchema.optional() });

export interface StudentConcessionItem {
  id: string;
  student: { id: string; name: string; classLabel: string | null };
  type: { id: string; name: string; calc: 'FLAT' | 'PERCENT'; valuePaise: number | null; valueBasisPoints: number | null };
  overrideValue: number | null;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  requestedBy: string;
  decidedAt: string | null;
  createdAt: string;
}

export const studentFeeOptionsSchema = z.object({ optedOptionalItemIds: z.array(uuidSchema).max(30) });

// ---------------------------------------------------------------- invoices

export const generateInvoicesSchema = z.object({
  installmentId: uuidSchema,
  /** Omit for every class in the structure. */
  classIds: z.array(uuidSchema).max(30).optional(),
});

export interface InvoicePreview {
  installment: { id: string; name: string; dueDate: string; structure: string };
  students: number;
  toCreate: number;
  alreadyInvoiced: number;
  totalPaise: number;
  concessionPaise: number;
  sample: { student: string; classLabel: string | null; lines: { description: string; amountPaise: number }[]; totalPaise: number }[];
}

export const invoiceStatusSchema = z.enum(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);
export const listInvoicesQuerySchema = pageQuerySchema.extend({
  status: invoiceStatusSchema.optional(),
  overdue: z.enum(['true', 'false']).optional(),
  studentId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  installmentId: uuidSchema.optional(),
});

export interface InvoiceLineItem {
  id: string;
  kind: 'FEE' | 'CONCESSION' | 'LATE_FEE' | 'ADJUSTMENT';
  description: string;
  amountPaise: number;
  reason: string | null;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  number: string;
  student: { id: string; name: string; admissionNo: string; classLabel: string | null };
  installment: { id: string; name: string } | null;
  issueDate: string;
  dueDate: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  overdue: boolean;
  subtotalPaise: number;
  concessionPaise: number;
  lateFeePaise: number;
  adjustmentPaise: number;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  version: number;
}

export interface InvoiceDetail extends InvoiceItem {
  lines: InvoiceLineItem[];
  payments: { paymentId: string; receiptNo: string | null; method: string; amountPaise: number; receivedAt: string; voided: boolean }[];
  cancelledAt: string | null;
  cancelReason: string | null;
}

export const adjustInvoiceSchema = z.object({
  /** Positive adds to the bill, negative reduces it. */
  amountPaise: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((v) => v !== 0, 'Enter an amount'),
  reason: z.string().trim().min(3, 'Say why').max(300),
  version: z.number().int().optional(),
});
export const cancelInvoiceSchema = z.object({ reason: z.string().trim().min(3, 'Say why').max(300), version: z.number().int().optional() });

// ---------------------------------------------------------------- payments

export const counterMethodSchema = z.enum(['CASH', 'UPI_DIRECT', 'BANK_TRANSFER', 'POS_CARD']);
export const collectPaymentSchema = z
  .object({
    studentId: uuidSchema,
    /** Whole invoices only (no part payments): the amount must equal their balances. */
    invoiceIds: z.array(uuidSchema).min(1, 'Choose what is being paid').max(24),
    amountPaise: paise.positive(),
    method: counterMethodSchema,
    referenceNo: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.method === 'CASH' || !!v.referenceNo, { path: ['referenceNo'], message: 'Enter the transaction / UTR reference' });
export type CollectPaymentRequest = z.input<typeof collectPaymentSchema>;

export const voidPaymentSchema = z.object({ reason: z.string().trim().min(3, 'Say why').max(300) });
export const refundPaymentSchema = z.object({ amountPaise: paise.positive(), reason: z.string().trim().min(3, 'Say why').max(300) });

export const listPaymentsQuerySchema = pageQuerySchema.extend({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  method: z.enum(['ONLINE', 'CASH', 'BANK_TRANSFER', 'UPI_DIRECT', 'POS_CARD']).optional(),
  studentId: uuidSchema.optional(),
  status: z.enum(['CAPTURED', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
});

export interface PaymentItem {
  id: string;
  student: { id: string; name: string; admissionNo: string; classLabel: string | null };
  amountPaise: number;
  method: 'ONLINE' | 'CASH' | 'BANK_TRANSFER' | 'UPI_DIRECT' | 'POS_CARD';
  gatewayMethod: string | null;
  status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'VOIDED';
  referenceNo: string | null;
  gatewayPaymentId: string | null;
  receiptNo: string | null;
  receiptReady: boolean;
  receivedAt: string;
  collectedBy: string | null;
  refundedPaise: number;
  creditPaise: number;
  allocations: { invoiceId: string; invoiceNumber: string; amountPaise: number }[];
  voidReason: string | null;
}

export interface DayClose {
  date: string;
  totalPaise: number;
  count: number;
  byMethod: { method: string; count: number; amountPaise: number }[];
  byCollector: { collector: string; count: number; amountPaise: number }[];
  voided: { count: number; amountPaise: number };
  payments: PaymentItem[];
}

export interface StudentFeeStatement {
  student: { id: string; name: string; admissionNo: string; classLabel: string | null };
  totals: { invoicedPaise: number; paidPaise: number; balancePaise: number; overduePaise: number; creditPaise: number };
  invoices: InvoiceItem[];
  payments: PaymentItem[];
  credits: { id: string; amountPaise: number; consumedPaise: number; source: string; note: string | null; createdAt: string }[];
  onlinePayments: boolean;
}

export const applyCreditSchema = z.object({ invoiceId: uuidSchema });

// ---------------------------------------------------------------- online (gateway)

export const gatewayAccountSchema = z.object({
  mode: z.enum(['TEST', 'LIVE']),
  keyId: z
    .string()
    .trim()
    .regex(/^rzp_(test|live)_[A-Za-z0-9]{6,32}$/, 'Looks like rzp_test_… or rzp_live_…'),
  keySecret: z.string().trim().min(8).max(100),
});
export type GatewayAccountRequest = z.input<typeof gatewayAccountSchema>;

export interface GatewayAccountItem {
  mode: 'TEST' | 'LIVE';
  keyId: string;
  isActive: boolean;
  verifiedAt: string | null;
  webhookUrl: string;
  createdAt: string;
}

export interface GatewayStatus {
  provider: 'RAZORPAY';
  /** mock = development sandbox (no real money); razorpay = real API. */
  driver: 'mock' | 'razorpay';
  accounts: GatewayAccountItem[];
  /** Which account parents pay through, if any. */
  activeMode: 'TEST' | 'LIVE' | null;
}

export interface GatewayConnected {
  account: GatewayAccountItem;
  /** Shown once: paste into the Razorpay dashboard webhook settings. */
  webhookSecret: string;
  events: string[];
}

export const createOnlineOrderSchema = z.object({ studentId: uuidSchema, invoiceIds: z.array(uuidSchema).min(1).max(24) });

export interface OnlineOrder {
  orderId: string;
  providerOrderId: string;
  keyId: string;
  amountPaise: number;
  currency: 'INR';
  mode: 'TEST' | 'LIVE';
  driver: 'mock' | 'razorpay';
  schoolName: string;
  prefill: { name: string | null; email: string | null; contact: string | null };
  description: string;
}

export const verifyOnlinePaymentSchema = z.object({
  providerOrderId: z.string().min(6).max(64),
  providerPaymentId: z.string().min(6).max(64),
  signature: z.string().min(16).max(256),
});

export interface OnlinePaymentResult {
  status: 'PAID' | 'PENDING' | 'FAILED';
  paymentId: string | null;
  receiptNo: string | null;
  message: string;
}

/** Development sandbox only: simulate the checkout outcome. */
export const mockCheckoutSchema = z.object({ providerOrderId: z.string().min(6), outcome: z.enum(['success', 'failure']), method: z.enum(['upi', 'card', 'netbanking']).default('upi') });

// ---------------------------------------------------------------- reports

export const reportRangeQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  classId: uuidSchema.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/** Indian grouping: 123456789 paise → "₹12,34,567.89". */
export function formatRupees(paiseValue: number, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const negative = paiseValue < 0;
  const abs = Math.abs(paiseValue);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  const decimals = opts.decimals ?? p !== 0;
  return `${negative ? '−' : ''}${opts.symbol === false ? '' : '₹'}${grouped}${decimals ? `.${String(p).padStart(2, '0')}` : ''}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

/** Amount in words, Indian system: 125050 paise → "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only". */
export function rupeesInWords(paiseValue: number): string {
  const rupees = Math.floor(Math.abs(paiseValue) / 100);
  const p = Math.abs(paiseValue) % 100;
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  const words = parts.join(' ') || 'Zero';
  return `Rupees ${words}${p ? ` and ${twoDigits(p)} Paise` : ''} Only`;
}
