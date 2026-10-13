'use client';

import { CONVERSATION_CATEGORIES, CONVERSATION_CATEGORY_LABELS, type ConversationCategory, type ConversationItem, type ConversationStatus, type PageResponse } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, PageHeader, Pagination, Select, Skeleton, Tabs, cn } from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, MessagesSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Gate } from '@/components/gate';
import { CategoryBadge, ChildTeachers, NewConversation, STATUS } from '@/components/messages/message-bits';
import { ApiError, apiFetch } from '@/lib/api-client';
import { timeAgo } from '@/lib/format';
import { useChild, useIsParentView } from '@/lib/child';
import { useTabParam } from '@/lib/hooks';
import { useMe } from '@/lib/me';

type StatusTab = 'all' | ConversationStatus;
const PAGE = 30;

function Row({ c }: { c: ConversationItem }) {
  const other = c.myRole === 'PARENT' ? (c.staff ? c.staff.name : 'School office') : c.parent.name;
  return (
    <li>
      <Link href={`/messages/${c.id}`} className="flex gap-3 border-b border-border px-5 py-3.5 last:border-b-0 hover:bg-hover">
        <span className={cn('mt-2 size-2 shrink-0 rounded-full', c.unread ? 'bg-accent' : 'bg-transparent')} aria-label={c.unread ? 'Unread' : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('truncate', c.unread ? 'font-semibold' : 'font-medium')}>{c.subject}</span>
            <CategoryBadge category={c.category} />
            <Badge tone={STATUS[c.status].tone} dot>{STATUS[c.status].label}</Badge>
          </div>
          <div className="mt-0.5 text-small text-fg-secondary">
            {c.student.name}{c.student.classLabel ? ` (${c.student.classLabel})` : ''} · {c.myRole === 'OFFICE' ? `${c.parent.name} ↔ ${c.staff?.name ?? 'School office'}` : `with ${other}`}
          </div>
          {c.lastMessage && (
            <p className="mt-1 truncate text-small text-fg-tertiary">{c.lastMessage.fromMe ? 'You' : c.lastMessage.senderName}: {c.lastMessage.body}</p>
          )}
        </div>
        <span className="shrink-0 text-caption text-fg-tertiary">{timeAgo(c.lastMessageAt)}</span>
      </Link>
    </li>
  );
}

function MessagesPageContent() {
  const { can } = useMe();
  const office = can('message.use', ['ALL']);
  const parentView = useIsParentView();
  const [status, setStatus] = useTabParam<StatusTab>(['all', 'OPEN', 'IN_PROGRESS', 'RESOLVED']);
  const [category, setCategory] = useState<ConversationCategory | ''>('');
  const [view, setView] = useState<'mine' | 'all'>('mine');
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState<ConversationCategory | null>(useSearchParams().get('to') ? 'ACADEMIC' : null);
  // ?to=<member>&about=<subject>: opened from a subject's "Message the teacher" button.
  const params = useSearchParams();
  const [writeTo, setWriteTo] = useState<string | undefined>(params.get('to') ?? undefined);
  const [about] = useState(params.get('about') ?? '');
  const { child } = useChild();
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE), view, ...(status !== 'all' ? { status } : {}), ...(category ? { category } : {}) });
  const list = useQuery({
    queryKey: ['conversations', status, category, view, page],
    queryFn: () => apiFetch<PageResponse<ConversationItem>>(`/conversations?${qs.toString()}`),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages"
        description="Questions, concerns, complaints and feedback between parents and teachers — with the whole history kept."
        actions={
          <div className="flex gap-2">
            {parentView && <Button variant="secondary" onClick={() => setWriting('COMPLAINT')}><AlertTriangle /> Raise a complaint</Button>}
            <Button onClick={() => setWriting('GENERAL')}><Plus /> New message</Button>
          </div>
        }
      />
      {parentView && child && <ChildTeachers studentId={child.id} firstName={child.firstName} onWrite={(to) => { setWriteTo(to); setWriting('GENERAL'); }} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<StatusTab>
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          items={[{ value: 'all', label: 'All' }, { value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }]}
        />
        <div className="flex flex-wrap gap-2">
          {office && (
            <Select aria-label="Whose threads" value={view} onChange={(e) => { setView(e.target.value as 'mine' | 'all'); setPage(1); }} className="w-48">
              <option value="mine">Mine and the office's</option>
              <option value="all">Every thread in school</option>
            </Select>
          )}
          <Select aria-label="Topic" value={category} onChange={(e) => { setCategory(e.target.value as ConversationCategory | ''); setPage(1); }} className="w-48">
            <option value="">All topics</option>
            {CONVERSATION_CATEGORIES.map((c) => <option key={c} value={c}>{CONVERSATION_CATEGORY_LABELS[c]}</option>)}
          </Select>
        </div>
      </div>
      <Card>
        {list.isError ? (
          <ErrorState message={list.error instanceof ApiError ? list.error.message : undefined} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <div className="flex flex-col gap-2 p-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !list.data.data.length ? (
          <EmptyState icon={<MessagesSquare />} title={status === 'all' && !category ? 'No messages yet' : 'Nothing here'} description={parentView ? 'Start a conversation with a teacher or the school office — replies show up here and on the app.' : "When a parent writes to you (or to the school office), it shows up here. You can also message a student's parents."} />
        ) : (
          <ul>{list.data.data.map((c) => <Row key={c.id} c={c} />)}</ul>
        )}
      </Card>
      {list.data && list.data.page.total > PAGE && <Pagination page={page} pageSize={PAGE} total={list.data.page.total} onPageChange={setPage} />}
      <Dialog open={!!writing} onOpenChange={(o) => { if (!o) { setWriting(null); setWriteTo(undefined); } }}>
        {writing && <NewConversation initialCategory={writing} initialStudentId={writeTo ? child?.id : undefined} initialTo={writeTo} initialSubject={writeTo && about ? `About ${about}` : undefined} onDone={() => { setWriting(null); setWriteTo(undefined); }} />}
      </Dialog>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Gate any={['message.use']}>
      <Suspense>
        <MessagesPageContent />
      </Suspense>
    </Gate>
  );
}
