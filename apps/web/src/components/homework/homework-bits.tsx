'use client';

import type { HomeworkItem } from '@schoolos/contracts';
import { Badge, toast } from '@schoolos/ui';
import { Download } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { addDays, formatDate, formatDay, todayISO } from '@/lib/format';

export function dueBadge(due: string | null) {
  if (!due) return null;
  const today = todayISO();
  if (due < today) return <Badge tone="neutral">Was due {formatDate(due)}</Badge>;
  if (due === today) return <Badge tone="warning" dot>Due today</Badge>;
  if (due === addDays(today, 1)) return <Badge tone="warning">Due tomorrow</Badge>;
  return <Badge tone="info">Due {formatDay(due)}</Badge>;
}

export function AttachmentLinks({ hw }: { hw: HomeworkItem }) {
  async function open(fileId: string) {
    try {
      const res = await apiFetch<{ data: { url: string } }>(`/homework/${hw.id}/attachments/${fileId}`);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t open the file.');
    }
  }
  if (!hw.attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {hw.attachments.map((a) => (
        <button key={a.id} onClick={() => void open(a.id)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-small hover:bg-hover">
          <Download className="size-3.5 text-fg-tertiary" />
          <span className="max-w-56 truncate">{a.originalName}</span>
        </button>
      ))}
    </div>
  );
}
