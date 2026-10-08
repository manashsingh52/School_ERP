import { z } from 'zod';
import { contactPhoneSchema, phoneSchema, uuidSchema } from './common.js';

// ---------------------------------------------------------------- plans & entitlements

/** null = unlimited. */
export const planLimitsSchema = z.object({
  students: z.number().int().min(1).nullable(),
  storageGb: z.number().min(0.1).nullable(),
  smsPerMonth: z.number().int().min(0).nullable(),
  aiCallsPerMonth: z.number().int().min(0).nullable(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[a-z0-9_-]+$/, 'Lower-case letters, digits, - or _'),
  name: z.string().trim().min(1).max(60),
  limits: planLimitsSchema,
  features: z.array(z.string().max(60)).max(50).default([]),
  priceMonthlyPaise: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type PlanRequest = z.input<typeof planSchema>;

export interface PlanItem {
  id: string;
  code: string;
  name: string;
  limits: PlanLimits;
  features: string[];
  priceMonthlyPaise: number | null;
  isActive: boolean;
  schools: number;
}

export const subscriptionSchema = z.object({
  planId: uuidSchema,
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED']),
  trialEndsAt: z.iso.date().nullable().optional(),
  currentPeriodStart: z.iso.date().nullable().optional(),
  currentPeriodEnd: z.iso.date().nullable().optional(),
  /** Per-school exceptions to the plan's limits. */
  limitOverrides: planLimitsSchema.partial().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export interface SubscriptionItem {
  plan: { id: string; code: string; name: string };
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  limitOverrides: Partial<PlanLimits> | null;
  notes: string | null;
}

/** What a school may use and what it has used (school settings → Billing, super admin). */
export interface Entitlements {
  plan: { code: string; name: string } | null;
  status: SubscriptionItem['status'] | null;
  limits: PlanLimits;
  usage: { students: number; storageBytes: number; smsThisMonth: number; aiCallsThisMonth: number };
  features: string[];
}

// ---------------------------------------------------------------- feature flags

export const featureFlagSchema = z.object({
  key: z.string().trim().min(2).max(60).regex(/^[a-z0-9_.-]+$/, 'Lower-case letters, digits, _ . -'),
  description: z.string().trim().min(1).max(200),
  defaultEnabled: z.boolean().default(false),
  killSwitch: z.boolean().default(false),
});
export interface FeatureFlagItem {
  key: string;
  description: string;
  defaultEnabled: boolean;
  killSwitch: boolean;
  overrides: number;
}
export const schoolFeatureSchema = z.object({ enabled: z.boolean().nullable() });

// ---------------------------------------------------------------- schools

export const provisionSchoolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, '3–32 lower-case letters, digits or -'),
  board: z.string().trim().max(20).optional(),
  phone: contactPhoneSchema.optional(),
  adminName: z.string().trim().min(2).max(100),
  adminPhone: phoneSchema,
  adminEmail: z.email().toLowerCase().optional(),
  planId: uuidSchema.optional(),
  trialDays: z.number().int().min(0).max(90).default(30),
});
export type ProvisionSchoolRequest = z.input<typeof provisionSchoolSchema>;

export const schoolStatusSchema = z.object({ status: z.enum(['ONBOARDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']), reason: z.string().trim().min(3).max(300) });

export const listSchoolsQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['ONBOARDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional() });

export interface PlatformSchoolItem {
  id: string;
  slug: string;
  name: string;
  status: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  plan: { code: string; name: string } | null;
  subscriptionStatus: SubscriptionItem['status'] | null;
  trialEndsAt: string | null;
  students: number;
  members: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface PlatformSchoolDetail extends PlatformSchoolItem {
  board: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  subscription: SubscriptionItem | null;
  entitlements: Entitlements;
  features: { key: string; description: string; enabled: boolean; source: 'kill_switch' | 'override' | 'plan' | 'default' }[];
  admins: { name: string; phone: string | null; email: string | null; status: string }[];
  counts: { teachers: number; guardians: number; invoices: number; paymentsPaise: number };
}

// ---------------------------------------------------------------- dashboard, users, system, audit

export interface PlatformDashboard {
  schools: { total: number; active: number; onboarding: number; suspended: number };
  students: number;
  activeUsers7d: number;
  payments30d: { count: number; amountPaise: number };
  subscriptions: { trialing: number; active: number; pastDue: number; cancelled: number };
  trialsEndingSoon: { schoolId: string; name: string; trialEndsAt: string }[];
  health: { failedJobs: number; outboxPending: number; outboxFailed: number; webhookFailures24h: number };
}

export const userLookupQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });
export interface PlatformUserItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  platformRole: 'SUPER_ADMIN' | 'SUPPORT' | null;
  lastLoginAt: string | null;
  memberships: { schoolId: string; school: string; slug: string; roles: string[]; status: string }[];
}

export interface QueueHealth {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}
export interface FailedJobItem {
  queue: string;
  id: string;
  name: string;
  schoolId: string | null;
  attempts: number;
  reason: string;
  failedAt: string | null;
}
export interface SystemStatus {
  queues: QueueHealth[];
  failedJobs: FailedJobItem[];
  outbox: { pending: number; failed: number };
  webhooks: { failed24h: number; invalidSignature24h: number };
  database: { ok: boolean; latencyMs: number };
}
export const retryJobSchema = z.object({ queue: z.string().min(1).max(40), jobId: z.string().min(1).max(200) });

export const platformAuditQuerySchema = z.object({
  schoolId: uuidSchema.optional(),
  action: z.string().trim().max(80).optional(),
  actorUserId: uuidSchema.optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(64).optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface AuditItem {
  id: string;
  school: { id: string; name: string } | null;
  actor: { type: 'USER' | 'SYSTEM' | 'PLATFORM'; name: string | null };
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- support access

export const requestSupportAccessSchema = z.object({
  schoolId: uuidSchema,
  reason: z.string().trim().min(10, 'Explain why (at least 10 characters)').max(500),
  hours: z.number().int().min(1).max(72).default(4),
});

export const supportGrantsQuerySchema = z.object({ all: z.enum(['true', 'false']).optional() });

export interface SupportGrantItem {
  id: string;
  school: { id: string; name: string; slug: string };
  requestedBy: { id: string; name: string };
  reason: string;
  mode: 'READ_ONLY' | 'FULL';
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  approvedBy: string | null;
  expiresAt: string;
  createdAt: string;
}
