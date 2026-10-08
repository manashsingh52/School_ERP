import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  GRADING_PRESETS,
  type ExamDetail,
  type ExamItem,
  type ExamSubjectItem,
  type GradingPreset,
  type GradingScaleItem,
  type createExamSchema,
  type gradingScaleSchema,
  type listExamsQuerySchema,
  type setExamSubjectsSchema,
  type updateExamSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fromDate, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

type In<T extends z.ZodType> = z.output<T>;

const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const scaleInclude = { bands: { orderBy: { order: 'asc' } }, _count: { select: { exams: true } } } satisfies Prisma.GradingScaleInclude;
export const examInclude = {
  gradingScale: { select: { id: true, name: true } },
  subjects: { include: { class: { select: { id: true, name: true, displayOrder: true } }, subject: { select: { id: true, name: true } } } },
} satisfies Prisma.ExamInclude;
type ExamRow = Prisma.ExamGetPayload<{ include: typeof examInclude }>;

export function toExamSubject(s: ExamRow['subjects'][number]): ExamSubjectItem {
  return {
    id: s.id,
    classId: s.classId,
    className: s.class.name,
    subject: s.subject,
    maxMarks: Number(s.maxMarks),
    passMarks: Number(s.passMarks),
    examDate: fromDate(s.examDate),
    startTime: s.startTime,
    endTime: s.endTime,
    lockedAt: s.marksLockedAt?.toISOString() ?? null,
  };
}

