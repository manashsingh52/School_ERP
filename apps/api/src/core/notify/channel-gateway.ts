import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
import { RequestContextStore } from '../context/request-context.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { LOGGER } from '../logger/logger.js';
import { PlatformPrismaService } from '../prisma/prisma.service.js';

export interface OutboundMessage {
  channel: 'PUSH' | 'SMS' | 'EMAIL';
  userId: string;
  phone: string | null;
  email: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface SendResult {
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  provider: string;
  providerMessageId?: string;
  reason?: string;
}

const mask = (s: string) => (s.includes('@') ? s.replace(/^(.).*(@.*)$/, '$1***$2') : `${s.slice(0, 3)}******${s.slice(-4)}`);

/**
 * The only code that talks to push/SMS/email providers. Feature modules never send directly —
 * they publish events and the notification engine routes them here (Master Prompt §39).
 *
 * Each works once its account exists (docs/SETUP-LATER.md): FCM push (Firebase), MSG91 SMS
 * (company + DLT registration), email via Resend.
 */
@Injectable()
export class ChannelGateway {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly platform: PlatformPrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const schoolId = RequestContextStore.get()?.schoolId;
    if (msg.channel === 'SMS' && schoolId && !(await this.entitlements.withinMonthly('sms', schoolId))) {
      return { status: 'SKIPPED', provider: this.env.SMS_PROVIDER, reason: "This month's SMS allowance is used up" };
    }
    const result = msg.channel === 'PUSH' ? await this.push(msg) : msg.channel === 'SMS' ? await this.sms(msg) : await this.email(msg);
    // Metered for plan limits (push is free).
    if (result.status === 'SENT' && schoolId && msg.channel !== 'PUSH') await this.entitlements.record(msg.channel === 'SMS' ? 'sms' : 'email', schoolId);
    return result;
  }

  private async push(msg: OutboundMessage): Promise<SendResult> {
    const provider = this.env.PUSH_PROVIDER;
    if (provider === 'none') return { status: 'SKIPPED', provider, reason: 'Push is not configured' };
    const tokens = await this.platform.deviceToken.count({ where: { userId: msg.userId } });
    if (!tokens) return { status: 'SKIPPED', provider, reason: 'No app installed' };
    if (provider === 'console') {
      this.logger.info({ channel: 'PUSH', userId: msg.userId, devices: tokens }, `[dev push] ${msg.title}`);
      return { status: 'SENT', provider };
    }
    return { status: 'SKIPPED', provider, reason: 'FCM not connected yet' };
  }

  private async sms(msg: OutboundMessage): Promise<SendResult> {
    const provider = this.env.SMS_PROVIDER;
    if (provider === 'none') return { status: 'SKIPPED', provider, reason: 'SMS is not configured' };
    if (!msg.phone) return { status: 'SKIPPED', provider, reason: 'No mobile number' };
    if (provider === 'console') {
      this.logger.info({ channel: 'SMS', to: mask(msg.phone) }, `[dev sms] ${msg.body}`);
      return { status: 'SENT', provider };
    }
    // DLT only delivers registered templates: one template whose single variable carries the text.
    const res = await fetch(new URL('/api/v5/flow', this.env.MSG91_BASE_URL), {
      method: 'POST',
      headers: { authkey: this.env.MSG91_AUTH_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({ template_id: this.env.MSG91_SMS_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: msg.phone.replace(/^\+/, ''), message: msg.body.slice(0, 300) }] }),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type !== 'success') throw new Error(`MSG91 responded ${res.status}: ${body.message ?? 'refused'}`); // retried by the queue
    return { status: 'SENT', provider, providerMessageId: typeof body.message === 'string' ? body.message : undefined };
  }

  private async email(msg: OutboundMessage): Promise<SendResult> {
    const provider = this.env.EMAIL_PROVIDER;
    if (provider === 'none') return { status: 'SKIPPED', provider, reason: 'Email is not configured' };
    if (!msg.email) return { status: 'SKIPPED', provider, reason: 'No email address' };
    if (provider === 'console') {
      this.logger.info({ channel: 'EMAIL', to: mask(msg.email) }, `[dev email] ${msg.title}`);
      return { status: 'SENT', provider };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.env.EMAIL_FROM, to: [msg.email], subject: msg.title, text: msg.body }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`); // retried by the queue
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { status: 'SENT', provider, providerMessageId: body.id };
  }
}
