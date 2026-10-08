'use client';

import type { ExamDetail, ResultRow, ResultsSummary } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Select, Skeleton, Textarea, cn, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, EyeOff, Send, Trophy } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiFetch, apiPatch, apiPost } from '@/lib/api-client';
import { useClasses } from '@/lib/academics';
import { formatPercent, timeAgo } from '@/lib/format';
import { RESULT_STATUS } from '@/lib/labels';
import { useMe } from '@/lib/me';

const cell = (s: ResultRow['subjects'][number]) => (s.exempt ? 'EX' : s.absent ? 'AB' : s.marks === null ? '—' : String(s.marks));

export function ResultsPanel({ exam }: { exam: ExamDetail }) {
  const { can, me } = useMe();
  const qc = useQueryClient();
  const office = can('results.publish');
  const classes = useClasses();
  const sections = (classes.data ?? []).filter((c) => exam.classes.some((x) => x.id === c.id)).flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name.replace(/^Class\s+/i, '')}-${s.name}`, classTeacherId: s.classTeacher?.id })));
  // Large schools have hundreds of students: open on the first section, "All sections" on request.
  const [chosen, setChosen] = useState<string | null>(null);
  const sectionId = chosen ?? sections[0]?.id ?? '';
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResultRow | null>(null);
  const query = useQuery({
    queryKey: ['exams', exam.id, 'results', sectionId],
    queryFn: () => apiFetch<{ data: ResultRow[]; summary: ResultsSummary }>(`/exams/${exam.id}/results${sectionId ? `?sectionId=${sectionId}` : ''}`),
    enabled: !!classes.data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['exams', exam.id] });
  const published = exam.status === 'RESULTS_PUBLISHED';
  const summary = query.data?.summary;

  async function act(kind: 'compute' | 'publish' | 'unpublish' | 'recompute') {
    if (kind === 'publish' && !window.confirm('Publish results? Marks will be locked and parents will be told.')) return;
    if (kind === 'unpublish' && !window.confirm('Unpublish results? Parents will no longer see them until you publish again.')) return;
    setBusy(kind);
    try {
      if (kind === 'compute' || kind === 'recompute') await apiPost(`/exams/${exam.id}/results/compute`, { force: kind === 'recompute' });
      else await apiPost(`/exams/${exam.id}/results/${kind}`);
      await refresh();
      void qc.invalidateQueries({ queryKey: ['exams', 'list'] });
      toast.success({ compute: 'Results computed — check them, then publish', recompute: 'Results recomputed', publish: 'Results published · parents will be told', unpublish: 'Results unpublished' }[kind]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(null);
    }
  }

  const rows = query.data?.data ?? [];
  const subjects = rows[0]?.subjects.map((s) => s.subject) ?? [];
  const showClassRank = exam.rankingEnabled && !sectionId;

  return (
    <div className="flex flex-col gap-4">
      {office && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-small text-fg-secondary">
            {published ? (
              <>Published {summary?.publishedAt ? timeAgo(summary.publishedAt) : ''}. Marks are locked.</>
            ) : summary?.computedAt ? (
              <>Computed {timeAgo(summary.computedAt)}. Recompute after any marks change, then publish.</>
            ) : exam.status === 'MARKS_ENTRY' ? (
              'When marks are in, compute the results to preview them.'
            ) : (
              'Open marks entry first.'
            )}
          </div>
          <div className="flex gap-2">
            {!published && (
              <Button variant="secondary" onClick={() => void act('compute')} loading={busy === 'compute'} disabled={exam.status !== 'MARKS_ENTRY' || !!busy}>
                <Calculator /> {summary?.computedAt ? 'Recompute' : 'Compute results'}
              </Button>
            )}
            {!published && <Button onClick={() => void act('publish')} loading={busy === 'publish'} disabled={!summary?.computedAt || !!busy}><Send /> Publish</Button>}
            {published && <Button variant="secondary" onClick={() => void act('recompute')} loading={busy === 'recompute'} disabled={!!busy}><Calculator /> Recompute</Button>}
            {published && <Button variant="ghost" onClick={() => void act('unpublish')} loading={busy === 'unpublish'} disabled={!!busy}><EyeOff /> Unpublish</Button>}
          </div>
        </Card>
      )}

      {summary && summary.students > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ['Students', summary.students],
            ['Passed', summary.passed],
            ['Failed', summary.failed],
            ['Incomplete', summary.incomplete],
            ['Class average', formatPercent(summary.average)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <div className="text-small text-fg-secondary">{label}</div>
              <div className={cn('tabular mt-1 text-h2 font-semibold', label === 'Failed' && Number(value) > 0 && 'text-danger', label === 'Incomplete' && Number(value) > 0 && 'text-warning')}>{value}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={sectionId} onChange={(e) => setChosen(e.target.value)} className="w-44" aria-label="Section">
          <option value="">All sections</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </div>

      {!query.data ? (
        <Skeleton className="h-80" />
      ) : !rows.length ? (
        <Card><EmptyState icon={<Trophy />} title="No results yet" description={office ? 'Compute the results once marks are entered.' : 'Results appear here after the exam office computes them.'} /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-border text-left text-caption text-fg-tertiary">
                <th className="sticky left-0 bg-surface px-4 py-2 font-medium">Student</th>
                {subjects.map((s) => <th key={s.id} className="px-2 py-2 text-right font-medium">{s.name}</th>)}
                <th className="px-2 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 text-right font-medium">%</th>
                <th className="px-2 py-2 font-medium">Grade</th>
                <th className="px-2 py-2 font-medium">Result</th>
                {exam.rankingEnabled && <th className="px-2 py-2 text-right font-medium">Rank</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canRemark = office || sections.find((s) => s.id === r.section.id)?.classTeacherId === me.membership?.teacherId;
                return (
                  <tr key={r.studentId} className={cn('border-b border-border last:border-b-0', canRemark && 'cursor-pointer hover:bg-hover')} onClick={() => canRemark && setEditing(r)}>
                    <td className="sticky left-0 bg-surface px-4 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-caption text-fg-tertiary">{r.section.label}{r.rollNo ? ` · roll ${r.rollNo}` : ''}{r.teacherRemark ? ' · remark added' : ''}</div>
                    </td>
                    {r.subjects.map((s) => (
                      <td key={s.examSubjectId} className={cn('tabular px-2 py-2 text-right', s.passed === false && 'font-medium text-danger')}>{cell(s)}</td>
                    ))}
                    <td className="tabular px-2 py-2 text-right">{r.totalObtained}/{r.totalMax}</td>
                    <td className="tabular px-2 py-2 text-right font-medium">{r.percentage}</td>
                    <td className="px-2 py-2">{r.grade ?? '—'}</td>
                    <td className="px-2 py-2"><Badge tone={RESULT_STATUS[r.status].tone}>{RESULT_STATUS[r.status].label}</Badge></td>
                    {exam.rankingEnabled && <td className="tabular px-2 py-2 text-right">{(showClassRank ? r.rankInClass : r.rankInSection) ?? '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.name} description={`${editing.section.label} · ${editing.percentage}% · ${RESULT_STATUS[editing.status].label}`}>
            <RemarksForm examId={exam.id} row={editing} office={office} published={published} onDone={() => { setEditing(null); void refresh(); }} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function RemarksForm({ examId, row, office, published, onDone }: { examId: string; row: ResultRow; office: boolean; published: boolean; onDone: () => void }) {
  const [teacherRemark, setTeacherRemark] = useState(row.teacherRemark ?? '');
  const [principalRemark, setPrincipalRemark] = useState(row.principalRemark ?? '');
  const [withheld, setWithheld] = useState(row.status === 'WITHHELD');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/exams/${examId}/results/${row.studentId}`, {
        teacherRemark: teacherRemark.trim() || null,
        ...(office ? { principalRemark: principalRemark.trim() || null } : {}),
        ...(office && !published && withheld !== (row.status === 'WITHHELD') ? { withheld } : {}),
      });
      toast.success('Saved');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Class teacher's remark" htmlFor="rm-t"><Textarea id="rm-t" rows={3} maxLength={300} value={teacherRemark} onChange={(e) => setTeacherRemark(e.target.value)} placeholder="e.g. Attentive in class; needs more reading practice." /></Field>
        {office && <Field label="Principal's remark" htmlFor="rm-p"><Textarea id="rm-p" rows={2} maxLength={300} value={principalRemark} onChange={(e) => setPrincipalRemark(e.target.value)} /></Field>}
        {office && (
          <Checkbox
            checked={withheld}
            onChange={(e) => setWithheld(e.target.checked)}
            disabled={published}
            label="Withhold this result"
            description={published ? 'Unpublish results to change this.' : "Parents won't see it or be notified (e.g. pending re-exam)."}
          />
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving}>Save</Button>
      </DialogFooter>
    </>
  );
}
