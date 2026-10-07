import { z } from 'zod';

// Plain-language defaults for every schema (shown to end users by web, mobile and API).
z.config({
  customError: (issue) => {
    if (issue.code === 'invalid_type' && issue.input === undefined) return 'This field is required';
    if (issue.code === 'invalid_type') return 'This value has the wrong format';
    return undefined; // keep the schema's own message
  },
});

/** Normalises Indian mobile numbers to E.164 (+91XXXXXXXXXX). Other countries must include "+". */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(raw)) {
    if (raw.startsWith('+91')) return /^\+91[6-9]\d{9}$/.test(raw) ? raw : null;
    return raw;
  }
  const digits = raw.replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export const phoneSchema = z.string().trim().transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number' });
    return z.NEVER;
  }
  return phone;
});

/**
 * Office numbers: Indian mobiles OR landlines with STD code ("020 2612 3456" → +912026123456).
 * Use phoneSchema (mobile only) for anything that receives SMS.
 */
export const contactPhoneSchema = z.string().trim().transform((value, ctx) => {
  const mobile = normalizePhone(value);
  if (mobile) return mobile;
  const digits = value.replace(/[\s\-().]/g, '').replace(/^\+91/, '').replace(/^0/, '');
  if (/^[1-9]\d{9}$/.test(digits)) return `+91${digits}`;
  ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number with STD code' });
  return z.NEVER;
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

/** Phone or email, normalised. Used by login and password reset. */
export const identifierSchema = z
  .string()
  .trim()
  .min(3, 'Enter your phone number or email')
  .transform((value, ctx) => {
    if (value.includes('@')) {
      const parsed = emailSchema.safeParse(value);
      if (parsed.success) return { kind: 'email' as const, value: parsed.data };
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' });
      return z.NEVER;
    }
    const phone = normalizePhone(value);
    if (phone) return { kind: 'phone' as const, value: phone };
    ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number or email' });
    return z.NEVER;
  });
export type Identifier = z.output<typeof identifierSchema>;

export const uuidSchema = z.uuid({ message: 'Invalid id' });

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});
export type PageQuery = z.output<typeof pageQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface DataResponse<T> {
  data: T;
}

export interface PageResponse<T> {
  data: T[];
  page: PageMeta;
}

export interface ErrorDetail {
  field?: string;
  message: string;
}

/** Shape of every error response (docs/05-api-conventions.md §3). */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    requestId?: string;
    supportRef?: string;
  };
}
