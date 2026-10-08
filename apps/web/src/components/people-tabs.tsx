'use client';

import { cn } from '@schoolos/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '@/lib/me';

/** Students | Parents — parents live under Students in navigation (docs/06 §1). */
export function PeopleTabs() {
  const pathname = usePathname();
  const { can } = useMe();
  const tabs = [
    { href: '/students', label: 'Students', show: true },
    { href: '/guardians', label: 'Parents', show: can('guardian.view', ['ALL', 'ASSIGNED']) },
  ].filter((t) => t.show);
  if (tabs.length < 2) return null;
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={cn('-mb-px flex h-10 items-center border-b-2 px-3 text-body', active ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-secondary hover:text-fg')}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
