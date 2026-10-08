import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
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
 * ⏸ Providers still to connect (docs/SETUP-LATER.md): FCM push (Phase 7, needs Firebase),
 * MSG91 SMS (needs company + DLT registration). Email via Resend works once a key is set.
 */
@Injectable()
export class ChannelGateway {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly platform: PlatformPrismaService,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    switch (msg.channel) {
      case 'PUSH':
        return this.push(msg);
      case 'SMS':
        return this.sms(msg);
      case 'EMAIL':
        return this.email(msg);
    }
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
    return { status: 'SKIPPED', provider, reason: 'MSG91 not connected yet (needs DLT registration)' };
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
