'use client';

import type { AttendanceOverview } from '@schoolos/contracts';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, TD, TH, THead, TR, Table, TableSkeleton } from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CalendarOff, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AttendanceTabs } from '@/components/attendance/attendance-tabs';
import { DateStepper } from '@/components/attendance/date-stepper';
import { Gate } from '@/components/gate';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatNumber, formatPercent, todayISO } from '@/lib/format';
import { REGISTER_STATUS } from '@/lib/labels';
import { useMe } from '@/lib/me';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-small text-fg-secondary">{label}</div>
      <div className="tabular mt-1 text-h2 font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-caption text-fg-tertiary">{hint}</div>}
    </Card>
  );
}

function AttendanceOverviewContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useMe();
  const date = params.get('date') ?? todayISO();
  const setDate = (d: string) => router.replace(d === todayISO() ? '/attendance' : `/attendance?date=${d}`);

  const query = useQuery({
    queryKey: ['attendance', 'overview', date],
    queryFn: () => apiFetch<{ data: AttendanceOverview }>(`/attendance/overview?date=${date}`).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const open = (sectionId: string) => router.push(`/attendance/${sectionId}${date === todayISO() ? '' : `?date=${date}`}`);
  const toMark = data?.sections.filter((s) => s.canMark && s.status !== 'SUBMITTED') ?? [];
  const wholeSchool = can('attendance.view', ['ALL']);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description={wholeSchool ? 'Daily registers for every section' : 'Registers for your sections'}
        actions={
          can('school.settings.manage') && (
            <Button variant="secondary" asChild>
              <Link href="/settings/attendance"><Settings2 /> Rules</Link>
            </Button>
          )
        }
      />
      <AttendanceTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateStepper value={date} onChange={setDate} />
        {data?.isWeeklyOff && <Badge tone="neutral"><CalendarOff className="size-3" /> Weekly off</Badge>}
      </div>

      {toMark.length > 0 && !wholeSchool && (
        <div className="flex flex-col gap-2">
          {toMark.map((s) => (
            <Card key={s.sectionId} className="flex items-center justify-between gap-4 border-accent/30 bg-accent-tint p-4">
              <div>
                <div className="text-body font-semibold">Take attendance for {s.label}</div>
                <div className="text-small text-fg-secondary">{s.students} students · {REGISTER_STATUS[s.status].label.toLowerCase()}</div>
              </div>
              <Button onClick={() => open(s.sectionId)}>Open register <ArrowRight /></Button>
            </Card>
          ))}
        </div>
      )}

      {query.isError ? (
        <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>
      ) : (
        <>
          {wholeSchool && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {data ? (
                <>
                  <Kpi label="Present" value={formatPercent(data.totals.percentPresent)} hint={data.totals.sectionsTaken ? `${formatNumber(data.totals.PRESENT + data.totals.LATE)} students` : 'No registers yet'} />
                  <Kpi label="Absent" value={formatNumber(data.totals.ABSENT)} hint={data.totals.LEAVE ? `+${data.totals.LEAVE} on leave` : undefined} />
                  <Kpi label="Late" value={formatNumber(data.totals.LATE)} />
                  <Kpi label="Registers in" value={`${data.totals.sectionsTaken} / ${data.totals.sectionsTotal}`} hint={data.totals.sectionsTaken < data.totals.sectionsTotal ? `${data.totals.sectionsTotal - data.totals.sectionsTaken} still to come` : 'All done'} />
                </>
              ) : (
                Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)
              )}
            </div>
          )}
          <Card className="overflow-hidden">
            {data && !data.sections.length ? (
              <EmptyState icon={<CalendarCheck />} title="No sections to show" description={wholeSchool ? 'Add classes and sections in Academics first.' : "You aren't class teacher of a section this year."} />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Section</TH>
                    <TH>Class teacher</TH>
                    <TH className="w-32">Register</TH>
                    <TH className="w-24 text-right">Students</TH>
                    <TH className="w-24 text-right">Present</TH>
                    <TH className="w-24 text-right">Absent</TH>
                    <TH className="w-24 text-right">Late</TH>
                  </tr>
                </THead>
                <tbody>
                  {!data ? (
                    <TableSkeleton columns={7} rows={6} />
                  ) : (
                    data.sections.map((s) => {
                      const done = s.status === 'SUBMITTED';
                      return (
                        <TR key={s.sectionId} interactive tabIndex={0} onClick={() => open(s.sectionId)} onKeyDown={(e) => e.key === 'Enter' && open(s.sectionId)}>
                          <TD className="font-medium">{s.label}</TD>
                          <TD className="text-fg-secondary">{s.classTeacher ?? '—'}</TD>
                          <TD><Badge tone={REGISTER_STATUS[s.status].tone} dot>{REGISTER_STATUS[s.status].label}</Badge></TD>
                          <TD className="tabular text-right">{s.students}</TD>
                          <TD className="tabular text-right">{done ? s.present : '—'}</TD>
                          <TD className={`tabular text-right ${done && s.absent ? 'font-medium text-danger' : ''}`}>{done ? s.absent : '—'}</TD>
                          <TD className="tabular text-right">{done ? s.late : '—'}</TD>
                        </TR>
                      );
                    })
                  )}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Gate any={['attendance.view']} scopes={['ALL', 'ASSIGNED']}>
      <Suspense>
        <AttendanceOverviewContent />
      </Suspense>
    </Gate>
  );
}
