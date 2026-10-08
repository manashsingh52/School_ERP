import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { MarksProgressRow, MarksSheet, saveMarksSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fullName } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ExamsService, toExamSubject } from './exams.service.js';

type In<T extends z.ZodType> = z.output<T>;

const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
export const ON_ROLL = { status: { notIn: ['TRANSFERRED', 'WITHDRAWN'] } } satisfies Prisma.StudentEnrollmentWhereInput;
const entered = (m: { marksObtained: unknown; isAbsent: boolean; isExempt: boolean }) => m.marksObtained !== null || m.isAbsent || m.isExempt;

/**
 * Marks entry (Master Prompt §33): one sheet per exam subject × section. The subject teacher
 * (or the class teacher where no subject teacher is assigned) enters marks while the exam is open
 * for marks entry; after locking only staff with "edit locked marks" can change them.
 */
@Injectable()
export class MarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly exams: ExamsService,
  ) {}

  /** (sectionId → subjectIds the caller may enter) for a teacher; null = everything. */
  private async enterable(): Promise<Map<string, Set<string> | 'ALL'> | null> {
    const perms = RequestContextStore.tenant().permissions;
    if (perms['marks.enter'] === 'ALL') return null;
    const map = new Map<string, Set<string> | 'ALL'>();
    if (perms['marks.enter'] !== 'ASSIGNED') return map;
    const teacherId = await this.scope.myTeacherId();
    const yearId = await this.scope.currentAcademicYearId();
    if (!teacherId || !yearId) return map;
    const [assignments, classTeacherOf] = await Promise.all([
      this.prisma.db.teachingAssignment.findMany({ where: { teacherId, academicYearId: yearId }, select: { sectionId: true, subjectId: true } }),
      this.prisma.db.section.findMany({ where: { classTeacherId: teacherId, academicYearId: yearId }, select: { id: true } }),
    ]);
    for (const a of assignments) {
      const set = map.get(a.sectionId);
      if (set !== 'ALL') map.set(a.sectionId, (set ?? new Set()).add(a.subjectId));
    }
    // The class teacher covers subjects that have no subject teacher in their section.
    for (const s of classTeacherOf) map.set(s.id, 'ALL');
    return map;
  }

  private async canEnter(sectionId: string, subjectId: string): Promise<boolean> {
    const map = await this.enterable();
    if (!map) return true;
    const entry = map.get(sectionId);
    if (entry === 'ALL') {
      const other = await this.prisma.db.teachingAssignment.findFirst({ where: { sectionId, subjectId }, select: { teacherId: true } });
      return !other || other.teacherId === (await this.scope.myTeacherId());
    }
    return !!entry?.has(subjectId);
  }

  private async context(examSubjectId: string, sectionId: string) {
    const es = await this.prisma.db.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { exam: true, class: { select: { id: true, name: true, displayOrder: true } }, subject: { select: { id: true, name: true } } },
    });
    if (!es) throw AppError.notFound('exam subject');
    await this.exams.row(es.examId); // visibility (drafts, archived)
    const section = await this.prisma.db.section.findUnique({ where: { id: sectionId }, select: { id: true, name: true, classId: true, academicYearId: true } });
    if (!section || section.classId !== es.classId || section.academicYearId !== es.exam.academicYearId) throw AppError.notFound('section');
    const perms = RequestContextStore.tenant().permissions;
    const canEnter = !!perms['marks.enter'] && (await this.canEnter(sectionId, es.subjectId));
    const seesAll = perms['exam.manage'] || perms['results.view'] === 'ALL' || perms['marks.enter'] === 'ALL';
    if (!canEnter && !seesAll) throw AppError.notFound('marks sheet');
    return { es, section, canEnter };
  }

  private roster(sectionId: string) {
    return this.prisma.db.studentEnrollment.findMany({
      where: { sectionId, ...ON_ROLL },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
      orderBy: [{ rollNo: { sort: 'asc', nulls: 'last' } }, { student: { firstName: 'asc' } }],
    });
  }

  private version(marks: { updatedAt: Date }[]): string {
    return `${marks.length}-${Math.max(0, ...marks.map((m) => m.updatedAt.getTime()))}`;
  }

  async sheet(examSubjectId: string, sectionId: string): Promise<MarksSheet> {
    const { es, section, canEnter } = await this.context(examSubjectId, sectionId);
    const roster = await this.roster(sectionId);
    const marks = await this.prisma.db.mark.findMany({ where: { examSubjectId, studentId: { in: roster.map((r) => r.studentId) } } });
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const perms = RequestContextStore.tenant().permissions;
    let lockedReason: string | null = null;
    if (!canEnter) lockedReason = "You can view these marks but not change them.";
    else if (es.exam.status === 'RESULTS_PUBLISHED') lockedReason = 'Results are published. Ask the exam office to unpublish before changing marks.';
    else if (es.exam.status !== 'MARKS_ENTRY') lockedReason = 'Marks entry has not been opened for this exam yet.';
    else if (es.marksLockedAt && !perms['marks.edit_locked']) lockedReason = 'Marks are locked. Ask the exam office to unlock them.';

    const scored = marks.filter((m) => m.marksObtained !== null).map((m) => Number(m.marksObtained));
    const passMarks = Number(es.passMarks);
    return {
      exam: { id: es.exam.id, name: es.exam.name, status: es.exam.status },
      examSubject: toExamSubject(es),
      section: { id: section.id, label: label(es.class.name, section.name) },
      editable: !lockedReason,
      lockedReason,
      version: this.version(marks),
      students: roster.map((r) => {
        const m = byStudent.get(r.studentId);
        return {
          studentId: r.studentId,
          name: fullName(r.student.firstName, r.student.lastName),
          rollNo: r.rollNo,
          admissionNo: r.student.admissionNo,
          marks: m?.marksObtained === null || m?.marksObtained === undefined ? null : Number(m.marksObtained),
          absent: m?.isAbsent ?? false,
          exempt: m?.isExempt ?? false,
          remarks: m?.remarks ?? null,
        };
      }),
      stats: {
        entered: marks.filter(entered).length,
        total: roster.length,
        average: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null,
        highest: scored.length ? Math.max(...scored) : null,
        passed: scored.filter((x) => x >= passMarks).length,
      },
    };
  }

  async save(input: In<typeof saveMarksSchema>): Promise<MarksSheet> {
    const current = await this.sheet(input.examSubjectId, input.sectionId);
    if (!current.editable) throw new AppError('MARKS_LOCKED', 422, current.lockedReason!);
    if (input.version && input.version !== current.version) {
      throw new AppError('VERSION_CONFLICT', 409, 'Someone else saved these marks after you opened the sheet. Reload to see their changes.');
    }
    const onRoll = new Map(current.students.map((s) => [s.studentId, s]));
    const max = current.examSubject.maxMarks;
    const details: { field: string; message: string }[] = [];
    input.entries.forEach((e, i) => {
      if (!onRoll.has(e.studentId)) details.push({ field: `entries.${i}.studentId`, message: 'Not in this section' });
      else if (e.absent && e.exempt) details.push({ field: `entries.${i}`, message: 'Absent or exempt — not both' });
      else if (e.marks !== null && (e.absent || e.exempt)) details.push({ field: `entries.${i}.marks`, message: 'No marks for an absent or exempt student' });
      else if (e.marks !== null && e.marks > max) details.push({ field: `entries.${i}.marks`, message: `More than ${max}` });
      else if (e.marks !== null && Math.round(e.marks * 100) !== e.marks * 100) details.push({ field: `entries.${i}.marks`, message: 'At most 2 decimals' });
    });
    if (details.length) throw new AppError('VALIDATION_FAILED', 422, details.length === 1 ? `${onRoll.get(input.entries[Number(details[0]!.field.split('.')[1])]?.studentId ?? '')?.name ?? 'A student'}: ${details[0]!.message}.` : `${details.length} entries need fixing.`, details);

    const { membershipId } = RequestContextStore.tenant();
    const corrections: Record<string, { from: string; to: string }> = {};
    const show = (s: { marks: number | null; absent: boolean; exempt: boolean }) => (s.absent ? 'AB' : s.exempt ? 'EX' : s.marks === null ? '—' : String(s.marks));
    await this.prisma.tenantTx(async (tx) => {
      for (const e of input.entries) {
        const before = onRoll.get(e.studentId)!;
        const empty = e.marks === null && !e.absent && !e.exempt && !e.remarks;
        if (before.marks === e.marks && before.absent === e.absent && before.exempt === e.exempt && (before.remarks ?? null) === (e.remarks ?? null)) continue;
        const had = before.marks !== null || before.absent || before.exempt;
        if (had && show(before) !== show(e)) corrections[before.name] = { from: show(before), to: show(e) };
        if (empty) {
          await tx.mark.deleteMany({ where: { examSubjectId: input.examSubjectId, studentId: e.studentId } });
          continue;
        }
        const data = { marksObtained: e.marks, isAbsent: e.absent, isExempt: e.exempt, remarks: e.remarks ?? null, enteredByMemberId: membershipId };
        await tx.mark.upsert({
          where: { examSubjectId_studentId: { examSubjectId: input.examSubjectId, studentId: e.studentId } },
          create: { ...data, examSubjectId: input.examSubjectId, studentId: e.studentId } as Prisma.MarkUncheckedCreateInput,
          update: data,
        });
      }
      await this.audit.record(tx, {
        action: Object.keys(corrections).length ? 'marks.correct' : 'marks.save',
        entityType: 'ExamSubject',
        entityId: input.examSubjectId,
        metadata: { section: current.section.label, subject: current.examSubject.subject.name, entries: input.entries.length, ...(Object.keys(corrections).length ? { corrections } : {}) },
      });
    });
    return this.sheet(input.examSubjectId, input.sectionId);
  }

  /** Lock a subject for the whole class: the exam office, or a teacher who covers every section. */
  async lock(examId: string, examSubjectId: string, locked: boolean): Promise<void> {
    const exam = await this.exams.row(examId);
    const es = exam.subjects.find((s) => s.id === examSubjectId);
    if (!es) throw AppError.notFound('exam subject');
    const perms = RequestContextStore.tenant().permissions;
    if (!locked && !perms['marks.edit_locked']) throw AppError.forbidden('Only the exam office can unlock marks.');
    if (locked && !perms['exam.manage']) {
      const sections = await this.prisma.db.section.findMany({ where: { classId: es.classId, academicYearId: exam.academicYearId }, select: { id: true } });
      for (const s of sections) if (!(await this.canEnter(s.id, es.subjectId))) throw AppError.forbidden('Other teachers enter marks for this subject too — the exam office locks it.');
    }
    if (exam.status === 'RESULTS_PUBLISHED' && !locked) throw new AppError('RESULTS_PUBLISHED', 422, 'Results are published. Unpublish them first.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.examSubject.update({ where: { id: examSubjectId }, data: { marksLockedAt: locked ? new Date() : null } });
      await this.audit.record(tx, { action: locked ? 'marks.lock' : 'marks.unlock', entityType: 'ExamSubject', entityId: examSubjectId, metadata: { exam: exam.name, subject: es.subject.name, class: es.class.name } });
    });
  }

  /** Marks entry progress per subject × section (teachers: only their own sheets). */
  async progress(examId: string): Promise<MarksProgressRow[]> {
    const exam = await this.exams.row(examId);
    const perms = RequestContextStore.tenant().permissions;
    const map = perms['exam.manage'] || perms['results.view'] === 'ALL' ? null : await this.enterable();
    if (map && !map.size) return [];
    const classIds = [...new Set(exam.subjects.map((s) => s.classId))];
    const [sections, rollCounts, markCounts, assignments] = await Promise.all([
      this.prisma.db.section.findMany({
        where: { classId: { in: classIds }, academicYearId: exam.academicYearId, ...(map ? { id: { in: [...map.keys()] } } : {}) },
        select: { id: true, name: true, classId: true, classTeacher: { select: { firstName: true, lastName: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.db.studentEnrollment.groupBy({ by: ['sectionId'], where: { classId: { in: classIds }, academicYearId: exam.academicYearId, ...ON_ROLL }, _count: { _all: true } }),
      this.prisma.db.mark.findMany({
        where: { examSubject: { examId } },
        select: { examSubjectId: true, marksObtained: true, isAbsent: true, isExempt: true, student: { select: { enrollments: { where: { academicYearId: exam.academicYearId }, select: { sectionId: true } } } } },
      }),
      this.prisma.db.teachingAssignment.findMany({ where: { academicYearId: exam.academicYearId }, select: { sectionId: true, subjectId: true, teacher: { select: { firstName: true, lastName: true } } }, orderBy: { id: 'asc' } }),
    ]);
    const counts = new Map<string, number>();
    for (const m of markCounts) {
      if (!entered(m)) continue;
      const key = `${m.examSubjectId}|${m.student.enrollments[0]?.sectionId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rows: MarksProgressRow[] = [];
    const subjects = [...exam.subjects].sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.subject.name.localeCompare(b.subject.name));
    for (const es of subjects) {
      for (const sec of sections.filter((s) => s.classId === es.classId)) {
        if (map) {
          const allowed = map.get(sec.id);
          if (!allowed || (allowed !== 'ALL' && !allowed.has(es.subjectId))) continue;
          if (allowed === 'ALL' && !(await this.canEnter(sec.id, es.subjectId))) continue;
        }
        const t = assignments.find((a) => a.sectionId === sec.id && a.subjectId === es.subjectId)?.teacher ?? sec.classTeacher;
        rows.push({
          examSubjectId: es.id,
          classId: es.classId,
          className: es.class.name,
          subject: es.subject,
          section: { id: sec.id, label: label(es.class.name, sec.name) },
          teacher: t ? fullName(t.firstName, t.lastName) : null,
          entered: counts.get(`${es.id}|${sec.id}`) ?? 0,
          total: rollCounts.find((r) => r.sectionId === sec.id)?._count._all ?? 0,
          locked: !!es.marksLockedAt,
        });
      }
    }
    return rows;
  }
}
