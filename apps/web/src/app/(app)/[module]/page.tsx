'use client';

import { Card, EmptyState, PageHeader } from '@schoolos/ui';
import { Lock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { ALL_NAV, visibleNav } from '@/components/shell/nav';
import { useMe } from '@/lib/me';

/** Modules on the roadmap but not built yet: a calm, honest page instead of a dead link. */
export default function ModulePlaceholder({ params }: { params: Promise<{ module: string }> }) {
  const { module } = use(params);
  const { can } = useMe();
  const item = ALL_NAV.find((n) => n.href === `/${module}` && !n.ready);
  if (!item) notFound();

  const allowed = visibleNav(can, [item]).length > 0;
  const Icon = item.icon;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.label} />
      <Card>
        {allowed ? (
          <EmptyState
            icon={<Icon />}
            title={`${item.label} is on its way`}
            description={`This module is being built (${item.phase} of the plan). It will use the same design, permissions and school data you see in Students.`}
          />
        ) : (
          <EmptyState icon={<Lock />} title="You don't have access to this page" description="Ask your school admin if you need it." />
        )}
      </Card>
    </div>
  );
}
