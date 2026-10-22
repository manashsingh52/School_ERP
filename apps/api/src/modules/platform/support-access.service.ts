import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { PERMISSIONS, type Permission } from '@schoolos/permissions';
import type { SupportGrantItem, requestSupportAccessSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { AccessService } from '../../core/auth/access.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PlatformPrismaService, PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { SchedulerService } from '../../core/queue/scheduler.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PlatformService } from './platform.service.js';

type In<T extends z.ZodType> = z.output<T>;
type GrantRow = Prisma.SupportAccessGrantGetPayload<{ include: { school: { select: { id: true; name: true; slug: true } } } }>;

export const SUPPORT_ROLE_KEY = 'platform_support';
const HOUR = 3_600_000;
/** Read-only: every "view" permission (school-wide) except guardians' contact details. */
const SUPPORT_GRANTS = (Object.keys(PERMISSIONS) as Permission[]).filter(
  (p) => (p.endsWith('.view') && p !== 'student.contact.view') || p === 'report.academic' || p === 'report.finance',
);

/**
 * Time-boxed support access (docs/09 §8). Support asks with a reason → the school's admin approves
 * → the support user gets a read-only membership until it expires or the school revokes it.
 * Nothing happens without the school's say-so, and every step is in both audit trails.
 *
 * Duration lives in the row: a pending request's `expiresAt − createdAt` is the time asked for;
 * on approval the window restarts from now.
 */
