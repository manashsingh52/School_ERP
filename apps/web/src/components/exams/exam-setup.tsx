'use client';

import type { ExamDetail } from '@schoolos/contracts';
import { Button, Card, Checkbox, EmptyState, Input, Select, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Copy, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError, apiPut } from '@/lib/api-client';
import { useClassSubjects, useClasses, useSubjects } from '@/lib/academics';

type Row = { subjectId: string; name: string; include: boolean; maxMarks: string; passMarks: string; examDate: string; startTime: string; endTime: string; locked: boolean };

/** One class at a time: which subjects, max/pass marks and the date sheet. */
export function ExamSetup({ exam, canManage }: { exam: ExamDetail; canManage: boolean }) {
  const classes = useClasses();
  const subjects = useSubjects();
  const classSubjects = useClassSubjects();
  const [classId, setClassId] = useState(exam.classes[0]?.id ?? '');
  const active = classId || classes.data?.[0]?.id || '';

  if (!classes.data || !subjects.data || !classSubjects.data) return <Skeleton className="h-96" />;
  if (!classes.data.length) return <Card><EmptyState icon={<BookOpen />} title="No classes yet" description="Add classes in Academics first." /></Card>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={active} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="w-48">
          {classes.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{exam.classes.some((x) => x.id === c.id) ? ` · ${exam.classes.find((x) => x.id === c.id)!.subjects} subjects` : ''}
            </option>
          ))}
        </Select>
        <span className="text-small text-fg-tertiary">{exam.classes.length} of {classes.data.length} classes set up</span>
      </div>
      <ClassGrid
        key={`${active}|${exam.subjects.length}|${exam.subjects.map((s) => s.maxMarks).join()}`}
        exam={exam}
        classId={active}
        allClasses={classes.data.map((c) => ({ id: c.id, name: c.name }))}
        subjectNames={new Map(subjects.data.map((s) => [s.id, s.name]))}
        classSubjectIds={classSubjects.data.filter((c) => c.classId === active).map((c) => c.subjectId)}
        classSubjectsFor={(id) => classSubjects.data!.filter((c) => c.classId === id).map((c) => c.subjectId)}
        canManage={canManage}
      />
    </div>
  );
}

