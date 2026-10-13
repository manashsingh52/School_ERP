import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  renderTemplate,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationEventDef,
  type NotificationItem,
  type NotificationRuleItem,
  type updateNotificationRulesSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { ChannelGateway } from '../../core/notify/channel-gateway.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface NotifyRequest {
  event: NotificationEvent;
  /** One entry per recipient; vars fill the event's template for that person. */
  recipients: { membershipId: string; vars: Record<string, string | number | null | undefined>; data?: Record<string, unknown> }[];
  /** Skip recipients who already got a notification with this key (e.g. "absent:<student>:<date>"). */
  dedupeKey?: (membershipId: string, index: number) => string;
  /** Inbox only, no push/SMS/email (e.g. a notice the author chose not to push). */
  inAppOnly?: boolean;
}

/**
 * The central notification engine (Master Prompt §39):
 *   event → school's rule (on/off, channels) → template → one in-app notification per person
 *   → one delivery job per extra channel (push / SMS / email), retried by the queue.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly gateway: ChannelGateway,
    private readonly audit: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.notifications, 'deliver', (data) => this.deliver(String(data.deliveryId)));
  }

  // ---------------------------------------------------------------- sending

  async notify(req: NotifyRequest): Promise<number> {
    const rule = await this.rule(req.event);
    if (!rule.enabled || !req.recipients.length) return 0;
    const def = NOTIFICATION_EVENTS[req.event];

    let recipients = req.recipients.map((r, i) => ({ ...r, dedupe: req.dedupeKey?.(r.membershipId, i) }));
    if (req.dedupeKey) {
      const existing = await this.prisma.db.notification.findMany({
        where: {
          event: req.event,
          OR: recipients.map((r) => ({ membershipId: r.membershipId, data: { path: ['dedupeKey'], equals: r.dedupe! } })),
        },
        select: { membershipId: true, data: true },
      });
      const seen = new Set(existing.map((n) => `${n.membershipId}|${(n.data as { dedupeKey?: string }).dedupeKey}`));
      recipients = recipients.filter((r) => !seen.has(`${r.membershipId}|${r.dedupe}`));
    }
    if (!recipients.length) return 0;

    const extra = req.inAppOnly ? [] : rule.channels.filter((c): c is Exclude<NotificationChannel, 'IN_APP'> => c !== 'IN_APP');
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
    for (const r of recipients) {
      const id = randomUUID();
      notifications.push({
        id,
        membershipId: r.membershipId,
        event: req.event,
        title: renderTemplate(def.title, r.vars),
        body: renderTemplate(def.body, r.vars),
        data: { ...(r.data ?? {}), ...(r.dedupe ? { dedupeKey: r.dedupe } : {}) } as Prisma.InputJsonValue,
      } as Prisma.NotificationCreateManyInput);
      for (const channel of extra) deliveries.push({ id: randomUUID(), notificationId: id, channel } as Prisma.NotificationDeliveryCreateManyInput);
    }

    await this.prisma.tenantTx(async (tx) => {
      await tx.notification.createMany({ data: notifications });
      if (deliveries.length) await tx.notificationDelivery.createMany({ data: deliveries });
    });
    const { schoolId } = RequestContextStore.school();
    for (const d of deliveries) {
      await this.queues.add(QUEUES.notifications, 'deliver', { schoolId, deliveryId: d.id as string }, { jobId: `delivery-${d.id}` });
    }
    this.logger.info({ event: req.event, recipients: notifications.length, deliveries: deliveries.length }, 'notifications created');
    return notifications.length;
  }

  /** Queue processor: one channel delivery. Errors are retried by BullMQ with backoff. */
  private async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.db.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: { include: { membership: { include: { user: { select: { id: true, phone: true, email: true } } } } } } },
    });
    if (!delivery || delivery.status !== 'QUEUED') return;
    const user = delivery.notification.membership.user;
    try {
      const result = await this.gateway.send({
        channel: delivery.channel as 'PUSH' | 'SMS' | 'EMAIL',
        userId: user.id,
        phone: user.phone,
        email: user.email,
        title: delivery.notification.title,
        body: delivery.notification.body,
        data: delivery.notification.data as Record<string, unknown>,
      });
      await this.prisma.db.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: result.status,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          lastError: result.reason,
          attempts: { increment: 1 },
          sentAt: result.status === 'SENT' ? new Date() : undefined,
        },
      });
    } catch (error) {
      await this.prisma.db.notificationDelivery.update({
        where: { id: deliveryId },
        data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 300) : 'error' },
      });
      throw error;
    }
  }

  // ---------------------------------------------------------------- rules

  private async rule(event: NotificationEvent): Promise<{ enabled: boolean; channels: NotificationChannel[] }> {
    const def: NotificationEventDef = NOTIFICATION_EVENTS[event];
    if (def.personal) return { enabled: true, channels: [...def.defaultChannels] };
    const row = await this.prisma.db.notificationRule.findUnique({ where: { schoolId_event: { schoolId: RequestContextStore.school().schoolId, event } } });
    if (!row) return { enabled: def.defaultEnabled, channels: [...def.defaultChannels] };
    const allowed = new Set<string>(def.channels);
    return { enabled: row.enabled, channels: ['IN_APP', ...row.channels.filter((c) => c !== 'IN_APP' && allowed.has(c))] as NotificationChannel[] };
  }

  async listRules(): Promise<NotificationRuleItem[]> {
    return Promise.all(
      NOTIFICATION_EVENT_KEYS.filter((e) => !(NOTIFICATION_EVENTS[e] as NotificationEventDef).personal).map(async (event) => {
        const def = NOTIFICATION_EVENTS[event];
        const rule = await this.rule(event);
        return {
          event,
          label: def.label,
          description: def.description,
          audience: def.audience,
          enabled: rule.enabled,
          channels: rule.channels,
          availableChannels: [...def.channels],
        };
      }),
    );
  }

  async updateRules(input: z.output<typeof updateNotificationRulesSchema>): Promise<NotificationRuleItem[]> {
    await this.prisma.tenantTx(async (tx) => {
      for (const r of input.rules) {
        const allowed = new Set<string>(NOTIFICATION_EVENTS[r.event].channels);
        const channels = [...new Set(['IN_APP', ...r.channels.filter((c) => allowed.has(c))])] as NotificationChannel[];
        await tx.notificationRule.upsert({
          where: { schoolId_event: { schoolId: RequestContextStore.school().schoolId, event: r.event } },
          create: { event: r.event, enabled: r.enabled, channels } as Prisma.NotificationRuleUncheckedCreateInput,
          update: { enabled: r.enabled, channels },
        });
      }
      await this.audit.record(tx, { action: 'notification_rules.update', entityType: 'NotificationRule', after: { rules: input.rules } });
    });
    return this.listRules();
  }

  // ---------------------------------------------------------------- inbox (the signed-in member's own)

  async inbox(query: { cursor?: string; limit: number; unread?: 'true' | 'false' }) {
    const { membershipId } = RequestContextStore.tenant();
    const rows = await this.prisma.db.notification.findMany({
      where: { membershipId, ...(query.unread === 'true' ? { readAt: null } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map(toItem),
      page: { nextCursor: rows.length > query.limit ? page.at(-1)!.id : null, hasMore: rows.length > query.limit },
    };
  }

  async unreadCount(): Promise<number> {
    return this.prisma.db.notification.count({ where: { membershipId: RequestContextStore.tenant().membershipId, readAt: null } });
  }

  async markRead(id: string): Promise<void> {
    const { membershipId } = RequestContextStore.tenant();
    const updated = await this.prisma.db.notification.updateMany({ where: { id, membershipId, readAt: null }, data: { readAt: new Date() } });
    if (!updated.count && !(await this.prisma.db.notification.findFirst({ where: { id, membershipId }, select: { id: true } }))) {
      throw AppError.notFound('notification');
    }
  }

  async markAllRead(): Promise<number> {
    const { membershipId } = RequestContextStore.tenant();
    return (await this.prisma.db.notification.updateMany({ where: { membershipId, readAt: null }, data: { readAt: new Date() } })).count;
  }

  // ---------------------------------------------------------------- recipients

  /** Guardians (with a login) of these students who want notifications. */
  async guardiansOf(studentIds: string[]): Promise<{ membershipId: string; studentId: string }[]> {
    if (!studentIds.length) return [];
    const links = await this.prisma.db.studentGuardian.findMany({
      where: { studentId: { in: studentIds }, receivesNotifications: true, guardian: { membershipId: { not: null }, archivedAt: null } },
      select: { studentId: true, guardian: { select: { membershipId: true } } },
    });
    return links.map((l) => ({ membershipId: l.guardian.membershipId!, studentId: l.studentId }));
  }
}

function toItem(n: { id: string; event: string; title: string; body: string; data: unknown; readAt: Date | null; createdAt: Date }): NotificationItem {
  const { dedupeKey: _hidden, ...data } = (n.data ?? {}) as Record<string, unknown>;
  return { id: n.id, event: n.event, title: n.title, body: n.body, data, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() };
}
