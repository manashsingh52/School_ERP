'use client';

import type { PageResponse, StudentListItem } from '@schoolos/contracts';
import { Avatar, CommandDialog, CommandEmpty, CommandGroup, CommandItem } from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, apiPost } from '@/lib/api-client';
import { classSection, fullName } from '@/lib/format';
import { useMe } from '@/lib/me';
import { ALL_NAV, visibleNav } from './nav';

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
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 150);
  const canSearchStudents = can('student.view');

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const students = useQuery({
    queryKey: ['palette-students', q],
    queryFn: () => apiFetch<PageResponse<StudentListItem>>(`/students?pageSize=5&q=${encodeURIComponent(q)}`),
    enabled: open && canSearchStudents && q.length >= 2,
    staleTime: 10_000,
  });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const needle = q.toLowerCase();
  const pages = visibleNav(can, ALL_NAV).filter((n) => !needle || n.label.toLowerCase().includes(needle));
  const studentResults = q.length >= 2 ? (students.data?.data ?? []) : [];
  const showSignOut = !needle || 'sign out log out'.includes(needle);

  // Keep the first result highlighted as results arrive, so Enter always does something.
  const values = [...studentResults.map((s) => `student-${s.id}`), ...pages.map((p) => `nav-${p.href}`), ...(showSignOut ? ['sign-out'] : [])];
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
      loading={students.isFetching}
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
              icon={<Avatar name={fullName(s.firstName, s.lastName)} size={22} />}
              hint={<span className="tabular">{classSection(s.className, s.sectionName)}</span>}
            >
              {fullName(s.firstName, s.lastName)}
              <span className="ml-2 font-mono text-small text-fg-tertiary">{s.admissionNo}</span>
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
        {q.length >= 2 && students.isFetching ? 'Searching…' : `No matches for “${search}”. Try a name or admission number.`}
      </CommandEmpty>
    </CommandDialog>
  );
}
