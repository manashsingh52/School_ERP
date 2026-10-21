import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { REPORTS, type DownloadLink, type ReportKey, type ReportParams, type ReportRunItem, type createReportRunSchema } from '@schoolos/contracts';
import { AccessService } from '../../core/auth/access.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PdfRenderer } from '../../core/pdf/pdf-renderer.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EXPORT_MIME, exportFileName, reportHtml, toCsv, toXlsx } from './report-export.js';
import { ReportsService } from './reports.service.js';

type In<T extends z.ZodType> = z.output<T>;
type Row = Prisma.ReportRunGetPayload<object>;
const MAX_ROWS = 50_000;

/**
 * Async exports (docs/12 Phase 6): request → ReportRun QUEUED → worker builds the file as the
 * person who asked (their permissions and scopes, checked again at run time) → DONE with a file.
 * History lists each member's own exports; files are fetched with short-lived signed links.
 */
@Injectable()
export class ReportRunsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly files: FilesService,
    private readonly pdf: PdfRenderer,
    private readonly queues: QueueService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.documents, 'report-export', async (data) => {
      await this.process(String(data.runId));
    });
  }

  private async toItems(rows: Row[]): Promise<ReportRunItem[]> {
    const ids = [...new Set(rows.map((r) => r.requestedByMemberId))];
    const members = await this.prisma.db.membership.findMany({ where: { id: { in: ids } }, select: { id: true, user: { select: { name: true } } } });
    return rows.map((r) => ({
      id: r.id,
      report: r.type as ReportKey,
      title: REPORTS.find((d) => d.key === r.type)?.title ?? r.type,
      params: r.params as ReportParams,
      format: r.format,
      status: r.status,
      error: r.error,
      requestedBy: members.find((m) => m.id === r.requestedByMemberId)?.user.name ?? null,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));
  }

  async create(input: In<typeof createReportRunSchema>): Promise<ReportRunItem> {
    this.reports.def(input.report); // 403 if they can't run it
    return this.queueFor({ memberId: RequestContextStore.tenant().membershipId, ...input });
  }

  /** Queue an export for a member (themselves, or a saved report's owner on its schedule). */
  async queueFor(input: { memberId: string; report: ReportKey; params: ReportParams; format: Row['format']; savedReport?: { id: string } }): Promise<ReportRunItem> {
    const run = await this.prisma.tenantTx(async (tx) => {
      const r = await tx.reportRun.create({
        data: { type: input.report, params: input.params, format: input.format, requestedByMemberId: input.memberId, savedReportId: input.savedReport?.id ?? null } as Prisma.ReportRunUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'report.export', entityType: 'ReportRun', entityId: r.id, metadata: { report: input.report, format: input.format, params: input.params, scheduled: !!input.savedReport } });
      return r;
    });
    await this.queues.add(QUEUES.documents, 'report-export', { schoolId: RequestContextStore.school().schoolId, runId: run.id }, { jobId: `report-${run.id}`, attempts: 2 });
    return (await this.toItems([run]))[0]!;
  }

  /** A scheduled export is done: tell its owner. */
  private async announce(run: Row): Promise<void> {
    if (!run.savedReportId) return;
    const saved = await this.prisma.db.savedReport.findFirst({ where: { id: run.savedReportId } });
    if (!saved) return;
    const p = run.params as ReportParams;
    const period = p.from && p.to ? `${p.from} to ${p.to}` : (p.month ?? 'latest');
    await this.notifications.notify({
      event: 'report.ready',
      recipients: [{ membershipId: run.requestedByMemberId, vars: { name: saved.name, schedule: saved.schedule === 'WEEKLY' ? 'weekly' : 'monthly', period }, data: { route: '/reports', runId: run.id } }],
      dedupeKey: () => `report-ready:${run.id}`,
    });
  }

  async list(): Promise<ReportRunItem[]> {
    const { membershipId } = RequestContextStore.tenant();
    const rows = await this.prisma.db.reportRun.findMany({ where: { requestedByMemberId: membershipId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return this.toItems(rows);
  }

  private async mine(id: string): Promise<Row> {
    const run = await this.prisma.db.reportRun.findFirst({ where: { id, requestedByMemberId: RequestContextStore.tenant().membershipId } });
    if (!run) throw AppError.notFound('export');
    return run;
  }

  async get(id: string): Promise<ReportRunItem> {
    return (await this.toItems([await this.mine(id)]))[0]!;
  }

  async download(id: string): Promise<DownloadLink> {
    const run = await this.mine(id);
    if (run.status !== 'DONE' || !run.fileId) throw new AppError('NOT_READY', 409, 'This export isn’t ready yet.');
    return this.files.attachedLink(run.fileId);
  }

  /** Worker: build the file as the requester. */
  async process(runId: string): Promise<void> {
    const run = await this.prisma.db.reportRun.findFirst({ where: { id: runId } });
    if (!run || run.status === 'DONE') return;
    const fail = async (error: string) => {
      await this.prisma.tenantTx((tx) => tx.reportRun.update({ where: { id: runId }, data: { status: 'FAILED', error, completedAt: new Date() } }));
    };
    const member = await this.access.membership(run.requestedByMemberId);
    if (!member?.active) return fail('The person who asked for this export no longer has access.');
    await this.prisma.tenantTx((tx) => tx.reportRun.update({ where: { id: runId }, data: { status: 'RUNNING', error: null } }));

    const base = RequestContextStore.get()!;
    await RequestContextStore.run({ ...base, userId: member.userId, membershipId: member.membershipId, permissions: member.permissions, actor: 'user' }, async () => {
      try {
        const table = await this.reports.run(run.type as ReportKey, run.params as ReportParams);
        if (table.rows.length > MAX_ROWS) return fail(`This report has ${table.rows.length.toLocaleString('en-IN')} rows — narrow the filters (the limit is ${MAX_ROWS.toLocaleString('en-IN')}).`);
        const school = await this.prisma.db.school.findFirstOrThrow({ select: { name: true, accentColor: true } });
        const who = (await this.prisma.db.membership.findFirst({ where: { id: member.membershipId }, select: { user: { select: { name: true } } } }))?.user.name ?? '';
        const data = run.format === 'CSV' ? toCsv(table) : run.format === 'XLSX' ? await toXlsx(table) : await this.pdf.render(reportHtml(table, { name: school.name, accent: school.accentColor }, who));
        const fileId = await this.files.storeGenerated({ purpose: 'report_export', fileName: exportFileName(table, run.format), mimeType: EXPORT_MIME[run.format], data, memberId: member.membershipId });
        await this.prisma.tenantTx((tx) => tx.reportRun.update({ where: { id: runId }, data: { status: 'DONE', fileId, completedAt: new Date() } }));
        await this.announce(run);
      } catch (err) {
        if (err instanceof AppError) return fail(err.message);
        this.logger.error({ err, runId }, 'report export failed');
        await fail('Something went wrong making this file. Try again; if it keeps failing, contact support.');
      }
    });
  }
}
