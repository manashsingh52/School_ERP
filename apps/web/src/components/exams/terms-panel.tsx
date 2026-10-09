'use client';

import type { ExamItem, ExamTermItem, GradingScaleItem, TermResultRow } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Select, Skeleton, Table, TD, TH, THead, TR, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { sectionLabel, useClasses } from '@/lib/academics';
import { ApiError, apiDelete, apiFetch, apiPost, apiPut } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const pct = (v: number | null) => (v === null ? '—' : `${v % 1 ? v.toFixed(1) : v}%`);
const STATUS = { PASS: ['Passed', 'success'], FAIL: ['Not passed', 'danger'], INCOMPLETE: ['Incomplete', 'warning'] } as const;

/** Consolidated terms: several exams with weights (e.g. Unit Test × 20% + Half-Yearly × 80%). */
export function TermsPanel() {
  const { can } = useMe();
  const qc = useQueryClient();
  const terms = useData<ExamTermItem[]>(['exam-terms'], '/exam-terms');
  const [editing, setEditing] = useState<ExamTermItem | 'new' | null>(null);
  const [viewing, setViewing] = useState<ExamTermItem | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['exam-terms'] });

  async function act(t: ExamTermItem, action: 'publish' | 'unpublish' | 'delete') {
    if (action === 'delete' && !window.confirm(`Delete “${t.name}”?`)) return;
    try {
      if (action === 'delete') await apiDelete(`/exam-terms/${t.id}`);
      else await apiPost(`/exam-terms/${t.id}/${action}`);
      toast.success(action === 'publish' ? 'Published — parents are told and report cards are being made' : action === 'unpublish' ? 'Taken back from parents' : 'Deleted');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">A term combines exams with weights — e.g. Unit Test 1 (20%) + Half-Yearly (80%) — into one result and one report card.</p>
        {can('exam.manage') && <Button onClick={() => setEditing('new')}><Plus /> New term</Button>}
      </div>
      {!terms.data ? (
        <Skeleton className="h-40" />
      ) : !terms.data.length ? (
        <Card><EmptyState icon={<Layers />} title="No terms yet" description="Publish the results of the exams first, then combine them here." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {terms.data.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-h3 font-semibold">{t.name}</div>
                  <div className="text-small text-fg-secondary">{t.components.map((c) => `${c.exam.name} ${c.weight}%`).join(' + ')}</div>
                </div>
                {t.publishedAt ? <Badge tone="success" dot>Published {formatDate(t.publishedAt)}</Badge> : t.ready ? <Badge tone="info" dot>Ready</Badge> : <Badge dot>Waiting for exam results</Badge>}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setViewing(t)}>Results</Button>
                {can('results.publish') && (t.publishedAt ? <Button size="sm" variant="ghost" onClick={() => void act(t, 'unpublish')}>Unpublish</Button> : <Button size="sm" disabled={!t.ready} onClick={() => void act(t, 'publish')}>Publish</Button>)}
                {can('exam.manage') && !t.publishedAt && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil /></Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => void act(t, 'delete')} aria-label={`Delete ${t.name}`}><Trash2 /></Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>{editing && <TermDialog term={editing === 'new' ? null : editing} onDone={() => { setEditing(null); void refresh(); }} />}</Dialog>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>{viewing && <TermResults term={viewing} />}</Dialog>
    </div>
  );
}

function TermDialog({ term, onDone }: { term: ExamTermItem | null; onDone: () => void }) {
  const exams = useData<ExamItem[]>(['exams', 'list'], '/exams');
  const scales = useData<GradingScaleItem[]>(['grading-scales'], '/grading-scales');
  const [name, setName] = useState(term?.name ?? '');
  const [scaleId, setScaleId] = useState(term?.gradingScale.id ?? '');
  const [rows, setRows] = useState<{ examId: string; weight: string }[]>(term?.components.map((c) => ({ examId: c.exam.id, weight: String(c.weight) })) ?? [{ examId: '', weight: '' }]);
  const [busy, setBusy] = useState(false);
  const total = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);
  const scale = scaleId || scales.data?.[0]?.id || '';
  async function save() {
    setBusy(true);
    try {
      const body = { name: name.trim(), gradingScaleId: scale, components: rows.filter((r) => r.examId).map((r) => ({ examId: r.examId, weight: Number(r.weight) })) };
      if (term) await apiPut(`/exam-terms/${term.id}`, body);
      else await apiPost('/exam-terms', body);
      toast.success('Term saved');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title={term ? `Edit ${term.name}` : 'New term'} description="Pick the exams and how much each counts. Weights add up to 100.">
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="tm-name"><Input id="tm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Term 1" maxLength={60} /></Field>
          <Field label="Grading scale" htmlFor="tm-scale">
            <Select id="tm-scale" value={scale} onChange={(e) => setScaleId(e.target.value)}>{scales.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select aria-label="Exam" value={r.examId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, examId: e.target.value } : x)))} className="flex-1">
                <option value="">Choose an exam…</option>
                {exams.data?.filter((e) => e.status !== 'ARCHIVED').map((e) => <option key={e.id} value={e.id} disabled={rows.some((x, j) => j !== i && x.examId === e.id)}>{e.name}</option>)}
              </Select>
              <Input aria-label="Weight %" inputMode="numeric" value={r.weight} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weight: e.target.value.replace(/\D/g, '') } : x)))} className="w-20 text-right" placeholder="%" />
              <Button variant="ghost" size="icon-sm" aria-label="Remove" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X /></Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { examId: '', weight: '' }])} disabled={rows.length >= 6}><Plus /> Add exam</Button>
            <span className={cn('tabular text-small', total === 100 ? 'text-success' : 'text-warning')}>Total {total}%</span>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={!name.trim() || total !== 100 || rows.some((r) => !r.examId)}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TermResults({ term }: { term: ExamTermItem }) {
  const classes = useClasses();
  const sections = (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ id: s.id, label: sectionLabel(c.name, s.name) })));
  const [sectionId, setSectionId] = useState('');
  const data = useData<{ term: ExamTermItem; rows: TermResultRow[] }>(['exam-terms', term.id, 'results', sectionId], `/exam-terms/${term.id}/results${sectionId ? `?sectionId=${sectionId}` : ''}`);
  async function card(studentId: string) {
    try {
      window.open((await apiFetch<{ data: { url: string } }>(`/exam-terms/${term.id}/report-cards/${studentId}`)).data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t make the report card.');
    }
  }
  const subjects = [...new Set((data.data?.rows ?? []).flatMap((r) => r.subjects.map((s) => s.subject.name)))].sort();
  return (
    <DialogContent title={`${term.name} results`} description={term.components.map((c) => `${c.exam.name} ${c.weight}%`).join(' + ')} className="max-w-[1100px]">
      <DialogBody className="flex flex-col gap-3">
        <Select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-48">
          <option value="">All my sections</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        {!data.data ? (
          <Skeleton className="h-64" />
        ) : !data.data.rows.length ? (
          <EmptyState icon={<Layers />} title="No published results for these exams yet" />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <Table>
              <THead className="sticky top-0">
                <TR><TH>Student</TH><TH>Class</TH>{subjects.map((s) => <TH key={s} className="text-right">{s}</TH>)}<TH className="text-right">Term</TH><TH>Grade</TH><TH>Result</TH><TH className="text-right">Rank</TH><TH /></TR>
              </THead>
              <tbody>
                {data.data.rows.map((r) => (
                  <TR key={r.studentId}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD>{r.section.label}</TD>
                    {subjects.map((name) => {
                      const s = r.subjects.find((x) => x.subject.name === name);
                      return <TD key={name} className={cn('tabular text-right', s?.passed === false && 'font-medium text-danger')}>{s ? pct(s.percent) : ''}</TD>;
                    })}
                    <TD className="tabular text-right font-semibold">{pct(r.percentage)}</TD>
                    <TD>{r.grade ?? '—'}</TD>
                    <TD><Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge></TD>
                    <TD className="tabular text-right">{r.rankInSection ?? '—'}</TD>
                    <TD><Button size="sm" variant="ghost" onClick={() => void card(r.studentId)} aria-label={`Report card for ${r.name}`}><Download /></Button></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </DialogBody>
    </DialogContent>
  );
}
