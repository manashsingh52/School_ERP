'use client';

import { Avatar, Badge, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, cn } from '@schoolos/ui';
import { Activity, Building2, Flag, LayoutDashboard, LifeBuoy, LogOut, Package, ScrollText, UserSearch, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { apiPost } from '@/lib/api-client';
import { ThemeMenuItems } from '@/lib/theme';

export type PlatformRole = 'SUPER_ADMIN' | 'SUPPORT';
const RoleContext = createContext<PlatformRole>('SUPPORT');
/** Mirrors the API's PLATFORM_ROLE_PERMISSIONS: support staff look and ask; super admins change things. */
export const useIsSuperAdmin = () => useContext(RoleContext) === 'SUPER_ADMIN';

const NAV: { href: string; label: string; icon: LucideIcon; superOnly?: boolean }[] = [
  { href: '/platform', label: 'Overview', icon: LayoutDashboard },
  { href: '/platform/schools', label: 'Schools', icon: Building2 },
  { href: '/platform/plans', label: 'Plans', icon: Package },
  { href: '/platform/flags', label: 'Feature flags', icon: Flag },
  { href: '/platform/users', label: 'Find a user', icon: UserSearch, superOnly: true },
  { href: '/platform/support', label: 'Support access', icon: LifeBuoy },
  { href: '/platform/system', label: 'System', icon: Activity },
  { href: '/platform/audit', label: 'Audit log', icon: ScrollText, superOnly: true },
];

export function ConsoleShell({ user, role, children }: { user: { name: string; email: string | null; phone: string | null }; role: PlatformRole; children: ReactNode }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const items = NAV.filter((n) => !n.superOnly || role === 'SUPER_ADMIN');
  async function signOut() {
    setSigningOut(true);
    await apiPost('/api/session/logout').catch(() => null);
    window.location.assign('/login');
  }
  return (
    <RoleContext.Provider value={role}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <div className="flex h-14 items-center gap-2 border-b border-border px-4">
            <span className="flex size-7 items-center justify-center rounded-md bg-charcoal text-small font-semibold text-white">S</span>
            <span className="text-body font-semibold">SchoolOS Admin</span>
          </div>
          <nav aria-label="Console" className="flex flex-1 flex-col gap-0.5 p-2">
            {items.map((n) => {
              const active = n.href === '/platform' ? pathname === '/platform' : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('flex h-9 items-center gap-2.5 rounded-md px-2.5 text-body transition-colors [&_svg]:size-4', active ? 'bg-accent-tint font-medium text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg')}>
                  <n.icon /> {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-6">
            <nav aria-label="Console (mobile)" className="flex gap-1 overflow-x-auto md:hidden">
              {items.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2 py-1 text-small whitespace-nowrap text-fg-secondary hover:bg-hover">{n.label}</Link>
              ))}
            </nav>
            <div className="flex-1" />
            <Badge tone={role === 'SUPER_ADMIN' ? 'accent' : 'neutral'}>{role === 'SUPER_ADMIN' ? 'Super admin' : 'Support'}</Badge>
            <Menu>
              <MenuTrigger asChild>
                <button className="rounded-full focus-visible:outline-2" aria-label="Account menu"><Avatar name={user.name} size={30} /></button>
              </MenuTrigger>
              <MenuContent>
                <div className="px-2 py-2">
                  <div className="truncate text-body font-medium">{user.name}</div>
                  <div className="truncate text-small text-fg-tertiary">{user.email ?? user.phone}</div>
                </div>
                <MenuSeparator />
                <ThemeMenuItems />
                <MenuSeparator />
                <MenuItem onSelect={signOut} disabled={signingOut}><LogOut /> Sign out</MenuItem>
              </MenuContent>
            </Menu>
          </header>
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
    </RoleContext.Provider>
  );
}
