'use client';

import type { AttendanceRegister, AttendanceStatus, SectionMonth } from '@schoolos/contracts';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Kbd, PageHeader, Skeleton, Tabs, cn, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, CheckCheck, ChevronLeft, ChevronRight, Lock, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { DateStepper } from '@/components/attendance/date-stepper';
import { StatusCell, StatusPicker } from '@/components/attendance/status-picker';
import { Gate } from '@/components/gate';
import { ApiError, apiFetch, apiPut } from '@/lib/api-client';
import { addMonths, formatMonth, formatPercent, todayISO } from '@/lib/format';
import { ATTENDANCE, ATTENDANCE_ORDER, REGISTER_STATUS } from '@/lib/labels';

type Mark = { status: AttendanceStatus | null; remark: string };
type View = 'day' | 'month';

function RegisterPageContent() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const date = params.get('date') ?? todayISO();
  const view: View = params.get('view') === 'month' ? 'month' : 'day';
  const dirtyRef = useRef(false);

  const go = (next: { date?: string; view?: View; month?: string }) => {
    if (dirtyRef.current && !window.confirm('You have unsaved marks. Leave without saving?')) return;
    const q = new URLSearchParams();
    const d = next.date ?? date;
    if (d !== todayISO()) q.set('date', d);
    if ((next.view ?? view) === 'month') q.set('view', 'month');
    if (next.month) q.set('month', next.month);
    else if (params.get('month') && (next.view ?? view) === 'month') q.set('month', params.get('month')!);
    router.replace(`/attendance/${sectionId}${q.size ? `?${q}` : ''}`);
  };

  const register = useQuery({
    queryKey: ['attendance', 'register', sectionId, date],
    queryFn: () => apiFetch<{ data: AttendanceRegister }>(`/sections/${sectionId}/attendance?date=${date}`).then((r) => r.data),
  });
  const data = register.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/attendance" className="inline-flex items-center gap-1 text-small text-fg-secondary hover:text-fg">
          <ChevronLeft className="size-3.5" /> Attendance
        </Link>
        <PageHeader
          className="mt-2"
          title={data ? `${data.section.label} register` : <Skeleton className="h-8 w-48" />}
          description={data ? (data.section.classTeacher ? `Class teacher: ${data.section.classTeacher}` : 'No class teacher assigned') : undefined}
          actions={view === 'day' && <DateStepper value={date} onChange={(d) => go({ date: d })} />}
        />
      </div>
      <Tabs<View>
        value={view}
        onChange={(v) => go({ view: v })}
        items={[
          { value: 'day', label: 'Daily register' },
          { value: 'month', label: 'Month' },
        ]}
      />
      {view === 'month' ? (
        <MonthGrid sectionId={sectionId} month={params.get('month') ?? date.slice(0, 7)} onMonth={(m) => go({ month: m })} onDay={(d) => go({ date: d, view: 'day' })} />
      ) : register.isError ? (
        <Card><ErrorState message={register.error instanceof ApiError ? register.error.message : undefined} onRetry={() => void register.refetch()} /></Card>
      ) : !data ? (
        <Skeleton className="h-[480px]" />
      ) : (
        <Register key={`${data.date}|${data.status}|${data.submittedAt}`} data={data} dirtyRef={dirtyRef} />
      )}
    </div>
  );
}

