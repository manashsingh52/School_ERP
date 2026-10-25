import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { CertificateItem, DownloadLink, PageResponse, issueCertificatesSchema, listCertificatesQuerySchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PdfRenderer } from '../../core/pdf/pdf-renderer.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { fromDate, fullName, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { nextNumber, yearKey } from '../finance/sequence.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { certificateHtml } from './certificate.template.js';

type In<T extends z.ZodType> = z.output<T>;

const include = { student: { select: { id: true, firstName: true, lastName: true } } } satisfies Prisma.CertificateInclude;
type Row = Prisma.CertificateGetPayload<{ include: typeof include }>;

const longDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const shortDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const NONE = '00000000-0000-0000-0000-000000000000';

/**
 * E-certificates: a teacher or the office issues a participation or achievement certificate to one
 * student or a whole team; parents are told and find it under the child's Achievements. The PDF
 * (school colours, logo, principal's signature) is drawn on first download and kept.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly settings: SchoolSettingsService,
    private readonly pdf: PdfRenderer,
    private readonly notifications: NotificationsService,
  ) {}

  /** ALL: every certificate · ASSIGNED: my sections' students, plus any I issued · OWN_CHILDREN: my children's. */
  private async visibleWhere(): Promise<Prisma.CertificateWhereInput> {
    const scope = RequestContextStore.tenant().permissions['certificate.view'];
    if (scope === 'ALL') return {};
    if (scope === 'ASSIGNED') {
      return { OR: [{ student: await this.scope.studentWhere('certificate.view') }, { issuedByMemberId: RequestContextStore.tenant().membershipId }] };
    }
    if (scope === 'OWN_CHILDREN') return { studentId: { in: await this.scope.childStudentIds() } };
    return { id: { in: [] } };
  }

  private canDelete(row: { issuedByMemberId: string }): boolean {
    const scope = RequestContextStore.tenant().permissions['certificate.issue'];
    return scope === 'ALL' || (scope === 'ASSIGNED' && row.issuedByMemberId === RequestContextStore.tenant().membershipId);
  }

  private toItem(r: Row): CertificateItem {
    return {
      id: r.id,
      serialNo: r.serialNo,
      kind: r.kind,
      eventName: r.eventName,
      eventDate: fromDate(r.eventDate)!,
      position: r.position,
      note: r.note,
      student: { id: r.student.id, name: fullName(r.student.firstName, r.student.lastName), classLabel: r.classLabel },
      issuedBy: r.issuedByName,
      createdAt: r.createdAt.toISOString(),
      canDelete: this.canDelete(r),
    };
  }

  private async visible(id: string): Promise<Row> {
    const row = await this.prisma.db.certificate.findFirst({ where: { AND: [{ id }, await this.visibleWhere()] }, include });
    if (!row) throw AppError.notFound('certificate');
    return row;
  }

  async list(query: In<typeof listCertificatesQuerySchema>): Promise<PageResponse<CertificateItem>> {
    const filters: Prisma.CertificateWhereInput[] = [await this.visibleWhere()];
    if (query.studentId) {
      const exists = (await this.prisma.db.student.count({ where: { id: query.studentId } })) > 0;
      if (!exists || !(await this.scope.canAccessStudent('certificate.view', query.studentId))) throw AppError.notFound('student');
      filters.push({ studentId: query.studentId });
    }
    if (query.kind) filters.push({ kind: query.kind });
    if (query.mine === 'true') filters.push({ issuedByMemberId: RequestContextStore.tenant().membershipId });
    if (query.q) {
      const words = query.q.split(/\s+/).filter(Boolean);
      filters.push({
        OR: [
          { eventName: { contains: query.q, mode: 'insensitive' } },
          { serialNo: { contains: query.q, mode: 'insensitive' } },
          { AND: words.map((w) => ({ OR: [{ student: { firstName: { contains: w, mode: 'insensitive' as const } } }, { student: { lastName: { contains: w, mode: 'insensitive' as const } } }] })) },
        ],
      });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.certificate.findMany({ where, include, orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.db.certificate.count({ where }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  async issue(input: In<typeof issueCertificatesSchema>): Promise<CertificateItem[]> {
    const ids = [...new Set(input.studentIds)];
    const yearId = await this.scope.currentAcademicYearId();
    const students = await this.prisma.db.student.findMany({
      where: { AND: [{ id: { in: ids } }, await this.scope.studentWhere('certificate.issue'), { archivedAt: null }] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        enrollments: { where: { academicYearId: yearId ?? NONE }, take: 1, select: { class: { select: { name: true } }, section: { select: { name: true } } } },
      },
    });
    if (students.length !== ids.length) throw AppError.invalidReference('studentIds', 'student');

    const { membershipId } = RequestContextStore.tenant();
    const me = await this.prisma.db.membership.findUnique({ where: { id: membershipId }, select: { user: { select: { name: true } } } });
    const year = yearId ? (await this.prisma.db.academicYear.findFirst({ where: { id: yearId }, select: { name: true } }))?.name : null;
    const key = year ? `CERTIFICATE:${yearKey(year)}` : 'CERTIFICATE';
    const prefix = year ? `CERT/${yearKey(year)}/` : 'CERT/';
    const byId = new Map(students.map((s) => [s.id, s]));

    const created = await this.prisma.tenantTx(async (tx) => {
      const out: Row[] = [];
      for (const id of ids) {
        const s = byId.get(id)!;
        const e = s.enrollments[0];
        const row = await tx.certificate.create({
          data: {
            studentId: s.id,
            serialNo: await nextNumber(tx, key, prefix, 4),
            kind: input.kind,
            eventName: input.eventName,
            eventDate: toDate(input.eventDate)!,
            position: input.kind === 'ACHIEVEMENT' ? input.position! : null,
            note: input.note || null,
            classLabel: e ? `${e.class.name} - ${e.section.name}` : null,
            issuedByMemberId: membershipId,
            issuedByName: me?.user.name ?? 'Teacher',
          } as Prisma.CertificateUncheckedCreateInput,
          include,
        });
        await this.audit.record(tx, {
          action: 'certificate.issue',
          entityType: 'Certificate',
          entityId: row.id,
          after: { serialNo: row.serialNo, studentId: s.id, kind: row.kind, eventName: row.eventName, eventDate: input.eventDate, position: row.position },
        });
        out.push(row);
      }
      return out;
    });
    await this.tellParents(created);
    return created.map((r) => this.toItem(r));
  }

  private async tellParents(rows: Row[]): Promise<void> {
    const parents = await this.notifications.guardiansOf(rows.map((r) => r.studentId));
    const recipients = parents.flatMap((p) =>
      rows
        .filter((r) => r.studentId === p.studentId)
        .map((r) => ({
          certificateId: r.id,
          membershipId: p.membershipId,
          vars: {
            student: fullName(r.student.firstName, r.student.lastName),
            what: r.kind === 'ACHIEVEMENT' ? `${r.position} in` : 'Took part in',
            event: r.eventName,
            date: shortDate(fromDate(r.eventDate)!),
          },
          data: { route: '/certificates', studentId: r.studentId, certificateId: r.id },
        })),
    );
    if (!recipients.length) return;
    await this.notifications.notify({
      event: 'certificate.issued',
      recipients: recipients.map(({ certificateId: _c, ...r }) => r),
      dedupeKey: (_m, i) => `certificate:${recipients[i]!.certificateId}`,
    });
  }

  /** The certificate PDF: drawn the first time anyone opens it, then served from storage. */
  async download(id: string): Promise<DownloadLink> {
    const row = await this.visible(id);
    if (row.fileId) {
      const link = await this.files.attachedLink(row.fileId).catch(() => null);
      if (link) return link;
    }
    const fileId = await this.render(row);
    const { count } = await this.prisma.db.certificate.updateMany({ where: { id, OR: [{ fileId: null }, { fileId: row.fileId }] }, data: { fileId } });
    const kept = count ? fileId : (await this.prisma.db.certificate.findUniqueOrThrow({ where: { id }, select: { fileId: true } })).fileId!;
    return this.files.attachedLink(kept);
  }

  private async render(row: Row): Promise<string> {
    const [school, general, branding] = await Promise.all([
      this.prisma.db.school.findUniqueOrThrow({
        where: { id: RequestContextStore.school().schoolId },
        select: { name: true, addressLine1: true, city: true, state: true, accentColor: true, logoFileId: true },
      }),
      this.settings.get('general'),
      this.settings.get('branding'),
    ]);
    const studentName = fullName(row.student.firstName, row.student.lastName);
    const html = certificateHtml({
      school: {
        name: school.name,
        address: [school.addressLine1, school.city, school.state].filter(Boolean).join(', ') || null,
        accent: school.accentColor,
        logoDataUri: await this.files.imageDataUri(school.logoFileId),
        affiliation: general.affiliation || null,
      },
      principal: { name: general.principalName || null, signatureDataUri: await this.files.imageDataUri(branding.signatureFileId) },
      kind: row.kind,
      serialNo: row.serialNo,
      studentName,
      classLabel: row.classLabel,
      eventName: row.eventName,
      eventDate: longDate(fromDate(row.eventDate)!),
      issuedOn: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(row.createdAt),
      position: row.position,
      note: row.note,
      issuedBy: row.issuedByName,
    });
    const title = row.kind === 'ACHIEVEMENT' ? 'Certificate of Achievement' : 'Certificate of Participation';
    return this.files.storeGenerated({
      purpose: 'certificate',
      fileName: `${title} - ${studentName} - ${row.eventName}.pdf`.replace(/[\\/:*?"<>|]/g, ''),
      mimeType: 'application/pdf',
      data: await this.pdf.render(html),
      memberId: RequestContextStore.tenant().membershipId,
    });
  }

  async remove(id: string): Promise<void> {
    const row = await this.visible(id);
    if (!this.canDelete(row)) throw AppError.forbidden('Only the teacher who issued this certificate, or the office, can withdraw it.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.certificate.delete({ where: { id } });
      await this.audit.record(tx, {
        action: 'certificate.delete',
        entityType: 'Certificate',
        entityId: id,
        before: { serialNo: row.serialNo, studentId: row.studentId, kind: row.kind, eventName: row.eventName, eventDate: fromDate(row.eventDate), position: row.position },
      });
    });
  }
}
