'use client';

import type { TodaySchedule } from '@schoolos/contracts';
import { Card, CardHeader, EmptyState, cn } from '@schoolos/ui';
import { CalendarClock, Coffee } from 'lucide-react';
import Link from 'next/link';
import { clock, nowHHMM } from '@/lib/timetable';

/** Today's periods with the current one highlighted and the next one marked. */
export function TodayClasses({ today, title = "Today's classes", empty = 'No classes today.' }: { today: TodaySchedule; title?: string; empty?: string }) {
  const now = nowHHMM();
  const slots = today.slots;
  const childDay = today.for.kind === 'section'; // a child's day vs a teacher's own classes
  const next = slots.find((s) => !s.isBreak && s.startTime > now);
  return (
    <Card>
      <CardHeader title={title} action={<Link href={childDay ? '/my/timetable' : '/timetable?tab=teachers'} className="text-small text-accent-strong hover:underline">Full week</Link>} />
      {today.isWeeklyOff ? (
        <EmptyState icon={<CalendarClock />} title="Weekly off" description="No school today." />
      ) : !slots.length ? (
        <EmptyState icon={<CalendarClock />} title={empty} />
      ) : (
        <ol className="mt-3 border-t border-border">
          {slots.map((s, i) => {
            const current = s.startTime <= now && now < s.endTime;
            return (
              <li key={i} className={cn('flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0', current && 'bg-accent-tint')}>
                <span className="tabular w-24 shrink-0 text-small text-fg-tertiary">{clock(s.startTime)}–{clock(s.endTime)}</span>
                {s.isBreak ? (
                  <span className="inline-flex items-center gap-1.5 text-small text-fg-tertiary"><Coffee className="size-3.5" /> {s.periodName}</span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium">
                      {childDay ? (s.subject?.name ?? 'Free period') : `${s.section?.label} · ${s.subject?.name ?? '—'}`}
                    </span>
                    {childDay && s.teacher && <span className="block truncate text-caption text-fg-secondary">{s.teacher.name}</span>}
                    {s.room && !childDay && <span className="block text-caption text-fg-secondary">Room {s.room}</span>}
                  </span>
                )}
                {current && <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent-strong">Now</span>}
                {!current && next === s && <span className="ml-auto rounded-full bg-subtle px-2 py-0.5 text-caption text-fg-secondary">Next</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
