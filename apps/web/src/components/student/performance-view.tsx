'use client';

import type { PerformanceSubject, StudentPerformance } from '@schoolos/contracts';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Skeleton, cn } from '@schoolos/ui';
import { BookOpen, ChevronDown, FileText, Minus, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { useState } from 'react';
import { ProgressChart } from '@/components/charts/progress-chart';
import { RadarChart } from '@/components/charts/radar-chart';
import { ApiError } from '@/lib/api-client';
import { formatPercent } from '@/lib/format';
import { useData } from '@/lib/hooks';

/** Same bands for every number on the page: 75+ good, 50+ fair, below needs attention. */
export const pctTone = (p: number | null) => (p === null ? 'text-fg-tertiary' : p >= 75 ? 'text-success' : p >= 50 ? 'text-warning' : 'text-danger');

const TREND = {
  up: { icon: TrendingUp, label: 'Improving', className: 'text-success' },
  down: { icon: TrendingDown, label: 'Dropped since the last exam', className: 'text-danger' },
  steady: { icon: Minus, label: 'Steady', className: 'text-fg-tertiary' },
} as const;

function SubjectCard({ s, open, onToggle }: { s: PerformanceSubject; open: boolean; onToggle: () => void }) {
  const trend = s.trend ? TREND[s.trend] : null;
  const Icon = trend?.icon;
  return (
    <Card id={`subject-${s.subject.id}`} className={cn('overflow-hidden transition-shadow', open && 'ring-2 ring-accent/30')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-hover">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{s.subject.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-fg-secondary">
            <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />{s.exams.length} exam{s.exams.length === 1 ? '' : 's'}</span>
            <span>·</span>
            <span className={cn('font-semibold tabular', pctTone(s.averagePct))}>{formatPercent(s.averagePct)}</span>
            {s.sectionAveragePct !== null && <span className="text-fg-tertiary">(section {formatPercent(s.sectionAveragePct)})</span>}
            {trend && Icon && <span className={cn('inline-flex items-center gap-1', trend.className)} title={trend.label}><Icon className="size-3.5" />{trend.label}</span>}
          </div>
        </div>
        <ChevronDown className={cn('size-5 shrink-0 text-fg-tertiary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[480px] text-small">
            <thead className="bg-subtle text-left text-caption text-fg-tertiary">
              <tr>
                <th className="px-5 py-2 font-medium">Test / exam</th>
                <th className="px-3 py-2 text-right font-medium">Marks</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-5 py-2 text-right font-medium">Section avg.</th>
              </tr>
            </thead>
            <tbody>
              {s.exams.map((e) => (
                <tr key={e.examId} className="border-t border-border">
                  <td className="px-5 py-2.5">{e.examName}</td>
                  <td className="tabular px-3 py-2.5 text-right">{e.exempt ? 'Exempt' : e.absent ? <span className="text-danger">Absent</span> : e.marks === null ? '—' : `${e.marks} / ${e.maxMarks}`}</td>
                  <td className={cn('tabular px-3 py-2.5 text-right font-semibold', pctTone(e.percent))}>{formatPercent(e.percent)}</td>
                  <td className="px-3 py-2.5">{e.grade ?? '—'}{e.passed === false && <Badge tone="danger" className="ml-2">Below pass</Badge>}</td>
                  <td className="tabular px-5 py-2.5 text-right text-fg-secondary">{formatPercent(e.sectionAveragePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Marks as pictures: a radar of subjects (tap one to open its tests), progress across exams, and
 * every subject's unit tests and exams with the section average beside them. Recalculated by the
 * server whenever results are computed or published.
 */
export function StudentPerformanceView({ studentId }: { studentId: string }) {
  const perf = useData<StudentPerformance>(['performance', studentId], `/students/${studentId}/performance`);
  const [openId, setOpenId] = useState<string | null>(null);
  if (perf.isError) return <Card><ErrorState message={perf.error instanceof ApiError ? perf.error.message : undefined} onRetry={() => void perf.refetch()} /></Card>;
  if (!perf.data) return <Skeleton className="h-96" />;
  const p = perf.data;
  if (!p.exams.length) {
    return <Card><EmptyState icon={<Trophy />} title="No marks yet" description="Charts appear here as soon as the first test's results are out." /></Card>;
  }

  const select = (id: string) => {
    setOpenId(id);
    requestAnimationFrame(() => document.getElementById(`subject-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  const selectedIndex = p.subjects.findIndex((s) => s.subject.id === openId);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col">
          <CardHeader
            title="Performance radar"
            description={p.subjects.length >= 3 ? 'Average in each subject across all tests. Tap a point for details.' : 'Average in each subject across all tests.'}
            action={<span className={cn('whitespace-nowrap rounded-full border px-3 py-1 text-body font-semibold tabular', p.overallPct !== null && p.overallPct >= 75 ? 'border-success-border bg-success-bg text-success' : 'border-border')}>{formatPercent(p.overallPct)} <span className="text-small font-normal">avg</span></span>}
          />
          <div className="flex flex-1 flex-col items-center px-4 pb-4">
            {p.subjects.length >= 3 ? (
              <RadarChart
                axes={p.subjects.map((s) => ({ label: s.subject.name, value: s.averagePct, compare: s.sectionAveragePct }))}
                selected={selectedIndex >= 0 ? selectedIndex : null}
                onSelect={(i) => select(p.subjects[i]!.subject.id)}
              />
            ) : (
              <ul className="flex w-full flex-col gap-3 py-4">
                {p.subjects.map((s) => (
                  <li key={s.subject.id}>
                    <div className="mb-1 flex justify-between text-small"><span>{s.subject.name}</span><span className="tabular font-semibold">{formatPercent(s.averagePct)}</span></div>
                    <div className="h-2.5 rounded-full bg-subtle"><div className="h-full rounded-full bg-success" style={{ width: `${s.averagePct ?? 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-4 text-caption text-fg-secondary">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-success" /> Your child</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-fg-tertiary" /> Section average</span>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Progress across exams" description="Overall percentage in each test and exam, oldest first." />
          <div className="flex flex-1 items-center px-4 pb-4">
            <ProgressChart points={p.exams.map((e) => ({ label: e.name, value: e.percentage, compare: e.sectionAveragePct }))} />
          </div>
          <ul className="grid grid-cols-3 gap-px border-t border-border bg-border">
            {p.exams.slice(-3).map((e) => (
              <li key={e.examId} className="min-w-0 bg-surface px-3 py-3 sm:px-4">
                <div className="truncate text-caption text-fg-tertiary">{e.name}</div>
                <div className={cn('tabular text-body font-semibold sm:text-h3', pctTone(e.percentage))}>{formatPercent(e.percentage)}</div>
                <div className="text-caption text-fg-secondary">{[e.grade && `Grade ${e.grade}`, e.rankInSection && `Rank ${e.rankInSection}`].filter(Boolean).join(' · ') || ' '}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1"><BookOpen className="size-4" />{p.subjects.length} subjects</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1"><FileText className="size-4" />{p.exams.length} exams</span>
      </div>
      <div className="flex flex-col gap-3">
        {p.subjects.map((s) => (
          <SubjectCard key={s.subject.id} s={s} open={openId === s.subject.id} onToggle={() => setOpenId(openId === s.subject.id ? null : s.subject.id)} />
        ))}
      </div>
    </div>
  );
}