function Register({ data, dirtyRef }: { data: AttendanceRegister; dirtyRef: React.RefObject<boolean> }) {
  const qc = useQueryClient();
  const initial = useMemo(() => Object.fromEntries(data.students.map((s) => [s.studentId, { status: s.status, remark: s.remark ?? '' }])) as Record<string, Mark>, [data]);
  const [marks, setMarks] = useState(initial);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const readOnly = !data.editable;
  const submitted = data.status === 'SUBMITTED';

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, unmarked: 0 };
    for (const m of Object.values(marks)) {
      if (m.status) c[m.status]++;
      else c.unmarked++;
    }
    return c;
  }, [marks]);
  const changed = data.students.filter((s) => {
    const m = marks[s.studentId]!;
    return m.status !== s.status || m.remark.trim() !== (s.remark ?? '');
  });
  const dirty = changed.length > 0;
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (studentId: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [studentId]: { ...m[studentId]!, ...patch } }));
  // Fills only the gaps — never overwrites an absence already marked.
  const markRestPresent = () => setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, { ...x, status: x.status ?? 'PRESENT' }])));

  const focusRow = (i: number) => rows.current[Math.max(0, Math.min(i, data.students.length - 1))]?.focus();
  const onRowKey = (e: React.KeyboardEvent, i: number, studentId: string) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      focusRow(i + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      focusRow(i - 1);
    } else if (!readOnly && !e.metaKey && !e.ctrlKey) {
      const status = ATTENDANCE_ORDER.find((s) => ATTENDANCE[s].key === e.key.toLowerCase());
      if (status) {
        e.preventDefault();
        set(studentId, { status });
        focusRow(i + 1);
      }
    }
  };

  async function save(submit: boolean) {
    setSaving(submit ? 'submit' : 'draft');
    try {
      const records = data.students
        .filter((s) => marks[s.studentId]!.status)
        .map((s) => ({ studentId: s.studentId, status: marks[s.studentId]!.status!, remark: marks[s.studentId]!.remark.trim() || undefined }));
      const res = await apiPut<{ data: AttendanceRegister }>(`/sections/${data.section.id}/attendance`, { date: data.date, records, submit });
      dirtyRef.current = false;
      qc.setQueryData(['attendance', 'register', data.section.id, data.date], res.data);
      void qc.invalidateQueries({ queryKey: ['attendance', 'overview'] });
      if (!submit) toast.success('Draft saved');
      else if (submitted) toast.success('Changes saved');
      else toast.success(res.data.counts.ABSENT ? `Attendance submitted · ${res.data.counts.ABSENT} absent. Parents will be told.` : 'Attendance submitted · everyone present');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the register. Please try again.');
    } finally {
      setSaving(null);
    }
  }

  if (!data.students.length) {
    return (
      <Card>
        <EmptyState icon={<Users />} title="No students in this section" description="Add students or move them into this section first." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.isWeeklyOff && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-subtle px-4 py-3 text-small text-fg-secondary">
          <CalendarOff className="size-4 shrink-0" /> This is a weekly off. Take attendance only if school was open.
        </div>
      )}
      {readOnly && data.lockedReason && (
        <div className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-small text-warning">
          <Lock className="size-4 shrink-0" /> {data.lockedReason}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={REGISTER_STATUS[data.status].tone} dot>{REGISTER_STATUS[data.status].label}</Badge>
            {data.takenBy && <span className="text-small text-fg-tertiary">by {data.takenBy}</span>}
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
            {ATTENDANCE_ORDER.map((s) =>
              counts[s] ? (
                <span key={s} className="tabular text-small text-fg-secondary">
                  <span className="font-semibold text-fg">{counts[s]}</span> {ATTENDANCE[s].label.toLowerCase()}
                </span>
              ) : null,
            )}
            {counts.unmarked > 0 && <span className="tabular text-small font-medium text-warning">{counts.unmarked} not marked</span>}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1 text-caption text-fg-tertiary lg:flex">
                <Kbd>↑</Kbd><Kbd>↓</Kbd> move · <Kbd>P</Kbd><Kbd>A</Kbd><Kbd>L</Kbd><Kbd>H</Kbd><Kbd>V</Kbd> mark
              </span>
              {counts.unmarked > 0 && (
                <Button variant="secondary" size="sm" onClick={markRestPresent}>
                  <CheckCheck /> {counts.unmarked === data.students.length ? 'Mark all present' : 'Mark rest present'}
                </Button>
              )}
            </div>
          )}
        </div>

        <div role="list" aria-label="Students">
          {data.students.map((s, i) => {
            const m = marks[s.studentId]!;
            const needsReason = m.status && m.status !== 'PRESENT';
            return (
              <div
                key={s.studentId}
                role="listitem"
                ref={(el) => {
                  rows.current[i] = el;
                }}
                tabIndex={0}
                onKeyDown={(e) => onRowKey(e, i, s.studentId)}
                className={cn(
                  'flex flex-col gap-2 border-b border-border px-4 py-2.5 last:border-b-0 focus-visible:bg-accent-tint focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4',
                  m.status === 'ABSENT' && 'bg-danger-bg/40',
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="tabular w-7 shrink-0 text-right text-small text-fg-tertiary">{s.rollNo ?? '—'}</span>
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium">{s.name}</div>
                    <div className="text-caption text-fg-tertiary">Adm. {s.admissionNo}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-10 sm:pl-0">
                  {needsReason && (
                    <Input
                      value={m.remark}
                      onChange={(e) => set(s.studentId, { remark: e.target.value })}
                      placeholder="Reason (optional)"
                      maxLength={200}
                      disabled={readOnly}
                      className="h-8 w-full sm:w-44"
                      aria-label={`Reason for ${s.name}`}
                    />
                  )}
                  <StatusPicker name={s.name} value={m.status} onChange={(status) => set(s.studentId, { status })} disabled={readOnly} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <span className="mr-auto text-small text-fg-secondary">
            {submitted
              ? dirty
                ? `${changed.length} change${changed.length === 1 ? '' : 's'} — corrections are recorded.`
                : 'Submitted. You can still correct marks.'
              : counts.unmarked
                ? `${counts.unmarked} student${counts.unmarked === 1 ? '' : 's'} left to mark`
                : 'Everyone is marked.'}
          </span>
          {!submitted && (
            <Button variant="secondary" onClick={() => void save(false)} loading={saving === 'draft'} disabled={!!saving || !dirty}>
              Save draft
            </Button>
          )}
          <Button onClick={() => void save(true)} loading={saving === 'submit'} disabled={!!saving || counts.unmarked > 0 || (submitted && !dirty)}>
            {submitted ? 'Save changes' : 'Submit register'}
          </Button>
        </div>
      )}
    </div>
  );
}

function MonthGrid({ sectionId, month, onMonth, onDay }: { sectionId: string; month: string; onMonth: (m: string) => void; onDay: (d: string) => void }) {
  const query = useQuery({
    queryKey: ['attendance', 'month', sectionId, month],
    queryFn: () => apiFetch<{ data: SectionMonth }>(`/sections/${sectionId}/attendance/month?month=${month}`).then((r) => r.data),
  });
  const thisMonth = todayISO().slice(0, 7);
  const days = query.data?.days ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}><ChevronLeft /></Button>
        <span className="min-w-36 text-center text-body font-medium">{formatMonth(month)}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= thisMonth} onClick={() => onMonth(addMonths(month, 1))}><ChevronRight /></Button>
      </div>
      {query.isError ? (
        <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>
      ) : !query.data ? (
        <Skeleton className="h-96" />
      ) : !days.length ? (
        <Card><EmptyState icon={<CalendarOff />} title="No registers this month" description="Submitted registers appear here." /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-border text-caption text-fg-tertiary">
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">Student</th>
                {days.map((d) => (
                  <th key={d} className="px-1 py-2 text-center font-medium">
                    <button className="tabular rounded px-1 hover:bg-hover hover:text-fg" onClick={() => onDay(d)} title="Open this day">
                      {Number(d.slice(8))}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Present</th>
              </tr>
            </thead>
            <tbody>
              {query.data.students.map((s) => (
                <tr key={s.studentId} className="border-b border-border last:border-b-0 hover:bg-hover">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 whitespace-nowrap">
                    <span className="tabular mr-2 text-fg-tertiary">{s.rollNo ?? ''}</span>
                    <span className="font-medium">{s.name}</span>
                  </td>
                  {days.map((d) => (
                    <td key={d} className="px-1 py-2 text-center">
                      <StatusCell status={s.marks[d]} />
                    </td>
                  ))}
                  <td className={cn('tabular px-3 py-2 text-right font-medium', s.percentPresent !== null && s.percentPresent < 75 && 'text-danger')}>
                    {formatPercent(s.percentPresent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Gate any={['attendance.view']} scopes={['ALL', 'ASSIGNED']}>
      <Suspense>
        <RegisterPageContent />
      </Suspense>
    </Gate>
  );
}
