import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, createPostgresBackend, type Job, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
import { RequestContextStore } from '../context/request-context.js';
import { LOGGER } from '../logger/logger.js';

/** Queue names (docs/01 §5). Add a queue here before using it. */
export const QUEUES = {
  /** Domain events relayed from the outbox → event handlers. */
  events: 'events',
  /** Housekeeping: cleanup, reconciliation, scheduled jobs. */
  maintenance: 'maintenance',
  /** Excel/CSV import commits. */
  imports: 'imports',
  /** One job per notification delivery (push / SMS / email). */
  notifications: 'notifications',
  /** PDFs (report cards, receipts) — Chromium, so kept apart from quick jobs. */
  documents: 'documents',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Job payloads carry IDs only — never names, phones or marks (docs/01 §5).
 * `schoolId` makes the handler run tenant-scoped, exactly like an HTTP request.
 */
export interface JobData {
  schoolId?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export type JobHandler = (data: JobData, job: Job<JobData>) => Promise<void>;

/**
 * BullMQ wrapper. V1 runs on PostgreSQL (BullMQ 6 Postgres backend, schema "bullmq") so we
 * need no Redis; set QUEUE_BACKEND=redis + REDIS_URL to switch later without code changes.
 */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue<JobData>>();
  private readonly handlers = new Map<QueueName, Map<string, JobHandler>>();
  private readonly workers: Worker<JobData>[] = [];
  private redis?: Redis;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Register a handler for jobs named `name` on `queue`. Call from a module's onModuleInit. */
  handle(queue: QueueName, name: string, handler: JobHandler): void {
    const map = this.handlers.get(queue) ?? new Map<string, JobHandler>();
    if (map.has(name)) throw new Error(`Duplicate job handler ${queue}/${name}`);
    map.set(name, handler);
    this.handlers.set(queue, map);
  }

  async add(queue: QueueName, name: string, data: JobData, opts: JobsOptions = {}): Promise<void> {
    await this.queue(queue).add(name, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 14 * 24 * 3600 },
      ...opts,
    });
  }

  /** Start processing every queue that has handlers (worker process, or API in lean mode). */
  async startWorkers(): Promise<void> {
    for (const [queue, handlers] of this.handlers) {
      const worker = this.createWorker(queue, async (job) => {
        const handler = handlers.get(job.name);
        if (!handler) throw new Error(`No handler for ${queue}/${job.name}`);
        const requestId = `job_${queue}_${job.id}`;
        const run = () => handler(job.data, job);
        await (job.data.schoolId ? RequestContextStore.runAsSystem(job.data.schoolId, requestId, run) : run());
      });
      worker.on('failed', (job, err) =>
        this.logger.error({ queue, job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err }, 'job failed'),
      );
      worker.on('error', (err) => this.logger.error({ queue, err }, 'worker error'));
      this.workers.push(worker);
    }
    this.logger.info({ queues: [...this.handlers.keys()], backend: this.env.QUEUE_BACKEND }, 'job workers started');
  }

  async counts(queue: QueueName) {
    return this.queue(queue).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  }

  private queue(name: QueueName): Queue<JobData> {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = this.env.QUEUE_BACKEND === 'postgres'
        ? (new Queue<JobData>(name, { connection: this.pgConnection() }, createPostgresBackend as never) as Queue<JobData>)
        : new Queue<JobData>(name, { connection: this.redisConnection() });
      queue.on('error', (err) => this.logger.error({ queue: name, err }, 'queue error'));
      this.queues.set(name, queue);
    }
    return queue;
  }

  private createWorker(name: QueueName, processor: (job: Job<JobData>) => Promise<void>): Worker<JobData> {
    return this.env.QUEUE_BACKEND === 'postgres'
      ? (new Worker<JobData>(name, processor, { connection: this.pgConnection(), concurrency: 5 }, createPostgresBackend as never) as Worker<JobData>)
      : new Worker<JobData>(name, processor, { connection: this.redisConnection(), concurrency: 5 });
  }

  private pgConnection() {
    return { connectionString: this.env.QUEUE_DATABASE_URL ?? this.env.PLATFORM_DATABASE_URL, max: 3 } as never;
  }

  private redisConnection(): Redis {
    this.redis ??= new Redis(this.env.REDIS_URL!, { maxRetriesPerRequest: null });
    return this.redis;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    this.redis?.disconnect();
  }
}
