import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import { LOGGER } from '../logger/logger.js';
import { PlatformPrismaService } from '../prisma/prisma.service.js';
import { QUEUES, QueueService, type QueueName } from './queue.service.js';

export interface ClockParts {
  /** School-local (IST) date YYYY-MM-DD and time HH:MM. */
  date: string;
  hhmm: string;
  minute: number;
}

interface Task {
  name: string;
  queue: QueueName;
  job: string;
  due: (c: ClockParts) => boolean;
  /** Same bucket → same job id → runs once even with several workers or a retried tick. */
  bucket: (c: ClockParts) => string;
}

const ist = (at: Date): ClockParts => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, minute: Number(parts.minute) };
};

/**
 * Minimal scheduler on top of the queue (docs/11 §9): a "tick" job every minute (deduped by its
 * minute, so several workers don't double-tick), which fans out per-school jobs for whatever is
 * due. Every school job id includes its time bucket, so a job never runs twice for the same slot.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnApplicationShutdown {
  private readonly tasks: Task[] = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly queues: QueueService,
    private readonly platform: PlatformPrismaService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  register(task: Task): void {
    this.tasks.push(task);
  }

  onModuleInit(): void {
    this.queues.handle(QUEUES.maintenance, 'tick', async (data) => {
      await this.tick(new Date(String(data.at)));
    });
  }

  start(): void {
    const enqueue = () => {
      const now = new Date();
      now.setSeconds(0, 0);
      void this.queues.add(QUEUES.maintenance, 'tick', { at: now.toISOString() }, { jobId: `tick-${now.getTime()}`, attempts: 1 }).catch((err: unknown) => this.logger.error({ err }, 'tick enqueue failed'));
    };
    enqueue();
    this.timer = setInterval(enqueue, 60_000);
    this.logger.info({ tasks: this.tasks.map((t) => t.name) }, 'scheduler started');
  }

  /** Run one tick for a given moment (also used by tests). */
  async tick(at: Date): Promise<number> {
    const clock = ist(at);
    const due = this.tasks.filter((t) => t.due(clock));
    if (!due.length) return 0;
    const schools = await this.platform.school.findMany({ where: { status: { in: ['ACTIVE', 'ONBOARDING'] } }, select: { id: true } });
    let queued = 0;
    for (const task of due) {
      for (const s of schools) {
        await this.queues.add(task.queue, task.job, { schoolId: s.id }, { jobId: `${task.name}-${s.id}-${task.bucket(clock)}`.replace(/:/g, '') });
        queued++;
      }
    }
    return queued;
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export { ist };
