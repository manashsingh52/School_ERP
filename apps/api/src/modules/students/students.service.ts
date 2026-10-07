import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  createStudentSchema,
  listStudentsQuerySchema,
  PageResponse,
  StudentDetail,
  StudentListItem,
  updateStudentSchema,
} from '@schoolos/contracts';
import { AuditService, diff } from '../../core/audit/audit.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type CreateInput = z.output<typeof createStudentSchema>;
type UpdateInput = z.output<typeof updateStudentSchema>;
type ListQuery = z.output<typeof listStudentsQuerySchema>;

const toDate = (value: string | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined);
const fromDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const enrollmentSelect = (yearId: string | null) => ({
  where: { academicYearId: yearId ?? '00000000-0000-0000-0000-000000000000' },
  take: 1,
  select: {
    rollNo: true,
    sectionId: true,
    classId: true,
    section: { select: { name: true } },
    class: { select: { name: true } },
  },
});

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery): Promise<PageResponse<StudentListItem>> {
    const yearId = await this.scope.currentAcademicYearId();
    const filters: Prisma.StudentWhereInput[] = [await this.scope.studentWhere('student.view')];
    filters.push({ status: query.status ?? 'ACTIVE' });
    if (query.sectionId || query.classId) {
      filters.push({
        enrollments: {
          some: {
            academicYearId: yearId ?? undefined,
            ...(query.sectionId ? { sectionId: query.sectionId } : {}),
            ...(query.classId ? { classId: query.classId } : {}),
          },
        },
      });
    }
    // "rahul ku" → every word must match a first name, last name or admission number.
    for (const word of (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5)) {
      filters.push({
        OR: [
          { firstName: { contains: word, mode: 'insensitive' } },
          { lastName: { contains: word, mode: 'insensitive' } },
          { admissionNo: { startsWith: word, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.StudentWhereInput = { AND: filters };

    const [rows, total] = await Promise.all([
      this.prisma.db.student.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { admissionNo: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          status: true,
          enrollments: enrollmentSelect(yearId),
        },
      }),
      this.prisma.db.student.count({ where }),
    ]);

    return {
      data: rows.map((s) => {
        const e = s.enrollments[0];
        return {
          id: s.id,
          admissionNo: s.admissionNo,
          firstName: s.firstName,
          lastName: s.lastName,
          status: s.status,
          className: e?.class.name ?? null,
          sectionName: e?.section.name ?? null,
          rollNo: e?.rollNo ?? null,
        };
      }),
      page: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<StudentDetail> {
    if (!(await this.scope.canAccessStudent('student.view', id))) throw AppError.notFound('student');
    const yearId = await this.scope.currentAcademicYearId();
    const s = await this.prisma.db.student.findUnique({
      where: { id },
      include: { enrollments: enrollmentSelect(yearId) },
    });
    if (!s) throw AppError.notFound('student');
    const e = s.enrollments[0];
    const showContact = await this.scope.canAccessStudent('student.contact.view', id);
    return {
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      status: s.status,
      className: e?.class.name ?? null,
      sectionName: e?.section.name ?? null,
      rollNo: e?.rollNo ?? null,
      classId: e?.classId ?? null,
      sectionId: e?.sectionId ?? null,
      dateOfBirth: fromDate(s.dateOfBirth),
      gender: s.gender,
      admissionDate: fromDate(s.admissionDate),
      ...(showContact ? { phone: s.phone, email: s.email } : {}),
      createdAt: s.createdAt.toISOString(),
    };
  }

  async create(input: CreateInput): Promise<StudentDetail> {
    // Foreign ids from the request are resolved through the tenant client first: another
    // school's section simply isn't found (docs/03 §2).
    const section = await this.prisma.db.section.findUnique({
      where: { id: input.sectionId },
      select: { id: true, classId: true, academicYearId: true },
    });
    if (!section) throw AppError.invalidReference('sectionId', 'section');

    const taken = await this.prisma.db.student.findFirst({
      where: { admissionNo: input.admissionNo },
      select: { id: true },
    });
    if (taken) {
      throw new AppError('STUDENT_ADMISSION_NO_TAKEN', 409, `Admission number ${input.admissionNo} is already used.`, [
        { field: 'admissionNo', message: 'Already in use' },
      ]);
    }

    const id = await this.prisma.tenantTx(async (tx) => {
      const student = await tx.student.create({
        data: {
          admissionNo: input.admissionNo,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: toDate(input.dateOfBirth),
          gender: input.gender,
          admissionDate: toDate(input.admissionDate),
          phone: input.phone,
          email: input.email,
        } as Prisma.StudentUncheckedCreateInput,
      });
      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicYearId: section.academicYearId,
          classId: section.classId,
          sectionId: section.id,
          rollNo: input.rollNo,
          enrolledOn: toDate(input.admissionDate) ?? new Date(),
        } as Prisma.StudentEnrollmentUncheckedCreateInput,
      });
      await this.audit.record(tx, {
        action: 'student.create',
        entityType: 'Student',
        entityId: student.id,
        after: { admissionNo: student.admissionNo, sectionId: section.id },
      });
      return student.id;
    });
    return this.get(id);
  }

  async update(id: string, input: UpdateInput): Promise<StudentDetail> {
    if (!(await this.scope.canAccessStudent('student.edit', id))) throw AppError.notFound('student');

    await this.prisma.tenantTx(async (tx) => {
      const before = await tx.student.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('student');
      const data = {
        admissionNo: input.admissionNo,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: toDate(input.dateOfBirth),
        gender: input.gender,
        admissionDate: toDate(input.admissionDate),
        phone: input.phone,
        email: input.email,
        status: input.status,
      };
      const changes = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      if (!Object.keys(changes).length) return;
      const after = await tx.student.update({ where: { id }, data: changes });
      const delta = diff(before as unknown as Record<string, unknown>, pick(after, Object.keys(changes)));
      if (delta) await this.audit.record(tx, { action: 'student.update', entityType: 'Student', entityId: id, ...delta });
    });
    return this.get(id);
  }
}

function pick<T extends object>(obj: T, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, (obj as Record<string, unknown>)[k]]));
}
