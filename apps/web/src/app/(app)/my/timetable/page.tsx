'use client';

import type { TimetableView } from '@schoolos/contracts';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, cn } from '@schoolos/ui';
import { CalendarClock, Coffee } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ForChild } from '@/components/parent/parent-gate';
import { WeekGrid, cellKey, type GridCell } from '@/components/timetable/week-grid';
import { ApiError } from '@/lib/api-client';
import { todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { DAY_SHORT, clock, isoDay, nowHHMM } from '@/lib/timetable';

function ChildTimetable({ sectionId }: { sectionId: string }) {
  const tt = useData<TimetableView | null>(['timetable', 'section', sectionId], `/timetables?sectionId=${sectionId}`);
  const todayDow = isoDay(todayISO());
  const [day, setDay] = useState<number | null>(null);
  const cells = useMemo(() => new Map((tt.data?.entries ?? []).map((e) => [cellKey(e.dayOfWeek, e.periodId), e as GridCell])), [tt.data]);
  if (tt.isError) return <Card><ErrorState message={tt.error instanceof ApiError ? tt.error.message : undefined} onRetry={() => void tt.refetch()} /></Card>;
  if (tt.data === undefined) return <Skeleton className="h-80" />;
  if (!tt.data) return <Card><EmptyState icon={<CalendarClock />} title="Timetable not published yet" description="It will appear here once the school publishes it." /></Card>;
  const view = tt.data;
  const shown = day ?? (view.days.includes(todayDow) ? todayDow : view.days[0]!);
  const now = nowHHMM();
  return (
    <>
      {/* Phones: one day at a time. */}
      <div className="flex flex-col gap-3 md:hidden">
        <Tabs<string> value={String(shown)} onChange={(v) => setDay(Number(v))} items={view.days.map((d) => ({ value: String(d), label: d === todayDow ? 'Today' : DAY_SHORT[d] }))} />
        <Card>
          {view.bellSchedule.periods.map((p) => {
            const c = cells.get(cellKey(shown, p.id));
            const current = shown === todayDow && p.startTime <= now && now < p.endTime;
            return (
              <div key={p.id} className={cn('flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0', current && 'bg-accent-tint')}>
                <span className="tabular w-20 shrink-0 text-small text-fg-tertiary">{clock(p.startTime)}–{clock(p.endTime)}</span>
                {p.isBreak ? (
                  <span className="inline-flex items-center gap-1.5 text-small text-fg-tertiary"><Coffee className="size-3.5" /> {p.name}</span>
                ) : (
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium">{c?.subject?.name ?? 'Free period'}</div>
                    {c?.teacher && <div className="truncate text-caption text-fg-secondary">{c.teacher.name}{c.room ? ` · ${c.room}` : ''}</div>}
                  </div>
                )}
                {current && <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent-strong">Now</span>}
              </div>
            );
          })}
        </Card>
      </div>
      {/* Larger screens: the whole week. */}
      <Card className="hidden p-2 md:block">
        <WeekGrid days={view.days} periods={view.bellSchedule.periods} cells={cells} today={todayDow} />
      </Card>
    </>
  );
}

export default function ChildTimetablePage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s timetable`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          {child.sectionId ? <ChildTimetable key={child.sectionId} sectionId={child.sectionId} /> : <Card><EmptyState icon={<CalendarClock />} title="Not in a class this year" /></Card>}
        </div>
      )}
    </ForChild>
  );
}
