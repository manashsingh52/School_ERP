import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import type { ClientPlatform, TokenPair } from '@schoolos/contracts';
import { AccessService } from '../../core/auth/access.service.js';
import { TokenService } from '../../core/auth/token.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import type { Session } from '../../generated/prisma/client.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Session lifetimes (docs/09 §1). */
const LIFETIME: Record<ClientPlatform, { idleMs: number; absoluteMs: number }> = {
  WEB: { idleMs: 12 * HOUR, absoluteMs: 14 * DAY },
  ANDROID: { idleMs: 60 * DAY, absoluteMs: 180 * DAY },
  IOS: { idleMs: 60 * DAY, absoluteMs: 180 * DAY },
};

/** Two tabs refreshing at once look like token reuse; allow a short grace instead of logging out. */
const CONCURRENT_REFRESH_GRACE_MS = 10_000;

export interface DeviceInfo {
  platform: ClientPlatform;
  deviceName?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Sessions with rotating refresh tokens. Each refresh creates a new row in the same family and
 * marks the old one rotated. Presenting a rotated token again = theft signal → whole family revoked.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async create(userId: string, activeMembershipId: string | null, device: DeviceInfo) {
    const { token, hash } = this.tokens.newRefreshToken();
    const session = await this.platform.session.create({
      data: {
        userId,
        familyId: randomUUID(),
        refreshTokenHash: hash,
        activeMembershipId,
        platform: device.platform,
        deviceName: device.deviceName,
        ip: device.ip,
        userAgent: device.userAgent,
        expiresAt: new Date(Date.now() + LIFETIME[device.platform].absoluteMs),
      },
    });
    return { session, tokens: await this.issue(session, token) };
  }

  /** Access token for the session's active membership (school-scoped) or a user-only token. */
  async issue(session: Session, refreshToken: string): Promise<TokenPair> {
    const access = await this.accessTokenFor(session);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
    };
  }

  async accessTokenFor(session: Pick<Session, 'id' | 'userId' | 'activeMembershipId'>) {
    if (session.activeMembershipId) {
      const membership = await this.access.membership(session.activeMembershipId);
      if (membership?.active && membership.userId === session.userId) {
        return this.tokens.signAccess({
          sub: session.userId,
          sid: session.id,
          typ: 'school',
          sch: membership.schoolId,
          mid: membership.membershipId,
        });
      }
    }
    return this.tokens.signAccess({ sub: session.userId, sid: session.id, typ: 'user' });
  }

  async refresh(refreshToken: string, ip?: string): Promise<TokenPair> {
    const hash = TokenService.hashRefresh(refreshToken);
    const current = await this.platform.session.findUnique({ where: { refreshTokenHash: hash } });
    const now = Date.now();
    if (!current || current.revokedAt || current.expiresAt.getTime() <= now) throw AppError.unauthenticated();

    if (current.rotatedAt) {
      if (now - current.rotatedAt.getTime() < CONCURRENT_REFRESH_GRACE_MS) {
        throw AppError.unauthenticated('Session was just refreshed. Retry with the latest token.', 'TOKEN_ROTATED');
      }
      this.logger.warn({ familyId: current.familyId, userId: current.userId }, 'security: refresh token reuse');
      await this.revokeFamily(current.familyId, 'refresh_token_reuse');
      throw AppError.unauthenticated();
    }

    if (now - current.lastUsedAt.getTime() > LIFETIME[current.platform].idleMs) {
      await this.revokeFamily(current.familyId, 'idle_timeout');
      throw AppError.unauthenticated('You were signed out after a period of inactivity.', 'SESSION_IDLE');
    }

    const { token, hash: nextHash } = this.tokens.newRefreshToken();
    const next = await this.platform.$transaction(async (tx) => {
      // Conditional update makes concurrent refreshes race-safe: only one can rotate.
      const rotated = await tx.session.updateMany({
        where: { id: current.id, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: new Date(now) },
      });
      if (rotated.count !== 1) {
        throw AppError.unauthenticated('Session was just refreshed. Retry with the latest token.', 'TOKEN_ROTATED');
      }
      return tx.session.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          refreshTokenHash: nextHash,
          activeMembershipId: current.activeMembershipId,
          platform: current.platform,
          deviceName: current.deviceName,
          ip: ip ?? current.ip,
          userAgent: current.userAgent,
          expiresAt: current.expiresAt,
        },
      });
    });
    return this.issue(next, token);
  }

  async setActiveMembership(sessionId: string, membershipId: string | null): Promise<Session> {
    return this.platform.session.update({ where: { id: sessionId }, data: { activeMembershipId: membershipId } });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    const rows = await this.platform.session.findMany({ where: { familyId }, select: { id: true } });
    await this.platform.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    rows.forEach((r) => this.access.invalidateSession(r.id));
  }

  async revokeAllForUser(userId: string, reason: string, exceptFamilyId?: string): Promise<void> {
    const rows = await this.platform.session.findMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { NOT: { familyId: exceptFamilyId } } : {}) },
      select: { id: true },
    });
    await this.platform.session.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    rows.forEach((r) => this.access.invalidateSession(r.id));
  }

  /** Live sessions (one per device/login), newest first. */
  listForUser(userId: string) {
    return this.platform.session.findMany({
      where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }
}
