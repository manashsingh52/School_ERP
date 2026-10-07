import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
import { LOGGER } from '../logger/logger.js';
import { PlatformPrismaService, type TenantTx } from '../prisma/prisma.service.js';
import { QUEUES, QueueService, type JobData } from '../queue/queue.service.js';

/** IDs and flags only — handlers load what they need (docs/01 §5). */
export type EventPayload = Record<string, string | number | boolean | null>;
export type EventHandler = (event: { id: string; type: string; schoolId: string | null; payload: EventPayload }) => Promise<void>;

const RELAY_INTERVAL_MS = 2_000;
const BATCH = 100;

/**
 * Transactional outbox (docs/01 §5): publish() writes the event in the SAME transaction as the
 * business change, so an event can never be lost or sent for a change that rolled back.
 * The relay moves pending events onto the "events" queue; handlers run in the worker.
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly handlers = new Map<string, EventHandler[]>();
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;

  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly queues: QueueService,
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Call inside prisma.tenantTx(). */
  async publish(tx: TenantTx, type: string, payload: EventPayload): Promise<void> {
    await tx.outboxEvent.create({ data: { type, payload } });
  }

  /** Subscribe to an event type. Handlers must be idempotent (an event may be delivered twice). */
  on(type: string, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  /** After a transaction commits: relay now instead of waiting for the next tick. */
  flush(): void {
    if (this.env.RUN_WORKERS) void this.relay();
  }

  onModuleInit(): void {
    this.queues.handle(QUEUES.events, 'event', async (data: JobData) => {
      const handlers = this.handlers.get(String(data.type)) ?? [];
      const payload = JSON.parse(String(data.payload ?? '{}')) as EventPayload;
      for (const handler of handlers) {
        await handler({ id: String(data.eventId), type: String(data.type), schoolId: data.schoolId ?? null, payload });
      }
    });
  }

  onApplicationBootstrap(): void {
    if (!this.env.RUN_WORKERS) return;
    this.timer = setInterval(() => void this.relay(), RELAY_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Move pending events to the queue. Safe to run on several instances (SKIP LOCKED). */
  async relay(): Promise<number> {
    if (this.running) {
      this.again = true;
      return 0;
    }
    this.running = true;
    let moved = 0;
    try {
      do {
        this.again = false;
        moved += await this.relayBatch();
      } while (this.again);
    } catch (err) {
      this.logger.error({ err }, 'outbox relay failed');
    } finally {
      this.running = false;
    }
    return moved;
  }

  private async relayBatch(): Promise<number> {
    return this.platform.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; school_id: string | null; type: string; payload: unknown; attempts: number }[]>`
        SELECT id, school_id, type, payload, attempts FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY created_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;
      for (const row of rows) {
        try {
          await this.queues.add(
            QUEUES.events,
            'event',
            { schoolId: row.school_id ?? undefined, eventId: row.id, type: row.type, payload: JSON.stringify(row.payload) },
            { jobId: row.id }, // de-duplicates if the relay ever re-sends
          );
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { status: 'DISPATCHED', dispatchedAt: new Date(), attempts: { increment: 1 } },
          });
        } catch (err) {
          const attempts = row.attempts + 1;
          this.logger.warn({ err, eventId: row.id, attempts }, 'outbox enqueue failed, will retry');
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts,
              status: attempts >= 10 ? 'FAILED' : 'PENDING',
              availableAt: new Date(Date.now() + Math.min(300_000, 2 ** attempts * 1000)),
            },
          });
        }
      }
      return rows.length;
    });
  }
}
