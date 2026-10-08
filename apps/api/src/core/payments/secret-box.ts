import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

/**
 * AES-256-GCM for secrets we must be able to read back (schools' gateway keys, docs/09 §3).
 * Format: v{keyVersion}:{iv}:{tag}:{ciphertext}, base64url parts. The key lives outside the DB.
 */
@Injectable()
export class SecretBox {
  readonly keyVersion = 1;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private key(): Buffer {
    if (!this.env.PAYMENT_SECRETS_KEY) throw new AppError('PAYMENTS_NOT_CONFIGURED', 503, 'Online payments are not set up on this server yet.');
    return Buffer.from(this.env.PAYMENT_SECRETS_KEY, 'base64');
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [`v${this.keyVersion}`, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
  }

  open(sealed: string): string {
    const [, iv, tag, ct] = sealed.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv!, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct!, 'base64url')), decipher.final()]).toString('utf8');
  }
}
