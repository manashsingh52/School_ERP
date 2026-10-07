import { SCOPE_RANK, type Permission, type PermissionScope } from './catalog.js';

/** Effective permission set for one membership: permission → broadest scope granted. */
export type PermissionSet = Partial<Record<Permission, PermissionScope>>;

/** Merge grants from several roles, keeping the broadest scope per permission. */
export function mergeGrants(grants: Iterable<{ permission: Permission; scope: PermissionScope }>): PermissionSet {
  const result: PermissionSet = {};
  for (const { permission, scope } of grants) {
    const current = result[permission];
    if (!current || SCOPE_RANK[scope] > SCOPE_RANK[current]) result[permission] = scope;
  }
  return result;
}

export function hasPermission(set: PermissionSet, permission: Permission): boolean {
  return set[permission] !== undefined;
}

export function scopeOf(set: PermissionSet, permission: Permission): PermissionScope | undefined {
  return set[permission];
}
