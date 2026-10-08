'use client';

import { Badge, Card, EmptyState, PageHeader, Select, Skeleton, Tabs } from '@schoolos/ui';
import { CalendarClock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Gate } from '@/components/gate';
import { BellSchedules } from '@/components/timetable/bell-schedules';
import { SectionTimetable } from '@/components/timetable/section-timetable';
import { TeacherWeekView } from '@/components/timetable/teacher-week';
import { useTeacherOptions } from '@/lib/academics';
import { fullName } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

type Tab = 'sections' | 'teachers' | 'bells';
interface OverviewRow {
  sectionId: string;
  label: string;
  timetableId: string | null;
  status: 'DRAFT' | 'PUBLISHED' | null;
  filled: number;
}

function TimetablePageContent() {
  const { can, me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const canManage = can('timetable.manage');
  const myTeacherId = me.membership?.teacherId ?? null;
  const tab: Tab = (params.get('tab') as Tab) || (myTeacherId && !canManage ? 'teachers' : 'sections');
  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`/timetable${q.size ? `?${q}` : ''}`);
  };

  const overview = useData<OverviewRow[]>(['timetable', 'overview'], '/timetables/overview');
  const sectionId = params.get('section') ?? overview.data?.[0]?.sectionId ?? null;
  const teachers = useTeacherOptions(tab === 'teachers');
  const teacherId = params.get('teacher') ?? myTeacherId ?? teachers.data?.[0]?.id ?? null;
  const published = overview.data?.filter((s) => s.status === 'PUBLISHED').length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Timetable"
        description={overview.data ? `${published} of ${overview.data.length} sections published` : 'Weekly timetables for every section'}
      />
      <Tabs<Tab>
        value={tab}
        onChange={(v) => set({ tab: v })}
        items={[
          { value: 'sections', label: 'Sections' },
          { value: 'teachers', label: myTeacherId ? 'Teachers & mine' : 'Teachers' },
          { value: 'bells', label: 'Bell schedules' },
        ]}
      />

      {tab === 'sections' &&
        (!overview.data ? (
          <Skeleton className="h-96" />
        ) : !overview.data.length ? (
          <Card><EmptyState icon={<CalendarClock />} title="No sections this year" description="Add classes and sections in Academics first." /></Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={sectionId ?? ''} onChange={(e) => set({ section: e.target.value })} aria-label="Section" className="w-56">
                {overview.data.map((s) => (
                  <option key={s.sectionId} value={s.sectionId}>
                    {s.label} · {s.status === 'PUBLISHED' ? 'published' : s.status === 'DRAFT' ? 'draft' : 'not started'}
                  </option>
                ))}
              </Select>
              {canManage && (
                <div className="hidden flex-wrap gap-1 lg:flex">
                  {overview.data.map((s) => (
                    <button key={s.sectionId} onClick={() => set({ section: s.sectionId })} title={s.label}>
                      <Badge tone={s.sectionId === sectionId ? 'accent' : s.status === 'PUBLISHED' ? 'success' : s.status === 'DRAFT' ? 'warning' : 'neutral'}>{s.label}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sectionId && <SectionTimetable key={sectionId} sectionId={sectionId} canManage={canManage} />}
          </>
        ))}

      {tab === 'teachers' && (
        <>
          <Select value={teacherId ?? ''} onChange={(e) => set({ teacher: e.target.value })} aria-label="Teacher" className="w-64">
            {myTeacherId && <option value={myTeacherId}>My timetable</option>}
            {teachers.data?.filter((t) => t.id !== myTeacherId).map((t) => <option key={t.id} value={t.id}>{fullName(t.firstName, t.lastName)}</option>)}
          </Select>
          {teacherId && <TeacherWeekView key={teacherId} teacherId={teacherId} />}
        </>
      )}

      {tab === 'bells' && <BellSchedules canManage={canManage} />}
    </div>
  );
}

export default function TimetablePage() {
  return (
    <Gate any={['timetable.view']} scopes={['ALL', 'ASSIGNED']}>
      <Suspense>
        <TimetablePageContent />
      </Suspense>
    </Gate>
  );
}
