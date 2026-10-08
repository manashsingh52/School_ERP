'use client';

import type { TeacherWeek } from '@schoolos/contracts';
import { Card, EmptyState, ErrorState, Skeleton, cn } from '@schoolos/ui';
import { CalendarClock } from 'lucide-react';
import { useData } from '@/lib/hooks';
import { ApiError } from '@/lib/api-client';
import { todayISO } from '@/lib/format';
import { DAY_SHORT, clock, isoDay } from '@/lib/timetable';

/** A teacher's week: one column per working day, classes in time order. */
export function TeacherWeekView({ teacherId }: { teacherId: string }) {
  const week = useData<TeacherWeek>(['timetable', 'teacher', teacherId], `/teachers/${teacherId}/timetable`);
  if (week.isError) return <Card><ErrorState message={week.error instanceof ApiError ? week.error.message : undefined} onRetry={() => void week.refetch()} /></Card>;
  if (!week.data) return <Skeleton className="h-80" />;
  const { days, slots } = week.data;
  const today = isoDay(todayISO());
  if (!slots.length) {
    return <Card><EmptyState icon={<CalendarClock />} title={`${week.data.teacher.name} has no classes in published timetables`} /></Card>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-fg-secondary">{week.data.periodsPerWeek} periods a week</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {days.map((d) => {
          const mine = slots.filter((s) => s.dayOfWeek === d);
          return (
            <Card key={d} className={cn('flex flex-col', d === today && 'border-accent/40')}>
              <div className={cn('border-b border-border px-3 py-2 text-small font-semibold', d === today && 'text-accent-strong')}>
                {DAY_SHORT[d]} <span className="font-normal text-fg-tertiary">· {mine.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {mine.length ? (
                  mine.map((s, i) => (
                    <div key={i} className="rounded-md border border-border px-2.5 py-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-small font-medium">{s.section?.label}</span>
                        <span className="tabular text-caption text-fg-tertiary">{clock(s.startTime)}</span>
                      </div>
                      <div className="truncate text-caption text-fg-secondary">{s.subject?.name ?? '—'}{s.room ? ` · ${s.room}` : ''}</div>
                    </div>
                  ))
                ) : (
                  <p className="px-1 py-2 text-caption text-fg-tertiary">Free</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
