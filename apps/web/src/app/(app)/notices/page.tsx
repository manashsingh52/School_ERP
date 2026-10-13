'use client';

import type { NoticeItem, PageResponse } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, ErrorState, Input, PageHeader, Pagination, Skeleton, Tabs, cn } from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, Megaphone, Paperclip, Pin, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Gate } from '@/components/gate';
import { NoticeForm } from '@/components/notices/notice-form';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatDate, timeAgo } from '@/lib/format';
import { NOTICE_TYPE } from '@/lib/labels';
import { useTabParam } from '@/lib/hooks';
import { useMe } from '@/lib/me';

type Tab = 'PUBLISHED' | 'SCHEDULED' | 'DRAFT';
const PAGE = 20;
const plain = (md: string) => md.replace(/[*_`#>[\]]/g, '').replace(/\(https?:\/\/[^)]+\)/g, '').replace(/\s+/g, ' ').trim();

function NoticeRow({ n }: { n: NoticeItem }) {
  const unread = n.status === 'PUBLISHED' && !n.readAt && !n.canEdit;
  return (
    <Link href={`/notices/${n.id}`} className="block">
      <Card className={cn('flex gap-4 p-4 transition-colors hover:border-border-strong', unread && 'border-accent/30 bg-accent-tint/40')}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {n.isPinned && <Badge tone="accent"><Pin className="size-3" /> Pinned</Badge>}
            <Badge>{NOTICE_TYPE[n.type]}</Badge>
            <span className="text-small text-fg-secondary">{n.audiences.map((a) => a.label).join(', ')}</span>
            {n.status === 'SCHEDULED' && n.publishAt && (
              <Badge tone="neutral"><CalendarClock className="size-3" /> {new Date(n.publishAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Badge>
            )}
          </div>
          <div className={cn('mt-1.5 text-body', unread ? 'font-semibold' : 'font-medium')}>{n.title}</div>
          <p className="mt-0.5 line-clamp-2 text-small text-fg-secondary">{plain(n.body)}</p>
          <div className="mt-2 flex items-center gap-3 text-caption text-fg-tertiary">
            <span>{n.author.name}</span>
            <span>{n.publishedAt ? timeAgo(n.publishedAt) : `Created ${formatDate(n.createdAt)}`}</span>
            {n.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /> {n.attachments.length}</span>}
          </div>
        </div>
        {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
      </Card>
    </Link>
  );
}

function NoticesPageContent() {
  const { can } = useMe();
  const router = useRouter();
  const canCreate = can('notice.create');
  const [tab, setTab] = useTabParam<Tab>(['PUBLISHED', 'SCHEDULED', 'DRAFT']);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE), status: tab });
  if (q) params.set('q', q);
  if (tab !== 'PUBLISHED' && !can('notice.publish_school')) params.set('mine', 'true');
  const query = useQuery({
    queryKey: ['notices', 'list', params.toString()],
    queryFn: () => apiFetch<PageResponse<NoticeItem>>(`/notices?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notices"
        description={canCreate ? 'Notices, circulars and events for parents and staff' : 'News and circulars from school'}
        actions={canCreate && <Button onClick={() => setCreating(true)}><Plus /> New notice</Button>}
      />
      {canCreate && (
        <Tabs<Tab>
          value={tab}
          onChange={(v) => { setTab(v); setPage(1); }}
          items={[{ value: 'PUBLISHED', label: 'Published' }, { value: 'SCHEDULED', label: 'Scheduled' }, { value: 'DRAFT', label: 'Drafts' }]}
        />
      )}
      <div className="w-full max-w-xs">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notices" leading={<Search />} aria-label="Search notices" />
      </div>
      {query.isError ? (
        <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>
      ) : !query.data ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !query.data.data.length ? (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title={q ? `Nothing matches “${q}”` : tab === 'PUBLISHED' ? 'No notices yet' : tab === 'DRAFT' ? 'No drafts' : 'Nothing scheduled'}
            action={canCreate && tab === 'PUBLISHED' && !q ? <Button onClick={() => setCreating(true)}><Plus /> New notice</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {query.data.data.map((n) => <NoticeRow key={n.id} n={n} />)}
          {query.data.page.total > PAGE && <Pagination page={page} pageSize={PAGE} total={query.data.page.total} onPageChange={setPage} />}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New notice" className="max-w-[680px]">
          {creating && <NoticeForm onDone={(id) => { setCreating(false); if (id) router.push(`/notices/${id}`); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NoticesPage() {
  return (
    <Gate any={['notice.view']}>
      <NoticesPageContent />
    </Gate>
  );
}
