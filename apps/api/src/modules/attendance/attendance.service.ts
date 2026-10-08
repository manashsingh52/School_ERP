import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import {
  attendanceSettingsSchema,
  percentPresent,
  type AttendanceCounts,
  type AttendanceOverview,
  type AttendanceRegister,
  type AttendanceSettings,
  type AttendanceStatus,
  type SectionMonth,
  type StaffAttendanceDay,
  type StudentAttendanceHistory,
  type saveRegisterSchema,
  type saveStaffAttendanceSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fromDate, fullName, toDate, todayIn } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type In<T extends z.ZodType> = z.output<T>;

const emptyCounts = (): AttendanceCounts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, unmarked: 0 });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const short = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const prettyDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/**
 * Daily attendance (Master Prompt §29): one register per section per day, built for speed
 * ("mark all present", then exceptions). Corrections after submission are audited; parents of
 * absent students are notified once per student per day.
 */
@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.outbox.on('attendance.submitted', (event) => this.notifyParents(String(event.payload.sessionId)));
  }

  // ---------------------------------------------------------------- settings & helpers

  async settings(): Promise<AttendanceSettings> {
    const row = await this.prisma.db.schoolSettings.findUnique({ where: { schoolId: RequestContextStore.school().schoolId } });
    return attendanceSettingsSchema.parse(row?.attendance ?? {});
  }

  async updateSettings(input: Partial<AttendanceSettings>): Promise<AttendanceSettings> {
    const next = attendanceSettingsSchema.parse({ ...(await this.settings()), ...input });
    await this.prisma.tenantTx(async (tx) => {
      await tx.schoolSettings.update({ where: { schoolId: RequestContextStore.school().schoolId }, data: { attendance: next } });
      await this.audit.record(tx, { action: 'settings.attendance.update', entityType: 'SchoolSettings', after: next });
    });
    return next;
  }

  private async today(): Promise<string> {
    const school = await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { timezone: true } });
    return todayIn(school?.timezone);
  }

  /** Sections the caller may view registers for (null = every section). */
  private async viewableSections(): Promise<string[] | null> {
    const scope = RequestContextStore.tenant().permissions['attendance.view'];
    if (scope === 'ALL') return null;
    if (scope === 'ASSIGNED') return this.scope.assignedSectionIds();
    return [];
  }

  /** Sections the caller may mark, given the school's "marked by" rule. */
  private async markableSections(settings: AttendanceSettings): Promise<string[] | null> {
    const scope = RequestContextStore.tenant().permissions['attendance.mark'];
    if (scope === 'ALL') return null;
    if (scope !== 'ASSIGNED') return [];
    if (settings.markedBy === 'ANY_ASSIGNED') return this.scope.assignedSectionIds();
    const { membershipId } = RequestContextStore.tenant();
    const teacher = await this.prisma.db.teacher.findUnique({ where: { membershipId }, select: { id: true } });
    const yearId = await this.scope.currentAcademicYearId();
    if (!teacher || !yearId) return [];
    return (await this.prisma.db.section.findMany({ where: { classTeacherId: teacher.id, academicYearId: yearId }, select: { id: true } })).map((s) => s.id);
  }

  private async sectionFor(sectionId: string) {
    const visible = await this.viewableSections();
    if (visible && !visible.includes(sectionId)) throw AppError.notFound('section');
    const section = await this.prisma.db.section.findUnique({
      where: { id: sectionId },
      include: {
        class: { select: { name: true } },
        classTeacher: { select: { firstName: true, lastName: true } },
        academicYear: { select: { startDate: true, endDate: true } },
      },
    });
    if (!section) throw AppError.notFound('section');
    return section;
  }

  /** Students on the section's roll on that date (history-safe: includes those who later moved on). */
  private roster(sectionId: string, date: string) {
    const day = toDate(date)!;
    return this.prisma.db.studentEnrollment.findMany({
      where: { sectionId, enrolledOn: { lte: day }, OR: [{ leftOn: null }, { leftOn: { gte: day } }], status: { notIn: ['TRANSFERRED', 'WITHDRAWN'] } },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
      orderBy: [{ rollNo: { sort: 'asc', nulls: 'last' } }, { student: { firstName: 'asc' } }],
    });
  }

  /** Why the caller can't change this register now, or null if they can. */
  private async lockReason(
    sectionId: string,
    date: string,
    status: AttendanceRegister['status'],
    section: Awaited<ReturnType<AttendanceService['sectionFor']>>,
    settings: AttendanceSettings,
  ): Promise<string | null> {
    const today = await this.today();
    const markable = await this.markableSections(settings);
    if (markable && !markable.includes(sectionId)) {
      return settings.markedBy === 'CLASS_TEACHER' ? 'Only the class teacher marks attendance for this section.' : "You don't teach this section.";
    }
    if (date > today) return "Attendance can't be marked for a future date.";
    if (date < fromDate(section.academicYear.startDate)! || date > fromDate(section.academicYear.endDate)!) return 'This date is outside the academic year.';
    const age = daysBetween(date, today);
    const canEditPast = !!RequestContextStore.tenant().permissions['attendance.edit_past'];
    if (age > settings.editWindowDays && !canEditPast) {
      return status === 'SUBMITTED'
        ? `Submitted registers can be corrected for ${settings.editWindowDays} day(s). Ask an admin to change it.`
        : `Registers older than ${settings.editWindowDays} day(s) need an admin.`;
    }
    return null;
  }

  // ---------------------------------------------------------------- register

  async register(sectionId: string, date?: string): Promise<AttendanceRegister> {
    const day = date ?? (await this.today());
    const [section, settings] = await Promise.all([this.sectionFor(sectionId), this.settings()]);
    const [roster, session] = await Promise.all([
      this.roster(sectionId, day),
      this.prisma.db.attendanceSession.findUnique({ where: { sectionId_date: { sectionId, date: toDate(day)! } }, include: { records: true } }),
    ]);
    const marks = new Map(session?.records.map((r) => [r.studentId, r]) ?? []);
    const status: AttendanceRegister['status'] = session?.status === 'SUBMITTED' ? 'SUBMITTED' : session ? 'DRAFT' : 'NOT_TAKEN';
    const counts = emptyCounts();
    const students = roster.map((e) => {
      const mark = marks.get(e.studentId);
      if (mark) counts[mark.status]++;
      else counts.unmarked++;
      return {
        studentId: e.studentId,
        name: fullName(e.student.firstName, e.student.lastName),
        rollNo: e.rollNo,
        admissionNo: e.student.admissionNo,
        status: (mark?.status ?? null) as AttendanceStatus | null,
        remark: mark?.remark ?? null,
      };
    });
    let takenBy: string | null = null;
    if (session) {
      const m = await this.prisma.db.membership.findUnique({ where: { id: session.takenByMemberId }, include: { user: { select: { name: true } } } });
      takenBy = m?.user.name ?? null;
    }
    const lockedReason = await this.lockReason(sectionId, day, status, section, settings);
    return {
      section: {
        id: section.id,
        label: short(section.class.name, section.name),
        classTeacher: section.classTeacher ? fullName(section.classTeacher.firstName, section.classTeacher.lastName) : null,
      },
      date: day,
      status,
      submittedAt: session?.submittedAt?.toISOString() ?? null,
      takenBy,
      editable: !lockedReason,
      lockedReason,
      isWeeklyOff: settings.weeklyOffDays.includes(weekday(day)),
      students,
      counts,
    };
  }

  async save(sectionId: string, input: In<typeof saveRegisterSchema>): Promise<AttendanceRegister> {
    const [section, settings] = await Promise.all([this.sectionFor(sectionId), this.settings()]);
    const existing = await this.prisma.db.attendanceSession.findUnique({
      where: { sectionId_date: { sectionId, date: toDate(input.date)! } },
      include: { records: true },
    });
    // Offline replay of a submission we already have: answer as if it just happened.
    if (input.clientMutationId && existing?.clientMutationId === input.clientMutationId && existing.status === 'SUBMITTED') {
      return this.register(sectionId, input.date);
    }
    const wasSubmitted = existing?.status === 'SUBMITTED';
    const reason = await this.lockReason(sectionId, input.date, wasSubmitted ? 'SUBMITTED' : 'DRAFT', section, settings);
    if (reason) throw new AppError('ATTENDANCE_LOCKED', 422, reason);

    const roster = await this.roster(sectionId, input.date);
    const onRoll = new Set(roster.map((e) => e.studentId));
    if (input.records.some((r) => !onRoll.has(r.studentId))) throw AppError.invalidReference('records', 'student');
    const marks = new Map(existing?.records.map((r) => [r.studentId, r]) ?? []);
    for (const r of input.records) marks.set(r.studentId, { ...marks.get(r.studentId)!, status: r.status, remark: r.remark ?? null } as never);
    const missing = roster.filter((e) => !marks.has(e.studentId)).length;
    if (input.submit && missing) {
      throw new AppError('ATTENDANCE_INCOMPLETE', 422, `Mark every student before submitting — ${missing} left.`);
    }

    const { membershipId } = RequestContextStore.tenant();
    const day = toDate(input.date)!;
    const changes: Record<string, { from: string; to: string }> = {};
    await this.prisma.tenantTx(async (tx) => {
      const session = await tx.attendanceSession.upsert({
        where: { sectionId_date: { sectionId, date: day } },
        create: {
          sectionId,
          date: day,
          status: input.submit ? 'SUBMITTED' : 'DRAFT',
          takenByMemberId: membershipId,
          submittedAt: input.submit ? new Date() : null,
          clientMutationId: input.clientMutationId,
        } as Prisma.AttendanceSessionUncheckedCreateInput,
        update: {
          status: input.submit || wasSubmitted ? 'SUBMITTED' : 'DRAFT',
          submittedAt: input.submit && !wasSubmitted ? new Date() : undefined,
          clientMutationId: input.clientMutationId ?? undefined,
        },
      });
      for (const r of input.records) {
        const before = existing?.records.find((x) => x.studentId === r.studentId);
        if (before && before.status === r.status && (before.remark ?? null) === (r.remark ?? null)) continue;
        if (before && wasSubmitted && before.status !== r.status) changes[r.studentId] = { from: before.status, to: r.status };
        await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: r.studentId } },
          create: { sessionId: session.id, studentId: r.studentId, date: day, status: r.status, remark: r.remark } as Prisma.AttendanceRecordUncheckedCreateInput,
          update: { status: r.status, remark: r.remark ?? null },
        });
      }
      if (wasSubmitted && Object.keys(changes).length) {
        await this.audit.record(tx, { action: 'attendance.edit', entityType: 'AttendanceSession', entityId: session.id, metadata: { date: input.date, section: short(section.class.name, section.name), changes } });
      } else if (input.submit && !wasSubmitted) {
        const counts = emptyCounts();
        for (const m of marks.values()) counts[(m as { status: AttendanceStatus }).status]++;
        await this.audit.record(tx, { action: 'attendance.submit', entityType: 'AttendanceSession', entityId: session.id, after: { date: input.date, ...counts } });
      }
      if (input.submit || (wasSubmitted && Object.keys(changes).length)) {
        await this.outbox.publish(tx, 'attendance.submitted', { sessionId: session.id });
      }
    });
    this.outbox.flush();
    return this.register(sectionId, input.date);
  }

  /** Event handler: tell parents of absent (and, if enabled, late) students. Once per student per day. */
  private async notifyParents(sessionId: string): Promise<void> {
    const session = await this.prisma.db.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        section: { select: { name: true, class: { select: { name: true } } } },
        records: { where: { status: { in: ['ABSENT', 'LATE'] } }, include: { student: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!session || session.status !== 'SUBMITTED') return;
    const date = fromDate(session.date)!;
    for (const status of ['ABSENT', 'LATE'] as const) {
      const records = session.records.filter((r) => r.status === status);
      const guardians = await this.notifications.guardiansOf(records.map((r) => r.studentId));
      const byStudent = new Map(records.map((r) => [r.studentId, r]));
      await this.notifications.notify({
        event: status === 'ABSENT' ? 'attendance.absent' : 'attendance.late',
        recipients: guardians.map((g) => {
          const r = byStudent.get(g.studentId)!;
          return {
            membershipId: g.membershipId,
            vars: { student: r.student.firstName, class: short(session.section.class.name, session.section.name), date: prettyDate(date) },
            data: { route: '/attendance', studentId: g.studentId, date },
          };
        }),
        dedupeKey: (_m, i) => `${status}:${guardians[i]!.studentId}:${date}`,
      });
    }
  }

  // ---------------------------------------------------------------- views

  async overview(date?: string): Promise<AttendanceOverview> {
    const day = date ?? (await this.today());
    const [settings, yearId, visible] = await Promise.all([this.settings(), this.scope.currentAcademicYearId(), this.viewableSections()]);
    if (!yearId) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create an academic year first.');
    const markable = await this.markableSections(settings);
    const sections = await this.prisma.db.section.findMany({
      where: { academicYearId: yearId, ...(visible ? { id: { in: visible } } : {}) },
      include: { class: { select: { name: true, displayOrder: true } }, classTeacher: { select: { firstName: true, lastName: true } } },
    });
    sections.sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.name.localeCompare(b.name));
    const ids = sections.map((s) => s.id);
    const dayDate = toDate(day)!;
    const [sessions, rollCounts] = await Promise.all([
      this.prisma.db.attendanceSession.findMany({ where: { sectionId: { in: ids }, date: dayDate }, select: { id: true, sectionId: true, status: true } }),
      this.prisma.db.studentEnrollment.groupBy({
        by: ['sectionId'],
        where: { sectionId: { in: ids }, enrolledOn: { lte: dayDate }, OR: [{ leftOn: null }, { leftOn: { gte: dayDate } }], status: { notIn: ['TRANSFERRED', 'WITHDRAWN'] } },
        _count: { _all: true },
      }),
    ]);
    const marks = sessions.length
      ? await this.prisma.db.attendanceRecord.groupBy({ by: ['sessionId', 'status'], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } })
      : [];

    const totals = { ...emptyCounts(), students: 0, percentPresent: null as number | null, sectionsTaken: 0, sectionsTotal: sections.length };
    const rows = sections.map((s) => {
      const session = sessions.find((x) => x.sectionId === s.id);
      const students = rollCounts.find((r) => r.sectionId === s.id)?._count._all ?? 0;
      const count = (status: AttendanceStatus) => marks.find((m) => m.sessionId === session?.id && m.status === status)?._count._all ?? 0;
      const submitted = session?.status === 'SUBMITTED';
      totals.students += students;
      if (submitted) {
        totals.sectionsTaken++;
        for (const st of ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE'] as const) totals[st] += count(st);
      }
      return {
        sectionId: s.id,
        label: short(s.class.name, s.name),
        classTeacher: s.classTeacher ? fullName(s.classTeacher.firstName, s.classTeacher.lastName) : null,
        status: (submitted ? 'SUBMITTED' : session ? 'DRAFT' : 'NOT_TAKEN') as AttendanceRegister['status'],
        students,
        present: count('PRESENT') + count('LATE'),
        absent: count('ABSENT'),
        late: count('LATE'),
        canMark: !markable || markable.includes(s.id),
      };
    });
    totals.percentPresent = percentPresent(totals);
    return { date: day, isWeeklyOff: settings.weeklyOffDays.includes(weekday(day)), totals, sections: rows };
  }

  async studentHistory(studentId: string, from?: string, to?: string): Promise<StudentAttendanceHistory> {
    const visible = (await this.scope.canAccessStudent('attendance.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!visible) throw AppError.notFound('student');
    const today = await this.today();
    const yearId = await this.scope.currentAcademicYearId();
    const year = yearId ? await this.prisma.db.academicYear.findUnique({ where: { id: yearId } }) : null;
    const start = from ?? (year ? fromDate(year.startDate)! : today);
    const end = to ?? today;
    const records = await this.prisma.db.attendanceRecord.findMany({
      where: { studentId, date: { gte: toDate(start), lte: toDate(end) }, session: { status: 'SUBMITTED' } },
      orderBy: { date: 'asc' },
      select: { date: true, status: true, remark: true },
    });
    const counts = emptyCounts();
    for (const r of records) counts[r.status]++;
    return {
      studentId,
      from: start,
      to: end,
      counts,
      percentPresent: percentPresent(counts),
      days: records.map((r) => ({ date: fromDate(r.date)!, status: r.status, remark: r.remark })),
    };
  }

  async sectionMonth(sectionId: string, month: string): Promise<SectionMonth> {
    const section = await this.sectionFor(sectionId);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const [sessions, roster] = await Promise.all([
      this.prisma.db.attendanceSession.findMany({
        where: { sectionId, status: 'SUBMITTED', date: { gte: toDate(first), lte: toDate(last) } },
        include: { records: { select: { studentId: true, status: true } } },
        orderBy: { date: 'asc' },
      }),
      this.roster(sectionId, last),
    ]);
    const days = sessions.map((s) => fromDate(s.date)!);
    return {
      section: { id: section.id, label: short(section.class.name, section.name) },
      month,
      days,
      students: roster.map((e) => {
        const marks: Record<string, AttendanceStatus> = {};
        const counts = emptyCounts();
        for (const s of sessions) {
          const r = s.records.find((x) => x.studentId === e.studentId);
          if (r) {
            marks[fromDate(s.date)!] = r.status;
            counts[r.status]++;
          }
        }
        return { studentId: e.studentId, name: fullName(e.student.firstName, e.student.lastName), rollNo: e.rollNo, marks, percentPresent: percentPresent(counts) };
      }),
    };
  }

  // ---------------------------------------------------------------- staff

  async staffDay(date?: string): Promise<StaffAttendanceDay> {
    const day = date ?? (await this.today());
    const [teachers, marks] = await Promise.all([
      this.prisma.db.teacher.findMany({ where: { status: { not: 'LEFT' } }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
      this.prisma.db.staffAttendance.findMany({ where: { date: toDate(day) } }),
    ]);
    const counts = emptyCounts();
    const rows = teachers.map((t) => {
      const m = marks.find((x) => x.teacherId === t.id);
      if (m) counts[m.status]++;
      else counts.unmarked++;
      return { teacherId: t.id, name: fullName(t.firstName, t.lastName), employeeId: t.employeeId, status: (m?.status ?? null) as AttendanceStatus | null, remark: m?.remark ?? null };
    });
    return { date: day, teachers: rows, counts };
  }

  async saveStaff(input: In<typeof saveStaffAttendanceSchema>): Promise<StaffAttendanceDay> {
    if (input.date > (await this.today())) throw new AppError('ATTENDANCE_LOCKED', 422, "Attendance can't be marked for a future date.");
    const ids = new Set((await this.prisma.db.teacher.findMany({ where: { id: { in: input.records.map((r) => r.teacherId) } }, select: { id: true } })).map((t) => t.id));
    if (input.records.some((r) => !ids.has(r.teacherId))) throw AppError.invalidReference('records', 'teacher');
    const { membershipId } = RequestContextStore.tenant();
    const day = toDate(input.date)!;
    await this.prisma.tenantTx(async (tx) => {
      for (const r of input.records) {
        await tx.staffAttendance.upsert({
          where: { teacherId_date: { teacherId: r.teacherId, date: day } },
          create: { teacherId: r.teacherId, date: day, status: r.status, remark: r.remark, markedByMemberId: membershipId } as Prisma.StaffAttendanceUncheckedCreateInput,
          update: { status: r.status, remark: r.remark ?? null, markedByMemberId: membershipId },
        });
      }
      await this.audit.record(tx, { action: 'staff_attendance.save', entityType: 'StaffAttendance', after: { date: input.date, count: input.records.length } });
    });
    return this.staffDay(input.date);
  }
}
