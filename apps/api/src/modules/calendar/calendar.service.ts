import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { CALENDAR_KIND_LABELS, type CalendarItem, type calendarEventSchema, type updateCalendarEventSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fromDate, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const span = (start: string, end: string) => (start === end ? day.format(toDate(start)!) : `${day.format(toDate(start)!)} – ${day.format(toDate(end)!)}`);
const shortClass = (name: string) => name.replace(/^Class\s+/i, '');

/**
 * The school calendar (holidays, vacations, events, parent–teacher meetings) merged with exam
 * dates from the exams themselves, so nobody keeps two lists. Parents see whole-school entries,
 * their children's classes, and each of their child's papers on its day.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private canManage() {
    return !!RequestContextStore.tenant().permissions['calendar.manage'];
  }

  /** Classes of the signed-in parent's children (null for staff, who see everything). */
  private async parentClassIds(): Promise<string[] | null> {
    const perms = RequestContextStore.tenant().permissions;
    if (perms['student.view'] !== 'OWN_CHILDREN') return null;
    const [children, yearId] = await Promise.all([this.scope.childStudentIds(), this.scope.currentAcademicYearId()]);
    if (!children.length || !yearId) return [];
    const rows = await this.prisma.db.studentEnrollment.findMany({ where: { studentId: { in: children }, academicYearId: yearId }, select: { classId: true } });
    return [...new Set(rows.map((r) => r.classId))];
  }

  async list(from: string, to: string): Promise<CalendarItem[]> {
    const mine = await this.parentClassIds();
    const manage = this.canManage();
    const classes = await this.prisma.db.schoolClass.findMany({ select: { id: true, name: true, displayOrder: true } });
    const className = new Map(classes.map((c) => [c.id, c.name]));
    const audience = (ids: string[]) => (ids.length ? ids.map((id) => shortClass(className.get(id) ?? '?')).join(', ') : 'Whole school');

    const events = await this.prisma.db.calendarEvent.findMany({
      where: {
        startDate: { lte: toDate(to) },
        endDate: { gte: toDate(from) },
        ...(mine ? { OR: [{ classIds: { isEmpty: true } }, { classIds: { hasSome: mine } }] } : {}),
      },
      orderBy: { startDate: 'asc' },
    });
    const items: CalendarItem[] = events.map((e) => ({
      id: e.id,
      source: 'CALENDAR',
      kind: e.kind,
      title: e.title,
      description: e.description,
      startDate: fromDate(e.startDate)!,
      endDate: fromDate(e.endDate)!,
      audience: audience(e.classIds),
      examId: null,
      time: null,
      canEdit: manage,
    }));

    // Exams this year, shown across their dates (parents: only exams that include their child's class, once scheduled).
    const yearId = await this.scope.currentAcademicYearId();
    const exams = await this.prisma.db.exam.findMany({
      where: { academicYearId: yearId ?? undefined, status: mine ? { notIn: ['DRAFT', 'ARCHIVED'] } : { not: 'ARCHIVED' } },
      include: { subjects: { select: { classId: true, examDate: true, startTime: true, endTime: true, subject: { select: { name: true } } } } },
    });
    for (const ex of exams) {
      const subjects = mine ? ex.subjects.filter((s) => mine.includes(s.classId)) : ex.subjects;
      if (mine && !subjects.length) continue;
      const dates = subjects.map((s) => fromDate(s.examDate)).filter((d): d is string => !!d).sort();
      const start = fromDate(ex.startDate) ?? dates[0];
      const end = fromDate(ex.endDate) ?? dates.at(-1) ?? start;
      if (!start || !end || start > to || end < from) continue;
      const classIds = [...new Set(subjects.map((s) => s.classId))];
      items.push({
        id: `exam-${ex.id}`,
        source: 'EXAM',
        kind: 'EXAM',
        title: ex.name,
        description: ex.term,
        startDate: start,
        endDate: end,
        audience: mine ? audience(classIds) : classIds.length >= classes.length ? 'Whole school' : audience(classIds),
        examId: ex.id,
        time: null,
        canEdit: false,
      });
      // A parent's date sheet, paper by paper.
      if (mine) {
        for (const s of subjects) {
          const d = fromDate(s.examDate);
          if (!d || d < from || d > to) continue;
          items.push({
            id: `paper-${ex.id}-${s.classId}-${s.subject.name}`,
            source: 'PAPER',
            kind: 'EXAM',
            title: `${s.subject.name} paper`,
            description: ex.name,
            startDate: d,
            endDate: d,
            audience: audience([s.classId]),
            examId: ex.id,
            time: s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : null,
            canEdit: false,
          });
        }
      }
    }
    return items.sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.source === 'PAPER' ? 1 : 0) - (b.source === 'PAPER' ? 1 : 0));
  }

  private async checkClasses(classIds: string[]) {
    if (!classIds.length) return;
    const found = await this.prisma.db.schoolClass.count({ where: { id: { in: classIds } } });
    if (found !== new Set(classIds).size) throw AppError.invalidReference('classIds', 'class');
  }

  async create(input: z.output<typeof calendarEventSchema>): Promise<CalendarItem> {
    await this.checkClasses(input.classIds);
    const end = input.endDate ?? input.startDate;
    const row = await this.prisma.tenantTx(async (tx) => {
      const e = await tx.calendarEvent.create({
        data: {
          title: input.title,
          description: input.description || null,
          kind: input.kind,
          startDate: toDate(input.startDate)!,
          endDate: toDate(end)!,
          classIds: input.classIds,
          createdByMemberId: RequestContextStore.tenant().membershipId,
        } as Prisma.CalendarEventUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'calendar.create', entityType: 'CalendarEvent', entityId: e.id, after: { title: e.title, kind: e.kind, startDate: input.startDate, endDate: end } });
      return e;
    });
    if (input.notify) await this.announce(row.id);
    return this.item(row.id);
  }

  async update(id: string, input: z.output<typeof updateCalendarEventSchema>): Promise<CalendarItem> {
    const before = await this.prisma.db.calendarEvent.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('calendar entry');
    if (input.classIds) await this.checkClasses(input.classIds);
    const start = input.startDate ?? fromDate(before.startDate)!;
    const end = input.endDate ?? (input.startDate && fromDate(before.endDate)! < input.startDate ? input.startDate : fromDate(before.endDate)!);
    if (end < start) throw new AppError('CALENDAR_DATES', 422, 'The end date is before the start date.', [{ field: 'endDate', message: 'Ends before it starts' }]);
    await this.prisma.tenantTx(async (tx) => {
      await tx.calendarEvent.update({
        where: { id },
        data: { title: input.title, description: input.description === undefined ? undefined : input.description || null, kind: input.kind, startDate: toDate(start)!, endDate: toDate(end)!, classIds: input.classIds },
      });
      await this.audit.record(tx, { action: 'calendar.update', entityType: 'CalendarEvent', entityId: id, before: { title: before.title, startDate: fromDate(before.startDate), endDate: fromDate(before.endDate) }, after: input });
    });
    return this.item(id);
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.db.calendarEvent.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('calendar entry');
    await this.prisma.tenantTx(async (tx) => {
      await tx.calendarEvent.delete({ where: { id } });
      await this.audit.record(tx, { action: 'calendar.delete', entityType: 'CalendarEvent', entityId: id, before: { title: before.title, startDate: fromDate(before.startDate), endDate: fromDate(before.endDate) } });
    });
  }

  private async item(id: string): Promise<CalendarItem> {
    const e = await this.prisma.db.calendarEvent.findUniqueOrThrow({ where: { id } });
    const list = await this.list(fromDate(e.startDate)!, fromDate(e.endDate)!);
    return list.find((x) => x.id === id)!;
  }

  /** Tell everyone it concerns: the whole school, or the parents of those classes (and all staff). */
  private async announce(id: string): Promise<void> {
    const e = await this.prisma.db.calendarEvent.findUniqueOrThrow({ where: { id } });
    let members: string[];
    if (!e.classIds.length) {
      members = (await this.prisma.db.membership.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map((m) => m.id);
    } else {
      const yearId = await this.scope.currentAcademicYearId();
      const students = await this.prisma.db.studentEnrollment.findMany({ where: { classId: { in: e.classIds }, academicYearId: yearId ?? undefined }, select: { studentId: true } });
      const parents = await this.notifications.guardiansOf(students.map((s) => s.studentId));
      const staff = await this.prisma.db.membership.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { key: { not: 'parent' } } } } }, select: { id: true } });
      members = [...parents.map((p) => p.membershipId), ...staff.map((m) => m.id)];
    }
    const me = RequestContextStore.tenant().membershipId;
    const unique = [...new Set(members)].filter((m) => m !== me);
    const vars = {
      kind: CALENDAR_KIND_LABELS[e.kind],
      title: e.title,
      when: span(fromDate(e.startDate)!, fromDate(e.endDate)!),
      description: e.description ? ` ${e.description}` : '',
    };
    await this.notifications.notify({
      event: 'calendar.added',
      recipients: unique.map((membershipId) => ({ membershipId, vars, data: { route: '/calendar', eventId: e.id, date: fromDate(e.startDate) } })),
      dedupeKey: () => `calendar:${e.id}`,
    });
  }
}
