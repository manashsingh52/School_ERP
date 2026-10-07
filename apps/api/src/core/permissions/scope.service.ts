import { Injectable } from '@nestjs/common';
import type { Permission, PermissionScope } from '@schoolos/permissions';
import type { Prisma } from '../../generated/prisma/client.js';
import { RequestContextStore } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Step 2 of authorization (docs/04 §2): turns a permission's scope into a record filter.
 *   ALL           → whole school
 *   ASSIGNED      → sections the teacher teaches or is class teacher of (current academic year)
 *   OWN_CHILDREN  → students linked to the guardian
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  scopeOf(permission: Permission): PermissionScope {
    const scope = RequestContextStore.tenant().permissions[permission];
    if (!scope) throw AppError.forbidden();
    return scope;
  }

  async currentAcademicYearId(): Promise<string | null> {
    const school = await this.prisma.db.school.findUnique({
      where: { id: RequestContextStore.tenant().schoolId },
      select: { currentAcademicYearId: true },
    });
    return school?.currentAcademicYearId ?? null;
  }

  /** Section ids the current member teaches in the current academic year. */
  async assignedSectionIds(): Promise<string[]> {
    const { membershipId } = RequestContextStore.tenant();
    const teacher = await this.prisma.db.teacher.findUnique({ where: { membershipId }, select: { id: true } });
    const yearId = await this.currentAcademicYearId();
    if (!teacher || !yearId) return [];
    const [classTeacherOf, assignments] = await Promise.all([
      this.prisma.db.section.findMany({
        where: { classTeacherId: teacher.id, academicYearId: yearId },
        select: { id: true },
      }),
      this.prisma.db.teachingAssignment.findMany({
        where: { teacherId: teacher.id, academicYearId: yearId },
        select: { sectionId: true },
      }),
    ]);
    return [...new Set([...classTeacherOf.map((s) => s.id), ...assignments.map((a) => a.sectionId)])];
  }

  /** Student ids linked to the current member as guardian. */
  async childStudentIds(): Promise<string[]> {
    const { membershipId } = RequestContextStore.tenant();
    const guardian = await this.prisma.db.guardian.findUnique({ where: { membershipId }, select: { id: true } });
    if (!guardian) return [];
    const links = await this.prisma.db.studentGuardian.findMany({
      where: { guardianId: guardian.id },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  /** Prisma filter for students visible under `permission`. */
  async studentWhere(permission: Permission): Promise<Prisma.StudentWhereInput> {
    switch (this.scopeOf(permission)) {
      case 'ALL':
        return {};
      case 'ASSIGNED': {
        const [sectionIds, yearId] = await Promise.all([this.assignedSectionIds(), this.currentAcademicYearId()]);
        if (!yearId || sectionIds.length === 0) return { id: { in: [] } };
        return { enrollments: { some: { academicYearId: yearId, sectionId: { in: sectionIds } } } };
      }
      case 'OWN_CHILDREN':
        return { id: { in: await this.childStudentIds() } };
      default:
        return { id: { in: [] } };
    }
  }

  /** Guardians visible under `permission`: ALL · ASSIGNED (parents of my students) · SELF (me). */
  async guardianWhere(permission: Permission): Promise<Prisma.GuardianWhereInput> {
    switch (this.scopeOf(permission)) {
      case 'ALL':
        return {};
      case 'ASSIGNED': {
        const students = await this.studentWhere('student.view').catch(() => ({ id: { in: [] } }));
        return { children: { some: { student: students } } };
      }
      case 'SELF':
        return { membershipId: RequestContextStore.tenant().membershipId };
      default:
        return { id: { in: [] } };
    }
  }

  /** Teachers visible under `permission`: ALL · OWN_CHILDREN (my children's class and subject teachers). */
  async teacherWhere(permission: Permission): Promise<Prisma.TeacherWhereInput> {
    switch (this.scopeOf(permission)) {
      case 'ALL':
        return {};
      case 'OWN_CHILDREN': {
        const [childIds, yearId] = await Promise.all([this.childStudentIds(), this.currentAcademicYearId()]);
        if (!childIds.length || !yearId) return { id: { in: [] } };
        const sections = await this.prisma.db.studentEnrollment.findMany({
          where: { studentId: { in: childIds }, academicYearId: yearId },
          select: { sectionId: true },
        });
        const sectionIds = sections.map((s) => s.sectionId);
        return {
          OR: [
            { classTeacherOf: { some: { id: { in: sectionIds } } } },
            { assignments: { some: { sectionId: { in: sectionIds } } } },
          ],
        };
      }
      default:
        return { id: { in: [] } };
    }
  }

  /** True when the current member may see this student under `permission`. */
  async canAccessStudent(permission: Permission, studentId: string): Promise<boolean> {
    const scope = RequestContextStore.tenant().permissions[permission];
    if (!scope) return false;
    if (scope === 'ALL') return true;
    const where = await this.studentWhere(permission);
    const count = await this.prisma.db.student.count({ where: { AND: [where, { id: studentId }] } });
    return count > 0;
  }
}
