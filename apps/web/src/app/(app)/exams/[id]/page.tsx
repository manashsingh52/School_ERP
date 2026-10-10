'use client';

import type { ExamDetail } from '@schoolos/contracts';
import { Badge, Button, Card, ErrorState, Menu, MenuContent, MenuItem, MenuTrigger, PageHeader, Skeleton, Tabs, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, MoreHorizontal, PencilLine, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CoScholasticPanel } from '@/components/exams/co-scholastic-panel';
import { ExamSetup } from '@/components/exams/exam-setup';
import { MarksProgress } from '@/components/exams/marks-progress';
import { ReportCardsPanel } from '@/components/exams/report-cards-panel';
import { ResultsPanel } from '@/components/exams/results-panel';
import { Gate } from '@/components/gate';
import { ApiError, apiDelete, apiFetch, apiPatch } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { EXAM_STATUS } from '@/lib/labels';
import { useMe } from '@/lib/me';

type Tab = 'setup' | 'marks' | 'co' | 'results' | 'cards';

function ExamPageContent() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useMe();
  const canManage = can('exam.manage');
  const exam = useQuery({ queryKey: ['exams', id, 'detail'], queryFn: () => apiFetch<{ data: ExamDetail }>(`/exams/${id}`).then((r) => r.data) });
  const e = exam.data;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'setup', label: canManage ? 'Subjects & dates' : 'Date sheet' },
    ...(can('marks.enter') || canManage ? [{ value: 'marks' as const, label: 'Marks' }] : []),
    ...(can('marks.enter') ? [{ value: 'co' as const, label: 'Co-scholastic' }] : []),
    ...(can('results.view', ['ALL', 'ASSIGNED']) || can('results.publish') ? [{ value: 'results' as const, label: 'Results' }] : []),
    ...(can('report_card.generate') ? [{ value: 'cards' as const, label: 'Report cards' }] : []),
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested : e?.status === 'MARKS_ENTRY' && tabs.some((t) => t.value === 'marks') ? 'marks' : 'setup';

  async function setStatus(status: 'SCHEDULED' | 'MARKS_ENTRY' | 'DRAFT') {
    try {
      await apiPatch(`/exams/${id}`, { status });
      await qc.invalidateQueries({ queryKey: ['exams'] });
      toast.success({ SCHEDULED: 'Date sheet is now visible to teachers and parents', MARKS_ENTRY: 'Marks entry is open for teachers', DRAFT: 'Back to draft' }[status]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }
  async function remove() {
    if (!window.confirm('Delete this exam? If marks were entered it will be archived instead.')) return;
    try {
      await apiDelete(`/exams/${id}`);
      await qc.invalidateQueries({ queryKey: ['exams'] });
      router.push('/exams');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/exams" className="inline-flex items-center gap-1 text-small text-fg-secondary hover:text-fg"><ChevronLeft className="size-3.5" /> Examinations</Link>
        <PageHeader
          className="mt-2"
          title={e ? <span className="flex items-center gap-3">{e.name} <Badge tone={EXAM_STATUS[e.status].tone} dot>{EXAM_STATUS[e.status].label}</Badge></span> : <Skeleton className="h-8 w-56" />}
          description={e ? [e.term, e.gradingScale.name, e.startDate ? `${formatDate(e.startDate)}${e.endDate ? ` – ${formatDate(e.endDate)}` : ''}` : null].filter(Boolean).join(' · ') : undefined}
          actions={
            e && canManage && (
              <>
                {e.status === 'DRAFT' && <Button variant="secondary" onClick={() => void setStatus('SCHEDULED')} disabled={!e.subjects.length}><CalendarDays /> Publish date sheet</Button>}
                {(e.status === 'DRAFT' || e.status === 'SCHEDULED') && <Button onClick={() => void setStatus('MARKS_ENTRY')} disabled={!e.subjects.length}><PencilLine /> Open marks entry</Button>}
                <Menu>
                  <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Exam actions"><MoreHorizontal /></Button></MenuTrigger>
                  <MenuContent>
                    {e.status === 'SCHEDULED' && <MenuItem onSelect={() => void setStatus('DRAFT')}><Send /> Hide date sheet (back to draft)</MenuItem>}
                    <MenuItem destructive onSelect={() => void remove()}><Trash2 /> Delete exam</MenuItem>
                  </MenuContent>
                </Menu>
              </>
            )
          }
        />
      </div>
      {exam.isError ? (
        <Card><ErrorState message={exam.error instanceof ApiError ? exam.error.message : undefined} onRetry={() => void exam.refetch()} /></Card>
      ) : !e ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Tabs<Tab> value={tab} onChange={(v) => router.replace(`/exams/${id}?tab=${v}`)} items={tabs} />
          {tab === 'setup' && <ExamSetup exam={e} canManage={canManage} />}
          {tab === 'marks' && <MarksProgress exam={e} />}
          {tab === 'co' && <CoScholasticPanel exam={e} />}
          {tab === 'results' && <ResultsPanel exam={e} />}
          {tab === 'cards' && <ReportCardsPanel exam={e} />}
        </>
      )}
    </div>
  );
}

export default function ExamPage() {
  return (
    <Gate any={['exam.view', 'exam.manage']} scopes={['ALL', 'ASSIGNED']}>
      <Suspense>
        <ExamPageContent />
      </Suspense>
    </Gate>
  );
}
