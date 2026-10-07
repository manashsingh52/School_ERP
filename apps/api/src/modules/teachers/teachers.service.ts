import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  PageResponse,
  TeacherDetail,
  TeacherListItem,
  createTeacherSchema,
  listTeachersQuerySchema,
  updateTeacherSchema,
} from '@schoolos/contracts';
import { AuditService, diff } from '../../core/audit/audit.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { fromDate, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { IdentityService } from '../schools/identity.service.js';

type In<T extends z.ZodType> = z.output<T>;

const short = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
    private readonly files: FilesService,
  ) {}

  async list(query: In<typeof listTeachersQuerySchema>): Promise<PageResponse<TeacherListItem>> {
    const yearId = await this.scope.currentAcademicYearId();
    const filters: Prisma.TeacherWhereInput[] = [await this.scope.teacherWhere('teacher.view')];
    filters.push(query.status ? { status: query.status } : { status: { not: 'LEFT' } });
    for (const word of (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5)) {
      filters.push({
        OR: [
          { firstName: { contains: word, mode: 'insensitive' } },
          { lastName: { contains: word, mode: 'insensitive' } },
          { employeeId: { startsWith: word, mode: 'insensitive' } },
          { department: { contains: word, mode: 'insensitive' } },
        ],
      });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.teacher.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { employeeId: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { classTeacherOf: { where: { academicYearId: yearId ?? undefined }, select: { name: true, class: { select: { name: true } } } } },
      }),
      this.prisma.db.teacher.count({ where }),
    ]);
    const logins = await this.identity.loginStatus(rows.map((r) => r.membershipId));
    return {
      data: rows.map((t) => ({
        id: t.id,
        employeeId: t.employeeId,
        firstName: t.firstName,
        lastName: t.lastName,
        department: t.department,
        designation: t.designation,
        status: t.status,
        login: t.membershipId ? (logins.get(t.membershipId) ?? 'NONE') : 'NONE',
        classTeacherOf: t.classTeacherOf.map((s) => short(s.class.name, s.name)),
      })),
      page: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<TeacherDetail> {
    const where = await this.scope.teacherWhere('teacher.view');
    const t = await this.prisma.db.teacher.findFirst({ where: { AND: [where, { id }] } });
    if (!t) throw AppError.notFound('teacher');
    const yearId = await this.scope.currentAcademicYearId();
    const [sections, assignments, logins] = await Promise.all([
      this.prisma.db.section.findMany({ where: { classTeacherId: id, academicYearId: yearId ?? undefined }, select: { name: true, class: { select: { name: true } } } }),
      this.prisma.db.teachingAssignment.findMany({
        where: { teacherId: id, academicYearId: yearId ?? undefined },
        include: { section: { select: { name: true, class: { select: { name: true, displayOrder: true } } } }, subject: { select: { name: true } } },
      }),
      this.identity.loginStatus([t.membershipId]),
    ]);
    // Parents see a teacher's name, subject and photo — not personal contact details (docs/04 §4 note 1).
    const staffView = this.scope.scopeOf('teacher.view') === 'ALL';
    return {
      id: t.id,
      employeeId: t.employeeId,
      firstName: t.firstName,
      lastName: t.lastName,
      department: t.department,
      designation: t.designation,
      status: t.status,
      login: t.membershipId ? (logins.get(t.membershipId) ?? 'NONE') : 'NONE',
      classTeacherOf: sections.map((s) => short(s.class.name, s.name)),
      gender: t.gender,
      dateOfBirth: staffView ? fromDate(t.dateOfBirth) : null,
      phone: staffView ? t.phone : '',
      email: staffView ? t.email : null,
      qualification: t.qualification,
      joiningDate: staffView ? fromDate(t.joiningDate) : null,
      photoUrl: t.photoFileId ? await this.files.inlineUrl(t.photoFileId) : null,
      assignments: assignments
        .sort((a, b) => a.section.class.displayOrder - b.section.class.displayOrder || a.section.name.localeCompare(b.section.name))
        .map((a) => ({ id: a.id, className: a.section.class.name, sectionName: a.section.name, subjectName: a.subject.name })),
    };
  }

  async create(input: In<typeof createTeacherSchema>): Promise<TeacherDetail> {
    const dup = await this.prisma.db.teacher.findFirst({ where: { employeeId: input.employeeId }, select: { id: true } });
    if (dup) throw new AppError('CONFLICT', 409, `Employee ID ${input.employeeId} is already used.`, [{ field: 'employeeId', message: 'Already in use' }]);

    let membershipId: string | null = null;
    if (input.inviteToLogin) {
      ({ membershipId } = await this.identity.invite({
        name: [input.firstName, input.lastName].filter(Boolean).join(' '),
        phone: input.phone,
        email: input.email,
        roleKey: 'teacher',
      }));
      const taken = await this.prisma.db.teacher.findFirst({ where: { membershipId }, select: { employeeId: true } });
      if (taken) throw new AppError('CONFLICT', 409, `This phone already belongs to teacher ${taken.employeeId}.`, [{ field: 'phone', message: 'Already used by another teacher' }]);
    }

    const id = await this.prisma.tenantTx(async (tx) => {
      const t = await tx.teacher.create({
        data: {
          membershipId,
          employeeId: input.employeeId,
          firstName: input.firstName,
          lastName: input.lastName,
          gender: input.gender,
          dateOfBirth: toDate(input.dateOfBirth),
          phone: input.phone,
          email: input.email,
          department: input.department,
          designation: input.designation,
          qualification: input.qualification,
          joiningDate: toDate(input.joiningDate),
        } as Prisma.TeacherUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'teacher.create', entityType: 'Teacher', entityId: t.id, after: { employeeId: t.employeeId, invited: !!membershipId } });
      return t.id;
    });
    return this.get(id);
  }

  async update(id: string, input: In<typeof updateTeacherSchema>): Promise<TeacherDetail> {
    const before = await this.prisma.db.teacher.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('teacher');
    if (input.employeeId && input.employeeId !== before.employeeId) {
      const dup = await this.prisma.db.teacher.findFirst({ where: { employeeId: input.employeeId }, select: { id: true } });
      if (dup) throw new AppError('CONFLICT', 409, `Employee ID ${input.employeeId} is already used.`, [{ field: 'employeeId', message: 'Already in use' }]);
    }
    if (input.photoFileId) await this.files.assertReady(input.photoFileId, 'teacher_photo');

    const data = {
      ...input,
      dateOfBirth: input.dateOfBirth !== undefined ? toDate(input.dateOfBirth) : undefined,
      joiningDate: input.joiningDate !== undefined ? toDate(input.joiningDate) : undefined,
    };
    const changes = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await this.prisma.tenantTx(async (tx) => {
      const after = await tx.teacher.update({ where: { id }, data: changes });
      const delta = diff(before as unknown as Record<string, unknown>, Object.fromEntries(Object.keys(changes).map((k) => [k, (after as Record<string, unknown>)[k]])));
      if (delta) await this.audit.record(tx, { action: 'teacher.update', entityType: 'Teacher', entityId: id, ...delta });
    });
    // Leaving the school ends their access; coming back restores it.
    if (input.status && before.membershipId && input.status !== before.status) {
      if (input.status === 'LEFT') await this.identity.setStatus(before.membershipId, 'SUSPENDED');
      else if (before.status === 'LEFT') await this.identity.setStatus(before.membershipId, 'ACTIVE');
    }
    return this.get(id);
  }

  /** Create a login for a teacher who was added without one. */
  async invite(id: string): Promise<TeacherDetail> {
    const t = await this.prisma.db.teacher.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('teacher');
    if (t.membershipId) return this.get(id);
    const { membershipId } = await this.identity.invite({
      name: [t.firstName, t.lastName].filter(Boolean).join(' '),
      phone: t.phone,
      email: t.email,
      roleKey: 'teacher',
    });
    await this.prisma.tenantTx(async (tx) => {
      await tx.teacher.update({ where: { id }, data: { membershipId } });
      await this.audit.record(tx, { action: 'teacher.invite', entityType: 'Teacher', entityId: id });
    });
    return this.get(id);
  }
}
