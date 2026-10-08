import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { hmacHex, safeEqualHex } from '../../core/payments/gateway-client.js';
import { SecretBox } from '../../core/payments/secret-box.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';

/**
 * Inbound Razorpay webhooks (docs/11 §3–4). The URL carries the account's opaque public id, which
 * tells us the school; the signature must verify with *that* school's webhook secret. Every event
 * is stored first (unique event id = dedupe), then processed tenant-scoped in the worker.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly secrets: SecretBox,
    private readonly queues: QueueService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async receive(publicId: string, rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined): Promise<{ status: 'queued' | 'duplicate' }> {
    const account = await this.platform.paymentGatewayAccount.findUnique({ where: { publicId } });
    if (!account) throw AppError.notFound('webhook');
    const secret = this.secrets.open(account.webhookSecretEnc);
    const valid = !!signature && safeEqualHex(hmacHex(secret, rawBody), signature);

    let payload: { event?: string } = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as { event?: string };
    } catch {
      /* stored as-is below; processing will ignore it */
    }
    const eventId = (eventIdHeader || `body_${createHash('sha256').update(rawBody).digest('hex').slice(0, 40)}`).slice(0, 100);

    let stored;
    try {
      stored = await this.platform.webhookEvent.create({
        data: { schoolId: account.schoolId, provider: 'RAZORPAY', eventId: valid ? eventId : `invalid_${Date.now()}_${eventId}`.slice(0, 120), eventType: String(payload.event ?? 'unknown').slice(0, 60), payload: payload as object, signatureValid: valid, status: valid ? 'RECEIVED' : 'FAILED', error: valid ? null : 'Invalid signature' },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return { status: 'duplicate' };
      throw err;
    }
    if (!valid) {
      this.logger.warn({ schoolId: account.schoolId, publicId, webhookEventId: stored.id }, 'webhook with invalid signature');
      throw new AppError('INVALID_SIGNATURE', 401, 'Invalid signature.');
    }
    if (!account.verifiedAt) await this.platform.paymentGatewayAccount.update({ where: { id: account.id }, data: { verifiedAt: new Date() } });
    await this.queues.add(QUEUES.finance, 'webhook.process', { schoolId: account.schoolId, webhookEventId: stored.id }, { jobId: `webhook-${stored.id}` });
    return { status: 'queued' };
  }
}
