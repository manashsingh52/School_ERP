import { randomBytes } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import type { MeetingItem, cancelMeetingSchema, createMeetingSchema, listMeetingsQuerySchema, updateMeetingSchema } from '@schoolos/contracts';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { SchedulerService } from '../../core/queue/scheduler.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CommunicationPeople } from './people.js';

type Row = Prisma.MeetingGetPayload<object>;

const JOIN_EARLY_MS = 15 * 60_000;
const GRACE_MS = 30 * 60_000;

/** "Tue 14 Oct, 4:30 PM" in the school's time. */
const when = (d: Date, timeZone = 'Asia/Kolkata') =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(d).replace(/ (am|pm)$/i, (m) => m.toUpperCase());
const time = (d: Date, timeZone = 'Asia/Kolkata') => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(d).toUpperCase();

/**
 * Parent–teacher video meetings. A teacher (or the office) books a slot about one child; the
 * child's parents are told, reminded 15 minutes before, and join a Jitsi room from the app or a
 * browser — no paid video service. The room name is random, so only people given the link can find it.
 */
@Injectable()
export class MeetingsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly people: CommunicationPeople,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly queues: QueueService,
    private readonly scheduler: SchedulerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.maintenance, 'meeting-reminders', () => this.remindStarting().then(() => undefined));
    this.scheduler.register({ name: 'meeting-reminders', queue: QUEUES.maintenance, job: 'meeting-reminders', due: () => true, bucket: (c) => `${c.date}T${c.hhmm}` });
  }

  private me() {
    return RequestContextStore.tenant().membershipId;
  }

  private async timezone(): Promise<string> {
    const s = await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { timezone: true } });
    return s?.timezone ?? 'Asia/Kolkata';
  }

  // ---------------------------------------------------------------- reading

  async list(query: z.output<typeof listMeetingsQuerySchema>): Promise<MeetingItem[]> {
    const scope = this.scope.scopeOf('meeting.view');
    const visible: Prisma.MeetingWhereInput =
      scope === 'ALL'
        ? {}
        : scope === 'OWN_CHILDREN'
          ? { studentId: { in: await this.scope.childStudentIds() } }
          : { OR: [{ organizerMemberId: this.me() }, { student: await this.scope.studentWhere('meeting.view') }] };
    const now = new Date();
    // "Upcoming" keeps a meeting until it has ended (plus a little grace), so a late joiner still sees it.
    const upcoming: Prisma.MeetingWhereInput = { status: 'SCHEDULED', scheduledAt: { gte: new Date(now.getTime() - 3 * 3600_000) } };
    const rows = await this.prisma.db.meeting.findMany({
      where: { AND: [visible, query.studentId ? { studentId: query.studentId } : {}, query.when === 'upcoming' ? upcoming : { NOT: upcoming }] },
      orderBy: { scheduledAt: query.when === 'upcoming' ? 'asc' : 'desc' },
      take: 100,
    });
    const items = await this.toItems(rows);
    return query.when === 'upcoming' ? items.filter((m) => Date.parse(m.scheduledAt) + m.durationMinutes * 60_000 + GRACE_MS > now.getTime()) : items;
  }

  async get(id: string): Promise<MeetingItem> {
    const row = await this.visible(id);
    return (await this.toItems([row]))[0]!;
  }

  private async visible(id: string): Promise<Row> {
    const row = await this.prisma.db.meeting.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('meeting');
    if (row.organizerMemberId === this.me() || (await this.scope.canAccessStudent('meeting.view', row.studentId))) return row;
    throw AppError.notFound('meeting');
  }

  private async manageable(id: string): Promise<Row> {
    const row = await this.visible(id);
    const mine = row.organizerMemberId === this.me();
    if (!mine && this.scope.scopeOf('meeting.manage') !== 'ALL') throw AppError.forbidden('Only the teacher who booked it (or the office) can change this meeting.');
    return row;
  }

  joinUrl(row: { roomCode: string }, displayName?: string): string {
    const base = this.env.MEETING_BASE_URL.replace(/\/+$/, '');
    const name = displayName ? `#userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}` : '';
    return `${base}/Bastaa-${row.roomCode}${name}`;
  }

  private async toItems(rows: Row[]): Promise<MeetingItem[]> {
    const me = this.me();
    const [students, names] = await Promise.all([
      this.people.students(rows.map((r) => r.studentId)),
      this.people.memberNames([...rows.map((r) => r.organizerMemberId), me]),
    ]);
    const manageAll = RequestContextStore.tenant().permissions['meeting.manage'] === 'ALL';
    const now = Date.now();
    return rows.map((r) => {
      const start = r.scheduledAt.getTime();
      const end = start + r.durationMinutes * 60_000;
      const open = r.status === 'SCHEDULED';
      return {
        id: r.id,
        student: students.get(r.studentId) ?? { id: r.studentId, name: 'Student', classLabel: null },
        organizer: { memberId: r.organizerMemberId, name: names.get(r.organizerMemberId) ?? 'Teacher' },
        title: r.title,
        agenda: r.agenda,
        category: r.category,
        scheduledAt: r.scheduledAt.toISOString(),
        durationMinutes: r.durationMinutes,
        status: r.status,
        cancelReason: r.cancelReason,
        joinUrl: open ? this.joinUrl(r, names.get(me)) : null,
        joinable: open && now >= start - JOIN_EARLY_MS && now <= end + GRACE_MS,
        canManage: open && (r.organizerMemberId === me || manageAll),
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------- writing

  async create(input: z.output<typeof createMeetingSchema>): Promise<MeetingItem> {
    if (!(await this.scope.canAccessStudent('meeting.manage', input.studentId))) throw AppError.notFound('student');
    const at = new Date(input.scheduledAt);
    if (at.getTime() < Date.now() - 60_000) throw new AppError('MEETING_IN_PAST', 422, 'Pick a time in the future.', [{ field: 'scheduledAt', message: 'Pick a time in the future' }]);
    if (!(await this.people.parentsOf(input.studentId)).length) {
      throw new AppError('NO_PARENT_LOGIN', 422, "None of this child's parents use the app yet, so nobody could join. Invite a parent first.");
    }
    const row = await this.prisma.tenantTx(async (tx) => {
      const m = await tx.meeting.create({
        data: {
          studentId: input.studentId,
          organizerMemberId: this.me(),
          title: input.title,
          agenda: input.agenda || null,
          category: input.category,
          scheduledAt: at,
          durationMinutes: input.durationMinutes,
          roomCode: randomBytes(12).toString('base64url'),
        } as Prisma.MeetingUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'meeting.create', entityType: 'Meeting', entityId: m.id, after: { studentId: input.studentId, scheduledAt: at.toISOString() } });
      return m;
    });
    await this.tellParents(row, 'meeting.scheduled');
    return this.get(row.id);
  }

  async update(id: string, input: z.output<typeof updateMeetingSchema>): Promise<MeetingItem> {
    const before = await this.manageable(id);
    if (before.status !== 'SCHEDULED') throw new AppError('MEETING_CLOSED', 409, 'This meeting was cancelled or already held.');
    const at = input.scheduledAt ? new Date(input.scheduledAt) : undefined;
    if (at && at.getTime() < Date.now() - 60_000) throw new AppError('MEETING_IN_PAST', 422, 'Pick a time in the future.', [{ field: 'scheduledAt', message: 'Pick a time in the future' }]);
    const moved = !!at && at.getTime() !== before.scheduledAt.getTime();
    const row = await this.prisma.tenantTx(async (tx) => {
      const m = await tx.meeting.update({
        where: { id },
        data: {
          title: input.title,
          agenda: input.agenda === undefined ? undefined : input.agenda || null,
          category: input.category,
          scheduledAt: at,
          durationMinutes: input.durationMinutes,
          ...(moved ? { remindedAt: null } : {}),
        },
      });
      await this.audit.record(tx, { action: moved ? 'meeting.reschedule' : 'meeting.update', entityType: 'Meeting', entityId: id, before: { scheduledAt: before.scheduledAt.toISOString() }, after: input });
      return m;
    });
    if (moved) await this.tellParents(row, 'meeting.rescheduled');
    return this.get(id);
  }

  async cancel(id: string, input: z.output<typeof cancelMeetingSchema>): Promise<MeetingItem> {
    const before = await this.manageable(id);
    if (before.status !== 'SCHEDULED') throw new AppError('MEETING_CLOSED', 409, 'This meeting was cancelled or already held.');
    const row = await this.prisma.tenantTx(async (tx) => {
      const m = await tx.meeting.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: input.reason || null } });
      await this.audit.record(tx, { action: 'meeting.cancel', entityType: 'Meeting', entityId: id, metadata: { reason: input.reason ?? null } });
      return m;
    });
    await this.tellParents(row, 'meeting.cancelled');
    return this.get(id);
  }

  async complete(id: string): Promise<MeetingItem> {
    const before = await this.manageable(id);
    if (before.status !== 'SCHEDULED') throw new AppError('MEETING_CLOSED', 409, 'This meeting was cancelled or already held.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.meeting.update({ where: { id }, data: { status: 'COMPLETED' } });
      await this.audit.record(tx, { action: 'meeting.complete', entityType: 'Meeting', entityId: id });
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- notifications

  private async tellParents(m: Row, event: 'meeting.scheduled' | 'meeting.rescheduled' | 'meeting.cancelled'): Promise<void> {
    const [parents, students, names, tz] = await Promise.all([
      this.people.parentsOf(m.studentId),
      this.people.students([m.studentId]),
      this.people.memberNames([m.organizerMemberId]),
      this.timezone(),
    ]);
    const student = students.get(m.studentId)?.name.split(' ')[0] ?? 'your child';
    await this.notifications.notify({
      event,
      recipients: parents.map((p) => ({
        membershipId: p.memberId,
        vars: {
          teacher: names.get(m.organizerMemberId) ?? 'The school',
          when: when(m.scheduledAt, tz),
          title: m.title,
          student,
          reason: m.cancelReason ? ` Reason: ${m.cancelReason}` : '',
        },
        data: { route: '/meetings', meetingId: m.id },
      })),
    });
  }

  /** Scheduler (every minute): "starts at 4:30 PM" to the parents and the teacher, once per meeting time. */
  async remindStarting(now = new Date()): Promise<number> {
    const soon = await this.prisma.db.meeting.findMany({
      where: { status: 'SCHEDULED', remindedAt: null, scheduledAt: { gt: now, lte: new Date(now.getTime() + JOIN_EARLY_MS) } },
    });
    if (!soon.length) return 0;
    const tz = await this.timezone();
    let sent = 0;
    for (const m of soon) {
      const [parents, students] = await Promise.all([this.people.parentsOf(m.studentId), this.people.students([m.studentId])]);
      const vars = { title: m.title, time: time(m.scheduledAt, tz), student: students.get(m.studentId)?.name.split(' ')[0] ?? 'your child' };
      sent += await this.notifications.notify({
        event: 'meeting.starting',
        recipients: [...parents.map((p) => p.memberId), m.organizerMemberId].map((membershipId) => ({ membershipId, vars, data: { route: '/meetings', meetingId: m.id } })),
        dedupeKey: (membershipId) => `meeting:${m.id}:${m.scheduledAt.toISOString()}:${membershipId}`,
      });
      await this.prisma.db.meeting.update({ where: { id: m.id }, data: { remindedAt: now } });
    }
    return sent;
  }
}
