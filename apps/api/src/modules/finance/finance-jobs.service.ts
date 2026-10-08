import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import { formatRupees } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { SchedulerService } from '../../core/queue/scheduler.service.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { fromDate, toDate, todayIn } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InvoicesService } from './invoices.service.js';

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const pretty = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Scheduled finance work per school (docs/11 §9): late fees (00:30), fee reminders (08:00) and
 * gateway reconciliation (every 10 minutes). All idempotent — safe to re-run for the same day.
 */
@Injectable()
export class FinanceJobsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queues: QueueService,
    private readonly scheduler: SchedulerService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly settings: SchoolSettingsService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.finance, 'late-fees', async () => {
      await this.lateFees();
    });
    this.queues.handle(QUEUES.finance, 'fee-reminders', async () => {
      await this.reminders();
    });
    this.scheduler.register({ name: 'late-fees', queue: QUEUES.finance, job: 'late-fees', due: (c) => c.hhmm === '00:30', bucket: (c) => c.date });
    this.scheduler.register({ name: 'fee-reminders', queue: QUEUES.finance, job: 'fee-reminders', due: (c) => c.hhmm === '08:00', bucket: (c) => c.date });
    this.scheduler.register({ name: 'reconcile', queue: QUEUES.finance, job: 'reconcile', due: (c) => c.minute % 10 === 0, bucket: (c) => `${c.date}T${c.hhmm}` });
  }

  /**
   * Late fees by rule: FLAT once; PERCENT once (of the invoice's fees after concessions);
   * PER_DAY grows daily up to the cap. Each run tops up to the amount due *today*, so re-running
   * the same day adds nothing.
   */
  async lateFees(today = todayIn()): Promise<{ invoices: number; addedPaise: number }> {
    const rules = await this.prisma.db.lateFeeRule.findMany({ where: { isActive: true } });
    if (!rules.length) return { invoices: 0, addedPaise: 0 };
    const schoolDefault = rules.find((r) => !r.feeStructureId);
    const open = await this.prisma.db.invoice.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, balancePaise: { gt: 0 }, dueDate: { lt: toDate(today) } },
      include: { installment: { select: { feeStructureId: true } }, lines: { where: { kind: 'LATE_FEE' }, select: { amountPaise: true } } },
    });
    let touched = 0;
    let added = 0;
    for (const inv of open) {
      const rule = rules.find((r) => r.feeStructureId && r.feeStructureId === inv.installment?.feeStructureId) ?? schoolDefault;
      if (!rule) continue;
      const late = daysBetween(fromDate(inv.dueDate)!, today) - rule.graceDays;
      if (late <= 0) continue;
      const base = inv.subtotalPaise - inv.concessionPaise;
      let target =
        rule.calc === 'FLAT' ? (rule.valuePaise ?? 0) : rule.calc === 'PER_DAY' ? late * (rule.valuePaise ?? 0) : Math.floor((base * (rule.valueBasisPoints ?? 0)) / 10_000);
      if (rule.maxPaise) target = Math.min(target, rule.maxPaise);
      const already = inv.lines.reduce((a, l) => a + l.amountPaise, 0);
      const add = target - already;
      if (add <= 0) continue;
      await this.prisma.tenantTx(async (tx) => {
        await tx.invoiceLine.create({
          data: { invoiceId: inv.id, kind: 'LATE_FEE', description: rule.calc === 'PER_DAY' ? `Late fee (${late} day${late === 1 ? '' : 's'})` : 'Late fee', amountPaise: add, reason: `Due ${fromDate(inv.dueDate)}` } as Prisma.InvoiceLineUncheckedCreateInput,
        });
        await this.invoices.recalc(tx, inv.id);
        await this.audit.record(tx, { action: 'invoice.late_fee', entityType: 'Invoice', entityId: inv.id, metadata: { number: inv.number, amountPaise: add, daysLate: late } });
      });
      touched++;
      added += add;
    }
    if (touched) this.logger.info({ invoices: touched, addedPaise: added }, 'late fees applied');
    return { invoices: touched, addedPaise: added };
  }

  /** Due-soon (default 7 and 1 days before) and repeating overdue reminders (default weekly, 4 times), once each — per Settings → Fees. */
  async reminders(today = todayIn()): Promise<{ dueSoon: number; overdue: number }> {
    const rules = await this.settings.get('fees');
    const every = rules.overdueReminderEveryDays;
    const soonDates = rules.reminderDaysBefore.map((d) => toDate(new Date(Date.parse(`${today}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10))!);
    const open = await this.prisma.db.invoice.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, balancePaise: { gt: 0 }, OR: [{ dueDate: { in: soonDates } }, { dueDate: { lt: toDate(today) } }] },
      include: { installment: { select: { name: true } }, student: { select: { firstName: true } } },
    });
    let dueSoon = 0;
    let overdue = 0;
    for (const inv of open) {
      const due = fromDate(inv.dueDate)!;
      const daysLeft = daysBetween(today, due);
      const late = -daysLeft;
      const repeat = late > 0 && late % every === 1 % every && Math.ceil(late / every) <= rules.maxOverdueReminders;
      if (daysLeft <= 0 && !repeat) continue;
      const guardians = await this.notifications.guardiansOf([inv.studentId]);
      const vars = { student: inv.student.firstName, installment: inv.installment?.name ?? 'school', amount: formatRupees(inv.balancePaise), due: pretty(due) };
      const sent = await this.notifications.notify({
        event: daysLeft > 0 ? 'fee.due' : 'fee.overdue',
        recipients: guardians.map((g) => ({ membershipId: g.membershipId, vars, data: { route: '/my/fees', invoiceId: inv.id } })),
        dedupeKey: () => (daysLeft > 0 ? `fee.due:${inv.id}:${daysLeft}` : `fee.overdue:${inv.id}:${Math.ceil(late / every)}`),
      });
      if (sent) {
        if (daysLeft > 0) dueSoon++;
        else overdue++;
      }
    }
    return { dueSoon, overdue };
  }
}
