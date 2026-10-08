import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  AuditItem,
  FeatureFlagItem,
  PlanItem,
  PlanLimits,
  PlatformDashboard,
  PlatformSchoolDetail,
  PlatformSchoolItem,
  PlatformUserItem,
  SubscriptionItem,
  SystemStatus,
  featureFlagSchema,
  listSchoolsQuerySchema,
  planSchema,
  platformAuditQuerySchema,
  provisionSchoolSchema,
  subscriptionSchema,
} from '@schoolos/contracts';
import { AccessService } from '../../core/auth/access.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { EntitlementsService } from '../../core/entitlements/entitlements.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { fromDate, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { SchoolsService } from '../schools/schools.service.js';

type In<T extends z.ZodType> = z.output<T>;
const DAY = 86_400_000;

/**
 * The super-admin console (docs/12 Phase 6): onboard, configure, monitor and support schools
 * without touching the database. Platform data — every write is audited as PLATFORM_ADMIN.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly schools: SchoolsService,
    private readonly entitlements: EntitlementsService,
    private readonly queues: QueueService,
    private readonly access: AccessService,
  ) {}

  /** Audit a platform action (optionally about one school). */
  async audit(action: string, entityType: string, entityId: string | null, data: { schoolId?: string | null; before?: unknown; after?: unknown; metadata?: unknown } = {}) {
    const ctx = RequestContextStore.get();
    await this.platform.auditLog.create({
      data: {
        schoolId: data.schoolId ?? null,
        actorType: 'PLATFORM_ADMIN',
        actorUserId: ctx?.userId ?? null,
        action,
        entityType,
        entityId,
        before: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: { ...((data.metadata as object) ?? {}), platformRole: ctx?.platformRole } as Prisma.InputJsonValue,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }

  // ---------------------------------------------------------------- dashboard

  async dashboard(): Promise<PlatformDashboard> {
    const now = Date.now();
    const [byStatus, students, active, payments, subs, trials, outbox, webhooks, failed] = await Promise.all([
      this.platform.school.groupBy({ by: ['status'], _count: { _all: true } }),
      this.platform.student.count({ where: { status: 'ACTIVE', archivedAt: null } }),
      this.platform.session.findMany({ where: { lastUsedAt: { gte: new Date(now - 7 * DAY) } }, select: { userId: true }, distinct: ['userId'] }),
      this.platform.payment.aggregate({ where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] }, receivedAt: { gte: new Date(now - 30 * DAY) } }, _count: { _all: true }, _sum: { amountPaise: true } }),
      this.platform.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.platform.subscription.findMany({ where: { status: 'TRIALING', trialEndsAt: { lte: new Date(now + 14 * DAY) } }, include: { school: { select: { name: true } } }, orderBy: { trialEndsAt: 'asc' }, take: 10 }),
      this.platform.outboxEvent.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'FAILED'] } }, _count: { _all: true } }),
      this.platform.webhookEvent.count({ where: { receivedAt: { gte: new Date(now - DAY) }, OR: [{ status: 'FAILED' }, { signatureValid: false }] } }),
      this.queues.failedJobs(100).catch(() => []),
    ]);
    const n = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
    const sub = (s: string) => subs.find((x) => x.status === s)?._count._all ?? 0;
    return {
      schools: { total: byStatus.reduce((a, x) => a + x._count._all, 0), active: n('ACTIVE'), onboarding: n('ONBOARDING'), suspended: n('SUSPENDED') },
      students,
      activeUsers7d: active.length,
      payments30d: { count: payments._count._all, amountPaise: payments._sum.amountPaise ?? 0 },
      subscriptions: { trialing: sub('TRIALING'), active: sub('ACTIVE'), pastDue: sub('PAST_DUE'), cancelled: sub('CANCELLED') },
      trialsEndingSoon: trials.map((t) => ({ schoolId: t.schoolId, name: t.school.name, trialEndsAt: t.trialEndsAt!.toISOString() })),
      health: {
        failedJobs: failed.length,
        outboxPending: outbox.find((x) => x.status === 'PENDING')?._count._all ?? 0,
        outboxFailed: outbox.find((x) => x.status === 'FAILED')?._count._all ?? 0,
        webhookFailures24h: webhooks,
      },
    };
  }

  // ---------------------------------------------------------------- schools

  async listSchools(q: In<typeof listSchoolsQuerySchema>): Promise<PlatformSchoolItem[]> {
    const rows = await this.platform.school.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q.toLowerCase() } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      include: { subscription: { include: { plan: { select: { code: true, name: true } } } }, _count: { select: { students: { where: { status: 'ACTIVE', archivedAt: null } }, memberships: { where: { status: 'ACTIVE' } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const last = await this.platform.membership.groupBy({ by: ['schoolId'], where: { schoolId: { in: rows.map((r) => r.id) } }, _max: { lastActiveAt: true } });
    return rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      status: s.status,
      plan: s.subscription ? s.subscription.plan : null,
      subscriptionStatus: s.subscription?.status ?? null,
      trialEndsAt: s.subscription?.trialEndsAt?.toISOString() ?? null,
      students: s._count.students,
      members: s._count.memberships,
      lastActiveAt: last.find((l) => l.schoolId === s.id)?._max.lastActiveAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async school(id: string): Promise<PlatformSchoolDetail> {
    const item = (await this.listSchools({})).find((s) => s.id === id);
    const s = await this.platform.school.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } });
    if (!s || !item) throw AppError.notFound('school');
    const [entitlements, features, admins, teachers, guardians, invoices, paid] = await Promise.all([
      this.entitlements.entitlements(id),
      this.entitlements.features(id),
      this.platform.membership.findMany({ where: { schoolId: id, roles: { some: { role: { key: 'school_admin' } } } }, select: { status: true, user: { select: { name: true, phone: true, email: true } } } }),
      this.platform.teacher.count({ where: { schoolId: id, status: { not: 'LEFT' } } }),
      this.platform.guardian.count({ where: { schoolId: id, archivedAt: null } }),
      this.platform.invoice.count({ where: { schoolId: id, status: { not: 'CANCELLED' } } }),
      this.platform.payment.aggregate({ where: { schoolId: id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } }, _sum: { amountPaise: true } }),
    ]);
    return {
      ...item,
      board: s.board,
      city: s.city,
      phone: s.phone,
      email: s.email,
      subscription: s.subscription ? this.toSubscription(s.subscription) : null,
      entitlements,
      features,
      admins: admins.map((a) => ({ ...a.user, status: a.status })),
      counts: { teachers, guardians, invoices, paymentsPaise: paid._sum.amountPaise ?? 0 },
    };
  }

  private toSubscription(s: Prisma.SubscriptionGetPayload<{ include: { plan: true } }>): SubscriptionItem {
    return {
      plan: { id: s.plan.id, code: s.plan.code, name: s.plan.name },
      status: s.status,
      trialEndsAt: fromDate(s.trialEndsAt),
      currentPeriodStart: fromDate(s.currentPeriodStart),
      currentPeriodEnd: fromDate(s.currentPeriodEnd),
      limitOverrides: (s.limitOverrides as Partial<PlanLimits> | null) ?? null,
      notes: s.notes,
    };
  }

  /** New school + its first admin (invited: they sign in with a one-time code) + trial. */
  async provision(input: In<typeof provisionSchoolSchema>): Promise<PlatformSchoolDetail> {
    if (await this.platform.school.findUnique({ where: { slug: input.slug } })) {
      throw new AppError('DUPLICATE', 409, 'That web address is taken.', [{ field: 'slug', message: 'Already used' }]);
    }
    const plan = input.planId
      ? await this.platform.plan.findUnique({ where: { id: input.planId } })
      : await this.platform.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthlyPaise: { sort: 'asc', nulls: 'last' } } });
    if (input.planId && !plan) throw AppError.invalidReference('planId', 'plan');
    const school = await this.schools.createSchool({ slug: input.slug, name: input.name, board: input.board, status: 'ONBOARDING' });
    if (input.phone) await this.platform.school.update({ where: { id: school.id }, data: { phone: input.phone } });
    await this.schools.addMember({ schoolId: school.id, name: input.adminName, phone: input.adminPhone, email: input.adminEmail, roleKeys: ['school_admin'], status: 'INVITED' });
    if (plan) {
      await this.platform.subscription.create({
        data: { schoolId: school.id, planId: plan.id, status: input.trialDays ? 'TRIALING' : 'ACTIVE', trialEndsAt: input.trialDays ? new Date(Date.now() + input.trialDays * DAY) : null },
      });
    }
    await this.audit('school.provision', 'School', school.id, { schoolId: school.id, after: { ...input, adminPhone: '••••' } });
    return this.school(school.id);
  }

  async setStatus(id: string, status: PlatformSchoolItem['status'], reason: string): Promise<PlatformSchoolDetail> {
    const s = await this.platform.school.findUnique({ where: { id } });
    if (!s) throw AppError.notFound('school');
    await this.platform.school.update({ where: { id }, data: { status } });
    this.access.clearAll(); // suspended schools lose access now, not in 30 s
    await this.audit('school.status', 'School', id, { schoolId: id, before: { status: s.status }, after: { status }, metadata: { reason } });
    return this.school(id);
  }

  // ---------------------------------------------------------------- plans & subscriptions

  async plans(): Promise<PlanItem[]> {
    const rows = await this.platform.plan.findMany({ include: { _count: { select: { subscriptions: true } } }, orderBy: [{ priceMonthlyPaise: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }] });
    return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, limits: p.limits as PlanLimits, features: p.features, priceMonthlyPaise: p.priceMonthlyPaise, isActive: p.isActive, schools: p._count.subscriptions }));
  }

  async savePlan(id: string | null, input: In<typeof planSchema>): Promise<PlanItem> {
    const clash = await this.platform.plan.findFirst({ where: { code: input.code, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError('DUPLICATE', 409, 'A plan with this code exists.', [{ field: 'code', message: 'Already used' }]);
    const data = { code: input.code, name: input.name, limits: input.limits, features: input.features, priceMonthlyPaise: input.priceMonthlyPaise ?? null, isActive: input.isActive };
    const plan = id ? await this.platform.plan.update({ where: { id }, data }) : await this.platform.plan.create({ data });
    for (const sub of await this.platform.subscription.findMany({ where: { planId: plan.id }, select: { schoolId: true } })) this.entitlements.invalidate(sub.schoolId);
    await this.audit(id ? 'plan.update' : 'plan.create', 'Plan', plan.id, { after: data });
    return (await this.plans()).find((p) => p.id === plan.id)!;
  }

  async setSubscription(schoolId: string, input: In<typeof subscriptionSchema>): Promise<PlatformSchoolDetail> {
    if (!(await this.platform.school.findUnique({ where: { id: schoolId }, select: { id: true } }))) throw AppError.notFound('school');
    if (!(await this.platform.plan.findUnique({ where: { id: input.planId }, select: { id: true } }))) throw AppError.invalidReference('planId', 'plan');
    const before = await this.platform.subscription.findUnique({ where: { schoolId } });
    const data = {
      planId: input.planId,
      status: input.status,
      trialEndsAt: toDate(input.trialEndsAt ?? undefined) ?? null,
      currentPeriodStart: toDate(input.currentPeriodStart ?? undefined) ?? null,
      currentPeriodEnd: toDate(input.currentPeriodEnd ?? undefined) ?? null,
      limitOverrides: (input.limitOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
      notes: input.notes ?? null,
    };
    await this.platform.subscription.upsert({ where: { schoolId }, create: { schoolId, ...data }, update: data });
    this.entitlements.invalidate(schoolId);
    await this.audit('subscription.update', 'Subscription', schoolId, { schoolId, before, after: data });
    return this.school(schoolId);
  }

  // ---------------------------------------------------------------- feature flags

  async flags(): Promise<FeatureFlagItem[]> {
    const rows = await this.platform.featureFlag.findMany({ include: { _count: { select: { schools: true } } }, orderBy: { key: 'asc' } });
    return rows.map((f) => ({ key: f.key, description: f.description, defaultEnabled: f.defaultEnabled, killSwitch: f.killSwitch, overrides: f._count.schools }));
  }

  async saveFlag(input: In<typeof featureFlagSchema>): Promise<FeatureFlagItem[]> {
    const before = await this.platform.featureFlag.findUnique({ where: { key: input.key } });
    await this.platform.featureFlag.upsert({ where: { key: input.key }, create: input, update: { description: input.description, defaultEnabled: input.defaultEnabled, killSwitch: input.killSwitch } });
    await this.audit(before ? 'flag.update' : 'flag.create', 'FeatureFlag', input.key, { before, after: input });
    return this.flags();
  }

  /** Per-school override; null removes it (back to plan/default). */
  async setSchoolFeature(schoolId: string, key: string, enabled: boolean | null): Promise<PlatformSchoolDetail> {
    if (!(await this.platform.featureFlag.findUnique({ where: { key } }))) throw AppError.notFound('feature');
    if (!(await this.platform.school.findUnique({ where: { id: schoolId }, select: { id: true } }))) throw AppError.notFound('school');
    if (enabled === null) await this.platform.schoolFeature.deleteMany({ where: { schoolId, flagKey: key } });
    else {
      const userId = RequestContextStore.get()?.userId ?? null;
      await this.platform.schoolFeature.upsert({ where: { schoolId_flagKey: { schoolId, flagKey: key } }, create: { schoolId, flagKey: key, enabled, updatedById: userId }, update: { enabled, updatedById: userId } });
    }
    await this.audit('school.feature', 'SchoolFeature', key, { schoolId, after: { enabled } });
    return this.school(schoolId);
  }

  // ---------------------------------------------------------------- users

  async users(q: string): Promise<PlatformUserItem[]> {
    const digits = q.replace(/\D/g, '');
    const rows = await this.platform.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q.toLowerCase() } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-10) } }] : []),
        ],
      },
      include: {
        platformAdmin: { select: { role: true } },
        memberships: { include: { school: { select: { id: true, name: true, slug: true } }, roles: { select: { role: { select: { name: true } } } } } },
      },
      take: 25,
      orderBy: { name: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      status: u.status,
      platformRole: u.platformAdmin?.role ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      memberships: u.memberships.map((m) => ({ schoolId: m.school.id, school: m.school.name, slug: m.school.slug, roles: m.roles.map((r) => r.role.name), status: m.status })),
    }));
  }

  // ---------------------------------------------------------------- system & audit

  async system(): Promise<SystemStatus> {
    const started = Date.now();
    await this.platform.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    const [queues, failedJobs, outbox, failed24, invalid24] = await Promise.all([
      Promise.all(Object.values(QUEUES).map(async (q) => ({ queue: q, c: (await this.queues.counts(q)) as Record<string, number | undefined> }))),
      this.queues.failedJobs(50),
      this.platform.outboxEvent.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'FAILED'] } }, _count: { _all: true } }),
      this.platform.webhookEvent.count({ where: { receivedAt: { gte: new Date(Date.now() - DAY) }, status: 'FAILED', signatureValid: true } }),
      this.platform.webhookEvent.count({ where: { receivedAt: { gte: new Date(Date.now() - DAY) }, signatureValid: false } }),
    ]);
    return {
      queues: queues.map(({ queue, c }) => ({ queue, waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0, completed: c.completed ?? 0 })),
      failedJobs,
      outbox: { pending: outbox.find((o) => o.status === 'PENDING')?._count._all ?? 0, failed: outbox.find((o) => o.status === 'FAILED')?._count._all ?? 0 },
      webhooks: { failed24h: failed24, invalidSignature24h: invalid24 },
      database: { ok: true, latencyMs },
    };
  }

  async retryJob(queue: string, jobId: string): Promise<SystemStatus> {
    if (!(await this.queues.retry(queue, jobId))) throw AppError.notFound('failed job');
    await this.audit('system.job_retry', 'Job', jobId, { metadata: { queue } });
    return this.system();
  }

  async auditLog(q: In<typeof platformAuditQuerySchema>): Promise<{ data: AuditItem[]; page: { nextCursor: string | null } }> {
    const rows = await this.platform.auditLog.findMany({
      where: {
        ...(q.schoolId ? { schoolId: q.schoolId } : {}),
        ...(q.action ? { action: { startsWith: q.action } } : {}),
        ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
      },
      include: { school: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const users = await this.platform.user.findMany({ where: { id: { in: [...new Set(page.map((r) => r.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
    return { data: page.map((r) => toAuditItem(r, users)), page: { nextCursor: rows.length > q.limit ? page.at(-1)!.id : null } };
  }
}

export function toAuditItem(r: Prisma.AuditLogGetPayload<{ include: { school: { select: { id: true; name: true } } } }>, users: { id: string; name: string }[]): AuditItem {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    school: r.school,
    actor: { type: r.actorType === 'PLATFORM_ADMIN' ? 'PLATFORM' : r.actorType === 'USER' ? 'USER' : 'SYSTEM', name: users.find((u) => u.id === r.actorUserId)?.name ?? null },
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: typeof meta.reason === 'string' ? meta.reason : null,
    before: r.before,
    after: r.after,
    metadata: r.metadata,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  };
}