/**
 * Exam setup (Master Prompt §33): grading scales, exams, and the class × subject grid with
 * maximum/pass marks and the date sheet.
 */
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- grading scales

  async listScales(): Promise<GradingScaleItem[]> {
    const rows = await this.prisma.db.gradingScale.findMany({ include: scaleInclude, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      isDefault: s.isDefault,
      bands: s.bands.map((b) => ({ id: b.id, label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent), gradePoint: num(b.gradePoint), remark: b.remark })),
      usedBy: s._count.exams,
    }));
  }

  private async scale(id: string): Promise<GradingScaleItem> {
    const found = (await this.listScales()).find((s) => s.id === id);
    if (!found) throw AppError.notFound('grading scale');
    return found;
  }

  async createScale(input: In<typeof gradingScaleSchema>): Promise<GradingScaleItem> {
    if (await this.prisma.db.gradingScale.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) {
      throw new AppError('DUPLICATE', 409, 'A grading scale with this name already exists.', [{ field: 'name', message: 'Already used' }]);
    }
    const { schoolId } = RequestContextStore.school();
    const first = (await this.prisma.db.gradingScale.count()) === 0;
    const id = await this.prisma.tenantTx(async (tx) => {
      if (input.isDefault) await tx.gradingScale.updateMany({ data: { isDefault: false } });
      const s = await tx.gradingScale.create({
        data: {
          name: input.name,
          isDefault: input.isDefault || first,
          bands: { create: this.bandRows(input.bands, schoolId) },
        } as Prisma.GradingScaleUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'grading_scale.create', entityType: 'GradingScale', entityId: s.id, after: input });
      return s.id;
    });
    return this.scale(id);
  }

  async createPreset(preset: GradingPreset): Promise<GradingScaleItem> {
    const p = GRADING_PRESETS[preset];
    const existing = await this.prisma.db.gradingScale.findFirst({ where: { name: p.name } });
    if (existing) return this.scale(existing.id);
    return this.createScale({ name: p.name, isDefault: false, bands: p.bands.map((b) => ({ ...b })) });
  }

  /** Bands can change until results are published with this scale. */
  async updateScale(id: string, input: In<typeof gradingScaleSchema>): Promise<GradingScaleItem> {
    const current = await this.scale(id);
    if (await this.prisma.db.exam.count({ where: { gradingScaleId: id, status: 'RESULTS_PUBLISHED' } })) {
      throw new AppError('IN_USE', 409, 'Results were published with this scale. Create a new scale instead, so published grades stay as they were.');
    }
    const clash = await this.prisma.db.gradingScale.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: 'insensitive' } } });
    if (clash) throw new AppError('DUPLICATE', 409, 'A grading scale with this name already exists.', [{ field: 'name', message: 'Already used' }]);
    const { schoolId } = RequestContextStore.school();
    await this.prisma.tenantTx(async (tx) => {
      if (input.isDefault) await tx.gradingScale.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      await tx.gradingScale.update({ where: { id }, data: { name: input.name, isDefault: input.isDefault || current.isDefault } });
      await tx.gradeBand.deleteMany({ where: { gradingScaleId: id } });
      if (input.bands.length) {
        await tx.gradeBand.createMany({ data: this.bandRows(input.bands, schoolId).map((b) => ({ ...b, gradingScaleId: id }) as Prisma.GradeBandCreateManyInput) });
      }
      await this.audit.record(tx, { action: 'grading_scale.update', entityType: 'GradingScale', entityId: id, before: { name: current.name, bands: current.bands.length }, after: input });
    });
    return this.scale(id);
  }

  async deleteScale(id: string): Promise<void> {
    const s = await this.scale(id);
    if (s.usedBy) throw new AppError('IN_USE', 409, `${s.usedBy} exam(s) use this scale.`);
    await this.prisma.tenantTx(async (tx) => {
      await tx.gradingScale.delete({ where: { id } });
      await this.audit.record(tx, { action: 'grading_scale.delete', entityType: 'GradingScale', entityId: id, before: { name: s.name } });
    });
  }

  private bandRows(bands: In<typeof gradingScaleSchema>['bands'], schoolId: string) {
    return [...bands]
      .sort((a, b) => b.minPercent - a.minPercent)
      .map((b, i) => ({ schoolId, label: b.label, minPercent: b.minPercent, maxPercent: b.maxPercent, gradePoint: b.gradePoint ?? null, remark: b.remark ?? null, order: i + 1 }));
  }

  // ---------------------------------------------------------------- exams

  /** Drafts are visible to exam managers only; parents see exams that include their child's class. */
  async visibleWhere(studentId?: string): Promise<Prisma.ExamWhereInput> {
    const perms = RequestContextStore.tenant().permissions;
    const yearId = await this.scope.currentAcademicYearId();
    const base: Prisma.ExamWhereInput = { academicYearId: yearId ?? '00000000-0000-0000-0000-000000000000', status: { not: 'ARCHIVED' } };
    if (perms['exam.manage']) return studentId ? { ...base, ...(await this.childFilter(studentId)) } : base;
    const view = perms['exam.view'];
    if (view === 'ALL' || view === 'ASSIGNED') return { ...base, status: { notIn: ['DRAFT', 'ARCHIVED'] }, ...(studentId ? await this.childFilter(studentId) : {}) };
    if (view === 'OWN_CHILDREN') {
      if (studentId) await this.assertStudent(studentId);
      const children = studentId ? [studentId] : await this.scope.childStudentIds();
      const classes = await this.prisma.db.studentEnrollment.findMany({ where: { studentId: { in: children }, academicYearId: base.academicYearId as string }, select: { classId: true } });
      return { ...base, status: { notIn: ['DRAFT', 'ARCHIVED'] }, subjects: { some: { classId: { in: classes.map((c) => c.classId) } } } };
    }
    return { id: { in: [] } };
  }

  private async childFilter(studentId: string): Promise<Prisma.ExamWhereInput> {
    await this.assertStudent(studentId);
    return { subjects: { some: { classId: (await this.classOf(studentId)) ?? '00000000-0000-0000-0000-000000000000' } } };
  }

  async assertStudent(studentId: string): Promise<void> {
    const ok = (await this.scope.canAccessStudent('exam.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!ok) throw AppError.notFound('student');
  }

  private toItem(e: ExamRow, classFilter?: string): ExamItem {
    const subjects = classFilter ? e.subjects.filter((s) => s.classId === classFilter) : e.subjects;
    const classes = [...new Map(subjects.map((s) => [s.classId, s.class])).values()].sort((a, b) => a.displayOrder - b.displayOrder);
    return {
      id: e.id,
      name: e.name,
      term: e.term,
      status: e.status,
      gradingScale: e.gradingScale,
      startDate: fromDate(e.startDate),
      endDate: fromDate(e.endDate),
      rankingEnabled: e.rankingEnabled,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      classes: classes.map((c) => ({ id: c.id, name: c.name, subjects: subjects.filter((s) => s.classId === c.id).length })),
      createdAt: e.createdAt.toISOString(),
    };
  }

  async list(query: In<typeof listExamsQuerySchema>): Promise<ExamItem[]> {
    const where: Prisma.ExamWhereInput = { AND: [await this.visibleWhere(query.studentId), ...(query.status ? [{ status: query.status }] : [])] };
    const rows = await this.prisma.db.exam.findMany({ where, include: examInclude, orderBy: [{ startDate: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }] });
    const classId = query.studentId ? await this.classOf(query.studentId) : undefined;
    return rows.map((r) => this.toItem(r, classId));
  }

  private async classOf(studentId: string): Promise<string | undefined> {
    const yearId = await this.scope.currentAcademicYearId();
    return (await this.prisma.db.studentEnrollment.findFirst({ where: { studentId, academicYearId: yearId ?? undefined }, select: { classId: true } }))?.classId;
  }

  async get(id: string, studentId?: string): Promise<ExamDetail> {
    const row = await this.prisma.db.exam.findFirst({ where: { AND: [{ id }, await this.visibleWhere(studentId)] }, include: examInclude });
    if (!row) throw AppError.notFound('exam');
    // A child's view shows that child's class; parents never see other classes' rows.
    let allowed: Set<string> | null = null;
    const perms = RequestContextStore.tenant().permissions;
    if (studentId) {
      const classId = await this.classOf(studentId);
      allowed = new Set(classId ? [classId] : []);
    } else if (perms['exam.view'] === 'OWN_CHILDREN' && !perms['exam.manage']) {
      const children = await this.scope.childStudentIds();
      allowed = new Set((await this.prisma.db.studentEnrollment.findMany({ where: { studentId: { in: children }, academicYearId: row.academicYearId }, select: { classId: true } })).map((c) => c.classId));
    }
    const subjects = row.subjects
      .filter((s) => !allowed || allowed.has(s.classId))
      .sort(
        (a, b) =>
          a.class.displayOrder - b.class.displayOrder ||
          (fromDate(a.examDate) ?? '9999').localeCompare(fromDate(b.examDate) ?? '9999') ||
          a.subject.name.localeCompare(b.subject.name),
      );
    return { ...this.toItem({ ...row, subjects }), subjects: subjects.map(toExamSubject) };
  }

  /** For other exam services: the exam row (any status) after a visibility check. */
  async row(id: string): Promise<ExamRow> {
    const row = await this.prisma.db.exam.findFirst({ where: { AND: [{ id }, await this.visibleWhere()] }, include: examInclude });
    if (!row) throw AppError.notFound('exam');
    return row;
  }

  async create(input: In<typeof createExamSchema>): Promise<ExamDetail> {
    const yearId = await this.scope.currentAcademicYearId();
    if (!yearId) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create an academic year first.');
    if (!(await this.prisma.db.gradingScale.findUnique({ where: { id: input.gradingScaleId }, select: { id: true } }))) throw AppError.invalidReference('gradingScaleId', 'grading scale');
    if (await this.prisma.db.exam.findFirst({ where: { academicYearId: yearId, name: { equals: input.name, mode: 'insensitive' } } })) {
      throw new AppError('DUPLICATE', 409, 'An exam with this name already exists this year.', [{ field: 'name', message: 'Already used' }]);
    }
    const id = await this.prisma.tenantTx(async (tx) => {
      const e = await tx.exam.create({
        data: {
          academicYearId: yearId,
          gradingScaleId: input.gradingScaleId,
          name: input.name,
          term: input.term ?? null,
          startDate: toDate(input.startDate),
          endDate: toDate(input.endDate),
          rankingEnabled: input.rankingEnabled,
        } as Prisma.ExamUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'exam.create', entityType: 'Exam', entityId: e.id, after: input });
      return e.id;
    });
    return this.get(id);
  }

  async update(id: string, input: In<typeof updateExamSchema>): Promise<ExamDetail> {
    const exam = await this.row(id);
    if (exam.status === 'RESULTS_PUBLISHED' && (input.gradingScaleId || input.rankingEnabled !== undefined || input.status)) {
      throw new AppError('RESULTS_PUBLISHED', 422, 'Results are published. Unpublish them first to change grading, ranking or status.');
    }
    if (input.gradingScaleId && !(await this.prisma.db.gradingScale.findUnique({ where: { id: input.gradingScaleId }, select: { id: true } }))) {
      throw AppError.invalidReference('gradingScaleId', 'grading scale');
    }
    if (input.name && (await this.prisma.db.exam.findFirst({ where: { id: { not: id }, academicYearId: exam.academicYearId, name: { equals: input.name, mode: 'insensitive' } } }))) {
      throw new AppError('DUPLICATE', 409, 'An exam with this name already exists this year.', [{ field: 'name', message: 'Already used' }]);
    }
    if (input.status && input.status !== 'DRAFT' && !exam.subjects.length) {
      throw new AppError('NO_SUBJECTS', 422, 'Add classes and subjects to the exam first.');
    }
    const date = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : toDate(v));
    await this.prisma.tenantTx(async (tx) => {
      await tx.exam.update({
        where: { id },
        data: {
          name: input.name,
          term: input.term,
          gradingScaleId: input.gradingScaleId,
          startDate: date(input.startDate),
          endDate: date(input.endDate),
          rankingEnabled: input.rankingEnabled,
          status: input.status,
        },
      });
      await this.audit.record(tx, { action: 'exam.update', entityType: 'Exam', entityId: id, before: { name: exam.name, status: exam.status }, after: input });
    });
    return this.get(id);
  }

  /** Drafts without marks are deleted; anything with marks is archived (history is kept). */
  async remove(id: string): Promise<void> {
    const exam = await this.row(id);
    const marks = await this.prisma.db.mark.count({ where: { examSubject: { examId: id } } });
    await this.prisma.tenantTx(async (tx) => {
      if (marks || exam.status === 'RESULTS_PUBLISHED') await tx.exam.update({ where: { id }, data: { status: 'ARCHIVED' } });
      else await tx.exam.delete({ where: { id } });
      await this.audit.record(tx, { action: 'exam.delete', entityType: 'Exam', entityId: id, before: { name: exam.name, status: exam.status, marks } });
    });
  }

  async setSubjects(id: string, input: In<typeof setExamSubjectsSchema>): Promise<ExamDetail> {
    const exam = await this.row(id);
    if (exam.status === 'RESULTS_PUBLISHED') throw new AppError('RESULTS_PUBLISHED', 422, 'Results are published. Unpublish them first to change subjects.');
    const classIds = [...new Set(input.classIds)];
    const rows = input.rows;
    if (rows.some((r) => !classIds.includes(r.classId))) throw new AppError('VALIDATION_FAILED', 422, 'Every row must belong to one of the classes being saved.', [{ field: 'rows', message: 'Unexpected class' }]);
    const seen = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const key = `${r.classId}|${r.subjectId}`;
      if (seen.has(key)) throw new AppError('VALIDATION_FAILED', 422, 'A subject appears twice for the same class.', [{ field: `rows.${i}.subjectId`, message: 'Duplicate' }]);
      seen.add(key);
    }
    const [classes, subjects] = await Promise.all([
      this.prisma.db.schoolClass.count({ where: { id: { in: classIds } } }),
      this.prisma.db.subject.count({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } } }),
    ]);
    if (classes !== classIds.length) throw AppError.invalidReference('classIds', 'class');
    if (subjects !== new Set(rows.map((r) => r.subjectId)).size) throw AppError.invalidReference('rows', 'subject');

    const current = exam.subjects.filter((s) => classIds.includes(s.classId));
    const removed = current.filter((s) => !seen.has(`${s.classId}|${s.subjectId}`));
    if (removed.length) {
      const withMarks = await this.prisma.db.mark.groupBy({ by: ['examSubjectId'], where: { examSubjectId: { in: removed.map((r) => r.id) } }, _count: { _all: true } });
      if (withMarks.length) {
        const s = removed.find((r) => r.id === withMarks[0]!.examSubjectId)!;
        throw new AppError('MARKS_ENTERED', 409, `${s.subject.name} (${s.class.name}) already has marks. Clear them before removing it.`);
      }
    }
    const lockedChanged = rows.find((r) => {
      const cur = current.find((s) => s.classId === r.classId && s.subjectId === r.subjectId);
      return cur?.marksLockedAt && (Number(cur.maxMarks) !== r.maxMarks || Number(cur.passMarks) !== r.passMarks);
    });
    if (lockedChanged) throw new AppError('MARKS_LOCKED', 409, 'Marks are locked for a subject whose maximum or pass marks changed. Unlock it first.');

    const { schoolId } = RequestContextStore.school();
    await this.prisma.tenantTx(async (tx) => {
      if (removed.length) await tx.examSubject.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
      for (const r of rows) {
        const data = { maxMarks: r.maxMarks, passMarks: r.passMarks, examDate: toDate(r.examDate) ?? null, startTime: r.startTime ?? null, endTime: r.endTime ?? null };
        const cur = current.find((s) => s.classId === r.classId && s.subjectId === r.subjectId);
        if (cur) await tx.examSubject.update({ where: { id: cur.id }, data });
        else await tx.examSubject.create({ data: { ...data, schoolId, examId: id, classId: r.classId, subjectId: r.subjectId } as Prisma.ExamSubjectUncheckedCreateInput });
      }
      await this.audit.record(tx, { action: 'exam.subjects', entityType: 'Exam', entityId: id, after: { classIds, rows: rows.length, removed: removed.length } });
    });
    return this.get(id);
  }
}
