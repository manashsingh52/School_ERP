'use client';

import type { AttendanceStatus, StudentAttendanceHistory } from '@schoolos/contracts';
import { Button, Card, CardHeader, ErrorState, Skeleton, Tabs, cn } from '@schoolos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
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

const tone = (p: number | null) => (p === null ? '' : p >= 90 ? 'text-success' : p >= 75 ? 'text-fg' : 'text-danger');

/** Classes held / attended / missed and the percentage, for the whole session so far. */
function SessionTotals({ data }: { data: StudentAttendanceHistory }) {
  const s = data.summary;
  const items: [string, string, string?][] = [
    ['Classes held', String(s.conducted), 'Days a register was taken'],
    ['Attended', String(s.attended), 'Present, late or half day'],
    ['Missed', String(s.missed), s.onLeave ? `${s.onLeave} more on approved leave` : 'Marked absent'],
    ['Attendance', formatPercent(s.percentPresent), 'This session'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([label, value, hint], i) => (
        <Card key={label} className="p-4">
          <div className="text-small text-fg-secondary">{label}</div>
          <div className={cn('tabular mt-1 text-h2 font-semibold', i === 2 && s.missed > 0 && 'text-danger', i === 3 && tone(s.percentPresent))}>{value}</div>
          <div className="mt-0.5 text-caption text-fg-tertiary">{hint}</div>
        </Card>
      ))}
    </div>
  );
}

/** One row per month of the session with a bar, so a dip stands out. */
function MonthTable({ data, onOpen }: { data: StudentAttendanceHistory; onOpen: (month: string) => void }) {
  if (!data.months.length) return <Card className="p-6 text-center text-body text-fg-secondary">No registers yet this session.</Card>;
  return (
    <Card>
      <CardHeader title="Month by month" description="Tap a month to see each day." />
      <ul className="mt-3 border-t border-border">
        {[...data.months].reverse().map((m) => (
          <li key={m.month}>
            <button type="button" onClick={() => onOpen(m.month)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-left last:border-b-0 hover:bg-hover">
              <span className="w-32 font-medium">{formatMonth(m.month)}</span>
              <span className="tabular text-small text-fg-secondary">{m.attended} of {m.conducted} days{m.missed ? ` · ${m.missed} missed` : ''}</span>
              <span className="ml-auto flex min-w-40 flex-1 items-center gap-3 sm:max-w-72">
                <span className="h-2 flex-1 rounded-full bg-subtle">
                  <span className={cn('block h-full rounded-full', (m.percentPresent ?? 0) >= 75 ? 'bg-success' : 'bg-danger')} style={{ width: `${m.percentPresent ?? 0}%` }} />
                </span>
                <span className={cn('tabular w-14 text-right font-semibold', tone(m.percentPresent))}>{formatPercent(m.percentPresent)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Calendar({ studentId, month }: { studentId: string; month: string }) {
  const first = `${month}-01`;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const last = `${month}-${String(days).padStart(2, '0')}`;
  const history = useData<StudentAttendanceHistory>(['attendance', 'child', studentId, month], `/students/${studentId}/attendance?from=${first}&to=${last}`);
  const [picked, setPicked] = useState<string | null>(null);
  if (history.isError) return <Card><ErrorState message={history.error instanceof ApiError ? history.error.message : undefined} onRetry={() => void history.refetch()} /></Card>;
  if (!history.data) return <Skeleton className="h-80" />;
  const marks = new Map(history.data.days.map((d) => [d.date, d]));
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const today = todayISO();
  const c = history.data.counts;
  const day = picked ? marks.get(picked) : undefined;
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
              <button
                type="button"
                key={date}
                onClick={() => setPicked(date)}
                title={m ? `${ATTENDANCE[m.status].label}${m.remark ? ` — ${m.remark}` : ''}` : undefined}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-md border text-small',
                  m ? CELL[m.status] : 'border-transparent text-fg-tertiary',
                  date === today && 'ring-2 ring-accent/40',
                  picked === date && 'outline-2 outline-offset-1 outline-accent',
                )}
              >
                <span className="tabular">{i + 1}</span>
                {m && <span className="text-[10px] leading-none">{ATTENDANCE[m.status].short}</span>}
              </button>
            );
          })}
        </div>
        {picked && (
          <p className="mt-3 rounded-md bg-subtle px-3 py-2 text-small" aria-live="polite">
            <b>{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${picked}T00:00:00Z`))}:</b>{' '}
            {day ? `${ATTENDANCE[day.status].label}${day.remark ? ` — ${day.remark}` : ''}` : picked > today ? 'Not yet' : 'No register that day (holiday or weekend)'}
          </p>
        )}
      </Card>
      <Card className="p-4">
        <div className="text-small text-fg-secondary">This month</div>
        <div className="tabular mt-1 text-h1 font-semibold">{formatPercent(history.data.percentPresent)}</div>
        <div className="text-caption text-fg-tertiary">{history.data.summary.attended} of {history.data.summary.conducted} days attended</div>
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

/**
 * A child's attendance for the whole session: totals, month by month, and any day in a calendar.
 * Updates as soon as a teacher submits or corrects a register.
 */
export function StudentAttendance({ studentId }: { studentId: string }) {
  const session = useData<StudentAttendanceHistory>(['attendance', 'child', studentId, 'year'], `/students/${studentId}/attendance`);
  const [view, setView] = useState<'month' | 'session'>('month');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  if (session.isError) return <Card><ErrorState message={session.error instanceof ApiError ? session.error.message : undefined} onRetry={() => void session.refetch()} /></Card>;
  return (
    <div className="flex flex-col gap-4">
      {session.data ? <SessionTotals data={session.data} /> : <Skeleton className="h-24" />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<'month' | 'session'> value={view} onChange={setView} items={[{ value: 'month', label: 'Days' }, { value: 'session', label: 'Whole session' }]} />
        {view === 'month' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></Button>
            <span className="min-w-36 text-center text-body font-medium">{formatMonth(month)}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= todayISO().slice(0, 7)} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></Button>
          </div>
        )}
      </div>
      {view === 'month' ? (
        <Calendar key={`${studentId}-${month}`} studentId={studentId} month={month} />
      ) : session.data ? (
        <MonthTable data={session.data} onOpen={(m) => { setMonth(m); setView('month'); }} />
      ) : (
        <Skeleton className="h-64" />
      )}
    </div>
  );
}
