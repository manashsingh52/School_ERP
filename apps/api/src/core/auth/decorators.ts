import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@schoolos/permissions';

/**
 * Every route must declare exactly one access rule. A startup check (route-access.check.ts)
 * refuses to boot if any route is missing one (docs/03 §6).
 */
export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' } // any signed-in user; a school is optional (/me, select-school, logout)
  | { kind: 'permission'; permission: Permission }; // requires a school-scoped token + permission

export const ACCESS_RULE = 'schoolos:access-rule';

export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);
export const Authenticated = () => SetMetadata(ACCESS_RULE, { kind: 'authenticated' } satisfies AccessRule);
export const RequirePermission = (permission: Permission) =>
  SetMetadata(ACCESS_RULE, { kind: 'permission', permission } satisfies AccessRule);
