'use client';

import type { HomeworkItem, PageResponse } from '@schoolos/contracts';
import { Badge, Card, Dialog, DialogBody, DialogContent, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NotebookPen, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { AttachmentLinks, dueBadge } from '@/components/homework/homework-bits';
import { ForChild } from '@/components/parent/parent-gate';
import { ApiError, apiFetch } from '@/lib/api-client';
import { timeAgo } from '@/lib/format';

const PAGE = 20;

function HomeworkList({ studentId }: { studentId: string }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<HomeworkItem | null>(null);
  const query = useQuery({
    queryKey: ['homework', 'child', studentId, page],
    queryFn: () => apiFetch<PageResponse<HomeworkItem>>(`/homework?studentId=${studentId}&page=${page}&pageSize=${PAGE}`),
    placeholderData: keepPreviousData,
  });
  if (query.isError) return <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>;
  if (!query.data) return <div className="flex flex-col gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!query.data.data.length) return <Card><EmptyState icon={<NotebookPen />} title="No homework yet" description="Homework from teachers will show up here." /></Card>;
  return (
    <div className="flex flex-col gap-3">
      {query.data.data.map((hw) => (
        <button key={hw.id} onClick={() => setOpen(hw)} className="text-left">
          <Card className="p-4 transition-colors hover:border-border-strong">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{hw.subject.name}</Badge>
              {dueBadge(hw.dueDate)}
            </div>
            <div className="mt-1.5 text-body font-semibold">{hw.title}</div>
            {hw.description && <p className="mt-0.5 line-clamp-2 text-small text-fg-secondary">{hw.description}</p>}
            <div className="mt-2 flex items-center gap-3 text-caption text-fg-tertiary">
              <span>{hw.teacher.name}</span>
              {hw.publishedAt && <span>{timeAgo(hw.publishedAt)}</span>}
              {hw.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /> {hw.attachments.length}</span>}
            </div>
          </Card>
        </button>
      ))}
      {query.data.page.total > PAGE && <Pagination page={page} pageSize={PAGE} total={query.data.page.total} onPageChange={setPage} />}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent title={open.title} description={`${open.subject.name} · ${open.teacher.name}`}>
            <DialogBody className="flex flex-col gap-4">
              {dueBadge(open.dueDate) && <div>{dueBadge(open.dueDate)}</div>}
              {open.description ? <p className="text-body whitespace-pre-wrap">{open.description}</p> : <p className="text-body text-fg-tertiary">No instructions.</p>}
              <AttachmentLinks hw={open} />
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default function ChildHomeworkPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s homework`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          <HomeworkList key={child.id} studentId={child.id} />
        </div>
      )}
    </ForChild>
  );
}
