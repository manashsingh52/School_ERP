import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  ConcessionTypeItem,
  FeeHeadItem,
  FeeStructureItem,
  StudentConcessionItem,
  concessionTypeSchema,
  decideConcessionSchema,
  feeHeadSchema,
  feeStructureSchema,
  listConcessionsQuerySchema,
  requestConcessionSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { fromDate, fullName, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

type In<T extends z.ZodType> = z.output<T>;

const structureInclude = {
  classes: { include: { class: { select: { id: true, name: true, displayOrder: true } } } },
  items: { include: { feeHead: { select: { id: true, name: true, code: true } }, splits: true } },
  installments: { orderBy: { order: 'asc' }, include: { splits: true, _count: { select: { invoices: true } } } },
  lateFeeRules: { where: { isActive: true } },
} satisfies Prisma.FeeStructureInclude;
type StructureRow = Prisma.FeeStructureGetPayload<{ include: typeof structureInclude }>;

const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;

/**
 * Fee setup (Master Prompt §34, docs/11): fee heads, per-class structures with installments and
 * a late-fee rule, concession types and per-student concessions (request → approve).
 * Amounts are integer paise everywhere.
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async yearId(): Promise<string> {
    const id = await this.scope.currentAcademicYearId();
    if (!id) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create an academic year first.');
    return id;
  }

  // ---------------------------------------------------------------- heads

  async listHeads(): Promise<FeeHeadItem[]> {
    return this.prisma.db.feeHead.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, code: true, type: true, frequency: true, isOptional: true, isActive: true },
    });
  }

  async saveHead(id: string | null, input: In<typeof feeHeadSchema>): Promise<FeeHeadItem> {
    const clash = await this.prisma.db.feeHead.findFirst({ where: { code: input.code, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError('DUPLICATE', 409, `Code ${input.code} is already used by ${clash.name}.`, [{ field: 'code', message: 'Already used' }]);
    if (id && !(await this.prisma.db.feeHead.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('fee');
    const saved = await this.prisma.tenantTx(async (tx) => {
      const row = id ? await tx.feeHead.update({ where: { id }, data: input }) : await tx.feeHead.create({ data: input as Prisma.FeeHeadUncheckedCreateInput });
      await this.audit.record(tx, { action: id ? 'fee_head.update' : 'fee_head.create', entityType: 'FeeHead', entityId: row.id, after: input });
      return row;
    });
    return { id: saved.id, name: saved.name, code: saved.code, type: saved.type, frequency: saved.frequency, isOptional: saved.isOptional, isActive: saved.isActive };
  }

  // ---------------------------------------------------------------- structures

  private toStructure(s: StructureRow): FeeStructureItem {
    const rule = s.lateFeeRules[0];
    return {
      id: s.id,
      name: s.name,
      status: s.status === 'PUBLISHED' ? 'PUBLISHED' : s.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT',
      classes: s.classes.sort((a, b) => a.class.displayOrder - b.class.displayOrder).map((c) => ({ id: c.class.id, name: c.class.name })),
      items: s.items
        .sort((a, b) => a.feeHead.name.localeCompare(b.feeHead.name))
        .map((i) => ({ id: i.id, feeHead: i.feeHead, amountPaise: i.amountPaise, isOptional: i.isOptional })),
      installments: s.installments.map((ins) => ({
        id: ins.id,
        name: ins.name,
        dueDate: fromDate(ins.dueDate)!,
        order: ins.order,
        amountPaise: ins.splits.reduce((a, sp) => a + sp.amountPaise, 0),
        splits: Object.fromEntries(ins.splits.map((sp) => [s.items.find((i) => i.id === sp.itemId)!.feeHeadId, sp.amountPaise])),
      })),
      lateFee: rule
        ? { graceDays: rule.graceDays, calc: rule.calc, valuePaise: rule.valuePaise, valueBasisPoints: rule.valueBasisPoints, maxPaise: rule.maxPaise }
        : null,
      annualPaise: s.items.filter((i) => !i.isOptional).reduce((a, i) => a + i.amountPaise, 0),
      invoices: s.installments.reduce((a, i) => a + i._count.invoices, 0),
      createdAt: s.createdAt.toISOString(),
    };
  }

  async listStructures(): Promise<FeeStructureItem[]> {
    const yearId = await this.yearId();
    const rows = await this.prisma.db.feeStructure.findMany({ where: { academicYearId: yearId, status: { not: 'ARCHIVED' } }, include: structureInclude, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.toStructure(r));
  }

  async getStructure(id: string): Promise<FeeStructureItem> {
    const row = await this.prisma.db.feeStructure.findUnique({ where: { id }, include: structureInclude });
    if (!row) throw AppError.notFound('fee structure');
    return this.toStructure(row);
  }

  /** Create, or replace a structure that has no invoices yet. */
  async saveStructure(id: string | null, input: In<typeof feeStructureSchema>): Promise<FeeStructureItem> {
    const yearId = await this.yearId();
    if (id) {
      const current = await this.getStructure(id);
      if (current.invoices) throw new AppError('STRUCTURE_IN_USE', 409, 'Invoices were already made from this structure. Create a new structure for changes, or adjust the invoices.');
      if (current.status === 'ARCHIVED') throw AppError.notFound('fee structure');
    }
    const [heads, classes] = await Promise.all([
      this.prisma.db.feeHead.findMany({ where: { id: { in: input.items.map((i) => i.feeHeadId) } }, select: { id: true } }),
      this.prisma.db.schoolClass.count({ where: { id: { in: input.classIds } } }),
    ]);
    if (heads.length !== new Set(input.items.map((i) => i.feeHeadId)).size) throw AppError.invalidReference('items', 'fee');
    if (classes !== new Set(input.classIds).size) throw AppError.invalidReference('classIds', 'class');
    if (await this.prisma.db.feeStructure.findFirst({ where: { academicYearId: yearId, name: { equals: input.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } })) {
      throw new AppError('DUPLICATE', 409, 'A fee structure with this name already exists.', [{ field: 'name', message: 'Already used' }]);
    }
    await this.assertClassesFree(input.classIds, yearId, id);

    const { schoolId } = RequestContextStore.school();
    const savedId = await this.prisma.tenantTx(async (tx) => {
      let structureId = id;
      if (structureId) {
        await tx.feeInstallment.deleteMany({ where: { feeStructureId: structureId } });
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: structureId } });
        await tx.feeStructureClass.deleteMany({ where: { feeStructureId: structureId } });
        await tx.lateFeeRule.deleteMany({ where: { feeStructureId: structureId } });
        await tx.feeStructure.update({ where: { id: structureId }, data: { name: input.name } });
      } else {
        structureId = (await tx.feeStructure.create({ data: { academicYearId: yearId, name: input.name } as Prisma.FeeStructureUncheckedCreateInput })).id;
      }
      await tx.feeStructureClass.createMany({ data: [...new Set(input.classIds)].map((classId) => ({ feeStructureId: structureId!, classId, schoolId })) });
      const itemIds = new Map<string, string>();
      for (const it of input.items) {
        const row = await tx.feeStructureItem.create({ data: { schoolId, feeStructureId: structureId, feeHeadId: it.feeHeadId, amountPaise: it.amountPaise, isOptional: it.isOptional } });
        itemIds.set(it.feeHeadId, row.id);
      }
      for (const [i, ins] of input.installments.entries()) {
        const row = await tx.feeInstallment.create({ data: { schoolId, feeStructureId: structureId, name: ins.name, dueDate: toDate(ins.dueDate)!, order: i + 1 } });
        const splits = Object.entries(ins.splits).filter(([, amount]) => amount > 0);
        if (splits.length) {
          await tx.feeInstallmentSplit.createMany({ data: splits.map(([headId, amountPaise]) => ({ schoolId, installmentId: row.id, itemId: itemIds.get(headId)!, amountPaise })) });
        }
      }
      if (input.lateFee) {
        await tx.lateFeeRule.create({
          data: {
            schoolId,
            feeStructureId: structureId,
            graceDays: input.lateFee.graceDays,
            calc: input.lateFee.calc,
            valuePaise: input.lateFee.valuePaise ?? null,
            valueBasisPoints: input.lateFee.valueBasisPoints ?? null,
            maxPaise: input.lateFee.maxPaise ?? null,
          },
        });
      }
      await this.audit.record(tx, { action: id ? 'fee_structure.update' : 'fee_structure.create', entityType: 'FeeStructure', entityId: structureId, after: { name: input.name, classes: input.classIds.length, items: input.items.length, installments: input.installments.length } });
      return structureId!;
    });
    return this.getStructure(savedId);
  }

  /** A class can be in only one live structure per year (so a student never gets two bills). */
  private async assertClassesFree(classIds: string[], yearId: string, exceptId: string | null) {
    const taken = await this.prisma.db.feeStructureClass.findFirst({
      where: { classId: { in: classIds }, feeStructure: { academicYearId: yearId, status: { not: 'ARCHIVED' }, ...(exceptId ? { id: { not: exceptId } } : {}) } },
      include: { class: { select: { name: true } }, feeStructure: { select: { name: true } } },
    });
    if (taken) throw new AppError('CLASS_HAS_STRUCTURE', 409, `${taken.class.name} already uses “${taken.feeStructure.name}”.`, [{ field: 'classIds', message: `${taken.class.name} is taken` }]);
  }

  async publishStructure(id: string): Promise<FeeStructureItem> {
    await this.getStructure(id);
    await this.prisma.tenantTx(async (tx) => {
      await tx.feeStructure.update({ where: { id }, data: { status: 'PUBLISHED' } });
      await this.audit.record(tx, { action: 'fee_structure.publish', entityType: 'FeeStructure', entityId: id });
    });
    return this.getStructure(id);
  }

  async archiveStructure(id: string): Promise<void> {
    const s = await this.getStructure(id);
    await this.prisma.tenantTx(async (tx) => {
      if (s.invoices) await tx.feeStructure.update({ where: { id }, data: { status: 'ARCHIVED' } });
      else await tx.feeStructure.delete({ where: { id } });
      await this.audit.record(tx, { action: 'fee_structure.delete', entityType: 'FeeStructure', entityId: id, before: { name: s.name, invoices: s.invoices } });
    });
  }

  // ---------------------------------------------------------------- concession types

  async listConcessionTypes(): Promise<ConcessionTypeItem[]> {
    return this.prisma.db.concessionType.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true, calc: true, valuePaise: true, valueBasisPoints: true, feeHeadIds: true, requiresApproval: true, isActive: true },
    }) as Promise<ConcessionTypeItem[]>;
  }

  async saveConcessionType(id: string | null, input: In<typeof concessionTypeSchema>): Promise<ConcessionTypeItem> {
    if (await this.prisma.db.concessionType.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } })) {
      throw new AppError('DUPLICATE', 409, 'A concession with this name already exists.', [{ field: 'name', message: 'Already used' }]);
    }
    if (input.feeHeadIds.length && (await this.prisma.db.feeHead.count({ where: { id: { in: input.feeHeadIds } } })) !== new Set(input.feeHeadIds).size) {
      throw AppError.invalidReference('feeHeadIds', 'fee');
    }
    if (id && !(await this.prisma.db.concessionType.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('concession');
    const data = {
      name: input.name,
      kind: input.kind,
      calc: input.calc,
      valuePaise: input.calc === 'FLAT' ? (input.valuePaise ?? null) : null,
      valueBasisPoints: input.calc === 'PERCENT' ? (input.valueBasisPoints ?? null) : null,
      feeHeadIds: input.feeHeadIds,
      requiresApproval: input.requiresApproval,
      isActive: input.isActive,
    };
    const row = await this.prisma.tenantTx(async (tx) => {
      const r = id ? await tx.concessionType.update({ where: { id }, data }) : await tx.concessionType.create({ data: data as Prisma.ConcessionTypeUncheckedCreateInput });
      await this.audit.record(tx, { action: id ? 'concession_type.update' : 'concession_type.create', entityType: 'ConcessionType', entityId: r.id, after: data });
      return r;
    });
    return (await this.listConcessionTypes()).find((t) => t.id === row.id)!;
  }

  // ---------------------------------------------------------------- student concessions

  async listConcessions(query: In<typeof listConcessionsQuerySchema>): Promise<StudentConcessionItem[]> {
    const yearId = await this.yearId();
    const rows = await this.prisma.db.studentConcession.findMany({
      where: { academicYearId: yearId, ...(query.status ? { status: query.status } : {}), ...(query.studentId ? { studentId: query.studentId } : {}) },
      include: {
        concessionType: true,
        student: { select: { id: true, firstName: true, lastName: true, enrollments: { where: { academicYearId: yearId }, select: { section: { select: { name: true, class: { select: { name: true } } } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const members = await this.prisma.db.membership.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.requestedByMemberId))] } }, select: { id: true, user: { select: { name: true } } } });
    return rows.map((r) => {
      const sec = r.student.enrollments[0]?.section;
      return {
        id: r.id,
        student: { id: r.student.id, name: fullName(r.student.firstName, r.student.lastName), classLabel: sec ? label(sec.class.name, sec.name) : null },
        type: { id: r.concessionType.id, name: r.concessionType.name, calc: r.concessionType.calc === 'PERCENT' ? 'PERCENT' : 'FLAT', valuePaise: r.concessionType.valuePaise, valueBasisPoints: r.concessionType.valueBasisPoints },
        overrideValue: r.overrideValue,
        reason: r.reason,
        status: r.status,
        requestedBy: members.find((m) => m.id === r.requestedByMemberId)?.user.name ?? '—',
        decidedAt: r.decidedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async requestConcession(input: In<typeof requestConcessionSchema>): Promise<StudentConcessionItem> {
    const yearId = await this.yearId();
    const [type, student] = await Promise.all([
      this.prisma.db.concessionType.findUnique({ where: { id: input.concessionTypeId } }),
      this.prisma.db.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
    ]);
    if (!type || !type.isActive) throw AppError.invalidReference('concessionTypeId', 'concession');
    if (!student) throw AppError.invalidReference('studentId', 'student');
    if (await this.prisma.db.studentConcession.findFirst({ where: { studentId: input.studentId, concessionTypeId: input.concessionTypeId, academicYearId: yearId, status: { in: ['PENDING', 'APPROVED'] } } })) {
      throw new AppError('DUPLICATE', 409, 'This student already has (or has requested) this concession.');
    }
    const perms = RequestContextStore.tenant().permissions;
    const autoApprove = !type.requiresApproval || !!perms['concession.approve'];
    const { membershipId } = RequestContextStore.tenant();
    const row = await this.prisma.tenantTx(async (tx) => {
      const r = await tx.studentConcession.create({
        data: {
          studentId: input.studentId,
          academicYearId: yearId,
          concessionTypeId: input.concessionTypeId,
          overrideValue: input.overrideValue ?? null,
          reason: input.reason ?? null,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          requestedByMemberId: membershipId,
          ...(autoApprove ? { approvedByMemberId: membershipId, decidedAt: new Date() } : {}),
        } as Prisma.StudentConcessionUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'concession.request', entityType: 'StudentConcession', entityId: r.id, after: { ...input, status: r.status } });
      return r;
    });
    return (await this.listConcessions({ studentId: input.studentId })).find((c) => c.id === row.id)!;
  }

  async decideConcession(id: string, input: In<typeof decideConcessionSchema>): Promise<StudentConcessionItem> {
    const row = await this.prisma.db.studentConcession.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('concession');
    const allowed = input.decision === 'REVOKED' ? row.status === 'APPROVED' : row.status === 'PENDING';
    if (!allowed) throw new AppError('INVALID_STATE', 422, input.decision === 'REVOKED' ? 'Only approved concessions can be revoked.' : 'This request was already decided.');
    const { membershipId } = RequestContextStore.tenant();
    await this.prisma.tenantTx(async (tx) => {
      await tx.studentConcession.update({ where: { id }, data: { status: input.decision, approvedByMemberId: membershipId, decidedAt: new Date() } });
      await this.audit.record(tx, { action: `concession.${input.decision.toLowerCase()}`, entityType: 'StudentConcession', entityId: id, metadata: { note: input.note } });
    });
    return (await this.listConcessions({ studentId: row.studentId })).find((c) => c.id === id)!;
  }

  // ---------------------------------------------------------------- per-student options

  /** The published structure that applies to a student this year (via their class). */
  async structureFor(studentId: string, tx?: TenantTx) {
    const db = tx ?? this.prisma.db;
    const yearId = await this.yearId();
    const enrollment = await db.studentEnrollment.findFirst({ where: { studentId, academicYearId: yearId }, select: { classId: true } });
    if (!enrollment) return null;
    return db.feeStructure.findFirst({
      where: { academicYearId: yearId, status: 'PUBLISHED', classes: { some: { classId: enrollment.classId } } },
      include: { items: { include: { feeHead: true } } },
    });
  }

  private async assertStudent(studentId: string) {
    if (!(await this.prisma.db.student.count({ where: { id: studentId } }))) throw AppError.notFound('student');
  }

  async setOptions(studentId: string, optedOptionalItemIds: string[]) {
    await this.assertStudent(studentId);
    const structure = await this.structureFor(studentId);
    if (!structure) throw new AppError('NO_STRUCTURE', 422, "This student's class has no published fee structure.");
    const optional = new Set(structure.items.filter((i) => i.isOptional).map((i) => i.id));
    if (optedOptionalItemIds.some((id) => !optional.has(id))) throw AppError.invalidReference('optedOptionalItemIds', 'optional fee');
    const yearId = await this.yearId();
    await this.prisma.tenantTx(async (tx) => {
      await tx.studentFeeAssignment.upsert({
        where: { studentId_academicYearId_feeStructureId: { studentId, academicYearId: yearId, feeStructureId: structure.id } },
        create: { studentId, academicYearId: yearId, feeStructureId: structure.id, optedOptionalItemIds } as Prisma.StudentFeeAssignmentUncheckedCreateInput,
        update: { optedOptionalItemIds },
      });
      await this.audit.record(tx, { action: 'fees.options', entityType: 'Student', entityId: studentId, after: { optedOptionalItemIds } });
    });
    return {
      structure: { id: structure.id, name: structure.name },
      optional: structure.items.filter((i) => i.isOptional).map((i) => ({ id: i.id, name: i.feeHead.name, amountPaise: i.amountPaise, opted: optedOptionalItemIds.includes(i.id) })),
    };
  }

  async getOptions(studentId: string) {
    await this.assertStudent(studentId);
    const structure = await this.structureFor(studentId);
    if (!structure) return { structure: null, optional: [] };
    const yearId = await this.yearId();
    const a = await this.prisma.db.studentFeeAssignment.findUnique({ where: { studentId_academicYearId_feeStructureId: { studentId, academicYearId: yearId, feeStructureId: structure.id } } });
    const opted = new Set(a?.optedOptionalItemIds ?? []);
    return {
      structure: { id: structure.id, name: structure.name },
      optional: structure.items.filter((i) => i.isOptional).map((i) => ({ id: i.id, name: i.feeHead.name, amountPaise: i.amountPaise, opted: opted.has(i.id) })),
    };
  }
}
