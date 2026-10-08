'use client';

import type { SystemStatus } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, Table, TD, TH, THead, TR, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useIsSuperAdmin } from '@/components/platform/console-shell';
import { ApiError, apiPost } from '@/lib/api-client';
import { timeAgo } from '@/lib/format';
import { useData } from '@/lib/hooks';

export default function SystemPage() {
  const qc = useQueryClient();
  const superAdmin = useIsSuperAdmin();
  const sys = useData<SystemStatus>(['platform', 'system'], '/platform/system', { staleTime: 0 });
  const [retrying, setRetrying] = useState<string | null>(null);
  async function retry(queue: string, jobId: string) {
    setRetrying(jobId);
    try {
      qc.setQueryData(['platform', 'system'], (await apiPost<{ data: SystemStatus }>('/platform/system/retry', { queue, jobId })).data);
      toast.success('Queued again');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setRetrying(null);
    }
  }
  if (!sys.data) return <Skeleton className="h-96" />;
  const s = sys.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="System" description="Background work, events and the database." actions={<Button variant="secondary" onClick={() => void sys.refetch()} loading={sys.isFetching}><RotateCw /> Refresh</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Database', s.database.ok ? `OK · ${s.database.latencyMs} ms` : 'Down', !s.database.ok], ['Events waiting', String(s.outbox.pending), false], ['Events failed', String(s.outbox.failed), s.outbox.failed > 0], ['Webhooks failed / bad signature (24 h)', `${s.webhooks.failed24h} / ${s.webhooks.invalidSignature24h}`, s.webhooks.failed24h + s.webhooks.invalidSignature24h > 0]] as const).map(([l, v, bad]) => (
          <Card key={l} className="p-4"><div className="text-small text-fg-secondary">{l}</div><div className={`tabular mt-1 text-h2 font-semibold ${bad ? 'text-danger' : ''}`}>{v}</div></Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Queues" />
        <div className="mt-3 overflow-x-auto">
          <Table>
            <THead><TR><TH>Queue</TH><TH className="text-right">Waiting</TH><TH className="text-right">Running</TH><TH className="text-right">Scheduled</TH><TH className="text-right">Failed</TH><TH className="text-right">Done (kept)</TH></TR></THead>
            <tbody>
              {s.queues.map((q) => (
                <TR key={q.queue}>
                  <TD className="font-medium">{q.queue}</TD>
                  <TD className="tabular text-right">{q.waiting}</TD>
                  <TD className="tabular text-right">{q.active}</TD>
                  <TD className="tabular text-right">{q.delayed}</TD>
                  <TD className={`tabular text-right ${q.failed ? 'font-semibold text-danger' : ''}`}>{q.failed}</TD>
                  <TD className="tabular text-right text-fg-tertiary">{q.completed}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Failed jobs" description="Jobs that used up their retries (dead-letter). Fix the cause, then retry." />
        {!s.failedJobs.length ? (
          <EmptyState icon={<CheckCircle2 />} title="No failed jobs" />
        ) : (
          <ul className="mt-3 border-t border-border">
            {s.failedJobs.map((j) => (
              <li key={`${j.queue}-${j.id}`} className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{j.queue}</Badge><span className="font-medium">{j.name}</span><span className="text-small text-fg-tertiary">{j.attempts} attempt{j.attempts === 1 ? '' : 's'}{j.failedAt ? ` · ${timeAgo(j.failedAt)}` : ''}</span></div>
                  <div className="mt-1 font-mono text-caption break-all text-danger">{j.reason}</div>
                  <div className="text-caption text-fg-tertiary">{j.id}{j.schoolId ? ` · school ${j.schoolId}` : ''}</div>
                </div>
                {superAdmin && <Button size="sm" variant="secondary" onClick={() => void retry(j.queue, j.id)} loading={retrying === j.id}>Retry</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
