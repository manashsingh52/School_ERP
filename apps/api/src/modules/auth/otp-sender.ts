import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
import { LOGGER } from '../../core/logger/logger.js';

/**
 * How OTP codes reach the user: the console in development, MSG91 (DLT-registered SMS) in
 * production. With OTP_PROVIDER=none nothing is sent: AuthService refuses before it gets here.
 */
export abstract class OtpSender {
  abstract send(phone: string, code: string, purpose: string): Promise<void>;
}

export const maskPhone = (phone: string) => `${phone.slice(0, 3)}******${phone.slice(-4)}`;

@Injectable()
export class ConsoleOtpSender extends OtpSender {
  /** Last code per phone — read by automated tests only. */
  readonly sent = new Map<string, string>();

  constructor(@Inject(LOGGER) private readonly logger: Logger) {
    super();
  }

  async send(phone: string, code: string, purpose: string): Promise<void> {
    this.sent.set(phone, code);
    this.logger.info({ to: maskPhone(phone), purpose }, `[dev OTP] ${code} (not sent — console provider)`);
  }
}

/** MSG91's OTP API with our own code and the DLT-approved OTP template (docs/SETUP-LATER.md #4). */
export class Msg91OtpSender extends OtpSender {
  constructor(
    private readonly env: Env,
    private readonly logger: Logger,
  ) {
    super();
  }

  async send(phone: string, code: string, purpose: string): Promise<void> {
    const url = new URL('/api/v5/otp', this.env.MSG91_BASE_URL);
    url.search = new URLSearchParams({ template_id: this.env.MSG91_OTP_TEMPLATE_ID!, mobile: phone.replace(/^\+/, ''), otp: code, otp_expiry: '5' }).toString();
    const res = await fetch(url, { method: 'POST', headers: { authkey: this.env.MSG91_AUTH_KEY!, 'content-type': 'application/json' }, body: '{}' });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type !== 'success') {
      this.logger.error({ to: maskPhone(phone), purpose, status: res.status, reason: body.message }, 'msg91 otp failed');
      throw new Error(`MSG91 refused the code (${res.status})`);
    }
  }
}

export const otpSenderProvider = {
  provide: OtpSender,
  inject: [ENV, LOGGER, ConsoleOtpSender],
  useFactory: (env: Env, logger: Logger, consoleSender: ConsoleOtpSender): OtpSender =>
    env.OTP_PROVIDER === 'msg91' ? new Msg91OtpSender(env, logger) : consoleSender,
};
