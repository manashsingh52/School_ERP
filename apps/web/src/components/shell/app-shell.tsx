'use client';

import {
  Avatar,
  Button,
  Kbd,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
  cn,
} from '@schoolos/ui';
import { LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiPost } from '@/lib/api-client';
import { useMe } from '@/lib/me';
import { CommandPalette } from './command-palette';
import { NotificationsButton } from './notifications-button';
import { SETTINGS_NAV, visibleNav, type NavItem } from './nav';

const COLLAPSE_KEY = 'sos.sidebar.collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const { me, can } = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Remember the sidebar state per browser (a convenience; storage may be unavailable).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* private mode */
    }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = visibleNav(can);
  const settings = visibleNav(can, [SETTINGS_NAV]);
  const school = me.membership!.school;

  const sidebar = (mobile: boolean) => (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface',
        mobile ? 'w-[264px]' : collapsed ? 'w-16' : 'w-60',
        'transition-[width] duration-[180ms] ease-[var(--ease)]',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 px-3', collapsed && !mobile && 'justify-center px-0')}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-small font-semibold text-accent-fg">
          {school.name.trim()[0]?.toUpperCase()}
        </div>
        {(!collapsed || mobile) && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-body font-semibold">{school.name}</div>
            <div className="truncate text-caption text-fg-tertiary">{me.membership!.roles.map((r) => r.name).join(', ')}</div>
          </div>
        )}
        {mobile && (
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} collapsed={collapsed && !mobile} />
          ))}
        </ul>
      </div>

      <div className="border-t border-border px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {settings.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} collapsed={collapsed && !mobile} />
          ))}
        </ul>
        {!mobile && (
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button
              onClick={toggleCollapsed}
              className={cn(
                'mt-0.5 flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-body text-fg-tertiary hover:bg-hover hover:text-fg',
                collapsed && 'justify-center px-0',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!collapsed && 'Collapse'}
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden md:block">{sidebar(false)}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-fit shadow-e3">{sidebar(true)}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </Button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 max-w-[420px] flex-1 items-center gap-2 rounded-md border border-border bg-app px-3 text-body text-fg-tertiary transition-colors hover:border-border-strong"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">
              <span className="sm:hidden">Search…</span>
              <span className="hidden sm:inline">Search students, pages and actions…</span>
            </span>
            <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationsButton />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Tooltip content={item.label} side="right" disabled={!collapsed}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex h-9 items-center gap-3 rounded-md px-2.5 text-body transition-colors duration-[120ms]',
            active ? 'bg-accent-tint font-medium text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
            collapsed && 'justify-center px-0',
          )}
        >
          {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" aria-hidden="true" />}
          <Icon className={cn('size-4 shrink-0', active ? 'text-accent-strong' : 'text-fg-tertiary')} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      </Tooltip>
    </li>
  );
}

function UserMenu() {
  const { me } = useMe();
  const [signingOut, setSigningOut] = useState(false);
  const others = me.memberships.filter((m) => m.membershipId !== me.membership?.membershipId);

  async function signOut() {
    setSigningOut(true);
    await apiPost('/api/session/logout').catch(() => null);
    window.location.assign('/login');
  }

  function openSchool(slug: string) {
    const { protocol, host } = window.location;
    const base = host.split('.').slice(1).join('.');
    window.location.assign(`${protocol}//${slug}.${base}/login`);
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="ml-1 rounded-full focus-visible:outline-2" aria-label="Account menu">
          <Avatar name={me.user.name} size={30} />
        </button>
      </MenuTrigger>
      <MenuContent>
        <div className="px-2 py-2">
          <div className="truncate text-body font-medium">{me.user.name}</div>
          <div className="truncate text-small text-fg-tertiary">{me.user.email ?? me.user.phone}</div>
        </div>
        {others.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Switch school</MenuLabel>
            {others.map((m) => (
              <MenuItem key={m.membershipId} onSelect={() => openSchool(m.school.slug)}>
                <span className="flex size-5 items-center justify-center rounded bg-subtle text-caption font-semibold">
                  {m.school.name[0]}
                </span>
                <span className="truncate">{m.school.name}</span>
              </MenuItem>
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuItem onSelect={signOut} disabled={signingOut}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
