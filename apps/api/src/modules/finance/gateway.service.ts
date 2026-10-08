import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { GatewayAccountItem, GatewayConnected, GatewayStatus, gatewayAccountSchema } from '@schoolos/contracts';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { GatewayAuthError, GatewayClient, GatewayUnavailableError, hmacHex, type GatewayCreds } from '../../core/payments/gateway-client.js';
import { SecretBox } from '../../core/payments/secret-box.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { PaymentGatewayAccount } from '../../generated/prisma/client.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';

export const WEBHOOK_EVENTS = ['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid', 'refund.processed', 'refund.failed'];

/**
 * A school's own Razorpay account (docs/11 §2): keys are verified, the secret is encrypted at
 * rest and never returned; a webhook secret is generated and shown once. Parents can pay
 * online only through an account whose webhook has been verified and that the school activated.
 */
@Injectable()
export class GatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly secrets: SecretBox,
    private readonly client: GatewayClient,
    private readonly webhooks: WebhooksService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private toItem(a: PaymentGatewayAccount): GatewayAccountItem {
    return {
      mode: a.mode,
      keyId: a.keyId,
      isActive: a.isActive,
      verifiedAt: a.verifiedAt?.toISOString() ?? null,
      webhookUrl: `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/v1/webhooks/razorpay/${a.publicId}`,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async status(): Promise<GatewayStatus> {
    const accounts = await this.prisma.db.paymentGatewayAccount.findMany({ orderBy: { mode: 'asc' } });
    return { provider: 'RAZORPAY', driver: this.client.driver, accounts: accounts.map((a) => this.toItem(a)), activeMode: accounts.find((a) => a.isActive)?.mode ?? null };
  }

  async connect(input: z.output<typeof gatewayAccountSchema>): Promise<GatewayConnected> {
    if ((input.mode === 'LIVE') !== input.keyId.startsWith('rzp_live_')) {
      throw new AppError('VALIDATION_FAILED', 422, input.mode === 'LIVE' ? 'Live mode needs a live key (rzp_live_…).' : 'Test mode needs a test key (rzp_test_…).', [{ field: 'keyId', message: 'Wrong key for this mode' }]);
    }
    try {
      await this.client.verifyKeys({ keyId: input.keyId, keySecret: input.keySecret });
    } catch (err) {
      if (err instanceof GatewayAuthError) throw new AppError('GATEWAY_KEYS_INVALID', 422, 'Razorpay did not accept these keys. Check the Key ID and Key Secret.', [{ field: 'keySecret', message: 'Not accepted by Razorpay' }]);
      if (err instanceof GatewayUnavailableError) throw new AppError('GATEWAY_UNAVAILABLE', 503, "We couldn't reach Razorpay. Try again in a few minutes.");
      throw err;
    }
    const webhookSecret = randomBytes(24).toString('base64url');
    const existing = await this.prisma.db.paymentGatewayAccount.findFirst({ where: { provider: 'RAZORPAY', mode: input.mode } });
    const account = await this.prisma.tenantTx(async (tx) => {
      const data = {
        keyId: input.keyId,
        keySecretEnc: this.secrets.seal(input.keySecret),
        webhookSecretEnc: this.secrets.seal(webhookSecret),
        encKeyVersion: this.secrets.keyVersion,
        isActive: false,
        verifiedAt: null,
      };
      const a = existing
        ? await tx.paymentGatewayAccount.update({ where: { id: existing.id }, data })
        : await tx.paymentGatewayAccount.create({ data: { ...data, provider: 'RAZORPAY', mode: input.mode, publicId: randomBytes(12).toString('base64url') } as never });
      await this.audit.record(tx, { action: 'gateway.connect', entityType: 'PaymentGatewayAccount', entityId: a.id, metadata: { mode: input.mode, keyId: input.keyId } });
      return a;
    });
    return { account: this.toItem(account), webhookSecret, events: WEBHOOK_EVENTS };
  }

  /** Make this mode the one parents pay through. Needs a verified webhook first. */
  async activate(mode: 'TEST' | 'LIVE', active: boolean): Promise<GatewayStatus> {
    const account = await this.prisma.db.paymentGatewayAccount.findFirst({ where: { mode } });
    if (!account) throw AppError.notFound('gateway account');
    if (active && !account.verifiedAt) throw new AppError('WEBHOOK_NOT_VERIFIED', 422, 'We have not received a webhook from Razorpay yet. Add the webhook URL and secret in Razorpay, then make a test payment.');
    await this.prisma.tenantTx(async (tx) => {
      if (active) await tx.paymentGatewayAccount.updateMany({ where: { id: { not: account.id } }, data: { isActive: false } });
      await tx.paymentGatewayAccount.update({ where: { id: account.id }, data: { isActive: active } });
      await this.audit.record(tx, { action: active ? 'gateway.activate' : 'gateway.deactivate', entityType: 'PaymentGatewayAccount', entityId: account.id, metadata: { mode } });
    });
    return this.status();
  }

  /** Sandbox only: deliver a signed ping as Razorpay would, to verify the webhook path. */
  async sendTestWebhook(mode: 'TEST' | 'LIVE'): Promise<GatewayStatus> {
    if (this.client.driver !== 'mock') throw new AppError('NOT_AVAILABLE', 422, 'With real Razorpay, make a small test payment — its webhook verifies the setup.');
    const account = await this.prisma.db.paymentGatewayAccount.findFirst({ where: { mode } });
    if (!account) throw AppError.notFound('gateway account');
    await this.deliver(account, { entity: 'event', event: 'mock.ping', payload: {}, created_at: Math.floor(Date.now() / 1000) });
    return this.status();
  }

  /** Sign and deliver an event to our own webhook endpoint logic (sandbox). */
  async deliver(account: PaymentGatewayAccount, event: object): Promise<void> {
    const body = Buffer.from(JSON.stringify(event));
    const signature = hmacHex(this.secrets.open(account.webhookSecretEnc), body);
    await this.webhooks.receive(account.publicId, body, signature, `evt_mock${randomBytes(8).toString('hex')}`);
  }

  async active(): Promise<{ account: PaymentGatewayAccount; creds: GatewayCreds }> {
    const account = await this.prisma.db.paymentGatewayAccount.findFirst({ where: { isActive: true } });
    if (!account) throw new AppError('ONLINE_PAYMENTS_OFF', 409, 'Online payment is not available for this school yet. You can pay at the school office.');
    return { account, creds: this.credsOf(account) };
  }

  async byId(id: string): Promise<{ account: PaymentGatewayAccount; creds: GatewayCreds }> {
    const account = await this.prisma.db.paymentGatewayAccount.findUniqueOrThrow({ where: { id } });
    return { account, creds: this.credsOf(account) };
  }

  credsOf(account: PaymentGatewayAccount): GatewayCreds {
    return { keyId: account.keyId, keySecret: this.secrets.open(account.keySecretEnc) };
  }
}
