import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { auditQuerySchema, createReportRunSchema, reportPreviewQuerySchema, saveReportSchema, updateSavedReportSchema, uuidSchema, type AuditItem } from '@schoolos/contracts';
import { RequirePermission, SchoolMember } from '../../core/auth/decorators.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { toDate } from '../../core/util/dates.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { toAuditItem } from '../platform/platform.service.js';
import { ReportRunsService } from './report-runs.service.js';
import { ReportsService } from './reports.service.js';
import { SavedReportsService } from './saved-reports.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;
const PREVIEW_ROWS = 500;

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly runs: ReportRunsService,
    private readonly saved: SavedReportsService,
  ) {}

  @Get('saved')
  @RequirePermission('report.export')
  async savedList() {
    return { data: await this.saved.list() };
  }

  @Post('saved')
  @RequirePermission('report.export')
  async save(@Body(new ZodPipe(saveReportSchema)) body: Out<typeof saveReportSchema>) {
    return { data: await this.saved.create(body) };
  }

  @Patch('saved/:id')
  @RequirePermission('report.export')
  async updateSaved(@Param('id', id) savedId: string, @Body(new ZodPipe(updateSavedReportSchema)) body: Out<typeof updateSavedReportSchema>) {
    return { data: await this.saved.update(savedId, body) };
  }

  @Delete('saved/:id')
  @HttpCode(200)
  @RequirePermission('report.export')
  async deleteSaved(@Param('id', id) savedId: string) {
    await this.saved.remove(savedId);
    return { data: { ok: true } };
  }

  @Post('saved/:id/run')
  @RequirePermission('report.export')
  async runSaved(@Param('id', id) savedId: string) {
    return { data: await this.saved.runNow(savedId) };
  }

  /** Reports the caller may run (needs report.academic or report.finance — checked per report). */
  @Get('catalog')
  @SchoolMember()
  catalog() {
    return { data: this.reports.catalog() };
  }

  /** On-screen view: the first 500 rows (export for everything). */
  @Get('preview')
  @SchoolMember()
  async preview(@Query(new ZodPipe(reportPreviewQuerySchema)) q: Out<typeof reportPreviewQuerySchema>) {
    const { report, ...params } = q;
    const t = await this.reports.run(report, params);
    return { data: { ...t, rows: t.rows.slice(0, PREVIEW_ROWS), totalRows: t.rows.length } };
  }

  @Post('runs')
  @RequirePermission('report.export')
  async create(@Body(new ZodPipe(createReportRunSchema)) body: Out<typeof createReportRunSchema>) {
    return { data: await this.runs.create(body) };
  }

  @Get('runs')
  @RequirePermission('report.export')
  async list() {
    return { data: await this.runs.list() };
  }

  @Get('runs/:id')
  @RequirePermission('report.export')
  async get(@Param('id', id) runId: string) {
    return { data: await this.runs.get(runId) };
  }

  @Get('runs/:id/download')
  @RequirePermission('report.export')
  async download(@Param('id', id) runId: string) {
    return { data: await this.runs.download(runId) };
  }
}

/** The school's own audit trail (docs/09 §6): who changed what, when — including Bastaa support. */
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.view')
  async list(@Query(new ZodPipe(auditQuerySchema)) q: Out<typeof auditQuerySchema>): Promise<{ data: AuditItem[]; page: { nextCursor: string | null } }> {
    const rows = await this.prisma.db.auditLog.findMany({
      where: {
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.action ? { action: { startsWith: q.action } } : {}),
        ...(q.actorMembershipId ? { actorMembershipId: q.actorMembershipId } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lt: new Date(toDate(q.to)!.getTime() + 86_400_000) } : {}) } } : {}),
      },
      include: { school: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const userIds = [...new Set(page.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const users = await this.prisma.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    return { data: page.map((r) => toAuditItem(r, users)), page: { nextCursor: rows.length > q.limit ? page.at(-1)!.id : null } };
  }
}
