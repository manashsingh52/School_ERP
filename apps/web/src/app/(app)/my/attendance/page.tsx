'use client';

import type { AttendanceStatus, StudentAttendanceHistory } from '@schoolos/contracts';
import { Button, Card, ErrorState, PageHeader, Skeleton, cn } from '@schoolos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ForChild } from '@/components/parent/parent-gate';
import { ApiError } from '@/lib/api-client';
import { addMonths, formatMonth, formatPercent, todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { ATTENDANCE, ATTENDANCE_ORDER } from '@/lib/labels';

const CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success-bg text-success border-success-border',
  ABSENT: 'bg-danger-bg text-danger border-danger-border font-semibold',
  LATE: 'bg-warning-bg text-warning border-warning-border',
  HALF_DAY: 'bg-info-bg text-info border-info-border',
  LEAVE: 'bg-subtle text-fg-secondary border-border',
};

function Calendar({ studentId, month }: { studentId: string; month: string }) {
  const first = `${month}-01`;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const last = `${month}-${String(days).padStart(2, '0')}`;
  const history = useData<StudentAttendanceHistory>(['attendance', 'child', studentId, month], `/students/${studentId}/attendance?from=${first}&to=${last}`);
  if (history.isError) return <Card><ErrorState message={history.error instanceof ApiError ? history.error.message : undefined} onRetry={() => void history.refetch()} /></Card>;
  if (!history.data) return <Skeleton className="h-80" />;
  const marks = new Map(history.data.days.map((d) => [d.date, d]));
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const today = todayISO();
  const c = history.data.counts;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <Card className="p-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-caption font-medium text-fg-tertiary">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {Array.from({ length: offset }, (_, i) => <div key={`pad${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`;
            const m = marks.get(date);
            return (
              <div
                key={date}
                title={m ? `${ATTENDANCE[m.status].label}${m.remark ? ` — ${m.remark}` : ''}` : undefined}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-md border text-small',
                  m ? CELL[m.status] : 'border-transparent text-fg-tertiary',
                  date === today && 'ring-2 ring-accent/40',
                )}
              >
                <span className="tabular">{i + 1}</span>
                {m && <span className="text-[10px] leading-none">{ATTENDANCE[m.status].short}</span>}
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-small text-fg-secondary">This month</div>
        <div className="tabular mt-1 text-h1 font-semibold">{formatPercent(history.data.percentPresent)}</div>
        <dl className="mt-3 flex flex-col gap-1.5 text-small">
          {ATTENDANCE_ORDER.map((s) => (
            <div key={s} className="flex items-center justify-between">
              <dt className="flex items-center gap-2"><span className={cn('size-2.5 rounded-sm border', CELL[s])} />{ATTENDANCE[s].label}</dt>
              <dd className="tabular">{c[s]}</dd>
            </div>
          ))}
        </dl>
        {history.data.days.some((d) => d.remark) && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1 text-caption font-medium text-fg-tertiary">Notes</div>
            {history.data.days.filter((d) => d.remark).map((d) => (
              <p key={d.date} className="text-small"><span className="tabular text-fg-tertiary">{Number(d.date.slice(8))} · </span>{d.remark}</p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function YearSummary({ studentId }: { studentId: string }) {
  const year = useData<StudentAttendanceHistory>(['attendance', 'child', studentId, 'year'], `/students/${studentId}/attendance`);
  if (!year.data) return null;
  return <span>{formatPercent(year.data.percentPresent)} present this year · {year.data.counts.ABSENT} day{year.data.counts.ABSENT === 1 ? '' : 's'} absent</span>;
}

export default function ChildAttendancePage() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s attendance`} description={<YearSummary studentId={child.id} />} />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></Button>
            <span className="min-w-36 text-center text-body font-medium">{formatMonth(month)}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= todayISO().slice(0, 7)} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></Button>
          </div>
          <Calendar key={`${child.id}-${month}`} studentId={child.id} month={month} />
        </div>
      )}
    </ForChild>
  );
}
