'use client';

import type { ExamDetail, ExamItem, StudentResultItem, StudentTermResultItem } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, cn, toast } from '@schoolos/ui';
import { CalendarDays, Download, Trophy } from 'lucide-react';
import { ForChild } from '@/components/parent/parent-gate';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatDate, formatPercent } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { RESULT_STATUS } from '@/lib/labels';
import { clock } from '@/lib/timetable';

function DateSheet({ examId, studentId }: { examId: string; studentId: string }) {
  const exam = useData<ExamDetail>(['exams', examId, 'child', studentId], `/exams/${examId}?studentId=${studentId}`);
  if (!exam.data) return <Skeleton className="h-32" />;
  const e = exam.data;
  return (
    <Card>
      <CardHeader title={e.name} description={[e.term, e.startDate ? `${formatDate(e.startDate)}${e.endDate ? ` – ${formatDate(e.endDate)}` : ''}` : null].filter(Boolean).join(' · ') || undefined} />
      <ul className="mt-3 border-t border-border">
        {e.subjects.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-small last:border-b-0">
            <span className="font-medium">{s.subject.name}</span>
            <span className="tabular text-fg-secondary">
              {s.examDate ? formatDate(s.examDate) : 'Date to be announced'}
              {s.startTime ? ` · ${clock(s.startTime)}${s.endTime ? `–${clock(s.endTime)}` : ''}` : ''} · {s.maxMarks} marks
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ResultCard({ item, studentId }: { item: StudentResultItem; studentId: string }) {
  const r = item.result;
  async function download() {
    try {
      const res = await apiFetch<{ data: { url: string } }>(`/exams/${item.exam.id}/report-cards/${studentId}`);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t open the report card.');
    }
  }
  return (
    <Card>
      <CardHeader
        title={item.exam.name}
        description={[item.exam.term, item.exam.publishedAt ? `Published ${formatDate(item.exam.publishedAt)}` : null].filter(Boolean).join(' · ')}
        action={item.reportCard && <Button variant="secondary" size="sm" onClick={() => void download()}><Download /> Report card</Button>}
      />
      <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-4">
        <div><div className="text-caption text-fg-tertiary">Percentage</div><div className="tabular text-h2 font-semibold">{formatPercent(r.percentage)}</div></div>
        <div><div className="text-caption text-fg-tertiary">Grade</div><div className="text-h2 font-semibold">{r.grade ?? '—'}</div></div>
        <div><div className="text-caption text-fg-tertiary">Result</div><div className="mt-1"><Badge tone={RESULT_STATUS[r.status].tone}>{RESULT_STATUS[r.status].label}</Badge></div></div>
        {r.rankInSection !== null && <div><div className="text-caption text-fg-tertiary">Rank in section</div><div className="tabular text-h2 font-semibold">{r.rankInSection}</div></div>}
      </div>
      <table className="mt-4 w-full text-small">
        <thead>
          <tr className="border-y border-border text-left text-caption text-fg-tertiary">
            <th className="px-5 py-2 font-medium">Subject</th>
            <th className="px-2 py-2 text-right font-medium">Marks</th>
            <th className="px-5 py-2 text-right font-medium">Grade</th>
          </tr>
        </thead>
        <tbody>
          {r.subjects.map((s) => (
            <tr key={s.examSubjectId} className="border-b border-border last:border-b-0">
              <td className="px-5 py-2">{s.subject.name}</td>
              <td className={cn('tabular px-2 py-2 text-right', s.passed === false && 'font-medium text-danger')}>
                {s.exempt ? 'Exempt' : s.absent ? 'Absent' : s.marks === null ? '—' : `${s.marks} / ${s.maxMarks}`}
              </td>
              <td className="px-5 py-2 text-right">{s.exempt ? '' : (s.grade ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(r.teacherRemark || r.principalRemark) && (
        <div className="flex flex-col gap-2 border-t border-border px-5 py-3 text-small">
          {r.teacherRemark && <p><span className="text-fg-tertiary">Class teacher: </span>{r.teacherRemark}</p>}
          {r.principalRemark && <p><span className="text-fg-tertiary">Principal: </span>{r.principalRemark}</p>}
        </div>
      )}
    </Card>
  );
}

function TermCard({ item, studentId }: { item: StudentTermResultItem; studentId: string }) {
  const r = item.result;
  async function download() {
    try {
      const res = await apiFetch<{ data: { url: string } }>(`/exam-terms/${item.term.id}/report-cards/${studentId}`);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t open the report card.');
    }
  }
  return (
    <Card>
      <CardHeader
        title={item.term.name}
        description={item.term.components.map((c) => `${c.name} ${c.weight}%`).join(' + ')}
        action={<Button variant="secondary" size="sm" onClick={() => void download()}><Download /> Report card</Button>}
      />
      <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-4">
        <div><div className="text-caption text-fg-tertiary">Term percentage</div><div className="tabular text-h2 font-semibold">{formatPercent(r.percentage)}</div></div>
        <div><div className="text-caption text-fg-tertiary">Grade</div><div className="text-h2 font-semibold">{r.grade ?? '—'}</div></div>
        <div><div className="text-caption text-fg-tertiary">Result</div><div className="mt-1"><Badge tone={RESULT_STATUS[r.status].tone}>{RESULT_STATUS[r.status].label}</Badge></div></div>
        {r.rankInSection !== null && <div><div className="text-caption text-fg-tertiary">Rank in section</div><div className="tabular text-h2 font-semibold">{r.rankInSection}</div></div>}
      </div>
      <table className="mt-4 w-full text-small">
        <thead>
          <tr className="border-y border-border text-left text-caption text-fg-tertiary">
            <th className="px-5 py-2 font-medium">Subject</th>
            <th className="px-2 py-2 text-right font-medium">Term</th>
            <th className="px-5 py-2 text-right font-medium">Grade</th>
          </tr>
        </thead>
        <tbody>
          {r.subjects.map((s) => (
            <tr key={s.subject.id} className="border-b border-border last:border-b-0">
              <td className="px-5 py-2">{s.subject.name}</td>
              <td className={cn('tabular px-2 py-2 text-right', s.passed === false && 'font-medium text-danger')}>{formatPercent(s.percent)}</td>
              <td className="px-5 py-2 text-right">{s.grade ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ChildResults({ studentId }: { studentId: string }) {
  const results = useData<StudentResultItem[]>(['results', 'child', studentId], `/students/${studentId}/results`);
  const terms = useData<StudentTermResultItem[]>(['results', 'child', studentId, 'terms'], `/students/${studentId}/term-results`);
  const exams = useData<ExamItem[]>(['exams', 'child', studentId], `/exams?studentId=${studentId}`);
  const upcoming = (exams.data ?? []).filter((e) => e.status === 'SCHEDULED' || e.status === 'MARKS_ENTRY');
  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-h3 font-semibold"><CalendarDays className="size-4 text-fg-tertiary" /> Date sheet</h2>
          {upcoming.map((e) => <DateSheet key={e.id} examId={e.id} studentId={studentId} />)}
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-h3 font-semibold"><Trophy className="size-4 text-fg-tertiary" /> Results</h2>
        {terms.data?.map((item) => <TermCard key={item.term.id} item={item} studentId={studentId} />)}
        {!results.data ? (
          <Skeleton className="h-64" />
        ) : !results.data.length ? (
          <Card><EmptyState icon={<Trophy />} title="No results yet" description="Results appear here as soon as the school publishes them." /></Card>
        ) : (
          results.data.map((item) => <ResultCard key={item.exam.id} item={item} studentId={studentId} />)
        )}
      </section>
    </div>
  );
}

export default function ChildResultsPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s exams`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          <ChildResults key={child.id} studentId={child.id} />
        </div>
      )}
    </ForChild>
  );
}
