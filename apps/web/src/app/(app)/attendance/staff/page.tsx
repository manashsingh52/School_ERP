'use client';

import type { AttendanceStatus, StaffAttendanceDay } from '@schoolos/contracts';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, GraduationCap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AttendanceTabs } from '@/components/attendance/attendance-tabs';
import { DateStepper } from '@/components/attendance/date-stepper';
import { StatusPicker } from '@/components/attendance/status-picker';
import { Gate } from '@/components/gate';
import { ApiError, apiFetch, apiPut } from '@/lib/api-client';
import { todayISO } from '@/lib/format';
import { ATTENDANCE, ATTENDANCE_ORDER } from '@/lib/labels';

function StaffAttendanceContent() {
  const [date, setDate] = useState(todayISO());
  const query = useQuery({
    queryKey: ['staff-attendance', date],
    queryFn: () => apiFetch<{ data: StaffAttendanceDay }>(`/staff-attendance?date=${date}`).then((r) => r.data),
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Attendance" description="Who is in school today" />
      <AttendanceTabs />
      <DateStepper value={date} onChange={setDate} />
      {query.isError ? (
        <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>
      ) : !query.data ? (
        <Skeleton className="h-96" />
      ) : !query.data.teachers.length ? (
        <Card><EmptyState icon={<GraduationCap />} title="No teachers yet" description="Add teachers to track staff attendance." /></Card>
      ) : (
        <StaffSheet key={date} data={query.data} />
      )}
    </div>
  );
}

function StaffSheet({ data }: { data: StaffAttendanceDay }) {
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus | null>>(() => Object.fromEntries(data.teachers.map((t) => [t.teacherId, t.status])));
  const [saving, setSaving] = useState(false);
  const changed = data.teachers.filter((t) => marks[t.teacherId] && marks[t.teacherId] !== t.status);
  const counts = useMemo(() => {
    const c: Partial<Record<AttendanceStatus, number>> = {};
    for (const s of Object.values(marks)) if (s) c[s] = (c[s] ?? 0) + 1;
    return c;
  }, [marks]);

  async function save() {
    setSaving(true);
    try {
      const res = await apiPut<{ data: StaffAttendanceDay }>('/staff-attendance', {
        date: data.date,
        records: changed.map((t) => ({ teacherId: t.teacherId, status: marks[t.teacherId]! })),
      });
      qc.setQueryData(['staff-attendance', data.date], res.data);
      toast.success('Staff attendance saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-3 text-small text-fg-secondary">
            {ATTENDANCE_ORDER.map((s) => (counts[s] ? <span key={s}><span className="font-semibold text-fg">{counts[s]}</span> {ATTENDANCE[s].label.toLowerCase()}</span> : null))}
            {!Object.keys(counts).length && 'Nobody marked yet'}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, s]) => [id, s ?? 'PRESENT'])))}>
            <CheckCheck /> Mark rest present
          </Button>
        </div>
        {data.teachers.map((t) => (
          <div key={t.teacherId} className="flex flex-col gap-2 border-b border-border px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-body font-medium">{t.name}</div>
              <div className="text-caption text-fg-tertiary">{t.employeeId}</div>
            </div>
            <StatusPicker name={t.name} value={marks[t.teacherId] ?? null} onChange={(s) => setMarks((m) => ({ ...m, [t.teacherId]: s }))} />
          </div>
        ))}
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => void save()} loading={saving} disabled={!changed.length}>
          Save {changed.length ? `(${changed.length})` : ''}
        </Button>
      </div>
    </div>
  );
}

export default function StaffAttendancePage() {
  return (
    <Gate any={['staff_attendance.manage']}>
      <StaffAttendanceContent />
    </Gate>
  );
}
