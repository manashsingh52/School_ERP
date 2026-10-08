'use client';

import type { ExamDetail, ReportCardStatus } from '@schoolos/contracts';
import { Button, Card, EmptyState, Select, Skeleton, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiFetch, apiPost } from '@/lib/api-client';
import { useClasses } from '@/lib/academics';
import { timeAgo } from '@/lib/format';

/** One click per section; cards are made in the background and listed here as they finish. */
export function ReportCardsPanel({ exam }: { exam: ExamDetail }) {
  const qc = useQueryClient();
  const classes = useClasses();
  const sections = (classes.data ?? []).filter((c) => exam.classes.some((x) => x.id === c.id)).flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name.replace(/^Class\s+/i, '')}-${s.name}` })));
  const [chosen, setChosen] = useState('');
  const sectionId = chosen || sections[0]?.id || '';
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const status = useQuery({
    queryKey: ['exams', exam.id, 'report-cards', sectionId],
    queryFn: () => apiFetch<{ data: ReportCardStatus[] }>(`/exams/${exam.id}/report-cards?sectionId=${sectionId}`).then((r) => r.data),
    enabled: !!sectionId,
    // Poll while a batch is being made (stops after 2 minutes).
    refetchInterval: waitingSince && Date.now() - waitingSince < 120_000 ? 2000 : false,
    refetchIntervalInBackground: true,
  });

  async function generate() {
    try {
      const res = await apiPost<{ data: { queued: number } }>(`/exams/${exam.id}/report-cards`, { sectionId });
      setWaitingSince(Date.now());
      toast.success(`Making ${res.data.queued} report cards — they'll appear below`);
      void qc.invalidateQueries({ queryKey: ['exams', exam.id, 'report-cards', sectionId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t start it.');
    }
  }
  async function open(studentId: string) {
    try {
      const res = await apiFetch<{ data: { url: string } }>(`/exams/${exam.id}/report-cards/${studentId}`);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t open it.');
    }
  }

  if (!classes.data) return <Skeleton className="h-64" />;
  if (!sections.length) return <Card><EmptyState icon={<FileText />} title="No classes in this exam" /></Card>;
  const rows = status.data ?? [];
  const made = rows.filter((r) => r.version).length;
  const latest = rows.reduce<string | null>((a, r) => (r.generatedAt && (!a || r.generatedAt > a) ? r.generatedAt : a), null);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={sectionId} onChange={(e) => { setChosen(e.target.value); setWaitingSince(null); }} className="w-40" aria-label="Section">
            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <span className="text-small text-fg-secondary">{status.data ? `${made} of ${rows.length} ready${latest ? ` · last made ${timeAgo(latest)}` : ''}` : ''}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild disabled={!made}>
            <a href={made ? `/api/v1/exams/${exam.id}/report-cards/bundle?sectionId=${sectionId}` : undefined} target="_blank" rel="noopener" aria-disabled={!made}><Printer /> Download all (print)</a>
          </Button>
          <Button onClick={() => void generate()}>{made ? <><RefreshCw /> Make again</> : <><FileText /> Make report cards</>}</Button>
        </div>
      </Card>
      {exam.status !== 'RESULTS_PUBLISHED' && <p className="text-small text-fg-tertiary">Results aren't published yet — parents can download cards only after publishing. Make cards again if marks or remarks change.</p>}
      {!status.data ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          {rows.map((r) => (
            <div key={r.studentId} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <span className="tabular w-7 text-right text-small text-fg-tertiary">{r.rollNo ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              {r.version ? (
                <>
                  <span className="text-caption text-fg-tertiary">v{r.version} · {timeAgo(r.generatedAt!)}</span>
                  <Button variant="ghost" size="sm" onClick={() => void open(r.studentId)}><Download /> PDF</Button>
                </>
              ) : (
                <span className="text-caption text-fg-tertiary">{waitingSince ? 'Making…' : 'Not made yet'}</span>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
