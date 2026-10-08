import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  attendanceSettingsSchema,
  type BellScheduleItem,
  type ScheduleSlot,
  type TeacherWeek,
  type TimetableView,
  type TodaySchedule,
  type bellScheduleSchema,
  type saveTimetableSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fullName, todayIn } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

type In<T extends z.ZodType> = z.output<T>;

const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
/** 1 = Monday … 7 = Sunday (ISO) ↔ JS getUTCDay() 0 = Sunday. */
const isoDay = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const DAY_NAME = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;

const scheduleInclude = { periods: { orderBy: { order: 'asc' } }, _count: { select: { timetables: true } } } satisfies Prisma.BellScheduleInclude;
const entryInclude = {
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  period: true,
  timetable: { select: { section: { select: { id: true, name: true, class: { select: { name: true } } } } } },
} satisfies Prisma.TimetableEntryInclude;

/**
 * Timetable (Master Prompt §31): bell schedules (named sets of periods), one weekly grid per
 * section, and a hard rule that a teacher is never in two rooms at once — checked by clock
 * time, so sections on different bell schedules are compared correctly.
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- helpers

  /** Working days (ISO 1–7) from the school's weekly off setting. */
  private async workingDays(): Promise<number[]> {
    const row = await this.prisma.db.schoolSettings.findUnique({ where: { schoolId: RequestContextStore.school().schoolId } });
    const off = attendanceSettingsSchema.parse(row?.attendance ?? {}).weeklyOffDays;
    return [1, 2, 3, 4, 5, 6, 7].filter((d) => !off.includes(d % 7));
  }

  private async yearId(): Promise<string> {
    const id = await this.scope.currentAcademicYearId();
    if (!id) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create an academic year first.');
    return id;
  }

  /** Sections whose timetable the caller may see; null = all. `publishedOnly` for parents. */
  private async visibility(): Promise<{ sections: string[] | null; publishedOnly: boolean }> {
    const scope = RequestContextStore.tenant().permissions['timetable.view'];
    if (scope === 'ALL') return { sections: null, publishedOnly: !RequestContextStore.tenant().permissions['timetable.manage'] };
    if (scope === 'ASSIGNED') return { sections: await this.scope.assignedSectionIds(), publishedOnly: true };
    if (scope === 'OWN_CHILDREN') return { sections: await this.scope.childSectionIds(), publishedOnly: true };
    return { sections: [], publishedOnly: true };
  }

  private toSchedule(s: Prisma.BellScheduleGetPayload<{ include: typeof scheduleInclude }>): BellScheduleItem {
    return {
      id: s.id,
      name: s.name,
      isDefault: s.isDefault,
      periods: s.periods.map((p) => ({ id: p.id, name: p.name, order: p.order, startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak })),
      usedBy: s._count.timetables,
    };
  }

  private toSlot(e: Prisma.TimetableEntryGetPayload<{ include: typeof entryInclude }>): ScheduleSlot {
    const sec = e.timetable.section;
    return {
      dayOfWeek: e.dayOfWeek,
      periodName: e.period.name,
      startTime: e.period.startTime,
      endTime: e.period.endTime,
      isBreak: e.period.isBreak,
      section: { id: sec.id, label: label(sec.class.name, sec.name) },
      subject: e.subject,
      teacher: e.teacher ? { id: e.teacher.id, name: fullName(e.teacher.firstName, e.teacher.lastName) } : null,
      room: e.room,
    };
  }

  // ---------------------------------------------------------------- bell schedules

  async listSchedules(): Promise<BellScheduleItem[]> {
    const rows = await this.prisma.db.bellSchedule.findMany({ include: scheduleInclude, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
    return rows.map((r) => this.toSchedule(r));
  }

  async createSchedule(input: In<typeof bellScheduleSchema>): Promise<BellScheduleItem> {
    const { schoolId } = RequestContextStore.school();
    if (await this.prisma.db.bellSchedule.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) {
      throw new AppError('DUPLICATE', 409, 'A bell schedule with this name already exists.', [{ field: 'name', message: 'Already used' }]);
    }
    const first = (await this.prisma.db.bellSchedule.count()) === 0;
    const id = await this.prisma.tenantTx(async (tx) => {
      if (input.isDefault) await tx.bellSchedule.updateMany({ data: { isDefault: false } });
      const s = await tx.bellSchedule.create({
        data: {
          name: input.name,
          isDefault: input.isDefault || first,
          periods: { create: input.periods.map((p, i) => ({ ...p, order: i + 1, schoolId })) },
        } as Prisma.BellScheduleUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'bell_schedule.create', entityType: 'BellSchedule', entityId: s.id, after: input });
      return s.id;
    });
    return this.toSchedule(await this.prisma.db.bellSchedule.findUniqueOrThrow({ where: { id }, include: scheduleInclude }));
  }

  /** Periods are matched by position, so timetables keep their entries when times change. */
  async updateSchedule(id: string, input: In<typeof bellScheduleSchema>): Promise<BellScheduleItem> {
    const { schoolId } = RequestContextStore.school();
    const existing = await this.prisma.db.bellSchedule.findUnique({ where: { id }, include: { periods: { orderBy: { order: 'asc' }, include: { _count: { select: { entries: true } } } } } });
    if (!existing) throw AppError.notFound('bell schedule');
    const clash = await this.prisma.db.bellSchedule.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: 'insensitive' } } });
    if (clash) throw new AppError('DUPLICATE', 409, 'A bell schedule with this name already exists.', [{ field: 'name', message: 'Already used' }]);
    const removed = existing.periods.slice(input.periods.length);
    const used = removed.find((p) => p._count.entries > 0);
    if (used) throw new AppError('PERIOD_IN_USE', 409, `${used.name} is used in timetables. Clear those slots before removing it.`);
    const becameBreak = existing.periods.find((p, i) => input.periods[i]?.isBreak && !p.isBreak && p._count.entries > 0);
    if (becameBreak) throw new AppError('PERIOD_IN_USE', 409, `${becameBreak.name} has classes in timetables, so it can't become a break.`);

    await this.prisma.tenantTx(async (tx) => {
      if (input.isDefault) await tx.bellSchedule.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      await tx.bellSchedule.update({ where: { id }, data: { name: input.name, isDefault: input.isDefault || existing.isDefault } });
      if (removed.length) await tx.period.deleteMany({ where: { id: { in: removed.map((p) => p.id) } } });
      for (const [i, p] of input.periods.entries()) {
        const current = existing.periods[i];
        if (current) await tx.period.update({ where: { id: current.id }, data: { ...p, order: i + 1 } });
        else await tx.period.create({ data: { ...p, order: i + 1, bellScheduleId: id, schoolId } as Prisma.PeriodUncheckedCreateInput });
      }
      await this.audit.record(tx, { action: 'bell_schedule.update', entityType: 'BellSchedule', entityId: id, before: { name: existing.name, periods: existing.periods.length }, after: input });
    });
    return this.toSchedule(await this.prisma.db.bellSchedule.findUniqueOrThrow({ where: { id }, include: scheduleInclude }));
  }

  async deleteSchedule(id: string): Promise<void> {
    const s = await this.prisma.db.bellSchedule.findUnique({ where: { id }, include: scheduleInclude });
    if (!s) throw AppError.notFound('bell schedule');
    if (s._count.timetables) throw new AppError('IN_USE', 409, `${s._count.timetables} section timetable(s) use this schedule. Move them to another schedule first.`);
    await this.prisma.tenantTx(async (tx) => {
      await tx.bellSchedule.delete({ where: { id } });
      await this.audit.record(tx, { action: 'bell_schedule.delete', entityType: 'BellSchedule', entityId: id, before: { name: s.name } });
    });
  }

  // ---------------------------------------------------------------- section timetables

  /** Every visible section with its timetable status (for the section picker). */
  async overview() {
    const yearId = await this.yearId();
    const { sections: visible, publishedOnly } = await this.visibility();
    const sections = await this.prisma.db.section.findMany({
      where: { academicYearId: yearId, ...(visible ? { id: { in: visible } } : {}) },
      include: {
        class: { select: { name: true, displayOrder: true } },
        timetables: { where: { academicYearId: yearId, ...(publishedOnly ? { status: 'PUBLISHED' } : {}) }, select: { id: true, status: true, _count: { select: { entries: true } } } },
      },
    });
    sections.sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.name.localeCompare(b.name));
    return sections.map((s) => ({
      sectionId: s.id,
      label: label(s.class.name, s.name),
      timetableId: s.timetables[0]?.id ?? null,
      status: (s.timetables[0]?.status ?? null) as 'DRAFT' | 'PUBLISHED' | null,
      filled: s.timetables[0]?._count.entries ?? 0,
    }));
  }

  async forSection(sectionId: string): Promise<TimetableView | null> {
    const yearId = await this.yearId();
    const { sections: visible, publishedOnly } = await this.visibility();
    if (visible && !visible.includes(sectionId)) throw AppError.notFound('section');
    if (!(await this.prisma.db.section.findUnique({ where: { id: sectionId }, select: { id: true } }))) throw AppError.notFound('section');
    const tt = await this.prisma.db.timetable.findFirst({
      where: { sectionId, academicYearId: yearId, ...(publishedOnly ? { status: 'PUBLISHED' } : {}) },
      select: { id: true },
    });
    return tt ? this.view(tt.id) : null;
  }

  private async view(id: string): Promise<TimetableView> {
    const tt = await this.prisma.db.timetable.findUnique({
      where: { id },
      include: {
        section: { select: { id: true, name: true, class: { select: { name: true } } } },
        bellSchedule: { include: scheduleInclude },
        entries: { include: { subject: { select: { id: true, name: true } }, teacher: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!tt) throw AppError.notFound('timetable');
    return {
      id: tt.id,
      section: { id: tt.section.id, label: label(tt.section.class.name, tt.section.name) },
      status: tt.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      publishedAt: tt.publishedAt?.toISOString() ?? null,
      bellSchedule: this.toSchedule(tt.bellSchedule),
      days: await this.workingDays(),
      entries: tt.entries.map((e) => ({
        dayOfWeek: e.dayOfWeek,
        periodId: e.periodId,
        subject: e.subject,
        teacher: e.teacher ? { id: e.teacher.id, name: fullName(e.teacher.firstName, e.teacher.lastName) } : null,
        room: e.room,
      })),
    };
  }

  async create(sectionId: string, bellScheduleId: string): Promise<TimetableView> {
    const yearId = await this.yearId();
    const [section, schedule] = await Promise.all([
      this.prisma.db.section.findUnique({ where: { id: sectionId }, select: { academicYearId: true } }),
      this.prisma.db.bellSchedule.findUnique({ where: { id: bellScheduleId }, select: { id: true } }),
    ]);
    if (!section || section.academicYearId !== yearId) throw AppError.invalidReference('sectionId', 'section');
    if (!schedule) throw AppError.invalidReference('bellScheduleId', 'bell schedule');
    if (await this.prisma.db.timetable.findFirst({ where: { sectionId, academicYearId: yearId } })) {
      throw new AppError('DUPLICATE', 409, 'This section already has a timetable.');
    }
    const id = await this.prisma.tenantTx(async (tx) => {
      const tt = await tx.timetable.create({
        data: { sectionId, academicYearId: yearId, bellScheduleId, effectiveFrom: new Date(`${todayIn()}T00:00:00Z`) } as Prisma.TimetableUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'timetable.create', entityType: 'Timetable', entityId: tt.id });
      return tt.id;
    });
    return this.view(id);
  }

  /** Replace the whole grid. Refuses (409) if any teacher would be in two places at once. */
  async saveEntries(id: string, input: In<typeof saveTimetableSchema>): Promise<TimetableView> {
    const tt = await this.prisma.db.timetable.findUnique({ where: { id }, select: { id: true, academicYearId: true, bellScheduleId: true, sectionId: true } });
    if (!tt) throw AppError.notFound('timetable');
    const scheduleId = input.bellScheduleId ?? tt.bellScheduleId;
    const periods = await this.prisma.db.period.findMany({ where: { bellScheduleId: scheduleId } });
    if (!periods.length) throw AppError.invalidReference('bellScheduleId', 'bell schedule');
    const byId = new Map(periods.map((p) => [p.id, p]));

    const entries = input.entries.filter((e) => e.subjectId || e.teacherId || e.room);
    const seen = new Set<string>();
    for (const [i, e] of entries.entries()) {
      const period = byId.get(e.periodId);
      if (!period) throw new AppError('INVALID_REFERENCE', 422, "A slot uses a period that isn't in this bell schedule.", [{ field: `entries.${i}.periodId`, message: 'Unknown period' }]);
      if (period.isBreak) throw new AppError('VALIDATION_FAILED', 422, `${period.name} is a break — it can't have a class.`, [{ field: `entries.${i}.periodId`, message: 'Break' }]);
      const key = `${e.dayOfWeek}|${e.periodId}`;
      if (seen.has(key)) throw new AppError('VALIDATION_FAILED', 422, 'The same slot appears twice.', [{ field: `entries.${i}`, message: 'Duplicate slot' }]);
      seen.add(key);
    }
    const subjectIds = [...new Set(entries.map((e) => e.subjectId).filter((x): x is string => !!x))];
    const teacherIds = [...new Set(entries.map((e) => e.teacherId).filter((x): x is string => !!x))];
    const [subjects, teachers] = await Promise.all([
      this.prisma.db.subject.count({ where: { id: { in: subjectIds } } }),
      this.prisma.db.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    if (subjects !== subjectIds.length) throw AppError.invalidReference('entries', 'subject');
    if (teachers.length !== teacherIds.length) throw AppError.invalidReference('entries', 'teacher');

    // Teacher clash: same teacher, same day, overlapping clock time, in another section's timetable.
    const others = teacherIds.length
      ? await this.prisma.db.timetableEntry.findMany({
          where: { teacherId: { in: teacherIds }, timetable: { academicYearId: tt.academicYearId, id: { not: id } } },
          include: entryInclude,
        })
      : [];
    const details: { field: string; message: string }[] = [];
    for (const [i, e] of entries.entries()) {
      if (!e.teacherId) continue;
      const period = byId.get(e.periodId)!;
      const hit = others.find((o) => o.teacherId === e.teacherId && o.dayOfWeek === e.dayOfWeek && overlaps(o.period, period));
      if (hit) {
        const t = teachers.find((x) => x.id === e.teacherId)!;
        const sec = hit.timetable.section;
        details.push({
          field: `entries.${i}.teacherId`,
          message: `${fullName(t.firstName, t.lastName)} is with ${label(sec.class.name, sec.name)} on ${DAY_NAME[e.dayOfWeek]} (${hit.period.name}, ${hit.period.startTime}–${hit.period.endTime})`,
        });
      }
    }
    if (details.length) {
      throw new AppError('TEACHER_CLASH', 409, details.length === 1 ? details[0]!.message + '.' : `${details.length} slots clash with other classes.`, details);
    }

    const { schoolId } = RequestContextStore.school();
    await this.prisma.tenantTx(async (tx) => {
      if (scheduleId !== tt.bellScheduleId) await tx.timetable.update({ where: { id }, data: { bellScheduleId: scheduleId } });
      await tx.timetableEntry.deleteMany({ where: { timetableId: id } });
      if (entries.length) {
        await tx.timetableEntry.createMany({
          data: entries.map(
            (e) =>
              ({
                schoolId,
                timetableId: id,
                dayOfWeek: e.dayOfWeek,
                periodId: e.periodId,
                subjectId: e.subjectId ?? null,
                teacherId: e.teacherId ?? null,
                room: e.room || null,
              }) as Prisma.TimetableEntryCreateManyInput,
          ),
        });
      }
      await this.audit.record(tx, { action: 'timetable.save', entityType: 'Timetable', entityId: id, after: { slots: entries.length } });
    });
    return this.view(id);
  }

  async publish(id: string): Promise<TimetableView> {
    const tt = await this.prisma.db.timetable.findUnique({ where: { id }, select: { status: true } });
    if (!tt) throw AppError.notFound('timetable');
    if (tt.status !== 'PUBLISHED') {
      await this.prisma.tenantTx(async (tx) => {
        await tx.timetable.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
        await this.audit.record(tx, { action: 'timetable.publish', entityType: 'Timetable', entityId: id });
      });
    }
    return this.view(id);
  }

  async remove(id: string): Promise<void> {
    const tt = await this.prisma.db.timetable.findUnique({ where: { id }, select: { id: true } });
    if (!tt) throw AppError.notFound('timetable');
    await this.prisma.tenantTx(async (tx) => {
      await tx.timetable.delete({ where: { id } });
      await this.audit.record(tx, { action: 'timetable.delete', entityType: 'Timetable', entityId: id });
    });
  }

  // ---------------------------------------------------------------- people views

  async teacherWeek(teacherId: string): Promise<TeacherWeek> {
    const scope = RequestContextStore.tenant().permissions['timetable.view'];
    if (scope !== 'ALL' && teacherId !== (await this.scope.myTeacherId())) throw AppError.notFound('teacher');
    const teacher = await this.prisma.db.teacher.findUnique({ where: { id: teacherId }, select: { id: true, firstName: true, lastName: true } });
    if (!teacher) throw AppError.notFound('teacher');
    const yearId = await this.yearId();
    const { publishedOnly } = await this.visibility();
    const entries = await this.prisma.db.timetableEntry.findMany({
      where: { teacherId, timetable: { academicYearId: yearId, ...(publishedOnly ? { status: 'PUBLISHED' } : {}) } },
      include: entryInclude,
    });
    const slots = entries.map((e) => this.toSlot(e)).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    return { teacher: { id: teacher.id, name: fullName(teacher.firstName, teacher.lastName) }, days: await this.workingDays(), slots, periodsPerWeek: slots.length };
  }

  /** Teachers: my classes today. Parents: the child's day (studentId, or the only child). */
  async today(date: string | undefined, studentId: string | undefined): Promise<TodaySchedule> {
    const school = await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { timezone: true } });
    const day = date ?? todayIn(school?.timezone);
    const dow = isoDay(day);
    const isWeeklyOff = !(await this.workingDays()).includes(dow);
    const yearId = await this.yearId();

    const me = studentId ? null : await this.scope.myTeacherId();
    if (me) {
      const teacher = await this.prisma.db.teacher.findUniqueOrThrow({ where: { id: me }, select: { firstName: true, lastName: true } });
      const entries = await this.prisma.db.timetableEntry.findMany({
        where: { teacherId: me, dayOfWeek: dow, timetable: { academicYearId: yearId, status: 'PUBLISHED' } },
        include: entryInclude,
      });
      return {
        date: day,
        dayOfWeek: dow,
        isWeeklyOff,
        for: { kind: 'teacher', label: fullName(teacher.firstName, teacher.lastName) },
        slots: entries.map((e) => this.toSlot(e)).sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    }

    let child = studentId;
    if (!child) {
      const children = await this.scope.childStudentIds();
      if (children.length !== 1) throw new AppError('STUDENT_REQUIRED', 422, 'Choose which child.', [{ field: 'studentId', message: 'Choose a child' }]);
      child = children[0];
    }
    if (!(await this.scope.canAccessStudent('timetable.view', child!))) throw AppError.notFound('student');
    const enrollment = await this.prisma.db.studentEnrollment.findFirst({
      where: { studentId: child, academicYearId: yearId },
      select: { section: { select: { id: true, name: true, class: { select: { name: true } } } } },
    });
    if (!enrollment) throw AppError.notFound('student');
    const tt = await this.prisma.db.timetable.findFirst({
      where: { sectionId: enrollment.section.id, academicYearId: yearId, status: 'PUBLISHED' },
      include: { bellSchedule: { include: { periods: { orderBy: { order: 'asc' } } } }, entries: { where: { dayOfWeek: dow }, include: entryInclude } },
    });
    const sectionRef = { id: enrollment.section.id, label: label(enrollment.section.class.name, enrollment.section.name) };
    // A child's day shows every period, breaks included, so parents see the whole shape of it.
    const slots: ScheduleSlot[] =
      tt?.bellSchedule.periods.map((p) => {
        const e = tt.entries.find((x) => x.periodId === p.id);
        return {
          dayOfWeek: dow,
          periodName: p.name,
          startTime: p.startTime,
          endTime: p.endTime,
          isBreak: p.isBreak,
          section: sectionRef,
          subject: e?.subject ?? null,
          teacher: e?.teacher ? { id: e.teacher.id, name: fullName(e.teacher.firstName, e.teacher.lastName) } : null,
          room: e?.room ?? null,
        };
      }) ?? [];
    return { date: day, dayOfWeek: dow, isWeeklyOff, for: { kind: 'section', label: sectionRef.label }, slots: isWeeklyOff ? [] : slots };
  }
}
