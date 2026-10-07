import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import type {
  AuthResponse,
  Identifier,
  MembershipSummary,
  OtpSendResponse,
  TokenPair,
} from '@schoolos/contracts';
import { ENV, type Env } from '../../config/env.js';
import { AccessService } from '../../core/auth/access.service.js';
import { PasswordService } from '../../core/auth/password.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import { OtpSender, maskPhone } from './otp-sender.js';
import { SessionService, type DeviceInfo } from './session.service.js';

const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_SECONDS = 30;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_PER_DAY = 10;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60_000;

const INVALID_LOGIN = () => new AppError('INVALID_CREDENTIALS', 401, 'Incorrect phone/email or password.');
const INVALID_CODE = () => new AppError('INVALID_CODE', 401, 'That code is incorrect or has expired.');

type OtpPurpose = 'LOGIN' | 'RESET_PASSWORD' | 'ACTIVATE_ACCOUNT';

@Injectable()
export class AuthService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly access: AccessService,
    private readonly otpSender: OtpSender,
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  // ---------------------------------------------------------------- password login

  async loginWithPassword(
    identifier: Identifier,
    password: string,
    schoolSlug: string | undefined,
    device: DeviceInfo,
  ): Promise<AuthResponse> {
    const user = await this.platform.user.findUnique({
      where: identifier.kind === 'email' ? { email: identifier.value } : { phone: identifier.value },
    });

    const locked = user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
    const valid = await this.passwords.verify(locked ? null : user?.passwordHash, password);
    if (!user || !valid || locked || user.status === 'DISABLED') {
      if (user && !locked) await this.recordFailedLogin(user);
      throw INVALID_LOGIN();
    }

    await this.platform.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), status: 'ACTIVE' },
    });
    return this.startSession(user, schoolSlug, device);
  }

  private async recordFailedLogin(user: User): Promise<void> {
    const failed = user.failedLogins + 1;
    await this.platform.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : undefined,
      },
    });
    if (failed >= MAX_FAILED_LOGINS) this.logger.warn({ userId: user.id }, 'security: account locked after failures');
  }

  // ---------------------------------------------------------------- OTP

  async sendOtp(phone: string, purpose: OtpPurpose, ip?: string): Promise<OtpSendResponse> {
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const user = await this.platform.user.findUnique({ where: { phone }, select: { id: true, status: true } });

    // SMS-pumping defence: only known, enabled users get a code. Unknown numbers get an
    // identical-looking response and nothing is sent (docs/09 §1).
    if (!user || user.status === 'DISABLED') {
      return { challengeId: randomUUID(), expiresAt: expiresAt.toISOString(), resendAfter: OTP_RESEND_SECONDS };
    }

    const now = Date.now();
    const recent = await this.platform.otpChallenge.findMany({
      where: { target: phone, createdAt: { gt: new Date(now - 24 * 3_600_000) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const last = recent[0]?.createdAt.getTime();
    if (last && now - last < OTP_RESEND_SECONDS * 1000) {
      throw new AppError('OTP_TOO_SOON', 429, 'Please wait a few seconds before requesting another code.');
    }
    const lastHour = recent.filter((r) => now - r.createdAt.getTime() < 3_600_000).length;
    if (lastHour >= OTP_MAX_PER_HOUR || recent.length >= OTP_MAX_PER_DAY) {
      throw new AppError('OTP_LIMIT', 429, 'Too many codes requested. Please try again later.');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const id = randomUUID();
    await this.platform.otpChallenge.create({
      data: {
        id,
        target: phone,
        channel: 'SMS',
        purpose,
        codeHash: this.hashCode(id, code),
        expiresAt,
        ip,
      },
    });
    await this.otpSender.send(phone, code, purpose);
    this.logger.info({ to: maskPhone(phone), purpose }, 'otp sent');
    return { challengeId: id, expiresAt: expiresAt.toISOString(), resendAfter: OTP_RESEND_SECONDS };
  }

  /** Checks and consumes a code. Returns the phone it was sent to. */
  private async consumeOtp(challengeId: string, code: string, purposes: OtpPurpose[]): Promise<string> {
    const challenge = await this.platform.otpChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || !purposes.includes(challenge.purpose as OtpPurpose)) throw INVALID_CODE();

    // Count the attempt first (atomic), so brute force is capped even under concurrency.
    const counted = await this.platform.otpChallenge.updateMany({
      where: {
        id: challengeId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: challenge.maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count !== 1) throw INVALID_CODE();

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hashCode(challengeId, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw INVALID_CODE();

    const consumed = await this.platform.otpChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw INVALID_CODE();
    return challenge.target;
  }

  async loginWithOtp(
    challengeId: string,
    code: string,
    schoolSlug: string | undefined,
    device: DeviceInfo,
  ): Promise<AuthResponse> {
    const phone = await this.consumeOtp(challengeId, code, ['LOGIN', 'ACTIVATE_ACCOUNT']);
    const user = await this.platform.user.findUnique({ where: { phone } });
    if (!user || user.status === 'DISABLED') throw INVALID_CODE();

    // Proving the phone activates the account and any pending school invitations.
    const now = new Date();
    const [activeUser] = await this.platform.$transaction([
      this.platform.user.update({
        where: { id: user.id },
        data: {
          status: 'ACTIVE',
          phoneVerifiedAt: user.phoneVerifiedAt ?? now,
          lastLoginAt: now,
          failedLogins: 0,
          lockedUntil: null,
        },
      }),
      this.platform.membership.updateMany({
        where: { userId: user.id, status: 'INVITED' },
        data: { status: 'ACTIVE', joinedAt: now },
      }),
    ]);
    return this.startSession(activeUser, schoolSlug, device);
  }

  async resetPassword(challengeId: string, code: string, newPassword: string): Promise<void> {
    if (this.passwords.isTooCommon(newPassword)) {
      throw new AppError('WEAK_PASSWORD', 422, 'This password is too common. Choose another.', [
        { field: 'newPassword', message: 'Too common' },
      ]);
    }
    const phone = await this.consumeOtp(challengeId, code, ['RESET_PASSWORD']);
    const user = await this.platform.user.findUnique({ where: { phone } });
    if (!user || user.status === 'DISABLED') throw INVALID_CODE();
    await this.platform.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.passwords.hash(newPassword),
        failedLogins: 0,
        lockedUntil: null,
        status: 'ACTIVE',
        phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
      },
    });
    await this.sessions.revokeAllForUser(user.id, 'password_reset');
  }

  async changePassword(userId: string, currentFamilyId: string, current: string, next: string): Promise<void> {
    const user = await this.platform.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new AppError('INVALID_CREDENTIALS', 422, 'Your current password is incorrect.', [
        { field: 'currentPassword', message: 'Incorrect password' },
      ]);
    }
    if (this.passwords.isTooCommon(next)) {
      throw new AppError('WEAK_PASSWORD', 422, 'This password is too common. Choose another.', [
        { field: 'newPassword', message: 'Too common' },
      ]);
    }
    await this.platform.user.update({ where: { id: userId }, data: { passwordHash: await this.passwords.hash(next) } });
    await this.sessions.revokeAllForUser(userId, 'password_changed', currentFamilyId);
  }

  // ---------------------------------------------------------------- sessions & schools

  /** Active memberships in live schools — what the school picker shows. */
  async memberships(userId: string): Promise<MembershipSummary[]> {
    const rows = await this.platform.membership.findMany({
      where: { userId, status: 'ACTIVE', school: { status: { in: ['ONBOARDING', 'ACTIVE'] } } },
      select: {
        id: true,
        school: { select: { id: true, slug: true, name: true, accentColor: true } },
        roles: { select: { role: { select: { key: true, name: true } } } },
      },
      orderBy: { school: { name: 'asc' } },
    });
    return rows.map((m) => ({
      membershipId: m.id,
      school: { ...m.school, logoUrl: null },
      roles: m.roles.map((r) => r.role),
    }));
  }

  private async startSession(user: User, schoolSlug: string | undefined, device: DeviceInfo): Promise<AuthResponse> {
    const memberships = await this.memberships(user.id);
    let active: MembershipSummary | undefined;
    if (schoolSlug) {
      active = memberships.find((m) => m.school.slug === schoolSlug);
      if (!active) throw new AppError('NO_SCHOOL_ACCESS', 403, "Your account doesn't have access to this school.");
    } else if (memberships.length === 1) {
      active = memberships[0];
    }

    const isPlatformAdmin = !!(await this.platform.platformAdmin.findUnique({ where: { userId: user.id } }));
    const { tokens } = await this.sessions.create(user.id, active?.membershipId ?? null, device);
    return {
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email },
      memberships,
      activeMembershipId: active?.membershipId ?? null,
      isPlatformAdmin,
      tokens,
    };
  }

  async selectSchool(userId: string, sessionId: string, membershipId: string) {
    const membership = await this.access.membership(membershipId);
    if (!membership || membership.userId !== userId || !membership.active) {
      throw new AppError('NO_SCHOOL_ACCESS', 403, "Your account doesn't have access to this school.");
    }
    const session = await this.sessions.setActiveMembership(sessionId, membershipId);
    const access = await this.sessions.accessTokenFor(session);
    return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString() };
  }

  refresh(refreshToken: string, ip?: string): Promise<TokenPair> {
    return this.sessions.refresh(refreshToken, ip);
  }

  async logout(sessionId: string): Promise<void> {
    const session = await this.platform.session.findUnique({ where: { id: sessionId }, select: { familyId: true } });
    if (session) await this.sessions.revokeFamily(session.familyId, 'logout');
  }

  private hashCode(challengeId: string, code: string): string {
    return createHmac('sha256', this.env.OTP_PEPPER).update(`${challengeId}:${code}`).digest('hex');
  }
}
