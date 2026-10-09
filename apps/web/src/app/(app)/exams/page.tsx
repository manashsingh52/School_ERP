'use client';

import type { ExamItem, GradingScaleItem } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { GradingScales } from '@/components/exams/grading-scales';
import { TermsPanel } from '@/components/exams/terms-panel';
import { Gate } from '@/components/gate';
import { ApiError, apiPost } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { EXAM_STATUS } from '@/lib/labels';
import { useMe } from '@/lib/me';

type Tab = 'exams' | 'terms' | 'scales';

function NewExam({ onDone }: { onDone: (id?: string) => void }) {
  const scales = useData<GradingScaleItem[]>(['grading-scales'], '/grading-scales');
  const [name, setName] = useState('');
  const [term, setTerm] = useState('');
  const [scaleId, setScaleId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ranking, setRanking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const scale = scaleId || scales.data?.find((s) => s.isDefault)?.id || scales.data?.[0]?.id || '';

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const res = await apiPost<{ data: ExamItem }>('/exams', { name: name.trim(), term: term.trim() || null, gradingScaleId: scale, startDate: startDate || null, endDate: endDate || null, rankingEnabled: ranking });
      toast.success('Exam created — now add its subjects');
      onDone(res.data.id);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!, d.message])));
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t create the exam.');
    } finally {
      setSaving(false);
    }
  }

  if (scales.data && !scales.data.length) {
    return <DialogBody><p className="text-body text-fg-secondary">Add a grading scale first (Grading scales tab) — every exam uses one.</p></DialogBody>;
  }
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Exam name" htmlFor="ex-name" error={errors.name}><Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Half-Yearly" maxLength={80} /></Field>
          <Field label="Term" htmlFor="ex-term" hint="Optional"><Input id="ex-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term 1" maxLength={40} /></Field>
        </div>
        <Field label="Grading scale" htmlFor="ex-scale" error={errors.gradingScaleId}>
          <Select id="ex-scale" value={scale} onChange={(e) => setScaleId(e.target.value)}>
            {scales.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Starts" htmlFor="ex-start" hint="Optional"><Input id="ex-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Ends" htmlFor="ex-end" error={errors.endDate}><Input id="ex-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>
        <Checkbox checked={ranking} onChange={(e) => setRanking(e.target.checked)} label="Show ranks" description="Rank in section and class on results and report cards." />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone()}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving} disabled={!name.trim() || !scale}>Create exam</Button>
      </DialogFooter>
    </>
  );
}

function ExamsPageContent() {
  const { can } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const tab: Tab = params.get('tab') === 'scales' ? 'scales' : params.get('tab') === 'terms' ? 'terms' : 'exams';
  const canManage = can('exam.manage');
  const exams = useData<ExamItem[]>(['exams', 'list'], '/exams');
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Examinations" description="Exams, marks, results and report cards" actions={canManage && tab === 'exams' && <Button onClick={() => setCreating(true)}><Plus /> New exam</Button>} />
      <Tabs<Tab> value={tab} onChange={(v) => router.replace(v === 'exams' ? '/exams' : `/exams?tab=${v}`)} items={[{ value: 'exams', label: 'Exams' }, { value: 'terms', label: 'Terms' }, { value: 'scales', label: 'Grading scales' }]} />
      {tab === 'scales' ? (
        <GradingScales canManage={canManage} />
      ) : tab === 'terms' ? (
        <TermsPanel />
      ) : exams.isError ? (
        <Card><ErrorState message={exams.error instanceof ApiError ? exams.error.message : undefined} onRetry={() => void exams.refetch()} /></Card>
      ) : !exams.data ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !exams.data.length ? (
        <Card>
          <EmptyState icon={<ClipboardList />} title="No exams this year" description={canManage ? 'Create an exam, add its subjects, then open marks entry for teachers.' : 'Exams appear here once the school schedules them.'} action={canManage && <Button onClick={() => setCreating(true)}><Plus /> New exam</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {exams.data.map((e) => (
            <Link key={e.id} href={`/exams/${e.id}`}>
              <Card className="group flex h-full flex-col gap-2 p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-h3 font-semibold">{e.name}</div>
                    <div className="text-small text-fg-secondary">{[e.term, e.startDate ? `${formatDate(e.startDate)}${e.endDate ? ` – ${formatDate(e.endDate)}` : ''}` : null].filter(Boolean).join(' · ') || 'Dates not set'}</div>
                  </div>
                  <Badge tone={EXAM_STATUS[e.status].tone} dot>{EXAM_STATUS[e.status].label}</Badge>
                </div>
                <div className="mt-auto flex items-center justify-between text-small text-fg-tertiary">
                  <span>{e.classes.length ? `${e.classes.length} class${e.classes.length === 1 ? '' : 'es'} · ${e.gradingScale.name}` : 'No subjects yet'}</span>
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New exam">
          {creating && <NewExam onDone={(id) => { setCreating(false); void qc.invalidateQueries({ queryKey: ['exams'] }); if (id) router.push(`/exams/${id}`); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ExamsPage() {
  return (
    <Gate any={['exam.view', 'exam.manage']} scopes={['ALL', 'ASSIGNED']}>
      <Suspense>
        <ExamsPageContent />
      </Suspense>
    </Gate>
  );
}
