import { describe, expect, it } from 'vitest';
import { PERMISSIONS, isPermission, ROLE_TEMPLATES, mergeGrants, SYSTEM_ROLE_KEYS } from './index.js';

describe('role templates', () => {
  it('only reference known permissions with allowed scopes', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      for (const [permission, scope] of ROLE_TEMPLATES[key].grants) {
        expect(isPermission(permission), `${key}: ${permission}`).toBe(true);
        const allowed = PERMISSIONS[permission].scopes as readonly string[];
        // Non-scoped permissions are always granted as ALL.
        if (allowed.length === 0) expect(scope, `${key}: ${permission}`).toBe('ALL');
        else expect(allowed, `${key}: ${permission}`).toContain(scope);
      }
    }
  });

  it('never grants a permission twice within one role', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      const perms = ROLE_TEMPLATES[key].grants.map(([p]) => p);
      expect(new Set(perms).size, key).toBe(perms.length);
    }
  });

  it('school admin keeps role.manage (lockout guard)', () => {
    expect(ROLE_TEMPLATES.school_admin.grants.some(([p]) => p === 'role.manage')).toBe(true);
  });

  it('parents and teachers never get ALL-scope student access by default', () => {
    for (const key of ['parent', 'teacher'] as const) {
      const grant = ROLE_TEMPLATES[key].grants.find(([p]) => p === 'student.view');
      expect(grant?.[1]).not.toBe('ALL');
    }
  });
});

describe('mergeGrants', () => {
  it('keeps the broadest scope', () => {
    const set = mergeGrants([
      { permission: 'student.view', scope: 'OWN_CHILDREN' },
      { permission: 'student.view', scope: 'ASSIGNED' },
      { permission: 'notice.view', scope: 'ALL' },
    ]);
    expect(set['student.view']).toBe('ASSIGNED');
    expect(set['notice.view']).toBe('ALL');
    expect(set['fee.manage']).toBeUndefined();
  });
});
