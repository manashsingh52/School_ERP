import { Injectable } from '@nestjs/common';
import { isPermission, mergeGrants, type PermissionSet } from '@schoolos/permissions';
import { TtlCache } from '../cache/ttl-cache.js';
import { PlatformPrismaService } from '../prisma/prisma.service.js';

export interface MembershipAccess {
  membershipId: string;
  userId: string;
  schoolId: string;
  active: boolean;
  permissions: PermissionSet;
}

export interface SessionState {
  userId: string;
  revoked: boolean;
  expiresAt: number;
}

const LIVE_SCHOOL_STATUSES = new Set(['ONBOARDING', 'ACTIVE']);

/**
 * Loads what the auth guard needs on every request, with short caches.
 * Uses the platform client because the tenant isn't known until the token is checked.
 */
@Injectable()
export class AccessService {
  private readonly sessions = new TtlCache<SessionState | null>(30_000);
  private readonly memberships = new TtlCache<MembershipAccess | null>(30_000);
  private readonly slugs = new TtlCache<string | null>(5 * 60_000);

  constructor(private readonly platform: PlatformPrismaService) {}

  session(sessionId: string): Promise<SessionState | null> {
    return this.sessions.getOrLoad(sessionId, async () => {
      const row = await this.platform.session.findUnique({
        where: { id: sessionId },
        select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { status: true } } },
      });
      if (!row) return null;
      return {
        userId: row.userId,
        revoked: row.revokedAt !== null || row.user.status === 'DISABLED',
        expiresAt: row.expiresAt.getTime(),
      };
    });
  }

  membership(membershipId: string): Promise<MembershipAccess | null> {
    return this.memberships.getOrLoad(membershipId, async () => {
      const row = await this.platform.membership.findUnique({
        where: { id: membershipId },
        select: {
          id: true,
          userId: true,
          schoolId: true,
          status: true,
          school: { select: { status: true } },
          roles: { select: { role: { select: { permissions: { select: { permission: true, scope: true } } } } } },
        },
      });
      if (!row) return null;
      const grants = row.roles.flatMap((r) =>
        r.role.permissions
          .filter((p) => isPermission(p.permission))
          .map((p) => ({ permission: p.permission as never, scope: p.scope })),
      );
      return {
        membershipId: row.id,
        userId: row.userId,
        schoolId: row.schoolId,
        active: row.status === 'ACTIVE' && LIVE_SCHOOL_STATUSES.has(row.school.status),
        permissions: mergeGrants(grants),
      };
    });
  }

  schoolIdForSlug(slug: string): Promise<string | null> {
    return this.slugs.getOrLoad(slug, async () => {
      const row = await this.platform.school.findUnique({ where: { slug }, select: { id: true } });
      return row?.id ?? null;
    });
  }

  /** Call after logout, role changes, membership changes. */
  invalidateSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  invalidateMembership(membershipId: string): void {
    this.memberships.delete(membershipId);
  }

  clearAll(): void {
    this.sessions.clear();
    this.memberships.clear();
    this.slugs.clear();
  }
}
