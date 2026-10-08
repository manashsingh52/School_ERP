'use client';

import type { AuditItem } from '@schoolos/contracts';
import { Badge, Button, EmptyState, Skeleton } from '@schoolos/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** "fee.manage" → "Fee manage"; "school.status" → "School status". */
export const actionLabel = (a: string) => {
  const s = a.replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function Changes({ item }: { item: AuditItem }) {
  const before = (item.before ?? {}) as Record<string, unknown>;
  const after = (item.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <div className="mt-2 rounded-md bg-subtle p-3 text-small">
      {keys.length > 0 && (
        <table className="w-full">
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="align-top">
                <td className="w-40 py-0.5 pr-3 text-fg-tertiary">{k}</td>
                <td className="py-0.5 break-all">
                  {k in before && <span className="text-danger line-through decoration-1">{show(before[k])}</span>}
                  {k in before && k in after && ' → '}
                  {k in after && <span>{show(after[k])}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!item.metadata && Object.keys(item.metadata as object).length > 0 && <pre className="mt-2 overflow-x-auto text-caption whitespace-pre-wrap text-fg-secondary">{JSON.stringify(item.metadata, null, 2)}</pre>}
      <div className="mt-2 text-caption text-fg-tertiary">{[item.entityType, item.entityId, item.ip].filter(Boolean).join(' · ')}</div>
    </div>
  );
}

/** Audit trail with "load more" (cursor paging). `path` is the list endpoint with its filters. */
export function AuditList({ path, showSchool = false }: { path: string; showSchool?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['audit', path],
    queryFn: ({ pageParam }) => apiFetch<{ data: AuditItem[]; page: { nextCursor: string | null } }>(`${path}${path.includes('?') ? '&' : '?'}limit=50${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
  if (!q.data) return <Skeleton className="m-5 h-64" />;
  const items = q.data.pages.flatMap((p) => p.data);
  if (!items.length) return <EmptyState icon={<ScrollText />} title="Nothing recorded" description="Changes show up here as people make them." />;
  return (
    <div>
      <ul>
        {items.map((a) => (
          <li key={a.id} className="border-b border-border px-5 py-3 last:border-b-0">
            <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
              {open === a.id ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-fg-tertiary" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-tertiary" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{actionLabel(a.action)}</span>
                  {a.actor.type !== 'USER' && <Badge tone={a.actor.type === 'PLATFORM' ? 'accent' : 'neutral'}>{a.actor.type === 'PLATFORM' ? 'SchoolOS' : 'Automatic'}</Badge>}
                  {showSchool && a.school && <span className="text-small text-fg-tertiary">{a.school.name}</span>}
                </div>
                <div className="text-small text-fg-secondary">{[a.actor.name ?? (a.actor.type === 'SYSTEM' ? 'System' : 'Someone'), a.summary].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="shrink-0 text-small text-fg-tertiary">{when.format(new Date(a.createdAt))}</span>
            </button>
            {open === a.id && <Changes item={a} />}
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <div className="flex justify-center border-t border-border p-3">
          <Button variant="secondary" size="sm" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>
        </div>
      )}
    </div>
  );
}
