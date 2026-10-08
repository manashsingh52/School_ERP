'use client';

import type { NoticeItem, NoticeStats } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogContent, ErrorState, Menu, MenuContent, MenuItem, MenuTrigger, Skeleton, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, Download, MoreHorizontal, Pencil, Pin, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Gate } from '@/components/gate';
import { Markdown } from '@/components/notices/markdown';
import { NoticeForm } from '@/components/notices/notice-form';
import { ApiError, apiDelete, apiFetch, apiPost } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { NOTICE_TYPE } from '@/lib/labels';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Stats({ id }: { id: string }) {
  const stats = useData<NoticeStats>(['notices', 'stats', id], `/notices/${id}/stats`);
  if (!stats.data) return <Skeleton className="h-28" />;
  const s = stats.data;
  return (
    <Card className="p-4">
      <div className="text-small text-fg-secondary">Opened by</div>
      <div className="tabular mt-1 text-h2 font-semibold">{s.read} <span className="text-body font-normal text-fg-tertiary">of {s.recipients}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent" style={{ width: `${s.percent ?? 0}%` }} />
      </div>
      <dl className="mt-3 flex flex-col gap-1 text-small">
        {s.byGroup.filter((g) => g.recipients).map((g) => (
          <div key={g.group} className="flex justify-between"><dt className="text-fg-secondary">{g.group}</dt><dd className="tabular">{g.read} / {g.recipients}</dd></div>
        ))}
      </dl>
    </Card>
  );
}

function NoticeDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const notice = useQuery({ queryKey: ['notices', 'one', id], queryFn: () => apiFetch<{ data: NoticeItem }>(`/notices/${id}`).then((r) => r.data) });
  const n = notice.data;

  // Read receipt once the reader actually sees it.
  useEffect(() => {
    if (n && n.status === 'PUBLISHED' && !n.readAt) {
      void apiPost(`/notices/${id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
    }
  }, [n, id, qc]);

  async function openFile(fileId: string) {
    try {
      const res = await apiFetch<{ data: { url: string } }>(`/notices/${id}/attachments/${fileId}`);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t open the file.');
    }
  }
  async function publishNow() {
    try {
      await apiPost(`/notices/${id}/publish`, {});
      await qc.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Notice published');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t publish it.');
    }
  }
  async function remove() {
    if (!window.confirm('Delete this notice? People will no longer see it.')) return;
    try {
      await apiDelete(`/notices/${id}`);
      await qc.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Notice deleted');
      router.push('/notices');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/notices" className="inline-flex items-center gap-1 text-small text-fg-secondary hover:text-fg"><ChevronLeft className="size-3.5" /> Notices</Link>
      {notice.isError ? (
        <Card><ErrorState message={notice.error instanceof ApiError ? notice.error.message : undefined} onRetry={() => void notice.refetch()} /></Card>
      ) : !n ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {n.isPinned && <Badge tone="accent"><Pin className="size-3" /> Pinned</Badge>}
                <Badge>{NOTICE_TYPE[n.type]}</Badge>
                {n.status !== 'PUBLISHED' && <Badge tone="warning" dot>{n.status === 'DRAFT' ? 'Draft' : `Scheduled · ${when(n.publishAt!)}`}</Badge>}
              </div>
              {n.canEdit && (
                <Menu>
                  <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Notice actions"><MoreHorizontal /></Button></MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setEditing(true)}><Pencil /> Edit</MenuItem>
                    {n.status !== 'PUBLISHED' && <MenuItem onSelect={() => void publishNow()}><Send /> Publish now</MenuItem>}
                    <MenuItem destructive onSelect={() => void remove()}><Trash2 /> Delete</MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </div>
            <h1 className="mt-3 text-h1 font-semibold tracking-[-0.01em]">{n.title}</h1>
            <p className="mt-1 text-small text-fg-secondary">{n.author.name} · {n.publishedAt ? formatDate(n.publishedAt) : `created ${formatDate(n.createdAt)}`}</p>
            {n.type === 'EVENT' && n.eventStartsAt && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-subtle px-3 py-2 text-small">
                <CalendarDays className="size-4 text-fg-tertiary" /> {when(n.eventStartsAt)}{n.eventEndsAt ? ` – ${when(n.eventEndsAt)}` : ''}
              </div>
            )}
            <div className="mt-5"><Markdown text={n.body} /></div>
            {n.attachments.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
                {n.attachments.map((a) => (
                  <button key={a.id} onClick={() => void openFile(a.id)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-small hover:bg-hover">
                    <Download className="size-3.5 text-fg-tertiary" /> <span className="max-w-64 truncate">{a.originalName}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <div className="text-small text-fg-secondary">Sent to</div>
              <div className="mt-2 flex flex-wrap gap-1.5">{n.audiences.map((a) => <Badge key={`${a.type}:${a.refId}`}>{a.label}</Badge>)}</div>
            </Card>
            {n.canEdit && n.status === 'PUBLISHED' && <Stats id={n.id} />}
          </div>
        </div>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit notice" className="max-w-[680px]">
          {editing && n && <NoticeForm existing={n} onDone={() => { setEditing(false); void qc.invalidateQueries({ queryKey: ['notices'] }); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NoticePage() {
  return (
    <Gate any={['notice.view']}>
      <NoticeDetail />
    </Gate>
  );
}
