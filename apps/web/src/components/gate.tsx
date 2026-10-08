'use client';

import type { Permission, PermissionScope } from '@schoolos/permissions';
import { Card, EmptyState } from '@schoolos/ui';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMe } from '@/lib/me';

/**
 * Page-level access check for a clear "no access" message instead of a failed request.
 * Purely a UX layer — the API enforces every permission itself (docs/09 §2).
 */
export function Gate({ any, scopes, children }: { any: Permission[]; scopes?: PermissionScope[]; children: ReactNode }) {
  const { can } = useMe();
  if (any.some((p) => can(p, scopes))) return <>{children}</>;
  return (
    <Card>
      <EmptyState icon={<Lock />} title="You don't have access to this page" description="Ask your school admin if you need it." />
    </Card>
  );
}
