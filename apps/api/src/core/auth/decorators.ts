import { SetMetadata } from '@nestjs/common';
import type { Permission, PlatformPermission } from '@schoolos/permissions';

/**
 * Every route must declare exactly one access rule. A startup check (route-access.check.ts)
 * refuses to boot if any route is missing one (docs/03 §6).
 */
export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' } // any signed-in user; a school is optional (/me, select-school, logout)
  | { kind: 'school' } // any active member of the current school; the service checks the exact permission
  | { kind: 'permission'; permission: Permission } // requires a school-scoped token + permission
  | { kind: 'platform'; permission: PlatformPermission }; // SchoolOS staff (super admin / support); no school needed

export const ACCESS_RULE = 'schoolos:access-rule';

export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);
export const Authenticated = () => SetMetadata(ACCESS_RULE, { kind: 'authenticated' } satisfies AccessRule);
/** Use only when the required permission depends on the input (e.g. file purpose). */
export const SchoolMember = () => SetMetadata(ACCESS_RULE, { kind: 'school' } satisfies AccessRule);
export const RequirePermission = (permission: Permission) =>
  SetMetadata(ACCESS_RULE, { kind: 'permission', permission } satisfies AccessRule);
/** SchoolOS platform staff only (super-admin console). */
export const RequirePlatform = (permission: PlatformPermission) =>
  SetMetadata(ACCESS_RULE, { kind: 'platform', permission } satisfies AccessRule);
