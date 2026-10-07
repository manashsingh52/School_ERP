import { Injectable } from '@nestjs/common';
import type { LoginStatus } from '@schoolos/contracts';
import { AccessService } from '../../core/auth/access.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import type { MembershipStatus } from '../../generated/prisma/client.js';

export interface InviteInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Role ids of the CURRENT school. */
  roleIds?: string[];
  /** Or a system role key (copied into every school at creation). */
  roleKey?: string;
}

/**
 * The one place that creates logins (global users) and school memberships (docs/02 D1).
 * Users are global, so this needs the platform client; feature modules call this service
 * instead of touching users directly. Everything is scoped to the CURRENT school.
 *
 * Invitations start INVITED; the person activates them by signing in (one-time code or
 * password). Nobody gets access to another school's data by being invited.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly access: AccessService,
  ) {}

  /** Find (by phone, then email) or create the user, then ensure a membership with the roles. */
  async invite(input: InviteInput): Promise<{ membershipId: string; userId: string; status: MembershipStatus }> {
    const { schoolId } = RequestContextStore.school();
    if (!input.phone && !input.email) throw new AppError('VALIDATION_FAILED', 422, 'Enter a phone number or email.');

    const roleIds = await this.resolveRoles(schoolId, input);
    return this.platform.$transaction(async (tx) => {
      let user =
        (input.phone ? await tx.user.findUnique({ where: { phone: input.phone } }) : null) ??
        (input.email ? await tx.user.findUnique({ where: { email: input.email } }) : null);
      if (user?.status === 'DISABLED') throw new AppError('USER_DISABLED', 422, 'This person’s account is disabled. Contact support.');
      user ??= await tx.user.create({
        data: { name: input.name, phone: input.phone ?? undefined, email: input.email ?? undefined, status: 'INVITED' },
      });

      const membership = await tx.membership.upsert({
        where: { schoolId_userId: { schoolId, userId: user.id } },
        create: { schoolId, userId: user.id, status: 'INVITED', invitedAt: new Date() },
        update: {},
      });
      if (membership.status === 'REMOVED') {
        await tx.membership.update({ where: { id: membership.id }, data: { status: 'INVITED', invitedAt: new Date() } });
      }
      await tx.membershipRole.createMany({
        data: roleIds.map((roleId) => ({ membershipId: membership.id, roleId, schoolId })),
        skipDuplicates: true,
      });
      this.access.invalidateMembership(membership.id);
      return { membershipId: membership.id, userId: user.id, status: membership.status === 'REMOVED' ? 'INVITED' : membership.status };
    });
  }

  /** Replace a membership's roles (role ids of the current school). */
  async setRoles(membershipId: string, roleIds: string[]): Promise<void> {
    const { schoolId } = RequestContextStore.school();
    const ids = await this.resolveRoles(schoolId, { name: '', roleIds });
    await this.platform.$transaction([
      this.platform.membershipRole.deleteMany({ where: { membershipId, schoolId } }),
      this.platform.membershipRole.createMany({ data: ids.map((roleId) => ({ membershipId, roleId, schoolId })) }),
    ]);
    this.access.invalidateMembership(membershipId);
  }

  async setStatus(membershipId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
    const { schoolId } = RequestContextStore.school();
    const m = await this.platform.membership.findFirst({ where: { id: membershipId, schoolId } });
    if (!m) throw AppError.notFound('member');
    // Re-activating an invitation keeps it INVITED until the person signs in.
    const next = status === 'ACTIVE' && !m.joinedAt ? 'INVITED' : status;
    await this.platform.membership.update({ where: { id: membershipId }, data: { status: next } });
    this.access.invalidateMembership(membershipId);
  }

  /** Login state for a set of memberships (for list screens). */
  async loginStatus(membershipIds: (string | null)[]): Promise<Map<string, LoginStatus>> {
    const ids = membershipIds.filter((id): id is string => !!id);
    const rows = ids.length
      ? await this.platform.membership.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } })
      : [];
    return new Map(rows.map((r) => [r.id, r.status === 'REMOVED' ? 'NONE' : r.status]));
  }

  private async resolveRoles(schoolId: string, input: InviteInput): Promise<string[]> {
    const roles = await this.platform.role.findMany({
      where: { schoolId, ...(input.roleKey ? { key: input.roleKey } : { id: { in: input.roleIds ?? [] } }) },
      select: { id: true },
    });
    const expected = input.roleKey ? 1 : new Set(input.roleIds ?? []).size;
    if (roles.length !== expected || expected === 0) throw AppError.invalidReference('roleIds', 'role');
    return roles.map((r) => r.id);
  }
}
