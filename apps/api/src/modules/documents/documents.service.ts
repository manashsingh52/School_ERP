import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  DocumentCategory,
  DocumentItem,
  DocumentOwnerType,
  DownloadLink,
  createDocumentSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';

type In<T extends z.ZodType> = z.output<T>;
const include = { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } satisfies Prisma.DocumentInclude;
type Row = Prisma.DocumentGetPayload<{ include: typeof include }>;

/**
 * Documents attached to students, guardians, teachers or the school (docs/12 Phase 6).
 *   document.view ALL          → everything
 *   document.view ASSIGNED     → my students' documents, my own staff documents, school documents
 *   document.view OWN_CHILDREN → only what the school chose to share: my children's, mine, the school's
 * Uploading, editing and deleting is document.manage (school-wide). Files are served by short-lived signed links.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  /** Throws 404 unless the owner exists in this school and the caller may see its documents. */
  private async assertOwner(ownerType: DocumentOwnerType, ownerId: string | undefined): Promise<{ ownerId: string; guardianOnly: boolean }> {
    const ctx = RequestContextStore.tenant();
    const scope = ctx.permissions['document.view'];
    if (!scope) throw AppError.forbidden();
    const parent = scope === 'OWN_CHILDREN';
    if (ownerType === 'SCHOOL') return { ownerId: ctx.schoolId, guardianOnly: parent };
    if (!ownerId) throw AppError.notFound('owner');
    const db = this.prisma.db;
    let found = false;
    switch (ownerType) {
      case 'STUDENT': {
        if (!(await db.student.count({ where: { id: ownerId } }))) break;
        found = scope === 'ALL' || (await this.scope.canAccessStudent('document.view', ownerId));
        break;
      }
      case 'TEACHER': {
        if (!(await db.teacher.count({ where: { id: ownerId } }))) break;
        found = scope === 'ALL' || (scope === 'ASSIGNED' && (await this.scope.myTeacherId()) === ownerId);
        break;
      }
      case 'GUARDIAN': {
        const g = await db.guardian.findFirst({ where: { id: ownerId }, select: { membershipId: true } });
        if (!g) break;
        found = scope === 'ALL' || (parent && g.membershipId === ctx.membershipId);
        break;
      }
    }
    if (!found) throw AppError.notFound(ownerType.toLowerCase());
    return { ownerId, guardianOnly: parent };
  }

  private toItem(r: Row, names: Map<string, string>): DocumentItem {
    return {
      id: r.id,
      ownerType: r.ownerType,
      ownerId: r.ownerId,
      category: r.category as DocumentCategory,
      title: r.title,
      visibleToGuardian: r.visibleToGuardian,
      file: { id: r.file.id, name: r.file.originalName, mimeType: r.file.mimeType, sizeBytes: Number(r.file.sizeBytes) },
      uploadedBy: r.uploadedByMemberId ? (names.get(r.uploadedByMemberId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async uploaderNames(rows: Row[]) {
    const ids = [...new Set(rows.map((r) => r.uploadedByMemberId).filter((x): x is string => !!x))];
    const members = await this.prisma.db.membership.findMany({ where: { id: { in: ids } }, select: { id: true, user: { select: { name: true } } } });
    return new Map(members.map((m) => [m.id, m.user.name]));
  }

  async list(q: In<typeof listDocumentsQuerySchema>): Promise<DocumentItem[]> {
    const { ownerId, guardianOnly } = await this.assertOwner(q.ownerType, q.ownerId);
    const rows = await this.prisma.db.document.findMany({
      where: { ownerType: q.ownerType, ownerId, deletedAt: null, ...(q.category ? { category: q.category } : {}), ...(guardianOnly ? { visibleToGuardian: true } : {}) },
      include,
      orderBy: { createdAt: 'desc' },
    });
    const names = await this.uploaderNames(rows);
    return rows.map((r) => this.toItem(r, names));
  }

  async create(input: In<typeof createDocumentSchema>): Promise<DocumentItem> {
    const ctx = RequestContextStore.tenant();
    const { ownerId } = await this.assertOwner(input.ownerType, input.ownerId);
    await this.files.assertAllReady([input.fileId], 'document', 'fileId');
    if (await this.prisma.db.document.count({ where: { fileId: input.fileId, deletedAt: null } })) throw AppError.invalidReference('fileId', 'file');
    const row = await this.prisma.tenantTx(async (tx) => {
      const doc = await tx.document.create({
        data: { ownerType: input.ownerType, ownerId, category: input.category, title: input.title, fileId: input.fileId, visibleToGuardian: input.visibleToGuardian, uploadedByMemberId: ctx.membershipId } as Prisma.DocumentUncheckedCreateInput,
        include,
      });
      await this.audit.record(tx, { action: 'document.create', entityType: 'Document', entityId: doc.id, after: { ownerType: doc.ownerType, ownerId, category: doc.category, title: doc.title, visibleToGuardian: doc.visibleToGuardian } });
      return doc;
    });
    return this.toItem(row, await this.uploaderNames([row]));
  }

  private async find(id: string): Promise<Row> {
    const doc = await this.prisma.db.document.findFirst({ where: { id, deletedAt: null }, include });
    if (!doc) throw AppError.notFound('document');
    const { guardianOnly } = await this.assertOwner(doc.ownerType, doc.ownerId).catch(() => {
      throw AppError.notFound('document');
    });
    if (guardianOnly && !doc.visibleToGuardian) throw AppError.notFound('document');
    return doc;
  }

  async update(id: string, input: In<typeof updateDocumentSchema>): Promise<DocumentItem> {
    const before = await this.find(id);
    const row = await this.prisma.tenantTx(async (tx) => {
      const doc = await tx.document.update({ where: { id }, data: input, include });
      await this.audit.record(tx, { action: 'document.update', entityType: 'Document', entityId: id, before: { title: before.title, category: before.category, visibleToGuardian: before.visibleToGuardian }, after: input });
      return doc;
    });
    return this.toItem(row, await this.uploaderNames([row]));
  }

  async remove(id: string): Promise<void> {
    const doc = await this.find(id);
    await this.prisma.tenantTx(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, { action: 'document.delete', entityType: 'Document', entityId: id, before: { title: doc.title, ownerType: doc.ownerType, ownerId: doc.ownerId } });
    });
  }

  async download(id: string): Promise<DownloadLink> {
    const doc = await this.find(id);
    return this.files.attachedLink(doc.fileId);
  }
}
