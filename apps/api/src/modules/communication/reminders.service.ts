import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import type { ReminderItem, ReminderRepeat, createReminderSchema, listRemindersQuerySchema, updateReminderSchema } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { SchedulerService } from '../../core/queue/scheduler.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CommunicationPeople } from './people.js';

type Row = Prisma.ReminderGetPayload<object>;
const DAY = 86_400_000;

const weekday = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d);

/** The next time a repeating reminder goes off after `now` (same clock time). */
export function nextOccurrence(at: Date, repeat: ReminderRepeat, now: Date, timeZone = 'Asia/Kolkata'): Date | null {
  if (repeat === 'NONE') return null;
  const step = repeat === 'WEEKLY' ? 7 * DAY : DAY;
  let next = new Date(at.getTime() + step);
  while (next <= now || (repeat === 'WEEKDAYS' && weekday(next, timeZone) === 'Sun')) next = new Date(next.getTime() + step);
  return next;
}

/**
 * Personal reminders ("pick up Rahul at 1:30 PM"). Only the person who set one can see or change
 * it. The scheduler checks every minute and sends an in-app alert and a push to the phone; a one-off
 * reminder is then done, a repeating one moves to its next time.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly people: CommunicationPeople,
    private readonly notifications: NotificationsService,
    private readonly queues: QueueService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.maintenance, 'reminders-due', () => this.fireDue().then(() => undefined));
    this.scheduler.register({ name: 'reminders-due', queue: QUEUES.maintenance, job: 'reminders-due', due: () => true, bucket: (c) => `${c.date}T${c.hhmm}` });
  }

  private me() {
    return RequestContextStore.tenant().membershipId;
  }

  async list(query: z.output<typeof listRemindersQuerySchema>): Promise<ReminderItem[]> {
    const rows = await this.prisma.db.reminder.findMany({
      where: { memberId: this.me(), completedAt: query.status === 'active' ? null : { not: null } },
      orderBy: query.status === 'active' ? { remindAt: 'asc' } : { completedAt: 'desc' },
      take: 200,
    });
    return this.toItems(rows);
  }

  private async own(id: string): Promise<Row> {
    const row = await this.prisma.db.reminder.findUnique({ where: { id } });
    if (!row || row.memberId !== this.me()) throw AppError.notFound('reminder');
    return row;
  }

  private async checkStudent(studentId: string | null | undefined): Promise<void> {
    if (!studentId) return;
    if (!(await this.scope.canAccessStudent('student.view', studentId).catch(() => false))) throw AppError.invalidReference('studentId', 'student');
  }

  private checkFuture(remindAt: string): Date {
    const at = new Date(remindAt);
    if (at.getTime() <= Date.now()) throw new AppError('REMINDER_IN_PAST', 422, 'Pick a time in the future.', [{ field: 'remindAt', message: 'Pick a time in the future' }]);
    return at;
  }

  async create(input: z.output<typeof createReminderSchema>): Promise<ReminderItem> {
    await this.checkStudent(input.studentId);
    const row = await this.prisma.tenantTx((tx) =>
      tx.reminder.create({
        data: {
          memberId: this.me(),
          studentId: input.studentId ?? null,
          title: input.title,
          notes: input.notes || null,
          remindAt: this.checkFuture(input.remindAt),
          repeat: input.repeat,
        } as Prisma.ReminderUncheckedCreateInput,
      }),
    );
    return (await this.toItems([row]))[0]!;
  }

  async update(id: string, input: z.output<typeof updateReminderSchema>): Promise<ReminderItem> {
    const before = await this.own(id);
    await this.checkStudent(input.studentId);
    const reopening = input.completed === false && before.completedAt;
    // Reopening a reminder whose time has passed needs a new time.
    const remindAt = input.remindAt ? this.checkFuture(input.remindAt) : reopening && before.remindAt <= new Date() ? null : undefined;
    if (remindAt === null) throw new AppError('REMINDER_IN_PAST', 422, 'Pick a new time to turn this reminder back on.', [{ field: 'remindAt', message: 'Pick a new time' }]);
    const row = await this.prisma.tenantTx((tx) =>
      tx.reminder.update({
        where: { id },
        data: {
          title: input.title,
          notes: input.notes === undefined ? undefined : input.notes || null,
          remindAt,
          repeat: input.repeat,
          studentId: input.studentId === undefined ? undefined : input.studentId,
          completedAt: input.completed === true ? new Date() : input.completed === false || (remindAt && before.completedAt) ? null : undefined,
        },
      }),
    );
    return (await this.toItems([row]))[0]!;
  }

  async remove(id: string): Promise<void> {
    await this.own(id);
    await this.prisma.tenantTx((tx) => tx.reminder.delete({ where: { id } }));
  }

  private async toItems(rows: Row[]): Promise<ReminderItem[]> {
    const students = await this.people.students(rows.map((r) => r.studentId).filter((x): x is string => !!x));
    return rows.map((r) => {
      const s = r.studentId ? students.get(r.studentId) : undefined;
      return {
        id: r.id,
        title: r.title,
        notes: r.notes,
        remindAt: r.remindAt.toISOString(),
        repeat: r.repeat,
        student: s ? { id: s.id, name: s.name } : null,
        completedAt: r.completedAt?.toISOString() ?? null,
        lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** Scheduler (every minute, per school): send what's due, then finish or move each reminder on. */
  async fireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.db.reminder.findMany({ where: { completedAt: null, remindAt: { lte: now } }, take: 500 });
    if (!due.length) return 0;
    const school = await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { timezone: true } });
    const tz = school?.timezone ?? 'Asia/Kolkata';
    let sent = 0;
    for (const r of due) {
      sent += await this.notifications.notify({
        event: 'reminder.due',
        recipients: [{ membershipId: r.memberId, vars: { title: r.title, notes: r.notes ?? 'Your reminder is due now.' }, data: { route: '/reminders', reminderId: r.id } }],
        // The same alarm never goes off twice, even if this job is retried.
        dedupeKey: () => `reminder:${r.id}:${r.remindAt.toISOString()}`,
      });
      const next = nextOccurrence(r.remindAt, r.repeat, now, tz);
      await this.prisma.db.reminder.update({ where: { id: r.id }, data: next ? { remindAt: next, lastFiredAt: now } : { lastFiredAt: now, completedAt: now } });
    }
    return sent;
  }
}
