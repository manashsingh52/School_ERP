import { Injectable } from '@nestjs/common';
import { REPORTS, percentPresent, type ReportDef, type ReportKey, type ReportParams, type ReportTable } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fullName, todayIn, toDate } from '../../core/util/dates.js';
import type { FinanceReportKey } from '@schoolos/contracts';
import { FinanceReportsService } from '../finance/finance-reports.service.js';

const NONE = '00000000-0000-0000-0000-000000000000';
const LOW = 75;
const label = (cls: string, section: string) => `${cls.replace(/^Class\s+/i, '')}-${section}`;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const fmt = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
};
const FINANCE = new Set<string>(['collection', 'outstanding', 'defaulters', 'heads', 'concessions', 'reconciliation']);

/**
 * The report catalogue's data (docs/12 Phase 6). Every report returns the same table shape, so the
 * screen, CSV, Excel and PDF all come from one place. Runs as the requesting member, so scopes apply
 * (a teacher's academic reports cover only their sections) — also inside export jobs.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly finance: FinanceReportsService,
  ) {}

  /** Reports the caller may run. */
  catalog(): ReportDef[] {
    const perms = RequestContextStore.tenant().permissions;
    return REPORTS.filter((r) => perms[r.permission]);
  }

  def(key: ReportKey): ReportDef {
    const d = REPORTS.find((r) => r.key === key)!;
    if (!RequestContextStore.tenant().permissions[d.permission]) throw AppError.forbidden();
    return d;
  }

  async run(key: ReportKey, p: ReportParams): Promise<ReportTable> {
    const d = this.def(key);
    if (FINANCE.has(key)) {
      const r = await this.finance.run(key as FinanceReportKey, p);
      const cls = await this.className(p.classId);
      return { key, title: r.title, description: r.description, subtitle: [r.range && d.params.some((x) => x === 'range') ? `${fmt(r.range.from)} – ${fmt(r.range.to)}` : null, cls].filter(Boolean).join(' · ') || null, columns: r.columns, rows: r.rows, totals: r.totals };
    }
    switch (key) {
      case 'student_strength':
        return this.strength(d);
      case 'student_list':
        return this.studentList(d, p);
      case 'attendance_monthly':
        return this.attendanceMonthly(d, p);
      case 'attendance_low':
        return this.attendanceLow(d, p);
      case 'exam_summary':
        return this.examSummary(d, p);
      case 'exam_subjects':
        return this.examSubjects(d, p);
      default:
        throw AppError.notFound('report');
    }
  }

  private async className(classId?: string): Promise<string | null> {
    if (!classId) return null;
    const c = await this.prisma.db.schoolClass.findFirst({ where: { id: classId }, select: { name: true } });
    if (!c) throw AppError.invalidReference('classId', 'class');
    return c.name;
  }

  private async yearId() {
    return (await this.scope.currentAcademicYearId()) ?? NONE;
  }

  /** Sections this year the caller may report on (teachers: their own). */
  private async sections(classId?: string) {
    const [yearId, scope] = [await this.yearId(), this.scope.scopeOf('report.academic')];
    const assigned = scope === 'ALL' ? null : await this.scope.assignedSectionIds();
    return this.prisma.db.section.findMany({
      where: { academicYearId: yearId, ...(classId ? { classId } : {}), ...(assigned ? { id: { in: assigned } } : {}) },
      include: { class: { select: { name: true, displayOrder: true } } },
      orderBy: [{ class: { displayOrder: 'asc' } }, { name: 'asc' }],
    });
  }

  private table(d: ReportDef, subtitle: string | null, columns: ReportTable['columns'], rows: ReportTable['rows'], totals: ReportTable['totals'] = null): ReportTable {
    return { key: d.key, title: d.title, description: d.description, subtitle, columns, rows, totals };
  }

  private async strength(d: ReportDef): Promise<ReportTable> {
    const [sections, yearId] = [await this.sections(), await this.yearId()];
    const enr = await this.prisma.db.studentEnrollment.findMany({
      where: { academicYearId: yearId, sectionId: { in: sections.map((s) => s.id) }, student: { status: 'ACTIVE', archivedAt: null } },
      select: { sectionId: true, student: { select: { gender: true } } },
    });
    const rows = sections.map((s) => {
      const mine = enr.filter((e) => e.sectionId === s.id);
      const g = (x: string) => mine.filter((e) => e.student.gender === x).length;
      return { section: label(s.class.name, s.name), boys: g('MALE'), girls: g('FEMALE'), other: mine.length - g('MALE') - g('FEMALE'), total: mine.length, capacity: s.capacity ?? null };
    });
    const sum = (k: 'boys' | 'girls' | 'other' | 'total') => rows.reduce((a, r) => a + r[k], 0);
    return this.table(d, `As on ${fmt(todayIn())}`, [
      { key: 'section', label: 'Class', type: 'text' },
      { key: 'boys', label: 'Boys', type: 'number' },
      { key: 'girls', label: 'Girls', type: 'number' },
      { key: 'other', label: 'Other / not given', type: 'number' },
      { key: 'total', label: 'Total', type: 'number' },
      { key: 'capacity', label: 'Capacity', type: 'number' },
    ], rows, { boys: sum('boys'), girls: sum('girls'), other: sum('other'), total: sum('total') });
  }

  private async studentList(d: ReportDef, p: ReportParams): Promise<ReportTable> {
    const [sections, yearId, cls] = [await this.sections(p.classId), await this.yearId(), await this.className(p.classId)];
    const contacts = !!RequestContextStore.tenant().permissions['student.contact.view'];
    const enr = await this.prisma.db.studentEnrollment.findMany({
      where: { academicYearId: yearId, sectionId: { in: sections.map((s) => s.id) }, student: { status: 'ACTIVE', archivedAt: null } },
      select: {
        sectionId: true,
        rollNo: true,
        student: { select: { admissionNo: true, firstName: true, lastName: true, dateOfBirth: true, gender: true, guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { relation: true, guardian: { select: { name: true, phone: true } } } } } },
      },
    });
    const order = new Map(sections.map((s, i) => [s.id, i]));
    const name = new Map(sections.map((s) => [s.id, label(s.class.name, s.name)]));
    enr.sort((a, b) => order.get(a.sectionId)! - order.get(b.sectionId)! || (a.rollNo ?? 999) - (b.rollNo ?? 999) || a.student.firstName.localeCompare(b.student.firstName));
    const rows = enr.map((e) => {
      const g = e.student.guardians[0];
      return {
        admissionNo: e.student.admissionNo,
        name: fullName(e.student.firstName, e.student.lastName),
        class: name.get(e.sectionId)!,
        rollNo: e.rollNo ?? null,
        dob: e.student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        gender: e.student.gender ? e.student.gender[0] + e.student.gender.slice(1).toLowerCase() : null,
        parent: g ? `${g.guardian.name} (${g.relation[0]}${g.relation.slice(1).toLowerCase()})` : null,
        ...(contacts ? { phone: g?.guardian.phone ?? null } : {}),
      };
    });
    return this.table(d, cls, [
      { key: 'admissionNo', label: 'Adm. no', type: 'text' },
      { key: 'name', label: 'Student', type: 'text' },
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'rollNo', label: 'Roll', type: 'number' },
      { key: 'dob', label: 'Date of birth', type: 'date' },
      { key: 'gender', label: 'Gender', type: 'text' },
      { key: 'parent', label: 'Parent', type: 'text' },
      ...(contacts ? [{ key: 'phone', label: 'Phone', type: 'text' as const }] : []),
    ], rows);
  }

  /** Per-student counts over submitted registers in a period, for the given sections. */
  private async attendanceCounts(sectionIds: string[], from: string, to: string) {
    const records = await this.prisma.db.attendanceRecord.findMany({
      where: { date: { gte: toDate(from), lte: toDate(to) }, session: { status: 'SUBMITTED', sectionId: { in: sectionIds } } },
      select: { studentId: true, status: true, date: true, session: { select: { sectionId: true } } },
    });
    const per = new Map<string, { sectionId: string; PRESENT: number; ABSENT: number; LATE: number; HALF_DAY: number; LEAVE: number }>();
    for (const r of records) {
      const c = per.get(r.studentId) ?? { sectionId: r.session.sectionId, PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0 };
      c[r.status]++;
      per.set(r.studentId, c);
    }
    return { records, per };
  }

  private async attendanceMonthly(d: ReportDef, p: ReportParams): Promise<ReportTable> {
    const month = p.month ?? todayIn().slice(0, 7);
    const { from, to } = monthRange(month);
    const sections = await this.sections(p.classId);
    const { records, per } = await this.attendanceCounts(sections.map((s) => s.id), from, to);
    const rows = sections.map((s) => {
      const days = new Set(records.filter((r) => r.session.sectionId === s.id).map((r) => r.date.toISOString())).size;
      const students = [...per.values()].filter((c) => c.sectionId === s.id);
      const totals = students.reduce((a, c) => ({ PRESENT: a.PRESENT + c.PRESENT, ABSENT: a.ABSENT + c.ABSENT, LATE: a.LATE + c.LATE, HALF_DAY: a.HALF_DAY + c.HALF_DAY }), { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0 });
      return {
        section: label(s.class.name, s.name),
        days,
        students: students.length,
        average: percentPresent(totals),
        absences: totals.ABSENT,
        low: students.filter((c) => (percentPresent(c) ?? 100) < LOW).length,
      };
    });
    const [y, m] = month.split('-').map(Number) as [number, number];
    const title = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    return this.table(d, [title, await this.className(p.classId)].filter(Boolean).join(' · '), [
      { key: 'section', label: 'Class', type: 'text' },
      { key: 'days', label: 'Working days', type: 'number' },
      { key: 'students', label: 'Students', type: 'number' },
      { key: 'average', label: 'Average attendance', type: 'percent' },
      { key: 'absences', label: 'Absences', type: 'number' },
      { key: 'low', label: `Below ${LOW}%`, type: 'number' },
    ], rows);
  }

  private async attendanceLow(d: ReportDef, p: ReportParams): Promise<ReportTable> {
    const today = todayIn();
    const from = p.from ?? `${today.slice(0, 8)}01`;
    const to = p.to ?? today;
    const threshold = p.threshold ?? LOW;
    const sections = await this.sections(p.classId);
    const { per } = await this.attendanceCounts(sections.map((s) => s.id), from, to);
    const low = [...per.entries()].map(([studentId, c]) => ({ studentId, c, pct: percentPresent(c) })).filter((x) => x.pct !== null && x.pct < threshold);
    const students = await this.prisma.db.student.findMany({ where: { id: { in: low.map((x) => x.studentId) } }, select: { id: true, admissionNo: true, firstName: true, lastName: true } });
    const sec = new Map(sections.map((s) => [s.id, label(s.class.name, s.name)]));
    const rows = low
      .sort((a, b) => a.pct! - b.pct!)
      .map((x) => {
        const s = students.find((st) => st.id === x.studentId)!;
        return { name: fullName(s.firstName, s.lastName), admissionNo: s.admissionNo, class: sec.get(x.c.sectionId) ?? '', present: x.c.PRESENT + x.c.LATE + x.c.HALF_DAY / 2, absent: x.c.ABSENT, marked: x.c.PRESENT + x.c.ABSENT + x.c.LATE + x.c.HALF_DAY, percent: x.pct };
      });
    return this.table(d, [`${fmt(from)} – ${fmt(to)}`, `below ${threshold}%`, await this.className(p.classId)].filter(Boolean).join(' · '), [
      { key: 'name', label: 'Student', type: 'text' },
      { key: 'admissionNo', label: 'Adm. no', type: 'text' },
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'present', label: 'Present', type: 'number' },
      { key: 'absent', label: 'Absent', type: 'number' },
      { key: 'marked', label: 'Days marked', type: 'number' },
      { key: 'percent', label: 'Attendance', type: 'percent' },
    ], rows);
  }

  private async exam(examId?: string) {
    if (!examId) throw new AppError('VALIDATION_FAILED', 422, 'Choose an exam.', [{ field: 'examId', message: 'Required' }]);
    const exam = await this.prisma.db.exam.findFirst({ where: { id: examId }, select: { id: true, name: true } });
    if (!exam) throw AppError.invalidReference('examId', 'exam');
    return exam;
  }

  private async examSummary(d: ReportDef, p: ReportParams): Promise<ReportTable> {
    const exam = await this.exam(p.examId);
    const sections = await this.sections();
    const results = await this.prisma.db.examResult.findMany({
      where: { examId: exam.id, sectionId: { in: sections.map((s) => s.id) } },
      select: { sectionId: true, percentage: true, resultStatus: true, student: { select: { firstName: true, lastName: true } } },
    });
    const rows = sections
      .map((s) => {
        const mine = results.filter((r) => r.sectionId === s.id && r.resultStatus !== 'INCOMPLETE' && r.resultStatus !== 'WITHHELD');
        if (!mine.length) return null;
        const passed = mine.filter((r) => r.resultStatus === 'PASS').length;
        const top = mine.reduce((a, r) => (Number(r.percentage) > Number(a.percentage) ? r : a));
        return {
          section: label(s.class.name, s.name),
          appeared: mine.length,
          passed,
          failed: mine.length - passed,
          passPercent: pct(passed, mine.length),
          average: Math.round((mine.reduce((a, r) => a + Number(r.percentage), 0) / mine.length) * 10) / 10,
          topper: `${fullName(top.student.firstName, top.student.lastName)} (${Number(top.percentage)}%)`,
        };
      })
      .filter((r) => r !== null);
    const appeared = rows.reduce((a, r) => a + r.appeared, 0);
    const passed = rows.reduce((a, r) => a + r.passed, 0);
    return this.table(d, exam.name, [
      { key: 'section', label: 'Class', type: 'text' },
      { key: 'appeared', label: 'Appeared', type: 'number' },
      { key: 'passed', label: 'Passed', type: 'number' },
      { key: 'failed', label: 'Not passed', type: 'number' },
      { key: 'passPercent', label: 'Pass %', type: 'percent' },
      { key: 'average', label: 'Average', type: 'percent' },
      { key: 'topper', label: 'Topper', type: 'text' },
    ], rows, { appeared, passed, failed: appeared - passed, passPercent: pct(passed, appeared) ?? 0 });
  }

  private async examSubjects(d: ReportDef, p: ReportParams): Promise<ReportTable> {
    const exam = await this.exam(p.examId);
    const [sections, yearId, cls] = [await this.sections(p.classId), await this.yearId(), await this.className(p.classId)];
    const enr = await this.prisma.db.studentEnrollment.findMany({ where: { academicYearId: yearId, sectionId: { in: sections.map((s) => s.id) } }, select: { studentId: true } });
    const studentIds = enr.map((e) => e.studentId);
    const subjects = await this.prisma.db.examSubject.findMany({
      where: { examId: exam.id, ...(p.classId ? { classId: p.classId } : {}) },
      include: { class: { select: { name: true, displayOrder: true } }, subject: { select: { name: true } }, marks: { where: { studentId: { in: studentIds } }, select: { marksObtained: true, isAbsent: true, isExempt: true } } },
      orderBy: [{ class: { displayOrder: 'asc' } }, { subject: { name: 'asc' } }],
    });
    const rows = subjects
      .map((s) => {
        const scored = s.marks.filter((m) => !m.isExempt && !m.isAbsent && m.marksObtained !== null).map((m) => Number(m.marksObtained));
        const absent = s.marks.filter((m) => m.isAbsent).length;
        if (!scored.length && !absent) return null;
        const max = Number(s.maxMarks);
        const pass = scored.filter((x) => x >= Number(s.passMarks)).length;
        return {
          class: s.class.name,
          subject: s.subject.name,
          appeared: scored.length,
          absent,
          average: scored.length ? Math.round((scored.reduce((a, x) => a + x, 0) / scored.length / max) * 1000) / 10 : null,
          highest: scored.length ? Math.max(...scored) : null,
          maxMarks: max,
          passPercent: pct(pass, scored.length + absent),
        };
      })
      .filter((r) => r !== null);
    return this.table(d, [exam.name, cls].filter(Boolean).join(' · '), [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'appeared', label: 'Appeared', type: 'number' },
      { key: 'absent', label: 'Absent', type: 'number' },
      { key: 'average', label: 'Average', type: 'percent' },
      { key: 'highest', label: 'Highest', type: 'number' },
      { key: 'maxMarks', label: 'Out of', type: 'number' },
      { key: 'passPercent', label: 'Pass %', type: 'percent' },
    ], rows);
  }
}
