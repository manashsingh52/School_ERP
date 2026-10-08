'use client';

import { Card, EmptyState } from '@schoolos/ui';
import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useChild } from '@/lib/child';

type Child = NonNullable<ReturnType<typeof useChild>['child']>;

/** Parent pages render for the selected child; a friendly message if none is linked. */
export function ForChild({ children }: { children: (child: Child) => ReactNode }) {
  const { child } = useChild();
  if (!child) {
    return (
      <Card>
        <EmptyState icon={<Users />} title="No children linked yet" description="The school office links your children to your account. Contact them if this looks wrong." />
      </Card>
    );
  }
  return <>{children(child)}</>;
}
