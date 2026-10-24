import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import { REPORTS, type ReportKey, type ReportParams, type ReportRunItem, type ReportSchedule, type SavedReportItem, type saveReportSchema, type updateSavedReportSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { SchedulerService } from '../../core/queue/scheduler.service.js';
import { todayIn } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ReportRunsService } from './report-runs.service.js';
import { ReportsService } from './reports.service.js';

type In<T extends z.ZodType> = z.output<T>;
type Row = Prisma.SavedReportGetPayload<object>;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(day(s).getTime() + n * 86_400_000));

/** Next slot after [today] (school-local), at 07:30 IST: Monday for weekly, the 1st for monthly. */
export function nextRunAt(schedule: ReportSchedule, today: string): Date | null {
  if (schedule === 'NONE') return null;
  let next: string;
  if (schedule === 'WEEKLY') {
    const weekday = day(today).getUTCDay(); // 0 = Sunday
    next = addDays(today, ((8 - weekday) % 7) || 7);
  } else {
    const d = day(today);
    next = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  }
  return new Date(`${next}T02:00:00.000Z`); // 07:30 in India
}

/** The period a scheduled run covers: the week (Mon–Sun) or calendar month before [today]. */
export function scheduledParams(schedule: Exclude<ReportSchedule, 'NONE'>, params: ReportParams, kinds: readonly string[], today: string): { params: ReportParams } {
  const out: ReportParams = { ...params };
  let from: string;
  let to: string;
  if (schedule === 'WEEKLY') {
    const weekday = day(today).getUTCDay() || 7; // Monday = 1
    to = addDays(today, -weekday);
    from = addDays(to, -6);
  } else {
    const d = day(today);
    from = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    to = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  }
  if (kinds.includes('range')) Object.assign(out, { from, to });
  if (kinds.includes('month')) out.month = to.slice(0, 7);
  return { params: out };
}

/** Reports someone saved with their filters; weekly and monthly ones run on their own. */
@Injectable()
export class SavedReportsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly runs: ReportRunsService,
    private readonly queues: QueueService,
    private readonly scheduler: SchedulerService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.documents, 'saved-reports-due', async () => {
      await this.runDue();
    });
    this.scheduler.register({ name: 'saved-reports', queue: QUEUES.documents, job: 'saved-reports-due', due: (c) => c.minute % 15 === 0, bucket: (c) => `${c.date}T${c.hhmm}` });
  }

  private toItem(r: Row): SavedReportItem {
    return {
      id: r.id,
      name: r.name,
      report: r.type as ReportKey,
      title: REPORTS.find((d) => d.key === r.type)?.title ?? r.type,
      params: r.params as ReportParams,
      format: r.format,
      schedule: r.schedule,
      nextRunAt: r.nextRunAt?.toISOString() ?? null,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async mine(id: string): Promise<Row> {
    const row = await this.prisma.db.savedReport.findFirst({ where: { id, memberId: RequestContextStore.tenant().membershipId } });
    if (!row) throw AppError.notFound('saved report');
    return row;
  }

  async list(): Promise<SavedReportItem[]> {
    const rows = await this.prisma.db.savedReport.findMany({ where: { memberId: RequestContextStore.tenant().membershipId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.toItem(r));
  }

  async create(input: In<typeof saveReportSchema>): Promise<SavedReportItem> {
    this.reports.def(input.report); // 403 if they can't run it
    const ctx = RequestContextStore.tenant();
    if ((await this.prisma.db.savedReport.count({ where: { memberId: ctx.membershipId } })) >= 50) throw new AppError('LIMIT', 422, 'You can keep up to 50 saved reports. Delete some first.');
    const row = await this.prisma.tenantTx(async (tx) => {
      const r = await tx.savedReport.create({
        data: { memberId: ctx.membershipId, name: input.name, type: input.report, params: input.params, format: input.format, schedule: input.schedule, nextRunAt: nextRunAt(input.schedule, todayIn()) } as Prisma.SavedReportUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'report.save', entityType: 'SavedReport', entityId: r.id, after: { name: r.name, report: r.type, schedule: r.schedule } });
      return r;
    });
    return this.toItem(row);
  }

  async update(id: string, input: In<typeof updateSavedReportSchema>): Promise<SavedReportItem> {
    const before = await this.mine(id);
    const schedule = input.schedule ?? before.schedule;
    const row = await this.prisma.db.savedReport.update({
      where: { id },
      data: { ...input, ...(input.schedule && input.schedule !== before.schedule ? { nextRunAt: nextRunAt(schedule, todayIn()) } : {}) },
    });
    return this.toItem(row);
  }

  async remove(id: string): Promise<void> {
    await this.mine(id);
    await this.prisma.db.savedReport.delete({ where: { id } });
  }

  /** "Run now": exactly the saved filters. */
  async runNow(id: string): Promise<ReportRunItem> {
    const saved = await this.mine(id);
    return this.runs.create({ report: saved.type as ReportKey, params: saved.params as ReportParams, format: saved.format });
  }

  /** Scheduler (per school, every 15 minutes): export what's due, as its owner. */
  async runDue(now = new Date()): Promise<number> {
    const due = await this.prisma.db.savedReport.findMany({ where: { schedule: { not: 'NONE' }, nextRunAt: { lte: now } } });
    const today = todayIn();
    for (const saved of due) {
      const def = REPORTS.find((d) => d.key === saved.type);
      // Move the schedule on first, so a failure can't make it run every 15 minutes.
      await this.prisma.db.savedReport.update({ where: { id: saved.id }, data: { nextRunAt: nextRunAt(saved.schedule, today), lastRunAt: now } });
      if (!def) continue;
      const { params } = scheduledParams(saved.schedule as 'WEEKLY' | 'MONTHLY', saved.params as ReportParams, def.params, today);
      await this.runs.queueFor({ memberId: saved.memberId, report: def.key, params, format: saved.format, savedReport: { id: saved.id } });
    }
    return due.length;
  }
}
