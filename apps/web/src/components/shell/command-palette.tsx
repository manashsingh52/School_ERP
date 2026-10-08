'use client';

import type { SearchResults } from '@schoolos/contracts';
import { Avatar, CommandDialog, CommandEmpty, CommandGroup, CommandItem } from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GraduationCap, LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, apiPost } from '@/lib/api-client';
import { classSection } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useIsParentView } from '@/lib/child';
import { ALL_NAV, PARENT_NAV, visibleNav } from './nav';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** ⌘K — search students and jump anywhere (docs/06 §2). Only shows what the user may do. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { can } = useMe();
  const parentView = useIsParentView();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 150);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const results = useQuery({
    queryKey: ['palette-search', q],
    queryFn: () => apiFetch<{ data: SearchResults }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.data),
    enabled: open && q.length >= 2,
    staleTime: 10_000,
  });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const needle = q.toLowerCase();
  const pages = (parentView ? PARENT_NAV : visibleNav(can, ALL_NAV)).filter((n) => !needle || n.label.toLowerCase().includes(needle));
  const found = q.length >= 2 ? results.data : undefined;
  const studentResults = found?.students ?? [];
  const teacherResults = found?.teachers ?? [];
  const guardianResults = found?.guardians ?? [];
  const showSignOut = !needle || 'sign out log out'.includes(needle);

  // Keep the first result highlighted as results arrive, so Enter always does something.
  const values = [
    ...studentResults.map((s) => `student-${s.id}`),
    ...teacherResults.map((t) => `teacher-${t.id}`),
    ...guardianResults.map((g) => `guardian-${g.id}`),
    ...pages.map((p) => `nav-${p.href}`), ...(showSignOut ? ['sign-out'] : [])];
  const [selected, setSelected] = useState('');
  const valuesKey = values.join('|');
  useEffect(() => {
    if (!values.includes(selected)) setSelected(values[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      search={search}
      onSearchChange={setSearch}
      loading={results.isFetching}
      selected={selected}
      onSelectedChange={setSelected}
    >
      {studentResults.length > 0 && (
        <CommandGroup heading="Students">
          {studentResults.map((s) => (
            <CommandItem
              key={s.id}
              value={`student-${s.id}`}
              onSelect={() => go(`/students/${s.id}`)}
              icon={<Avatar name={s.name} size={22} />}
              hint={<span className="tabular">{classSection(s.className, s.sectionName)}</span>}
            >
              {s.name}
              <span className="ml-2 font-mono text-small text-fg-tertiary">{s.admissionNo}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {teacherResults.length > 0 && (
        <CommandGroup heading="Teachers">
          {teacherResults.map((t) => (
            <CommandItem key={t.id} value={`teacher-${t.id}`} onSelect={() => go(`/teachers/${t.id}`)} icon={<GraduationCap />} hint={t.department ?? undefined}>
              {t.name}
              <span className="ml-2 font-mono text-small text-fg-tertiary">{t.employeeId}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {guardianResults.length > 0 && (
        <CommandGroup heading="Parents">
          {guardianResults.map((g) => (
            <CommandItem key={g.id} value={`guardian-${g.id}`} onSelect={() => go(`/guardians/${g.id}`)} icon={<UserRound />} hint={`${g.childCount} ${g.childCount === 1 ? 'child' : 'children'}`}>
              {g.name}
              {g.phone && <span className="ml-2 text-small text-fg-tertiary">{g.phone}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {pages.length > 0 && (
        <CommandGroup heading="Go to">
          {pages.map((p) => {
            const Icon = p.icon;
            return (
              <CommandItem
                key={p.href}
                value={`nav-${p.href}`}
                onSelect={() => go(p.href)}
                icon={<Icon />}
                hint={p.ready ? <ArrowRight className="size-3.5" /> : 'Coming soon'}
              >
                {p.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}

      {showSignOut && (
        <CommandGroup heading="Account">
          <CommandItem
            value="sign-out"
            icon={<LogOut />}
            onSelect={async () => {
              await apiPost('/api/session/logout').catch(() => null);
              window.location.assign('/login');
            }}
          >
            Sign out
          </CommandItem>
        </CommandGroup>
      )}

      <CommandEmpty>
        {q.length >= 2 && results.isFetching ? 'Searching…' : `No matches for “${search}”. Try a name, admission number or phone.`}
      </CommandEmpty>
    </CommandDialog>
  );
}