function ClassGrid({
  exam,
  classId,
  allClasses,
  subjectNames,
  classSubjectIds,
  classSubjectsFor,
  canManage,
}: {
  exam: ExamDetail;
  classId: string;
  allClasses: { id: string; name: string }[];
  subjectNames: Map<string, string>;
  classSubjectIds: string[];
  classSubjectsFor: (classId: string) => string[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const current = exam.subjects.filter((s) => s.classId === classId);
  const ids = [...new Set([...classSubjectIds, ...current.map((s) => s.subject.id)])];
  const initial = useMemo<Row[]>(
    () =>
      ids
        .map((id) => {
          const s = current.find((x) => x.subject.id === id);
          return {
            subjectId: id,
            name: subjectNames.get(id) ?? s?.subject.name ?? 'Subject',
            include: !!s || !current.length,
            maxMarks: s ? String(s.maxMarks) : '100',
            passMarks: s ? String(s.passMarks) : '33',
            examDate: s?.examDate ?? '',
            startTime: s?.startTime ?? '',
            endTime: s?.endTime ?? '',
            locked: !!s?.lockedAt,
          };
        })
        .sort((a, b) => (a.examDate || '9999').localeCompare(b.examDate || '9999') || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, exam],
  );
  const [rows, setRows] = useState(initial);
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const readOnly = !canManage || exam.status === 'RESULTS_PUBLISHED';
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setSaving(true);
    setErrors({});
    const included = rows.filter((r) => r.include);
    const toRow = (cid: string, r: Row) => ({
      classId: cid,
      subjectId: r.subjectId,
      maxMarks: Number(r.maxMarks),
      passMarks: Number(r.passMarks),
      examDate: r.examDate || null,
      startTime: r.startTime || null,
      endTime: r.endTime || null,
    });
    try {
      await apiPut(`/exams/${exam.id}/subjects`, { classIds: [classId], rows: included.map((r) => toRow(classId, r)) });
      for (const other of copyTo) {
        const offered = new Set(classSubjectsFor(other));
        await apiPut(`/exams/${exam.id}/subjects`, { classIds: [other], rows: included.filter((r) => offered.has(r.subjectId)).map((r) => toRow(other, r)) });
      }
      await qc.invalidateQueries({ queryKey: ['exams'] });
      toast.success(copyTo.length ? `Saved for ${copyTo.length + 1} classes` : 'Subjects saved');
      setCopyTo([]);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const map: Record<string, string> = {};
        for (const d of err.details) {
          const m = /^rows\.(\d+)\.(\w+)$/.exec(d.field ?? '');
          if (m) map[`${included[Number(m[1])]?.subjectId}.${m[2]}`] = d.message;
        }
        setErrors(map);
      }
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the subjects.');
    } finally {
      setSaving(false);
    }
  }

  if (!rows.length) {
    return <Card><EmptyState icon={<BookOpen />} title="This class has no subjects" description="Choose the subjects for this class in Academics → Subjects first." /></Card>;
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-small">
          <thead>
            <tr className="border-b border-border text-left text-caption text-fg-tertiary">
              <th className="w-10 px-3 py-2" />
              <th className="px-2 py-2 font-medium">Subject</th>
              <th className="w-24 px-2 py-2 font-medium">Max marks</th>
              <th className="w-24 px-2 py-2 font-medium">Pass marks</th>
              <th className="w-40 px-2 py-2 font-medium">Date</th>
              <th className="w-28 px-2 py-2 font-medium">From</th>
              <th className="w-28 px-2 py-2 font-medium">To</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const err = errors[`${r.subjectId}.passMarks`] ?? errors[`${r.subjectId}.maxMarks`] ?? errors[`${r.subjectId}.endTime`];
              const disabled = readOnly || !r.include;
              return (
                <tr key={r.subjectId} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-1.5"><Checkbox checked={r.include} onChange={(e) => set(i, { include: e.target.checked })} disabled={readOnly || r.locked} aria-label={`Include ${r.name}`} /></td>
                  <td className="px-2 py-1.5">
                    <span className={r.include ? 'font-medium' : 'text-fg-tertiary'}>{r.name}</span>
                    {r.locked && <Lock className="ml-1.5 inline size-3 text-fg-tertiary" aria-label="Marks locked" />}
                    {err && <div className="text-caption text-danger">{err}</div>}
                  </td>
                  <td className="px-2 py-1.5"><Input className="h-8" type="number" min={1} value={r.maxMarks} onChange={(e) => set(i, { maxMarks: e.target.value })} disabled={disabled || r.locked} aria-label={`${r.name} max marks`} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8" type="number" min={0} value={r.passMarks} onChange={(e) => set(i, { passMarks: e.target.value })} disabled={disabled || r.locked} aria-label={`${r.name} pass marks`} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8" type="date" value={r.examDate} onChange={(e) => set(i, { examDate: e.target.value })} disabled={disabled} aria-label={`${r.name} date`} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8" type="time" value={r.startTime} onChange={(e) => set(i, { startTime: e.target.value })} disabled={disabled} aria-label={`${r.name} start`} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8" type="time" value={r.endTime} onChange={(e) => set(i, { endTime: e.target.value })} disabled={disabled} aria-label={`${r.name} end`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-small">
            <Copy className="size-4 text-fg-tertiary" />
            <span className="text-fg-secondary">Also apply to</span>
            <Select value="" onChange={(e) => e.target.value && setCopyTo((c) => [...new Set([...c, e.target.value])])} className="h-8 w-40" aria-label="Copy to class">
              <option value="">Choose class…</option>
              {allClasses.filter((c) => c.id !== classId && !copyTo.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {copyTo.map((id) => (
              <button key={id} className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-caption font-medium text-accent-strong" onClick={() => setCopyTo((c) => c.filter((x) => x !== id))} title="Remove">
                {allClasses.find((c) => c.id === id)?.name} ×
              </button>
            ))}
          </div>
          <Button onClick={() => void save()} loading={saving}>Save subjects</Button>
        </div>
      )}
    </Card>
  );
}
