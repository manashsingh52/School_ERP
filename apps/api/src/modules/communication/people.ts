import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { fullName } from '../../core/util/dates.js';

const RELATION: Record<string, string> = { FATHER: 'Father', MOTHER: 'Mother', GUARDIAN: 'Guardian', GRANDPARENT: 'Grandparent', SIBLING: 'Sibling', OTHER: 'Parent' };
const short = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;

/** Names and links the communication features share: students, members, a child's teachers and parents. */
@Injectable()
export class CommunicationPeople {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async students(ids: string[]): Promise<Map<string, { id: string; name: string; classLabel: string | null }>> {
    if (!ids.length) return new Map();
    const yearId = await this.scope.currentAcademicYearId();
    const rows = await this.prisma.db.student.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        enrollments: { where: { academicYearId: yearId ?? undefined }, take: 1, select: { section: { select: { name: true, class: { select: { name: true } } } } } },
      },
    });
    return new Map(
      rows.map((s) => {
        const section = s.enrollments[0]?.section;
        return [s.id, { id: s.id, name: fullName(s.firstName, s.lastName), classLabel: section ? short(section.class.name, section.name) : null }];
      }),
    );
  }

  async memberNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (!wanted.length) return new Map();
    const rows = await this.prisma.db.membership.findMany({ where: { id: { in: wanted } }, select: { id: true, user: { select: { name: true } } } });
    return new Map(rows.map((m) => [m.id, m.user.name]));
  }

  /** The child's class teacher and subject teachers who can sign in, with what they teach. */
  async teachersOf(studentId: string): Promise<{ memberId: string; name: string; role: string }[]> {
    const yearId = await this.scope.currentAcademicYearId();
    if (!yearId) return [];
    const enrollment = await this.prisma.db.studentEnrollment.findFirst({ where: { studentId, academicYearId: yearId }, select: { sectionId: true } });
    if (!enrollment) return [];
    const [section, assignments] = await Promise.all([
      this.prisma.db.section.findUnique({ where: { id: enrollment.sectionId }, select: { classTeacher: { select: { id: true, membershipId: true, firstName: true, lastName: true } } } }),
      this.prisma.db.teachingAssignment.findMany({
        where: { sectionId: enrollment.sectionId, academicYearId: yearId },
        select: { subject: { select: { name: true } }, teacher: { select: { id: true, membershipId: true, firstName: true, lastName: true } } },
      }),
    ]);
    const out = new Map<string, { memberId: string; name: string; roles: string[]; classTeacher: boolean }>();
    const add = (t: { membershipId: string | null; firstName: string; lastName: string | null }, role: string, classTeacher = false) => {
      if (!t.membershipId) return;
      const e = out.get(t.membershipId) ?? { memberId: t.membershipId, name: fullName(t.firstName, t.lastName), roles: [], classTeacher: false };
      if (!e.roles.includes(role)) e.roles.push(role);
      e.classTeacher ||= classTeacher;
      out.set(t.membershipId, e);
    };
    if (section?.classTeacher) add(section.classTeacher, 'Class teacher', true);
    for (const a of assignments) add(a.teacher, a.subject.name);
    return [...out.values()]
      .sort((a, b) => Number(b.classTeacher) - Number(a.classTeacher) || a.name.localeCompare(b.name))
      .map((e) => ({ memberId: e.memberId, name: e.name, role: e.roles.join(', ') }));
  }

  /** The child's parents who can sign in. */
  async parentsOf(studentId: string): Promise<{ memberId: string; name: string; role: string }[]> {
    const links = await this.prisma.db.studentGuardian.findMany({
      where: { studentId, guardian: { membershipId: { not: null }, archivedAt: null } },
      orderBy: { isPrimary: 'desc' },
      select: { relation: true, guardian: { select: { name: true, membershipId: true } } },
    });
    return links.map((l) => ({ memberId: l.guardian.membershipId!, name: l.guardian.name, role: RELATION[l.relation] ?? 'Parent' }));
  }

  /** Staff who answer the school office's threads: whoever holds `complaint.manage`. */
  async officeMembers(): Promise<string[]> {
    const rows = await this.prisma.db.membership.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { permission: 'complaint.manage' } } } } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
