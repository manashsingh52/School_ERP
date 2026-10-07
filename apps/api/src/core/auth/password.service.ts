import { Injectable } from '@nestjs/common';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** argon2id with the OWASP baseline parameters (docs/09 §1). */
const ARGON2ID = 2 as Algorithm; // const enum value; inlined because of isolatedModules
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'iloveyou',
  'admin123',
  'welcome123',
  'india123',
  'school123',
  'abcd1234',
]);

@Injectable()
export class PasswordService {
  /** Used when the user doesn't exist, so response time doesn't reveal whether an account exists. */
  private readonly dummyHash = hash('dummy-password-for-timing', OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string | null | undefined, password: string): Promise<boolean> {
    if (!passwordHash) {
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    return verify(passwordHash, password).catch(() => false);
  }

  isTooCommon(password: string): boolean {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  }
}
