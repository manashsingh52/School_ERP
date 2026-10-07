import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  GuardianItem,
  PageResponse,
  createGuardianSchema,
  linkChildSchema,
  listGuardiansQuerySchema,
  studentGuardianInputSchema,
  updateGuardianSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { fullName } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { IdentityService } from '../schools/identity.service.js';

type In<T extends z.ZodType> = z.output<T>;

/**
 * Parents/guardians (docs/02 D5). One guardian per phone per school; one guardian can have
 * many children. Their login is a Membership with the Parent role (created on invite).
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  private include(yearId: string | null) {
    return {
      children: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              enrollments: {
                where: { academicYearId: yearId ?? '00000000-0000-0000-0000-000000000000' },
                select: { section: { select: { name: true } }, class: { select: { name: true } } },
              },
            },
          },
        },
      },
    } satisfies Prisma.GuardianInclude;
  }

  private async toItems(rows: Prisma.GuardianGetPayload<{ include: ReturnType<GuardiansService['include']> }>[]): Promise<GuardianItem[]> {
    const logins = await this.identity.loginStatus(rows.map((r) => r.membershipId));
    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      phone: g.phone,
      email: g.email,
      occupation: g.occupation,
      login: g.membershipId ? (logins.get(g.membershipId) ?? 'NONE') : 'NONE',
      children: g.children.map((c) => ({
        studentId: c.student.id,
        name: fullName(c.student.firstName, c.student.lastName),
        admissionNo: c.student.admissionNo,
        className: c.student.enrollments[0]?.class.name ?? null,
        sectionName: c.student.enrollments[0]?.section.name ?? null,
        relation: c.relation,
        isPrimary: c.isPrimary,
      })),
    }));
  }

  async list(query: In<typeof listGuardiansQuerySchema>): Promise<PageResponse<GuardianItem>> {
    const filters: Prisma.GuardianWhereInput[] = [await this.scope.guardianWhere('guardian.view'), { archivedAt: null }];
    for (const word of (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5)) {
      const digits = word.replace(/\D/g, '');
      filters.push({
        OR: [
          { name: { contains: word, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    const where = { AND: filters };
    const yearId = await this.scope.currentAcademicYearId();
    const [rows, total] = await Promise.all([
      this.prisma.db.guardian.findMany({
        where,
        orderBy: [{ name: 'asc' }, { phone: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: this.include(yearId),
      }),
      this.prisma.db.guardian.count({ where }),
    ]);
    return { data: await this.toItems(rows), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string): Promise<GuardianItem> {
    const where = await this.scope.guardianWhere('guardian.view');
    const g = await this.prisma.db.guardian.findFirst({
      where: { AND: [where, { id }] },
      include: this.include(await this.scope.currentAcademicYearId()),
    });
    if (!g) throw AppError.notFound('parent');
    return (await this.toItems([g]))[0]!;
  }

  async create(input: In<typeof createGuardianSchema>): Promise<GuardianItem> {
    const existing = await this.prisma.db.guardian.findFirst({ where: { phone: input.phone }, select: { id: true, name: true } });
    if (existing) {
      throw new AppError('CONFLICT', 409, `${existing.name} already uses this phone number.`, [{ field: 'phone', message: 'Already used by another parent' }]);
    }
    const id = await this.ensure({ ...input, relation: 'GUARDIAN', isPrimary: false }, input.inviteToLogin, {
      occupation: input.occupation,
      addressLine1: input.addressLine1,
      city: input.city,
    });
    return this.get(id);
  }

  /**
   * Find the school's guardian with this phone or create one (used by the student form and
   * imports). Optionally invites them to log in as a Parent. Returns the guardian id.
   */
  async ensure(
    input: In<typeof studentGuardianInputSchema>,
    invite: boolean,
    extra: Partial<Pick<Prisma.GuardianUncheckedCreateInput, 'occupation' | 'addressLine1' | 'city'>> = {},
  ): Promise<string> {
    let guardian = await this.prisma.db.guardian.findFirst({ where: { phone: input.phone } });
    if (!guardian) {
      guardian = await this.prisma.tenantTx(async (tx) => {
        const g = await tx.guardian.create({
          data: { name: input.name, phone: input.phone, email: input.email, ...extra } as Prisma.GuardianUncheckedCreateInput,
        });
        await this.audit.record(tx, { action: 'guardian.create', entityType: 'Guardian', entityId: g.id, after: { name: g.name } });
        return g;
      });
    }
    if (invite && !guardian.membershipId) await this.createLogin(guardian.id);
    return guardian.id;
  }

  async update(id: string, input: In<typeof updateGuardianSchema>): Promise<GuardianItem> {
    const before = await this.prisma.db.guardian.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('parent');
    if (input.phone && input.phone !== before.phone) {
      const dup = await this.prisma.db.guardian.findFirst({ where: { phone: input.phone }, select: { id: true } });
      if (dup) throw new AppError('CONFLICT', 409, 'Another parent already uses this phone number.', [{ field: 'phone', message: 'Already in use' }]);
    }
    const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.prisma.tenantTx(async (tx) => {
      await tx.guardian.update({ where: { id }, data: changes });
      await this.audit.record(tx, {
        action: 'guardian.update',
        entityType: 'Guardian',
        entityId: id,
        before: Object.fromEntries(Object.keys(changes).map((k) => [k, (before as Record<string, unknown>)[k]])),
        after: changes,
      });
    });
    return this.get(id);
  }

  async linkChild(id: string, input: In<typeof linkChildSchema>): Promise<GuardianItem> {
    const [guardian, student] = await Promise.all([
      this.prisma.db.guardian.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.db.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
    ]);
    if (!guardian) throw AppError.notFound('parent');
    if (!student) throw AppError.invalidReference('studentId', 'student');
    await this.prisma.tenantTx((tx) => this.link(tx, id, input.studentId, input.relation, input.isPrimary));
    return this.get(id);
  }

  /** Link inside an existing transaction. Only one primary guardian per student. */
  async link(tx: TenantTx, guardianId: string, studentId: string, relation: In<typeof linkChildSchema>['relation'], isPrimary: boolean) {
    const hasPrimary = await tx.studentGuardian.count({ where: { studentId, isPrimary: true, NOT: { guardianId } } });
    const primary = isPrimary || hasPrimary === 0;
    if (primary) await tx.studentGuardian.updateMany({ where: { studentId, NOT: { guardianId } }, data: { isPrimary: false } });
    await tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      create: { studentId, guardianId, relation, isPrimary: primary } as Prisma.StudentGuardianUncheckedCreateInput,
      update: { relation, isPrimary: primary },
    });
    await this.audit.record(tx, { action: 'guardian.link', entityType: 'Guardian', entityId: guardianId, after: { studentId, relation, isPrimary: primary } });
  }

  async unlinkChild(id: string, studentId: string): Promise<GuardianItem> {
    const link = await this.prisma.db.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: id } } });
    if (!link) throw AppError.notFound('link');
    await this.prisma.tenantTx(async (tx) => {
      await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId: id } } });
      await this.audit.record(tx, { action: 'guardian.unlink', entityType: 'Guardian', entityId: id, before: { studentId, relation: link.relation } });
    });
    return this.get(id);
  }

  async inviteGuardian(id: string): Promise<GuardianItem> {
    await this.createLogin(id);
    return this.get(id);
  }

  /** Works for user requests and background jobs alike (no read-back as the current user). */
  private async createLogin(id: string): Promise<void> {
    const g = await this.prisma.db.guardian.findUnique({ where: { id } });
    if (!g) throw AppError.notFound('parent');
    if (g.membershipId) return;
    const { membershipId } = await this.identity.invite({ name: g.name, phone: g.phone, email: g.email, roleKey: 'parent' });
    await this.prisma.tenantTx(async (tx) => {
      await tx.guardian.update({ where: { id }, data: { membershipId } });
      await this.audit.record(tx, { action: 'guardian.invite', entityType: 'Guardian', entityId: id });
    });
  }
}
