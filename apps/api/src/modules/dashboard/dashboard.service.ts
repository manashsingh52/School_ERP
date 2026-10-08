import { Injectable } from '@nestjs/common';
import { percentPresent, type AttentionItem, type DashboardData } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { toDate } from '../../core/util/dates.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

const LOW_ATTENDANCE = 75; // % below which a student needs attention (common Indian school rule)
const MIN_DAYS = 5; // ignore students with too few marked days this month

/** Home page (Master Prompt §21): numbers and "attention required" items, scoped to the caller. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly attendance: AttendanceService,
    private readonly timetable: TimetableService,
  ) {}

  async get(): Promise<DashboardData> {
    const perms = RequestContextStore.tenant().permissions;
    const wholeSchool = perms['attendance.view'] === 'ALL';
    const yearId = await this.scope.currentAcademicYearId();
    const attention: AttentionItem[] = [];

    const overview = yearId && perms['attendance.view'] && perms['attendance.view'] !== 'OWN_CHILDREN' ? await this.attendance.overview() : null;
    const date = overview?.date ?? new Date().toISOString().slice(0, 10);
    const isWeeklyOff = overview?.isWeeklyOff ?? false;

    const [students, teachers] = await Promise.all([
      perms['student.view'] === 'ALL' ? this.prisma.db.student.count({ where: { status: 'ACTIVE', archivedAt: null } }) : null,
      perms['teacher.view'] === 'ALL' ? this.prisma.db.teacher.count({ where: { status: { not: 'LEFT' }, archivedAt: null } }) : null,
    ]);

    // Registers the caller can mark that are still open.
    const myRegisters =
      overview && !isWeeklyOff
        ? overview.sections.filter((s) => s.canMark && s.status !== 'SUBMITTED' && (!wholeSchool || perms['attendance.mark'] !== 'ALL')).map((s) => ({ sectionId: s.sectionId, label: s.label, status: s.status as 'NOT_TAKEN' | 'DRAFT' }))
        : [];

    if (overview && wholeSchool && !isWeeklyOff) {
      const pending = overview.sections.filter((s) => s.status !== 'SUBMITTED' && s.students > 0);
      if (pending.length) {
        attention.push({
          key: 'attendance.pending',
          tone: 'warning',
          title: `${pending.length} register${pending.length === 1 ? '' : 's'} not submitted today`,
          detail: pending.slice(0, 6).map((s) => s.label).join(', ') + (pending.length > 6 ? ` and ${pending.length - 6} more` : ''),
          href: '/attendance',
        });
      }
      if (overview.totals.ABSENT) {
        attention.push({ key: 'attendance.absent', tone: 'info', title: `${overview.totals.ABSENT} student${overview.totals.ABSENT === 1 ? '' : 's'} absent today`, detail: 'Parents have been told.', href: '/attendance' });
      }
    }

    if (wholeSchool && yearId) {
      const low = await this.lowAttendance(date);
      if (low.count) {
        attention.push({
          key: 'attendance.low',
          tone: 'danger',
          title: `${low.count} student${low.count === 1 ? '' : 's'} below ${LOW_ATTENDANCE}% attendance this month`,
          detail: low.names.join(', ') + (low.count > low.names.length ? ` and ${low.count - low.names.length} more` : ''),
          href: '/attendance',
        });
      }
    }

    if (perms['timetable.manage'] && yearId) {
      const [sections, published] = await Promise.all([
        this.prisma.db.section.count({ where: { academicYearId: yearId } }),
        this.prisma.db.timetable.count({ where: { academicYearId: yearId, status: 'PUBLISHED' } }),
      ]);
      if (sections && published < sections) {
        attention.push({ key: 'timetable.unpublished', tone: 'info', title: `${sections - published} section${sections - published === 1 ? '' : 's'} without a published timetable`, href: '/timetable' });
      }
    }

    const { membershipId } = RequestContextStore.tenant();
    const [scheduledNotices, draftNotices] = perms['notice.create']
      ? await Promise.all([
          this.prisma.db.notice.count({ where: { status: 'SCHEDULED', ...(perms['notice.publish_school'] ? {} : { createdByMemberId: membershipId }) } }),
          this.prisma.db.notice.count({ where: { status: 'DRAFT', createdByMemberId: membershipId } }),
        ])
      : [0, 0];
    if (draftNotices) attention.push({ key: 'notices.drafts', tone: 'info', title: `${draftNotices} notice draft${draftNotices === 1 ? '' : 's'} not sent`, href: '/notices' });
    if (scheduledNotices) attention.push({ key: 'notices.scheduled', tone: 'info', title: `${scheduledNotices} notice${scheduledNotices === 1 ? '' : 's'} scheduled`, href: '/notices' });

    const teacherId = await this.scope.myTeacherId();
    const today = teacherId && yearId && perms['timetable.view'] ? await this.timetable.today(date, undefined) : null;

    return {
      date,
      isWeeklyOff,
      kpis: {
        students,
        teachers,
        presentPercent: wholeSchool ? (overview?.totals.percentPresent ?? null) : null,
        absentToday: wholeSchool && overview?.totals.sectionsTaken ? overview.totals.ABSENT : null,
        registers: wholeSchool && overview ? { taken: overview.totals.sectionsTaken, total: overview.totals.sectionsTotal } : null,
      },
      attention,
      myRegisters,
      today,
    };
  }

  /** Students under the threshold this month (submitted registers only). */
  private async lowAttendance(date: string): Promise<{ count: number; names: string[] }> {
    const rows = await this.prisma.db.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      where: { date: { gte: toDate(`${date.slice(0, 7)}-01`), lte: toDate(date) }, session: { status: 'SUBMITTED' } },
      _count: { _all: true },
    });
    const per = new Map<string, { PRESENT: number; ABSENT: number; LATE: number; HALF_DAY: number }>();
    for (const r of rows) {
      const c = per.get(r.studentId) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0 };
      if (r.status !== 'LEAVE') c[r.status] += r._count._all;
      per.set(r.studentId, c);
    }
    const low = [...per.entries()]
      .filter(([, c]) => c.PRESENT + c.ABSENT + c.LATE + c.HALF_DAY >= MIN_DAYS && (percentPresent(c) ?? 100) < LOW_ATTENDANCE)
      .map(([id]) => id);
    if (!low.length) return { count: 0, names: [] };
    const names = await this.prisma.db.student.findMany({ where: { id: { in: low.slice(0, 5) } }, select: { firstName: true, lastName: true } });
    return { count: low.length, names: names.map((n) => [n.firstName, n.lastName].filter(Boolean).join(' ')) };
  }
}
