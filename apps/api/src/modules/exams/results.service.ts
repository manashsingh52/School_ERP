import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import {
  gradeFor,
  percentPresent,
  type ResultRow,
  type ResultStatus,
  type ResultSubject,
  type ResultsSummary,
  type StudentResultItem,
  type updateResultSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fullName, todayIn, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CoScholasticService } from './co-scholastic.service.js';
import { ExamsService } from './exams.service.js';
import { ON_ROLL } from './marks.service.js';

type In<T extends z.ZodType> = z.output<T>;
const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Computed {
  studentId: string;
  sectionId: string;
  classId: string;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string | null;
  status: ResultStatus;
  attendancePct: number | null;
}

/** Standard competition ranking ("1, 1, 3"): ties share a rank. */
function rank<T extends { percentage: number }>(rows: T[]): Map<T, number> {
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  const ranks = new Map<T, number>();
  sorted.forEach((r, i) => ranks.set(r, i > 0 && sorted[i - 1]!.percentage === r.percentage ? ranks.get(sorted[i - 1]!)! : i + 1));
  return ranks;
}

/**
 * Results (Master Prompt §33): computed from marks into a snapshot, previewed, then published.
 * Publishing locks every subject's marks and tells parents; corrections need an unpublish
 * (or a forced, audited recompute).
 */