@Injectable()
export class SupportAccessService implements OnModuleInit {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly queues: QueueService,
    private readonly scheduler: SchedulerService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.maintenance, 'support-expire', async () => {
      await this.expireDue();
    });
    // A delayed job ends each grant on the minute; this sweep is the safety net.
    this.scheduler.register({ name: 'support-expire', queue: QUEUES.maintenance, job: 'support-expire', due: (c) => c.minute % 15 === 0, bucket: (c) => `${c.date}T${c.hhmm}` });
  }

  static status(g: { approvedByUserId: string | null; revokedAt: Date | null; expiresAt: Date }, now = Date.now()): SupportGrantItem['status'] {
    if (g.revokedAt) return 'REVOKED';
    if (g.expiresAt.getTime() <= now) return 'EXPIRED';
    return g.approvedByUserId ? 'ACTIVE' : 'PENDING';
  }

  private async toItems(rows: GrantRow[]): Promise<SupportGrantItem[]> {
    const ids = [...new Set(rows.flatMap((r) => [r.platformUserId, r.approvedByUserId]).filter((x): x is string => !!x))];
    const users = await this.platform.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return rows.map((r) => ({
      id: r.id,
      school: r.school,
      requestedBy: { id: r.platformUserId, name: name(r.platformUserId) ?? 'Bastaa support' },
      reason: r.reason,
      mode: r.mode,
      status: SupportAccessService.status(r),
      approvedBy: name(r.approvedByUserId),
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------- platform side

  async request(input: In<typeof requestSupportAccessSchema>): Promise<SupportGrantItem> {
    const userId = RequestContextStore.get()!.userId!;
    const school = await this.platform.school.findUnique({ where: { id: input.schoolId }, select: { id: true, status: true } });
    if (!school) throw AppError.notFound('school');
    const open = await this.platform.supportAccessGrant.findFirst({ where: { schoolId: input.schoolId, platformUserId: userId, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (open) throw new AppError('ALREADY_REQUESTED', 409, open.approvedByUserId ? 'You already have access to this school.' : 'You already asked this school — wait for their admin to respond.');
    const now = Date.now();
    const grant = await this.platform.supportAccessGrant.create({
      data: { schoolId: input.schoolId, platformUserId: userId, reason: input.reason, mode: 'READ_ONLY', createdAt: new Date(now), expiresAt: new Date(now + input.hours * HOUR) },
      include: { school: { select: { id: true, name: true, slug: true } } },
    });
    await this.platformAdmin.audit('support.request', 'SupportAccessGrant', grant.id, { schoolId: input.schoolId, metadata: { reason: input.reason, hours: input.hours } });
    // The school hears about it from its own context: in-app (and email) to every admin.
    const requester = (await this.platform.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? 'Bastaa support';
    await RequestContextStore.runAsSystem(input.schoolId, `support_${grant.id}`, async () => {
      const admins = await this.prisma.db.membership.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { key: 'school_admin' } } } }, select: { id: true } });
      await this.notifications.notify({
        event: 'support.access_requested',
        recipients: admins.map((a) => ({ membershipId: a.id, vars: { requester, hours: input.hours, reason: input.reason }, data: { grantId: grant.id } })),
      });
    });
    return (await this.toItems([grant]))[0]!;
  }

  /** Grants this platform user has asked for (or, for super admins, all of them). */
  async mine(all: boolean): Promise<SupportGrantItem[]> {
    const ctx = RequestContextStore.get()!;
    const rows = await this.platform.supportAccessGrant.findMany({
      where: all && ctx.platformRole === 'SUPER_ADMIN' ? {} : { platformUserId: ctx.userId! },
      include: { school: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.toItems(rows);
  }

  // ---------------------------------------------------------------- school side

  async list(): Promise<SupportGrantItem[]> {
    const rows = await this.prisma.db.supportAccessGrant.findMany({ include: { school: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    return this.toItems(rows);
  }

  async approve(id: string): Promise<SupportGrantItem> {
    const ctx = RequestContextStore.tenant();
    const grant = await this.prisma.tenantTx(async (tx) => {
      const g = await tx.supportAccessGrant.findFirst({ where: { id } });
      if (!g) throw AppError.notFound('request');
      const status = SupportAccessService.status(g);
      if (status !== 'PENDING') throw new AppError('NOT_PENDING', 409, status === 'ACTIVE' ? 'This request is already approved.' : 'This request has lapsed. Support can ask again.');
      const existing = await tx.membership.findFirst({ where: { userId: g.platformUserId }, select: { id: true, roles: { select: { role: { select: { key: true } } } } } });
      if (existing && existing.roles.some((r) => r.role.key !== SUPPORT_ROLE_KEY)) throw new AppError('ALREADY_MEMBER', 409, 'This person is already a member of your school.');
      const now = Date.now();
      const expiresAt = new Date(now + (g.expiresAt.getTime() - g.createdAt.getTime()));
      const roleId = await this.supportRole(tx);
      const membership = { status: 'ACTIVE' as const, title: 'Bastaa support (read-only)', invitedAt: new Date(now), joinedAt: new Date(now) };
      if (existing) {
        // An earlier grant's membership (ended, not deleted — notifications etc. point at it).
        await tx.membership.update({ where: { id: existing.id }, data: membership });
        await tx.membershipRole.createMany({ data: [{ membershipId: existing.id, roleId, schoolId: ctx.schoolId }], skipDuplicates: true });
        this.access.invalidateMembership(existing.id);
      } else {
        await tx.membership.create({ data: { schoolId: ctx.schoolId, userId: g.platformUserId, ...membership, roles: { create: { roleId, schoolId: ctx.schoolId } } } });
      }
      const updated = await tx.supportAccessGrant.update({ where: { id }, data: { approvedByUserId: ctx.userId, expiresAt }, include: { school: { select: { id: true, name: true, slug: true } } } });
      await this.audit.record(tx, { action: 'support.approve', entityType: 'SupportAccessGrant', entityId: id, metadata: { reason: g.reason, expiresAt: expiresAt.toISOString() } });
      return updated;
    });
    await this.queues.add(QUEUES.maintenance, 'support-expire', { schoolId: grant.schoolId }, { jobId: `support-expire-${grant.id}`, delay: Math.max(0, grant.expiresAt.getTime() - Date.now()) + 1_000 });
    return (await this.toItems([grant]))[0]!;
  }

  async revoke(id: string): Promise<SupportGrantItem> {
    const grant = await this.prisma.tenantTx(async (tx) => {
      const g = await tx.supportAccessGrant.findFirst({ where: { id } });
      if (!g) throw AppError.notFound('request');
      if (g.revokedAt) throw new AppError('NOT_ACTIVE', 409, 'This access was already ended.');
      const updated = await tx.supportAccessGrant.update({ where: { id }, data: { revokedAt: new Date() }, include: { school: { select: { id: true, name: true, slug: true } } } });
      await this.endMembership(tx, g.platformUserId);
      await this.audit.record(tx, { action: g.approvedByUserId ? 'support.revoke' : 'support.decline', entityType: 'SupportAccessGrant', entityId: id });
      return updated;
    });
    this.access.clearAll();
    return (await this.toItems([grant]))[0]!;
  }

  /** End every approved grant in the current school whose time is up (job context). */
  async expireDue(): Promise<number> {
    const due = await this.prisma.db.supportAccessGrant.findMany({ where: { approvedByUserId: { not: null }, revokedAt: null, expiresAt: { lte: new Date() } } });
    let ended = 0;
    for (const g of due) {
      await this.prisma.tenantTx(async (tx) => {
        // Expiry is recorded as a system revocation so the grant's history is complete.
        await tx.supportAccessGrant.update({ where: { id: g.id }, data: { revokedAt: g.expiresAt } });
        if (await this.endMembership(tx, g.platformUserId)) ended++;
        await this.audit.record(tx, { action: 'support.expire', entityType: 'SupportAccessGrant', entityId: g.id });
      });
    }
    if (due.length) {
      this.access.clearAll();
      this.logger.info({ grants: due.length, ended }, 'support access expired');
    }
    return ended;
  }

  /** End the support user's membership — only one a grant created. Kept as REMOVED for history. */
  private async endMembership(tx: TenantTx, userId: string): Promise<boolean> {
    const m = await tx.membership.findFirst({ where: { userId, status: 'ACTIVE', roles: { some: { role: { key: SUPPORT_ROLE_KEY } } } }, select: { id: true } });
    if (!m) return false;
    await tx.membership.update({ where: { id: m.id }, data: { status: 'REMOVED' } });
    this.access.invalidateMembership(m.id);
    return true;
  }

  /** The school's read-only support role, created the first time it's needed. */
  private async supportRole(tx: TenantTx): Promise<string> {
    const existing = await tx.role.findFirst({ where: { key: SUPPORT_ROLE_KEY }, select: { id: true } });
    if (existing) return existing.id;
    const { schoolId } = RequestContextStore.school();
    const role = await tx.role.create({
      data: { schoolId, key: SUPPORT_ROLE_KEY, name: 'Bastaa support (read-only)', description: 'Temporary, approved access for the Bastaa support team. Removed automatically.', isSystem: true },
    });
    await tx.rolePermission.createMany({ data: SUPPORT_GRANTS.map((permission) => ({ roleId: role.id, schoolId, permission, scope: 'ALL' as const })) });
    return role.id;
  }
}
