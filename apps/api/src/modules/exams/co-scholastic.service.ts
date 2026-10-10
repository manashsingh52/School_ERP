import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { CoScholasticItem, CoScholasticSheet, saveCoScholasticSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { fullName } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ON_ROLL } from './marks.service.js';

type In<T extends z.ZodType> = z.output<T>;
const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;

/**
 * Co-scholastic areas (roadmap follow-up to Phase 4): Work Education, Art, Health & PE… are graded,
 * not marked. The class teacher enters one grade per student per area for an exam, on the school's
 * scale; the grades appear on report cards and in the parent's results.
 */
@Injectable()
export class CoScholasticService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly settings: SchoolSettingsService,
  ) {}

  /** Areas for a class: its co-scholastic subjects this year, or every co-scholastic subject if none are linked. */
  private async areas(classId: string, academicYearId: string) {
    const linked = await this.prisma.db.classSubject.findMany({ where: { classId, academicYearId, subject: { type: 'CO_SCHOLASTIC' } }, select: { subject: { select: { id: true, name: true } } } });
    const areas = linked.length ? linked.map((l) => l.subject) : await this.prisma.db.subject.findMany({ where: { type: 'CO_SCHOLASTIC' }, select: { id: true, name: true } });
    return areas.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async context(examId: string, sectionId: string) {
    const exam = await this.prisma.db.exam.findFirst({ where: { id: examId }, select: { id: true, name: true, status: true, academicYearId: true } });
    if (!exam) throw AppError.notFound('exam');
    const section = await this.prisma.db.section.findFirst({ where: { id: sectionId, academicYearId: exam.academicYearId }, select: { id: true, name: true, classId: true, classTeacherId: true, class: { select: { name: true } } } });
    if (!section) throw AppError.notFound('section');
    const scope = this.scope.scopeOf('marks.enter');
    const isClassTeacher = !!section.classTeacherId && section.classTeacherId === (await this.scope.myTeacherId());
    if (scope !== 'ALL' && !isClassTeacher) throw AppError.notFound('section');
    return { exam, section };
  }

  async sheet(examId: string, sectionId: string): Promise<CoScholasticSheet> {
    const { exam, section } = await this.context(examId, sectionId);
    const [areas, roster, grades, settings] = await Promise.all([
      this.areas(section.classId, exam.academicYearId),
      this.prisma.db.studentEnrollment.findMany({ where: { sectionId, ...ON_ROLL, student: { archivedAt: null } }, select: { studentId: true, rollNo: true, student: { select: { firstName: true, lastName: true } } } }),
      this.prisma.db.coScholasticGrade.findMany({ where: { examId } }),
      this.settings.get('examinations'),
    ]);
    const locked = exam.status === 'RESULTS_PUBLISHED' || exam.status === 'ARCHIVED';
    return {
      exam: { id: exam.id, name: exam.name, status: exam.status },
      section: { id: section.id, label: label(section.class.name, section.name) },
      editable: !locked,
      lockedReason: locked ? 'Results are published — unpublish them to change grades.' : null,
      grades: settings.coScholasticGrades,
      areas,
      students: roster
        .sort((a, b) => (a.rollNo ?? 999) - (b.rollNo ?? 999) || a.student.firstName.localeCompare(b.student.firstName))
        .map((e) => ({
          studentId: e.studentId,
          name: fullName(e.student.firstName, e.student.lastName),
          rollNo: e.rollNo,
          grades: Object.fromEntries(areas.map((a) => [a.id, grades.find((g) => g.studentId === e.studentId && g.subjectId === a.id)?.grade ?? null])),
        })),
    };
  }

  async save(examId: string, input: In<typeof saveCoScholasticSchema>): Promise<CoScholasticSheet> {
    const current = await this.sheet(examId, input.sectionId);
    if (!current.editable) throw new AppError('GRADES_LOCKED', 422, current.lockedReason!);
    const students = new Set(current.students.map((s) => s.studentId));
    const areas = new Set(current.areas.map((a) => a.id));
    const allowed = new Set(current.grades);
    const problems = input.entries.flatMap((e, i) =>
      !students.has(e.studentId) ? [{ field: `entries.${i}.studentId`, message: 'Not in this section' }]
      : !areas.has(e.subjectId) ? [{ field: `entries.${i}.subjectId`, message: 'Not a co-scholastic area for this class' }]
      : e.grade !== null && !allowed.has(e.grade) ? [{ field: `entries.${i}.grade`, message: `Use one of ${current.grades.join(', ')}` }]
      : [],
    );
    if (problems.length) throw new AppError('VALIDATION_FAILED', 422, problems.length === 1 ? problems[0]!.message : `${problems.length} grades need fixing.`, problems);
    const { membershipId } = RequestContextStore.tenant();
    await this.prisma.tenantTx(async (tx) => {
      for (const e of input.entries) {
        const where = { examId_studentId_subjectId: { examId, studentId: e.studentId, subjectId: e.subjectId } };
        if (e.grade === null) await tx.coScholasticGrade.deleteMany({ where: { examId, studentId: e.studentId, subjectId: e.subjectId } });
        else await tx.coScholasticGrade.upsert({ where, create: { examId, studentId: e.studentId, subjectId: e.subjectId, grade: e.grade, enteredByMemberId: membershipId } as Prisma.CoScholasticGradeUncheckedCreateInput, update: { grade: e.grade, enteredByMemberId: membershipId } });
      }
      await this.audit.record(tx, { action: 'co_scholastic.save', entityType: 'Exam', entityId: examId, metadata: { section: current.section.label, entries: input.entries.length } });
    });
    return this.sheet(examId, input.sectionId);
  }

  /** Grades per student for exams (report cards, parents). Area order follows the subject name. */
  async forStudents(examId: string, studentIds: string[]): Promise<Map<string, CoScholasticItem[]>> {
    const rows = await this.prisma.db.coScholasticGrade.findMany({ where: { examId, studentId: { in: studentIds } } });
    const subjects = await this.prisma.db.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } }, select: { id: true, name: true } });
    const out = new Map<string, CoScholasticItem[]>();
    for (const r of rows) {
      const list = out.get(r.studentId) ?? [];
      list.push({ area: subjects.find((s) => s.id === r.subjectId)?.name ?? 'Area', grade: r.grade });
      out.set(r.studentId, list);
    }
    for (const list of out.values()) list.sort((a, b) => a.area.localeCompare(b.area));
    return out;
  }
}
