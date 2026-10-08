'use client';

import { cn } from '@schoolos/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '@/lib/me';

/** Students | Staff */
export function AttendanceTabs() {
  const pathname = usePathname();
  const { can } = useMe();
  const tabs = [
    { href: '/attendance', label: 'Students', active: pathname !== '/attendance/staff', show: true },
    { href: '/attendance/staff', label: 'Staff', active: pathname === '/attendance/staff', show: can('staff_attendance.manage') },
  ].filter((t) => t.show);
  if (tabs.length < 2) return null;
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className={cn('-mb-px flex h-10 items-center border-b-2 px-3 text-body', t.active ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-secondary hover:text-fg')}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
