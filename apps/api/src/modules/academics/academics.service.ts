import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  AcademicYearItem,
  AssignmentItem,
  ClassItem,
  ClassSubjectItem,
  SectionItem,
  SubjectItem,
  bulkCreateClassesSchema,
  bulkCreateSectionsSchema,
  bulkCreateSubjectsSchema,
  createAcademicYearSchema,
  createAssignmentSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  listAssignmentsQuerySchema,
  setClassSubjectsSchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateSectionSchema,
  updateSubjectSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { fromDate, fullName, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

type In<T extends z.ZodType> = z.output<T>;

/** Natural order for common Indian class names: Nursery, LKG, UKG, Class 1 … Class 12. */
export function defaultClassOrder(name: string): number | null {
  const n = name.trim().toLowerCase();
  const fixed: Record<string, number> = { 'pre-nursery': 0, playgroup: 0, nursery: 1, lkg: 2, ukg: 3 };
  if (n in fixed) return fixed[n]!;
  const m = n.match(/^(?:class|grade|std\.?)?\s*(\d{1,2})$/);
  return m ? 3 + Number(m[1]) : null;
}

/**
 * Academic structure (docs/02 D3): permanent classes, per-year sections, subjects, which
 * subjects each class studies, and who teaches what (drives the teacher ASSIGNED scope).
 */
@Injectable()
export class AcademicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private async currentYearId(): Promise<string | null> {
    const school = await this.db.school.findUnique({
      where: { id: RequestContextStore.school().schoolId },
      select: { currentAcademicYearId: true },
    });
    return school?.currentAcademicYearId ?? null;
  }

  async resolveYear(yearId?: string): Promise<string> {
    const id = yearId ?? (await this.currentYearId());
    if (!id) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create an academic year first.');
    const year = await this.db.academicYear.findUnique({ where: { id }, select: { id: true } });
    if (!year) throw AppError.invalidReference('academicYearId', 'academic year');
    return year.id;
  }

  // ---------------------------------------------------------------- academic years

  async listYears(): Promise<AcademicYearItem[]> {
    const [years, currentId, sections, students] = await Promise.all([
      this.db.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
      this.currentYearId(),
      this.db.section.groupBy({ by: ['academicYearId'], _count: { _all: true } }),
      this.db.studentEnrollment.groupBy({ by: ['academicYearId'], where: { status: 'ENROLLED' }, _count: { _all: true } }),
    ]);
    const count = (rows: { academicYearId: string; _count: { _all: number } }[], id: string) =>
      rows.find((r) => r.academicYearId === id)?._count._all ?? 0;
    return years.map((y) => ({
      id: y.id,
      name: y.name,
      startDate: fromDate(y.startDate)!,
      endDate: fromDate(y.endDate)!,
      status: y.status,
      isCurrent: y.id === currentId,
      sectionCount: count(sections, y.id),
      studentCount: count(students, y.id),
    }));
  }

  async createYear(input: In<typeof createAcademicYearSchema>) {
    const exists = await this.db.academicYear.findFirst({ where: { name: input.name }, select: { id: true } });
    if (exists) throw new AppError('CONFLICT', 409, `An academic year named ${input.name} already exists.`, [{ field: 'name', message: 'Already exists' }]);
    const makeCurrent = input.makeCurrent || !(await this.currentYearId());
    const id = await this.prisma.tenantTx(async (tx) => {
      const year = await tx.academicYear.create({
        data: {
          name: input.name,
          startDate: toDate(input.startDate)!,
          endDate: toDate(input.endDate)!,
          status: makeCurrent ? 'ACTIVE' : 'PLANNED',
        } as Prisma.AcademicYearUncheckedCreateInput,
      });
      if (makeCurrent) await this.setCurrent(tx, year.id);
      await this.audit.record(tx, { action: 'academic_year.create', entityType: 'AcademicYear', entityId: year.id, after: { name: year.name, makeCurrent } });
      return year.id;
    });
    return (await this.listYears()).find((y) => y.id === id)!;
  }

  async updateYear(id: string, input: In<typeof updateAcademicYearSchema>) {
    const year = await this.db.academicYear.findUnique({ where: { id } });
    if (!year) throw AppError.notFound('academic year');
    if (year.status === 'CLOSED') throw new AppError('YEAR_CLOSED', 422, 'A closed academic year cannot be changed.');
    const start = input.startDate ?? fromDate(year.startDate)!;
    const end = input.endDate ?? fromDate(year.endDate)!;
    if (end <= start) throw new AppError('VALIDATION_FAILED', 422, 'End date must be after the start date', [{ field: 'endDate', message: 'Must be after the start date' }]);
    await this.prisma.tenantTx(async (tx) => {
      await tx.academicYear.update({ where: { id }, data: { name: input.name, startDate: toDate(start), endDate: toDate(end) } });
      await this.audit.record(tx, { action: 'academic_year.update', entityType: 'AcademicYear', entityId: id, after: input });
    });
    return (await this.listYears()).find((y) => y.id === id)!;
  }

  /** Make this the school's current year (what every screen shows by default). */
  async activateYear(id: string) {
    const year = await this.db.academicYear.findUnique({ where: { id } });
    if (!year) throw AppError.notFound('academic year');
    if (year.status === 'CLOSED') throw new AppError('YEAR_CLOSED', 422, 'A closed academic year cannot be made current.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.academicYear.update({ where: { id }, data: { status: 'ACTIVE' } });
      await this.setCurrent(tx, id);
      await this.audit.record(tx, { action: 'academic_year.activate', entityType: 'AcademicYear', entityId: id });
    });
    return (await this.listYears()).find((y) => y.id === id)!;
  }

  async closeYear(id: string) {
    const year = await this.db.academicYear.findUnique({ where: { id } });
    if (!year) throw AppError.notFound('academic year');
    if ((await this.currentYearId()) === id) {
      throw new AppError('YEAR_IS_CURRENT', 422, 'Make another year current before closing this one.');
    }
    await this.prisma.tenantTx(async (tx) => {
      await tx.academicYear.update({ where: { id }, data: { status: 'CLOSED' } });
      await this.audit.record(tx, { action: 'academic_year.close', entityType: 'AcademicYear', entityId: id });
    });
    return (await this.listYears()).find((y) => y.id === id)!;
  }

  private async setCurrent(tx: TenantTx, yearId: string) {
    await tx.school.update({ where: { id: RequestContextStore.school().schoolId }, data: { currentAcademicYearId: yearId } });
  }

  // ---------------------------------------------------------------- classes

  async listClasses(academicYearId?: string): Promise<ClassItem[]> {
    const yearId = academicYearId ?? (await this.currentYearId());
    const classes = await this.db.schoolClass.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] });
    const sections = yearId ? await this.sectionItems({ academicYearId: yearId }) : [];
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
      sections: sections.filter((s) => s.classId === c.id),
    }));
  }

  private async nextOrder(): Promise<number> {
    const max = await this.db.schoolClass.aggregate({ _max: { displayOrder: true } });
    return (max._max.displayOrder ?? 0) + 1;
  }

  async createClass(input: In<typeof createClassSchema>) {
    const exists = await this.db.schoolClass.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } });
    if (exists) throw new AppError('CONFLICT', 409, `${input.name} already exists.`, [{ field: 'name', message: 'Already exists' }]);
    const displayOrder = input.displayOrder ?? defaultClassOrder(input.name) ?? (await this.nextOrder());
    const cls = await this.prisma.tenantTx(async (tx) => {
      const created = await tx.schoolClass.create({ data: { name: input.name, displayOrder } as Prisma.SchoolClassUncheckedCreateInput });
      await this.audit.record(tx, { action: 'class.create', entityType: 'SchoolClass', entityId: created.id, after: { name: created.name } });
      return created;
    });
    return { id: cls.id, name: cls.name, displayOrder: cls.displayOrder, isActive: cls.isActive, sections: [] } satisfies ClassItem;
  }

  /** Onboarding: add many classes at once, skipping names that already exist. */
  async bulkCreateClasses(input: In<typeof bulkCreateClassesSchema>) {
    const existing = await this.db.schoolClass.findMany({ select: { name: true } });
    const have = new Set(existing.map((c) => c.name.toLowerCase()));
    let order = await this.nextOrder();
    const names = [...new Set(input.names.map((n) => n.trim()))].filter((n) => !have.has(n.toLowerCase()));
    if (names.length) {
      await this.prisma.tenantTx(async (tx) => {
        await tx.schoolClass.createMany({
          data: names.map((name) => ({ name, displayOrder: defaultClassOrder(name) ?? order++ })) as Prisma.SchoolClassCreateManyInput[],
        });
        await this.audit.record(tx, { action: 'class.bulk_create', entityType: 'SchoolClass', after: { names } });
      });
    }
    return { created: names.length, skipped: input.names.length - names.length };
  }

  async updateClass(id: string, input: In<typeof updateClassSchema>) {
    const cls = await this.db.schoolClass.findUnique({ where: { id } });
    if (!cls) throw AppError.notFound('class');
    await this.prisma.tenantTx(async (tx) => {
      await tx.schoolClass.update({ where: { id }, data: input });
      await this.audit.record(tx, { action: 'class.update', entityType: 'SchoolClass', entityId: id, before: { name: cls.name, isActive: cls.isActive }, after: input });
    });
    return (await this.listClasses()).find((c) => c.id === id)!;
  }

  async deleteClass(id: string) {
    const cls = await this.db.schoolClass.findUnique({ where: { id }, include: { _count: { select: { sections: true, enrollments: true } } } });
    if (!cls) throw AppError.notFound('class');
    if (cls._count.sections || cls._count.enrollments) {
      throw new AppError('IN_USE', 409, 'This class has sections or students. Mark it inactive instead of deleting it.');
    }
    await this.prisma.tenantTx(async (tx) => {
      await tx.classSubject.deleteMany({ where: { classId: id } });
      await tx.schoolClass.delete({ where: { id } });
      await this.audit.record(tx, { action: 'class.delete', entityType: 'SchoolClass', entityId: id, before: { name: cls.name } });
    });
  }

  // ---------------------------------------------------------------- sections

  async sectionItems(where: Prisma.SectionWhereInput): Promise<SectionItem[]> {
    const sections = await this.db.section.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { classTeacher: { select: { id: true, firstName: true, lastName: true } } },
    });
    const counts = await this.db.studentEnrollment.groupBy({
      by: ['sectionId'],
      where: { sectionId: { in: sections.map((s) => s.id) }, status: 'ENROLLED' },
      _count: { _all: true },
    });
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      classId: s.classId,
      academicYearId: s.academicYearId,
      capacity: s.capacity,
      room: s.room,
      classTeacher: s.classTeacher ? { id: s.classTeacher.id, name: fullName(s.classTeacher.firstName, s.classTeacher.lastName) } : null,
      studentCount: counts.find((c) => c.sectionId === s.id)?._count._all ?? 0,
    }));
  }

  private async assertTeacher(teacherId: string | null | undefined, field = 'classTeacherId') {
    if (!teacherId) return;
    const teacher = await this.db.teacher.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!teacher) throw AppError.invalidReference(field, 'teacher');
  }

  async createSection(input: In<typeof createSectionSchema>) {
    const yearId = await this.resolveYear(input.academicYearId);
    const cls = await this.db.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true, name: true } });
    if (!cls) throw AppError.invalidReference('classId', 'class');
    await this.assertTeacher(input.classTeacherId);
    const dup = await this.db.section.findFirst({ where: { academicYearId: yearId, classId: cls.id, name: input.name } });
    if (dup) throw new AppError('CONFLICT', 409, `${cls.name}-${input.name} already exists this year.`, [{ field: 'name', message: 'Already exists' }]);
    const id = await this.prisma.tenantTx(async (tx) => {
      const s = await tx.section.create({
        data: {
          academicYearId: yearId,
          classId: cls.id,
          name: input.name,
          capacity: input.capacity,
          room: input.room,
          classTeacherId: input.classTeacherId ?? null,
        } as Prisma.SectionUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'section.create', entityType: 'Section', entityId: s.id, after: { class: cls.name, name: s.name } });
      return s.id;
    });
    return (await this.sectionItems({ id }))[0]!;
  }

  async bulkCreateSections(input: In<typeof bulkCreateSectionsSchema>) {
    const yearId = await this.resolveYear(input.academicYearId);
    const classes = await this.db.schoolClass.findMany({ where: { id: { in: input.classIds } }, select: { id: true } });
    if (classes.length !== new Set(input.classIds).size) throw AppError.invalidReference('classIds', 'class');
    const existing = await this.db.section.findMany({
      where: { academicYearId: yearId, classId: { in: input.classIds } },
      select: { classId: true, name: true },
    });
    const have = new Set(existing.map((s) => `${s.classId}:${s.name.toUpperCase()}`));
    const names = [...new Set(input.names.map((n) => n.trim().toUpperCase()))];
    const rows = classes.flatMap((c) => names.filter((n) => !have.has(`${c.id}:${n}`)).map((name) => ({ academicYearId: yearId, classId: c.id, name })));
    if (rows.length) {
      await this.prisma.tenantTx(async (tx) => {
        await tx.section.createMany({ data: rows as Prisma.SectionCreateManyInput[] });
        await this.audit.record(tx, { action: 'section.bulk_create', entityType: 'Section', after: { count: rows.length } });
      });
    }
    return { created: rows.length, skipped: classes.length * names.length - rows.length };
  }

  async updateSection(id: string, input: In<typeof updateSectionSchema>) {
    const section = await this.db.section.findUnique({ where: { id } });
    if (!section) throw AppError.notFound('section');
    await this.assertTeacher(input.classTeacherId);
    if (input.name && input.name !== section.name) {
      const dup = await this.db.section.findFirst({ where: { academicYearId: section.academicYearId, classId: section.classId, name: input.name } });
      if (dup) throw new AppError('CONFLICT', 409, 'A section with this name already exists.', [{ field: 'name', message: 'Already exists' }]);
    }
    await this.prisma.tenantTx(async (tx) => {
      await tx.section.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        action: 'section.update',
        entityType: 'Section',
        entityId: id,
        before: { name: section.name, classTeacherId: section.classTeacherId, capacity: section.capacity, room: section.room },
        after: input,
      });
    });
    return (await this.sectionItems({ id }))[0]!;
  }

  async deleteSection(id: string) {
    const section = await this.db.section.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true, attendanceSessions: true, assignments: true } } },
    });
    if (!section) throw AppError.notFound('section');
    if (section._count.enrollments || section._count.attendanceSessions) {
      throw new AppError('IN_USE', 409, 'This section has students or attendance records and cannot be deleted.');
    }
    await this.prisma.tenantTx(async (tx) => {
      await tx.teachingAssignment.deleteMany({ where: { sectionId: id } });
      await tx.section.delete({ where: { id } });
      await this.audit.record(tx, { action: 'section.delete', entityType: 'Section', entityId: id, before: { name: section.name } });
    });
  }

  // ---------------------------------------------------------------- subjects

  async listSubjects(): Promise<SubjectItem[]> {
    const rows = await this.db.subject.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map((s) => ({ id: s.id, name: s.name, code: s.code, type: s.type, isActive: s.isActive }));
  }

  async createSubject(input: In<typeof createSubjectSchema>) {
    const dup = await this.db.subject.findFirst({ where: { code: input.code } });
    if (dup) throw new AppError('CONFLICT', 409, `Subject code ${input.code} is already used.`, [{ field: 'code', message: 'Already in use' }]);
    const s = await this.prisma.tenantTx(async (tx) => {
      const created = await tx.subject.create({ data: input as Prisma.SubjectUncheckedCreateInput });
      await this.audit.record(tx, { action: 'subject.create', entityType: 'Subject', entityId: created.id, after: input });
      return created;
    });
    return { id: s.id, name: s.name, code: s.code, type: s.type, isActive: s.isActive } satisfies SubjectItem;
  }

  async bulkCreateSubjects(input: In<typeof bulkCreateSubjectsSchema>) {
    const existing = await this.db.subject.findMany({ select: { code: true } });
    const have = new Set(existing.map((s) => s.code));
    const rows = input.subjects.filter((s, i, all) => !have.has(s.code) && all.findIndex((o) => o.code === s.code) === i);
    if (rows.length) {
      await this.prisma.tenantTx(async (tx) => {
        await tx.subject.createMany({ data: rows as Prisma.SubjectCreateManyInput[] });
        await this.audit.record(tx, { action: 'subject.bulk_create', entityType: 'Subject', after: { codes: rows.map((r) => r.code) } });
      });
    }
    return { created: rows.length, skipped: input.subjects.length - rows.length };
  }

  async updateSubject(id: string, input: In<typeof updateSubjectSchema>) {
    const s = await this.db.subject.findUnique({ where: { id } });
    if (!s) throw AppError.notFound('subject');
    const updated = await this.prisma.tenantTx(async (tx) => {
      const u = await tx.subject.update({ where: { id }, data: input });
      await this.audit.record(tx, { action: 'subject.update', entityType: 'Subject', entityId: id, before: { name: s.name, type: s.type, isActive: s.isActive }, after: input });
      return u;
    });
    return { id: updated.id, name: updated.name, code: updated.code, type: updated.type, isActive: updated.isActive } satisfies SubjectItem;
  }

  // ---------------------------------------------------------------- class subjects

  async listClassSubjects(academicYearId?: string): Promise<ClassSubjectItem[]> {
    const yearId = await this.resolveYear(academicYearId);
    const rows = await this.db.classSubject.findMany({ where: { academicYearId: yearId } });
    return rows.map((r) => ({ classId: r.classId, subjectId: r.subjectId, isOptional: r.isOptional }));
  }

  /** Replace what the given classes study this year. */
  async setClassSubjects(input: In<typeof setClassSubjectsSchema>) {
    const yearId = await this.resolveYear(input.academicYearId);
    const subjectIds = [...new Set([...input.subjectIds, ...input.optionalSubjectIds])];
    const [classes, subjects] = await Promise.all([
      this.db.schoolClass.count({ where: { id: { in: input.classIds } } }),
      this.db.subject.count({ where: { id: { in: subjectIds } } }),
    ]);
    if (classes !== new Set(input.classIds).size) throw AppError.invalidReference('classIds', 'class');
    if (subjects !== subjectIds.length) throw AppError.invalidReference('subjectIds', 'subject');
    const optional = new Set(input.optionalSubjectIds);

    await this.prisma.tenantTx(async (tx) => {
      await tx.classSubject.deleteMany({ where: { academicYearId: yearId, classId: { in: input.classIds } } });
      await tx.classSubject.createMany({
        data: input.classIds.flatMap((classId) =>
          subjectIds.map((subjectId) => ({ academicYearId: yearId, classId, subjectId, isOptional: optional.has(subjectId) })),
        ) as Prisma.ClassSubjectCreateManyInput[],
      });
      await this.audit.record(tx, { action: 'class_subjects.set', entityType: 'ClassSubject', after: { classIds: input.classIds, subjectIds } });
    });
    return this.listClassSubjects(yearId);
  }

  // ---------------------------------------------------------------- teaching assignments

  async listAssignments(query: In<typeof listAssignmentsQuerySchema>): Promise<AssignmentItem[]> {
    const yearId = query.sectionId ? undefined : await this.resolveYear(query.academicYearId);
    const rows = await this.db.teachingAssignment.findMany({
      where: { academicYearId: yearId, sectionId: query.sectionId, teacherId: query.teacherId },
      include: {
        section: { select: { id: true, name: true, class: { select: { name: true, displayOrder: true } } } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return rows
      .sort((a, b) => a.section.class.displayOrder - b.section.class.displayOrder || a.section.name.localeCompare(b.section.name) || a.subject.name.localeCompare(b.subject.name))
      .map((r) => ({
        id: r.id,
        section: { id: r.section.id, name: r.section.name, className: r.section.class.name },
        subject: r.subject,
        teacher: { id: r.teacher.id, name: fullName(r.teacher.firstName, r.teacher.lastName) },
      }));
  }

  async createAssignment(input: In<typeof createAssignmentSchema>) {
    const [section, subject] = await Promise.all([
      this.db.section.findUnique({ where: { id: input.sectionId }, select: { id: true, academicYearId: true } }),
      this.db.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } }),
    ]);
    if (!section) throw AppError.invalidReference('sectionId', 'section');
    if (!subject) throw AppError.invalidReference('subjectId', 'subject');
    await this.assertTeacher(input.teacherId, 'teacherId');
    const dup = await this.db.teachingAssignment.findFirst({ where: input });
    if (dup) throw new AppError('CONFLICT', 409, 'This teacher already teaches this subject to this section.');
    const id = await this.prisma.tenantTx(async (tx) => {
      const a = await tx.teachingAssignment.create({ data: { ...input, academicYearId: section.academicYearId } as Prisma.TeachingAssignmentUncheckedCreateInput });
      await this.audit.record(tx, { action: 'assignment.create', entityType: 'TeachingAssignment', entityId: a.id, after: input });
      return a.id;
    });
    return (await this.listAssignments({ sectionId: input.sectionId })).find((a) => a.id === id)!;
  }

  async deleteAssignment(id: string) {
    const a = await this.db.teachingAssignment.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('assignment');
    await this.prisma.tenantTx(async (tx) => {
      await tx.teachingAssignment.delete({ where: { id } });
      await this.audit.record(tx, { action: 'assignment.delete', entityType: 'TeachingAssignment', entityId: id, before: { sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId } });
    });
  }
}
