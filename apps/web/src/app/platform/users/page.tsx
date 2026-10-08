'use client';

import type { PlatformUserItem } from '@schoolos/contracts';
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Skeleton } from '@schoolos/ui';
import { Search, UserSearch } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { timeAgo } from '@/lib/format';
import { useData } from '@/lib/hooks';

/** "Who is this person and where can they sign in?" — the first question in most support calls. */
export default function UsersPage() {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim());
  const res = useData<PlatformUserItem[]>(['platform', 'users', query], query.length >= 2 ? `/platform/users?q=${encodeURIComponent(query)}` : null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Find a user" description="By name, mobile number or email — see every school they belong to." />
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-fg-tertiary" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 98765 43210 or priya@" className="pl-9" aria-label="Search users" />
      </div>
      {query.length < 2 ? null : !res.data ? (
        <Skeleton className="h-48" />
      ) : !res.data.length ? (
        <Card><EmptyState icon={<UserSearch />} title="Nobody found" description="Check the number — we match the last 10 digits." /></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {res.data.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={u.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">{u.name}{u.platformRole && <Badge tone="accent">{u.platformRole === 'SUPER_ADMIN' ? 'Super admin' : 'Support'}</Badge>}{u.status !== 'ACTIVE' && <Badge tone="warning">{u.status.toLowerCase()}</Badge>}</div>
                  <div className="text-small text-fg-secondary">{[u.phone, u.email].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="text-small text-fg-tertiary">{u.lastLoginAt ? `Last signed in ${timeAgo(u.lastLoginAt)}` : 'Never signed in'}</div>
              </div>
              {u.memberships.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-small">
                  {u.memberships.map((m) => (
                    <li key={m.schoolId} className="flex flex-wrap items-center gap-2">
                      <Link href={`/platform/schools/${m.schoolId}`} className="font-medium text-accent-strong hover:underline">{m.school}</Link>
                      <span className="text-fg-secondary">{m.roles.join(', ')}</span>
                      {m.status !== 'ACTIVE' && <Badge>{m.status.toLowerCase()}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
