'use client';

import type { HomeworkItem, NoticeItem, StudentAttendanceHistory, TodaySchedule } from '@schoolos/contracts';
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton, cn } from '@schoolos/ui';
import { ArrowRight, Megaphone, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { TodayClasses } from '@/components/dashboard/today-classes';
import { dueBadge } from '@/components/homework/homework-bits';
import { ForChild } from '@/components/parent/parent-gate';
import { useChild } from '@/lib/child';
import { formatPercent, timeAgo, todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { ATTENDANCE } from '@/lib/labels';

function TodayStatus({ studentId, firstName }: { studentId: string; firstName: string }) {
  const today = todayISO();
  const day = useData<StudentAttendanceHistory>(['attendance', 'child', studentId, 'today'], `/students/${studentId}/attendance?from=${today}&to=${today}`);
  const year = useData<StudentAttendanceHistory>(['attendance', 'child', studentId, 'year'], `/students/${studentId}/attendance`);
  if (!day.data) return <Skeleton className="h-[92px]" />;
  const mark = day.data.days[0];
  const tone = mark ? { PRESENT: 'text-success', ABSENT: 'text-danger', LATE: 'text-warning', HALF_DAY: 'text-info', LEAVE: 'text-fg-secondary' }[mark.status] : 'text-fg-tertiary';
  return (
    <Link href="/my/attendance" className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between text-small text-fg-secondary">
        Today
        <ArrowRight className="size-4 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className={cn('mt-1 text-h2 font-semibold', tone)}>{mark ? `${firstName} is ${ATTENDANCE[mark.status].label.toLowerCase()}` : 'Not marked yet'}</div>
      <div className="mt-1 text-caption text-fg-tertiary">{year.data ? `${formatPercent(year.data.percentPresent)} attendance this year` : ' '}</div>
    </Link>
  );
}

function ChildHome({ child }: { child: NonNullable<ReturnType<typeof useChild>['child']> }) {
  const today = useData<TodaySchedule>(['timetable', 'today', child.id], `/timetables/today?studentId=${child.id}`);
  const hw = useData<HomeworkItem[]>(['homework', 'child', child.id, 'home'], `/homework?studentId=${child.id}&pageSize=3`);
  const notices = useData<NoticeItem[]>(['notices', 'home'], '/notices?pageSize=3');
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={child.name} size={48} />
        <div>
          <div className="text-h2 font-semibold">{child.name}</div>
          <div className="text-small text-fg-secondary">{child.classLabel ? `Class ${child.classLabel}` : 'Not in a class this year'}</div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <TodayStatus studentId={child.id} firstName={child.firstName} />
          {today.data ? <TodayClasses today={today.data} title={`${child.firstName}'s day`} empty="The timetable isn't published yet." /> : today.isPending && <Skeleton className="h-64" />}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Homework" action={<Link href="/my/homework" className="text-small text-accent-strong hover:underline">All</Link>} />
            {!hw.data ? (
              <div className="p-5"><Skeleton className="h-20" /></div>
            ) : !hw.data.length ? (
              <EmptyState icon={<NotebookPen />} title="No homework yet" />
            ) : (
              <ul className="mt-3 border-t border-border">
                {hw.data.map((h) => (
                  <li key={h.id} className="border-b border-border px-5 py-3 last:border-b-0">
                    <Link href="/my/homework" className="block">
                      <div className="flex flex-wrap items-center gap-1.5"><Badge tone="accent">{h.subject.name}</Badge>{dueBadge(h.dueDate)}</div>
                      <div className="mt-1 truncate text-body font-medium">{h.title}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Notices" action={<Link href="/notices" className="text-small text-accent-strong hover:underline">All</Link>} />
            {!notices.data ? (
              <div className="p-5"><Skeleton className="h-20" /></div>
            ) : !notices.data.length ? (
              <EmptyState icon={<Megaphone />} title="No notices yet" />
            ) : (
              <ul className="mt-3 border-t border-border">
                {notices.data.map((n) => (
                  <li key={n.id} className="border-b border-border last:border-b-0">
                    <Link href={`/notices/${n.id}`} className="flex items-start gap-2 px-5 py-3 hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-body', !n.readAt ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                        <span className="block text-caption text-fg-tertiary">{n.publishedAt ? timeAgo(n.publishedAt) : ''}</span>
                      </span>
                      {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ParentHome() {
  return <ForChild>{(child) => <ChildHome key={child.id} child={child} />}</ForChild>;
}
