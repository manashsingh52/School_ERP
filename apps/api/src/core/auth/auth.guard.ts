import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Logger } from 'pino';
import { PLATFORM_ROLE_PERMISSIONS } from '@schoolos/permissions';
import { RequestContextStore } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { LOGGER } from '../logger/logger.js';
import { AccessService } from './access.service.js';
import { ACCESS_RULE, type AccessRule } from './decorators.js';
import { TokenService } from './token.service.js';

export const SCHOOL_SLUG_HEADER = 'x-school-slug';

/**
 * Global guard — layer 1 of tenant isolation (docs/03 §1):
 *  1. verify the access token and that its session is still live
 *  2. the school comes from the token; if the request names a subdomain (X-School-Slug)
 *     it must be the same school → otherwise 403 TENANT_MISMATCH
 *  3. check the route's permission against the membership's permission set
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    // The startup check makes this unreachable; fail closed anyway.
    if (!rule) throw AppError.forbidden();
    if (rule.kind === 'public') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw AppError.unauthenticated();
    const claims = await this.tokens.verifyAccess(header.slice(7).trim());

    const session = await this.access.session(claims.sid);
    if (!session || session.revoked || session.expiresAt <= Date.now() || session.userId !== claims.sub) {
      throw AppError.unauthenticated();
    }
    RequestContextStore.patch({ userId: claims.sub, sessionId: claims.sid });

    if (claims.typ === 'school') {
      const membership = await this.access.membership(claims.mid!);
      if (!membership || !membership.active || membership.userId !== claims.sub || membership.schoolId !== claims.sch) {
        throw new AppError('NO_SCHOOL_ACCESS', 403, "You no longer have access to this school.");
      }

      const slug = req.header(SCHOOL_SLUG_HEADER)?.trim().toLowerCase();
      if (slug) {
        const slugSchoolId = await this.access.schoolIdForSlug(slug);
        if (slugSchoolId !== membership.schoolId) {
          this.logger.warn({ slug, tokenSchoolId: membership.schoolId }, 'security: tenant mismatch');
          throw new AppError('TENANT_MISMATCH', 403, 'You are signed in to a different school.');
        }
      }

      RequestContextStore.patch({
        schoolId: membership.schoolId,
        membershipId: membership.membershipId,
        permissions: membership.permissions,
      });
    }

    if (rule.kind === 'platform') {
      const role = await this.access.platformRole(claims.sub);
      if (!role || !(PLATFORM_ROLE_PERMISSIONS[role] as readonly string[]).includes(rule.permission)) throw AppError.forbidden();
      RequestContextStore.patch({ platformRole: role });
    }

    if (rule.kind === 'permission' || rule.kind === 'school') {
      const ctx = RequestContextStore.get();
      if (!ctx?.schoolId) throw new AppError('SCHOOL_NOT_SELECTED', 403, 'Select a school to continue.');
      if (rule.kind === 'permission' && !ctx.permissions?.[rule.permission]) throw AppError.forbidden();
    }
    return true;
  }
}
