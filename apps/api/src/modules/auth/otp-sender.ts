import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { LOGGER } from '../../core/logger/logger.js';

/**
 * How OTP codes reach the user. V1 has only the console sender: the company isn't registered
 * yet, so DLT-compliant SMS (MSG91) is blocked. Adding MSG91 = one new class implementing this.
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
