'use client';

import type { ConversationDetail, ConversationStatus } from '@schoolos/contracts';
import { Badge, Button, Card, ErrorState, Select, Skeleton, Textarea, cn, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck, Send } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { Gate } from '@/components/gate';
import { CategoryBadge, STATUS } from '@/components/messages/message-bits';
import { ApiError, apiFetch, apiPatch, apiPost } from '@/lib/api-client';

const stamp = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const thread = useQuery({
    queryKey: ['conversations', 'thread', id],
    queryFn: () => apiFetch<{ data: ConversationDetail }>(`/conversations/${id}`).then((r) => r.data),
    refetchInterval: 10_000,
  });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const refresh = (data: ConversationDetail) => {
    qc.setQueryData(['conversations', 'thread', id], data);
    void qc.invalidateQueries({ queryKey: ['conversations'], exact: false, refetchType: 'none' });
  };

  async function send() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      refresh((await apiPost<{ data: ConversationDetail }>(`/conversations/${id}/messages`, { body: draft })).data);
      setDraft('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Your reply did not send. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: ConversationStatus) {
    try {
      refresh((await apiPatch<{ data: ConversationDetail }>(`/conversations/${id}`, { status })).data);
      toast.success(`Marked ${STATUS[status].label.toLowerCase()} — the parent has been told.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    }
  }

  if (thread.isError) return <Card><ErrorState message={thread.error instanceof ApiError ? thread.error.message : undefined} onRetry={() => void thread.refetch()} /></Card>;
  if (!thread.data) return <Skeleton className="h-[60vh]" />;
  const c = thread.data;
  const otherParty = c.myRole === 'PARENT' ? (c.staff?.name ?? 'School office') : c.parent.name;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/messages" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" /> Messages</Link>
      <Card className="flex flex-wrap items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 font-semibold">{c.subject}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-small text-fg-secondary">
            <CategoryBadge category={c.category} />
            <span>About {c.student.name}{c.student.classLabel ? ` (${c.student.classLabel})` : ''}</span>
            <span>·</span>
            <span>{c.myRole === 'OFFICE' ? `${c.parent.name} and ${c.staff?.name ?? 'the school office'}` : `With ${otherParty}`}</span>
          </div>
        </div>
        {c.canChangeStatus ? (
          <Select aria-label="Status" value={c.status} onChange={(e) => void setStatus(e.target.value as ConversationStatus)} className="w-40">
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
          </Select>
        ) : (
          <Badge tone={STATUS[c.status].tone} dot>{STATUS[c.status].label}</Badge>
        )}
      </Card>

      <Card className="flex flex-col">
        <div className="flex max-h-[60vh] min-h-64 flex-col gap-3 overflow-y-auto p-5" aria-live="polite">
          {c.messages.map((m) => (
            <div key={m.id} className={cn('flex flex-col', m.fromMe ? 'items-end' : 'items-start')}>
              <div className={cn('max-w-[85%] rounded-xl px-4 py-2.5', m.fromMe ? 'bg-accent text-accent-fg' : 'border border-border bg-subtle')}>
                {!m.fromMe && <div className="mb-0.5 text-caption font-medium">{m.sender.name}</div>}
                <p className="whitespace-pre-line">{m.body}</p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1 text-caption text-fg-tertiary">
                {stamp(m.createdAt)}
                {m.fromMe && (m.seen ? <><CheckCheck className="size-3.5 text-accent" /> Seen</> : <><Check className="size-3.5" /> Sent</>)}
              </span>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
            }}
            placeholder={c.status === 'RESOLVED' && c.myRole === 'PARENT' ? 'Writing again reopens this conversation…' : 'Write a reply… (Ctrl+Enter to send)'}
            rows={2}
            maxLength={4000}
            aria-label="Reply"
          />
          <Button type="submit" loading={busy} disabled={!draft.trim()} aria-label="Send"><Send /></Button>
        </form>
      </Card>
    </div>
  );
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Gate any={['message.use']}>
      <Thread id={id} />
    </Gate>
  );
}
