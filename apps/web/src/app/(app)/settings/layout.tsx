'use client';

import type { Permission } from '@schoolos/permissions';
import { PageHeader, cn } from '@schoolos/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Gate } from '@/components/gate';
import { useMe } from '@/lib/me';

const SECTIONS: { href: string; label: string; any: Permission[] }[] = [
  { href: '/settings', label: 'General', any: ['school.settings.view'] },
  { href: '/settings/branding', label: 'Branding', any: ['school.branding.manage'] },
  { href: '/settings/users', label: 'Users', any: ['user.view'] },
  { href: '/settings/roles', label: 'Roles & permissions', any: ['user.view'] },
  { href: '/settings/attendance', label: 'Attendance', any: ['school.settings.view'] },
  { href: '/settings/fees', label: 'Fees', any: ['school.settings.view'] },
  { href: '/settings/examinations', label: 'Examinations', any: ['school.settings.view'] },
  { href: '/settings/notifications', label: 'Notifications', any: ['notification.settings.manage'] },
  { href: '/academics?tab=years', label: 'Academic years', any: ['academic.view'] },
  { href: '/settings/billing', label: 'Plan & usage', any: ['billing.view'] },
  { href: '/settings/support-access', label: 'Support access', any: ['user.manage'] },
  { href: '/settings/audit', label: 'Audit log', any: ['audit.view'] },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useMe();
  const sections = SECTIONS.filter((s) => s.any.some((p) => can(p)));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label="Settings" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
          {sections.map((s) => {
            const active = s.href === '/settings' ? pathname === '/settings' : pathname.startsWith(s.href.split('?')[0]!);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={cn('rounded-md px-3 py-2 text-body whitespace-nowrap transition-colors', active ? 'bg-accent-tint font-medium text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg')}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1">
          <Gate any={['school.settings.view', 'user.view', 'school.branding.manage', 'notification.settings.manage', 'billing.view', 'audit.view']}>{children}</Gate>
        </div>
      </div>
    </div>
  );
}
