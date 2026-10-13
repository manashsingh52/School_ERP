import { Injectable } from '@nestjs/common';
import type { PerformanceExam, PerformanceSubject, StudentPerformance } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fromDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ResultsService } from './results.service.js';

const pct = (got: number, max: number) => (max > 0 ? Math.round((got / max) * 1000) / 10 : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * A student's marks shaped for charts: a progress line across exams and a radar of subjects, each
 * subject opening into its unit tests and exams, with the section's average beside every number.
 * Built from computed results, so it changes whenever results are recomputed or published.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly results: ResultsService,
  ) {}

  async forStudent(studentId: string): Promise<StudentPerformance> {
    const ok = (await this.scope.canAccessStudent('results.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!ok) throw AppError.notFound('student');
    // Parents see what the school has published; staff also see results not published yet.
    const parentView = RequestContextStore.tenant().permissions['results.view'] === 'OWN_CHILDREN';
    const yearId = await this.scope.currentAcademicYearId();
    const where: Prisma.ExamResultWhereInput = parentView
      ? { studentId, publishedAt: { not: null }, resultStatus: { not: 'WITHHELD' }, exam: { academicYearId: yearId ?? undefined, status: 'RESULTS_PUBLISHED' } }
      : { studentId, exam: { academicYearId: yearId ?? undefined } };
    const own = await this.prisma.db.examResult.findMany({
      where,
      include: { exam: { select: { id: true, name: true, term: true, startDate: true, createdAt: true } } },
    });
    own.sort((a, b) => (a.exam.startDate ?? a.exam.createdAt).getTime() - (b.exam.startDate ?? b.exam.createdAt).getTime());

    const exams: PerformanceExam[] = [];
    const subjects = new Map<string, PerformanceSubject>();
    for (const r of own) {
      const [row] = await this.results.rows(r.examId, { examId: r.examId, studentId });
      if (!row) continue;
      // The section's numbers for comparison: same exam, same section.
      const peers = await this.prisma.db.examResult.findMany({ where: { examId: r.examId, sectionId: r.sectionId }, select: { studentId: true, percentage: true } });
      const peerIds = peers.map((p) => p.studentId);
      const marks = await this.prisma.db.mark.findMany({
        where: { examSubjectId: { in: row.subjects.map((s) => s.examSubjectId) }, studentId: { in: peerIds }, isExempt: false },
        select: { examSubjectId: true, marksObtained: true, isAbsent: true },
      });
      exams.push({
        examId: r.exam.id,
        name: r.exam.name,
        term: r.exam.term,
        startDate: fromDate(r.exam.startDate),
        percentage: row.percentage,
        grade: row.grade,
        rankInSection: row.rankInSection,
        sectionAveragePct: avg(peers.map((p) => Number(p.percentage))),
      });
      for (const s of row.subjects) {
        const sectionPcts = marks
          .filter((m) => m.examSubjectId === s.examSubjectId && (m.isAbsent || m.marksObtained !== null))
          .map((m) => pct(m.isAbsent ? 0 : Number(m.marksObtained), s.maxMarks) ?? 0);
        const entry = subjects.get(s.subject.id) ?? { subject: s.subject, averagePct: null, sectionAveragePct: null, trend: null, exams: [] };
        entry.exams.push({
          examId: r.exam.id,
          examName: r.exam.name,
          marks: s.marks,
          maxMarks: s.maxMarks,
          percent: s.exempt || (s.marks === null && !s.absent) ? null : pct(s.absent ? 0 : s.marks!, s.maxMarks),
          grade: s.grade,
          absent: s.absent,
          exempt: s.exempt,
          passed: s.passed,
          sectionAveragePct: avg(sectionPcts),
        });
        subjects.set(s.subject.id, entry);
      }
    }

    for (const entry of subjects.values()) {
      const counted = entry.exams.filter((e) => e.percent !== null);
      const got = counted.reduce((n, e) => n + (e.absent ? 0 : (e.marks ?? 0)), 0);
      const max = counted.reduce((n, e) => n + e.maxMarks, 0);
      entry.averagePct = pct(got, max);
      entry.sectionAveragePct = avg(entry.exams.map((e) => e.sectionAveragePct).filter((x): x is number => x !== null));
      const [prev, last] = counted.slice(-2).map((e) => e.percent!);
      entry.trend = last === undefined || prev === undefined ? null : last - prev > 2 ? 'up' : prev - last > 2 ? 'down' : 'steady';
    }
    const list = [...subjects.values()].sort((a, b) => a.subject.name.localeCompare(b.subject.name));
    return { studentId, overallPct: avg(exams.map((e) => e.percentage)), exams, subjects: list };
  }
}