@Injectable()
export class ResultsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly exams: ExamsService,
    private readonly notifications: NotificationsService,
    private readonly coScholastic: CoScholasticService,
  ) {}

  onModuleInit(): void {
    this.outbox.on('exam.results_published', (event) => this.notifyParents(String(event.payload.examId)));
  }

  // ---------------------------------------------------------------- compute

  async compute(examId: string, force: boolean): Promise<ResultsSummary> {
    const exam = await this.exams.row(examId);
    if (exam.status === 'RESULTS_PUBLISHED' && !force) throw new AppError('RESULTS_PUBLISHED', 422, 'Results are already published. Recompute with "force" to apply corrections.');
    if (exam.status === 'DRAFT' || exam.status === 'SCHEDULED') throw new AppError('MARKS_NOT_OPEN', 422, 'Open marks entry for this exam first.');
    if (!exam.subjects.length) throw new AppError('NO_SUBJECTS', 422, 'This exam has no subjects.');

    const scale = await this.prisma.db.gradeBand.findMany({ where: { gradingScaleId: exam.gradingScaleId } });
    const bands = scale.map((b) => ({ label: b.label, minPercent: Number(b.minPercent) }));
    const classIds = [...new Set(exam.subjects.map((s) => s.classId))];
    const [enrollments, marks, existing] = await Promise.all([
      this.prisma.db.studentEnrollment.findMany({ where: { classId: { in: classIds }, academicYearId: exam.academicYearId, ...ON_ROLL }, select: { studentId: true, sectionId: true, classId: true } }),
      this.prisma.db.mark.findMany({ where: { examSubject: { examId } } }),
      this.prisma.db.examResult.findMany({ where: { examId }, select: { studentId: true, resultStatus: true } }),
    ]);
    const attendance = await this.attendance(enrollments.map((e) => e.studentId), exam.academicYearId, exam.endDate);
    const markOf = new Map(marks.map((m) => [`${m.examSubjectId}|${m.studentId}`, m]));
    const withheld = new Set(existing.filter((r) => r.resultStatus === 'WITHHELD').map((r) => r.studentId));

    const computed: Computed[] = enrollments.map((e) => {
      let obtained = 0;
      let max = 0;
      let missing = false;
      let failed = false;
      for (const es of exam.subjects.filter((s) => s.classId === e.classId)) {
        const m = markOf.get(`${es.id}|${e.studentId}`);
        if (m?.isExempt) continue;
        max += Number(es.maxMarks);
        if (!m || (m.marksObtained === null && !m.isAbsent)) {
          missing = true;
          continue;
        }
        const got = m.isAbsent ? 0 : Number(m.marksObtained);
        obtained += got;
        if (m.isAbsent || got < Number(es.passMarks)) failed = true;
      }
      const percentage = max ? round2((obtained / max) * 100) : 0;
      const status: ResultStatus = withheld.has(e.studentId) ? 'WITHHELD' : missing ? 'INCOMPLETE' : failed ? 'FAIL' : 'PASS';
      return {
        studentId: e.studentId,
        sectionId: e.sectionId,
        classId: e.classId,
        totalObtained: round2(obtained),
        totalMax: max,
        percentage,
        grade: missing ? null : gradeFor(percentage, bands),
        status,
        attendancePct: attendance.get(e.studentId) ?? null,
      };
    });

    // Ranks only among complete results.
    const ranked = computed.filter((c) => c.status === 'PASS' || c.status === 'FAIL');
    const sectionRank = new Map<Computed, number>();
    const classRank = new Map<Computed, number>();
    if (exam.rankingEnabled) {
      for (const sectionId of new Set(ranked.map((r) => r.sectionId))) for (const [r, n] of rank(ranked.filter((x) => x.sectionId === sectionId))) sectionRank.set(r, n);
      for (const classId of classIds) for (const [r, n] of rank(ranked.filter((x) => x.classId === classId))) classRank.set(r, n);
    }

    const now = new Date();
    const published = exam.status === 'RESULTS_PUBLISHED';
    await this.prisma.tenantTx(
      async (tx) => {
        await tx.examResult.deleteMany({ where: { examId, studentId: { notIn: computed.map((c) => c.studentId) } } });
        for (const c of computed) {
          const data = {
            sectionId: c.sectionId,
            totalObtained: c.totalObtained,
            totalMax: c.totalMax,
            percentage: c.percentage,
            grade: c.grade,
            resultStatus: c.status,
            rankInSection: sectionRank.get(c) ?? null,
            rankInClass: classRank.get(c) ?? null,
            attendancePct: c.attendancePct,
            computedAt: now,
            ...(published ? { publishedAt: now } : {}),
          };
          await tx.examResult.upsert({
            where: { examId_studentId: { examId, studentId: c.studentId } },
            create: { ...data, examId, studentId: c.studentId } as Prisma.ExamResultUncheckedCreateInput,
            update: data,
          });
        }
        await this.audit.record(tx, { action: published ? 'results.republish' : 'results.compute', entityType: 'Exam', entityId: examId, metadata: { students: computed.length } });
      },
      { timeout: 60_000 },
    );
    return this.summary(examId);
  }

  /** Present-equivalent % from the start of the year to the exam's end (or today). */
  private async attendance(studentIds: string[], yearId: string, until: Date | null): Promise<Map<string, number | null>> {
    const year = await this.prisma.db.academicYear.findUnique({ where: { id: yearId }, select: { startDate: true } });
    const end = until ?? toDate(todayIn())!;
    const rows = await this.prisma.db.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, date: { gte: year?.startDate, lte: end }, session: { status: 'SUBMITTED' } },
      _count: { _all: true },
    });
    const per = new Map<string, { PRESENT: number; ABSENT: number; LATE: number; HALF_DAY: number }>();
    for (const r of rows) {
      const c = per.get(r.studentId) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0 };
      if (r.status !== 'LEAVE') c[r.status] += r._count._all;
      per.set(r.studentId, c);
    }
    return new Map([...per].map(([id, c]) => [id, percentPresent(c)]));
  }

  // ---------------------------------------------------------------- read

  /** Sections whose results the caller may see; null = all. */
  async visibleSections(): Promise<string[] | null> {
    const perms = RequestContextStore.tenant().permissions;
    if (perms['results.publish'] || perms['results.view'] === 'ALL') return null;
    if (perms['results.view'] === 'ASSIGNED') return this.scope.assignedSectionIds();
    return [];
  }

  async summary(examId: string): Promise<ResultsSummary> {
    const exam = await this.exams.row(examId);
    const sections = await this.visibleSections();
    const rows = await this.prisma.db.examResult.findMany({ where: { examId, ...(sections ? { sectionId: { in: sections } } : {}) }, select: { resultStatus: true, percentage: true, computedAt: true } });
    const count = (s: ResultStatus) => rows.filter((r) => r.resultStatus === s).length;
    const complete = rows.filter((r) => r.resultStatus === 'PASS' || r.resultStatus === 'FAIL');
    return {
      computedAt: rows.length ? new Date(Math.max(...rows.map((r) => r.computedAt.getTime()))).toISOString() : null,
      publishedAt: exam.publishedAt?.toISOString() ?? null,
      students: rows.length,
      passed: count('PASS'),
      failed: count('FAIL'),
      incomplete: count('INCOMPLETE'),
      withheld: count('WITHHELD'),
      average: complete.length ? round2(complete.reduce((a, r) => a + Number(r.percentage), 0) / complete.length) : null,
    };
  }

  async list(examId: string, sectionId?: string): Promise<{ data: ResultRow[]; summary: ResultsSummary }> {
    await this.exams.row(examId);
    const sections = await this.visibleSections();
    if (sectionId && sections && !sections.includes(sectionId)) throw AppError.notFound('section');
    const where: Prisma.ExamResultWhereInput = { examId, ...(sectionId ? { sectionId } : sections ? { sectionId: { in: sections } } : {}) };
    return { data: await this.rows(examId, where), summary: await this.summary(examId) };
  }

  async rows(examId: string, where: Prisma.ExamResultWhereInput): Promise<ResultRow[]> {
    const exam = await this.prisma.db.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { subjects: { include: { subject: { select: { id: true, name: true } } } }, gradingScale: { include: { bands: true } } },
    });
    const bands = exam.gradingScale.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent) }));
    const results = await this.prisma.db.examResult.findMany({
      where,
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true, enrollments: { where: { academicYearId: exam.academicYearId }, select: { rollNo: true, classId: true } } } },
        section: { select: { id: true, name: true, class: { select: { name: true, displayOrder: true } } } },
      },
    });
    const marks = await this.prisma.db.mark.findMany({ where: { examSubject: { examId }, studentId: { in: results.map((r) => r.studentId) } } });
    const markOf = new Map(marks.map((m) => [`${m.examSubjectId}|${m.studentId}`, m]));
    results.sort(
      (a, b) =>
        a.section.class.displayOrder - b.section.class.displayOrder ||
        a.section.name.localeCompare(b.section.name) ||
        (a.student.enrollments[0]?.rollNo ?? 9999) - (b.student.enrollments[0]?.rollNo ?? 9999) ||
        a.student.firstName.localeCompare(b.student.firstName),
    );
    return results.map((r) => {
      const classId = r.student.enrollments[0]?.classId;
      const subjects: ResultSubject[] = exam.subjects
        .filter((s) => s.classId === classId)
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
        .map((s) => {
          const m = markOf.get(`${s.id}|${r.studentId}`);
          const got = m?.marksObtained === null || m?.marksObtained === undefined ? null : Number(m.marksObtained);
          const max = Number(s.maxMarks);
          return {
            examSubjectId: s.id,
            subject: s.subject,
            maxMarks: max,
            passMarks: Number(s.passMarks),
            marks: got,
            absent: m?.isAbsent ?? false,
            exempt: m?.isExempt ?? false,
            grade: got !== null ? gradeFor(round2((got / max) * 100), bands) : m?.isAbsent ? gradeFor(0, bands) : null,
            passed: m?.isExempt ? null : m?.isAbsent ? false : got === null ? null : got >= Number(s.passMarks),
          };
        });
      return {
        studentId: r.studentId,
        name: fullName(r.student.firstName, r.student.lastName),
        admissionNo: r.student.admissionNo,
        rollNo: r.student.enrollments[0]?.rollNo ?? null,
        section: { id: r.section.id, label: label(r.section.class.name, r.section.name) },
        subjects,
        totalObtained: Number(r.totalObtained),
        totalMax: Number(r.totalMax),
        percentage: Number(r.percentage),
        grade: r.grade,
        status: r.resultStatus,
        rankInSection: r.rankInSection,
        rankInClass: r.rankInClass,
        attendancePct: r.attendancePct === null ? null : Number(r.attendancePct),
        teacherRemark: r.teacherRemark,
        principalRemark: r.principalRemark,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      };
    });
  }

  /** A child's published results across this year's exams (parents, and staff on a student profile). */
  async forStudent(studentId: string): Promise<StudentResultItem[]> {
    const ok = (await this.scope.canAccessStudent('results.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!ok) throw AppError.notFound('student');
    const yearId = await this.scope.currentAcademicYearId();
    const published = await this.prisma.db.examResult.findMany({
      where: { studentId, publishedAt: { not: null }, resultStatus: { not: 'WITHHELD' }, exam: { academicYearId: yearId ?? undefined, status: 'RESULTS_PUBLISHED' } },
      include: { exam: { select: { id: true, name: true, term: true, publishedAt: true } } },
      orderBy: { publishedAt: 'desc' },
    });
    const cards = await this.prisma.db.reportCard.findMany({ where: { studentId, examId: { in: published.map((p) => p.examId) } }, orderBy: { version: 'desc' } });
    const out: StudentResultItem[] = [];
    for (const p of published) {
      const [row] = await this.rows(p.examId, { examId: p.examId, studentId });
      const card = cards.find((c) => c.examId === p.examId);
      out.push({
        exam: { id: p.exam.id, name: p.exam.name, term: p.exam.term, publishedAt: p.exam.publishedAt?.toISOString() ?? null },
        result: row!,
        reportCard: card ? { version: card.version, generatedAt: card.generatedAt.toISOString() } : null,
        coScholastic: (await this.coScholastic.forStudents(p.examId, [studentId])).get(studentId) ?? [],
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- write

  async update(examId: string, studentId: string, input: In<typeof updateResultSchema>): Promise<ResultRow> {
    const exam = await this.exams.row(examId);
    const result = await this.prisma.db.examResult.findUnique({ where: { examId_studentId: { examId, studentId } }, include: { section: { select: { classTeacherId: true } } } });
    if (!result) throw AppError.notFound('result');
    const perms = RequestContextStore.tenant().permissions;
    const office = !!perms['results.publish'];
    const classTeacher = result.section.classTeacherId && result.section.classTeacherId === (await this.scope.myTeacherId());
    if (!office && !classTeacher) throw AppError.notFound('result');
    if ((input.principalRemark !== undefined || input.withheld !== undefined) && !office) throw AppError.forbidden('Only the exam office can do this.');
    if (input.withheld !== undefined && exam.status === 'RESULTS_PUBLISHED') throw new AppError('RESULTS_PUBLISHED', 422, 'Unpublish results before withholding or releasing one.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.examResult.update({
        where: { id: result.id },
        data: {
          teacherRemark: input.teacherRemark,
          principalRemark: input.principalRemark,
          ...(input.withheld === true ? { resultStatus: 'WITHHELD' } : {}),
          ...(input.withheld === false && result.resultStatus === 'WITHHELD' ? { resultStatus: 'INCOMPLETE' } : {}),
        },
      });
      await this.audit.record(tx, { action: 'results.update', entityType: 'ExamResult', entityId: result.id, after: input });
    });
    // Releasing a withheld result recomputes its real status.
    if (input.withheld === false && result.resultStatus === 'WITHHELD') await this.compute(examId, false);
    const [row] = await this.rows(examId, { examId, studentId });
    return row!;
  }

  async publish(examId: string): Promise<ResultsSummary> {
    const exam = await this.exams.row(examId);
    if (exam.status === 'RESULTS_PUBLISHED') return this.summary(examId);
    const summary = await this.summary(examId);
    if (!summary.computedAt) throw new AppError('NOT_COMPUTED', 422, 'Compute the results first, then check them before publishing.');
    const newerMarks = await this.prisma.db.mark.count({ where: { examSubject: { examId }, updatedAt: { gt: new Date(summary.computedAt) } } });
    if (newerMarks) throw new AppError('STALE_RESULTS', 422, 'Marks changed after the results were computed. Compute again before publishing.');
    if (summary.incomplete) throw new AppError('RESULTS_INCOMPLETE', 422, `${summary.incomplete} student(s) have missing marks. Enter them, or withhold those results, before publishing.`);
    const now = new Date();
    await this.prisma.tenantTx(async (tx) => {
      await tx.exam.update({ where: { id: examId }, data: { status: 'RESULTS_PUBLISHED', publishedAt: now } });
      await tx.examResult.updateMany({ where: { examId }, data: { publishedAt: now } });
      await tx.examSubject.updateMany({ where: { examId, marksLockedAt: null }, data: { marksLockedAt: now } });
      await this.audit.record(tx, { action: 'results.publish', entityType: 'Exam', entityId: examId, metadata: { ...summary } });
      await this.outbox.publish(tx, 'exam.results_published', { examId });
    });
    this.outbox.flush();
    return this.summary(examId);
  }

  async unpublish(examId: string): Promise<ResultsSummary> {
    const exam = await this.exams.row(examId);
    if (exam.status !== 'RESULTS_PUBLISHED') return this.summary(examId);
    await this.prisma.tenantTx(async (tx) => {
      await tx.exam.update({ where: { id: examId }, data: { status: 'MARKS_ENTRY', publishedAt: null } });
      await tx.examResult.updateMany({ where: { examId }, data: { publishedAt: null } });
      await this.audit.record(tx, { action: 'results.unpublish', entityType: 'Exam', entityId: examId });
    });
    return this.summary(examId);
  }

  private async notifyParents(examId: string): Promise<void> {
    const exam = await this.prisma.db.exam.findUnique({ where: { id: examId }, select: { name: true, status: true } });
    if (exam?.status !== 'RESULTS_PUBLISHED') return;
    const results = await this.prisma.db.examResult.findMany({
      where: { examId, publishedAt: { not: null }, resultStatus: { not: 'WITHHELD' } },
      select: { studentId: true, student: { select: { firstName: true } } },
    });
    const names = new Map(results.map((r) => [r.studentId, r.student.firstName]));
    const guardians = await this.notifications.guardiansOf([...names.keys()]);
    await this.notifications.notify({
      event: 'exam.results_published',
      recipients: guardians.map((g) => ({
        membershipId: g.membershipId,
        vars: { exam: exam.name, student: names.get(g.studentId) },
        data: { route: '/my/results', examId, studentId: g.studentId },
      })),
      dedupeKey: (_m, i) => `results:${examId}:${guardians[i]!.studentId}`,
    });
  }
}
