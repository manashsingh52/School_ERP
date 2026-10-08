'use client';

import type { SearchResults } from '@schoolos/contracts';
import { Avatar, Input, cn } from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { classSection } from '@/lib/format';

export type PickedStudent = SearchResults['students'][number];

/** Type a name or admission number; pick a student. */
export function StudentPicker({ onPick, autoFocus, placeholder = 'Student name or admission number' }: { onPick: (s: PickedStudent) => void; autoFocus?: boolean; placeholder?: string }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);
  const results = useQuery({
    queryKey: ['search', 'students', q],
    queryFn: () => apiFetch<{ data: SearchResults }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.data.students),
    enabled: q.length >= 2,
  });
  const list = q.length >= 2 ? (results.data ?? []) : [];
  const pick = (s: PickedStudent) => {
    onPick(s);
    setText('');
    setQ('');
  };
  return (
    <div className="relative">
      <Input
        value={text}
        onChange={(e) => { setText(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && list[active]) { e.preventDefault(); pick(list[active]!); }
        }}
        placeholder={placeholder}
        leading={<Search />}
        autoFocus={autoFocus}
        aria-label="Find student"
      />
      {list.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface shadow-e3" role="listbox">
          {list.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === active && 'bg-hover')}
              >
                <Avatar name={s.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-caption text-fg-tertiary">Adm. {s.admissionNo} · {classSection(s.className, s.sectionName)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && results.data && !results.data.length && <p className="mt-1 text-small text-fg-tertiary">No student matches “{q}”.</p>}
    </div>
  );
}
