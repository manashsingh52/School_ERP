'use client';

import type { MarksSheet } from '@schoolos/contracts';
import { Badge, Button, Card, ErrorState, Input, Kbd, PageHeader, Skeleton, cn, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Gate } from '@/components/gate';
import { ApiError, apiFetch, apiPut } from '@/lib/api-client';
import { formatDate } from '@/lib/format';

type Entry = { marks: string; absent: boolean; exempt: boolean };

function MarksPageContent() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const examSubjectId = params.get('examSubjectId') ?? '';
  const sectionId = params.get('sectionId') ?? '';
  const sheet = useQuery({
    queryKey: ['exams', id, 'marks', examSubjectId, sectionId],
    queryFn: () => apiFetch<{ data: MarksSheet }>(`/exams/marks?examSubjectId=${examSubjectId}&sectionId=${sectionId}`).then((r) => r.data),
    enabled: !!examSubjectId && !!sectionId,
  });
  const s = sheet.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/exams/${id}?tab=marks`} className="inline-flex items-center gap-1 text-small text-fg-secondary hover:text-fg"><ChevronLeft className="size-3.5" /> {s?.exam.name ?? 'Exam'}</Link>
        <PageHeader
          className="mt-2"
          title={s ? `${s.examSubject.subject.name} · ${s.section.label}` : <Skeleton className="h-8 w-56" />}
          description={s ? `Out of ${s.examSubject.maxMarks} · pass ${s.examSubject.passMarks}${s.examSubject.examDate ? ` · ${formatDate(s.examSubject.examDate)}` : ''}` : undefined}
        />
      </div>
      {sheet.isError ? (
        <Card><ErrorState message={sheet.error instanceof ApiError ? sheet.error.message : undefined} onRetry={() => void sheet.refetch()} /></Card>
      ) : !s ? (
        <Skeleton className="h-[480px]" />
      ) : (
        <Sheet key={s.version} sheet={s} onReload={() => void sheet.refetch()} />
      )}
    </div>
  );
}

function Sheet({ sheet, onReload }: { sheet: MarksSheet; onReload: () => void }) {
  const qc = useQueryClient();
  const initial = useMemo(
    () => Object.fromEntries(sheet.students.map((s) => [s.studentId, { marks: s.marks === null ? '' : String(s.marks), absent: s.absent, exempt: s.exempt }])) as Record<string, Entry>,
    [sheet],
  );
  const [entries, setEntries] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const max = sheet.examSubject.maxMarks;
  const pass = sheet.examSubject.passMarks;
  const readOnly = !sheet.editable;

  const problem = (e: Entry): string | null => {
    if (e.absent || e.exempt || e.marks === '') return null;
    const n = Number(e.marks);
    if (Number.isNaN(n) || n < 0) return 'Not a number';
    if (n > max) return `More than ${max}`;
    if (Math.round(n * 100) !== n * 100) return 'Max 2 decimals';
    return null;
  };
  const changed = sheet.students.filter((s) => {
    const a = entries[s.studentId]!;
    const b = initial[s.studentId]!;
    return a.marks !== b.marks || a.absent !== b.absent || a.exempt !== b.exempt;
  });
  const invalid = sheet.students.filter((s) => problem(entries[s.studentId]!));
  const filled = sheet.students.filter((s) => {
    const e = entries[s.studentId]!;
    return e.absent || e.exempt || e.marks !== '';
  }).length;

  useEffect(() => {
    if (!changed.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed.length]);

  const set = (studentId: string, patch: Partial<Entry>) => {
    setEntries((m) => ({ ...m, [studentId]: { ...m[studentId]!, ...patch } }));
    setServerErrors((e) => ({ ...e, [studentId]: '' }));
  };
  const focus = (i: number) => {
    const el = inputs.current[Math.max(0, Math.min(i, sheet.students.length - 1))];
    el?.focus();
    el?.select();
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number, studentId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focus(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const cur = entries[studentId]!;
      set(studentId, { absent: !cur.absent, exempt: false, marks: '' });
      if (!cur.absent) focus(i + 1);
    } else if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const cur = entries[studentId]!;
      set(studentId, { exempt: !cur.exempt, absent: false, marks: '' });
      if (!cur.exempt) focus(i + 1);
    }
  };

  async function save() {
    if (invalid.length) {
      toast.error(`${invalid.length} mark${invalid.length === 1 ? ' needs' : 's need'} fixing first.`);
      return;
    }
    setSaving(true);
    try {
      const res = await apiPut<{ data: MarksSheet }>('/exams/marks', {
        examSubjectId: sheet.examSubject.id,
        sectionId: sheet.section.id,
        version: sheet.version,
        entries: changed.map((s) => {
          const e = entries[s.studentId]!;
          return { studentId: s.studentId, marks: e.absent || e.exempt || e.marks === '' ? null : Number(e.marks), absent: e.absent, exempt: e.exempt };
        }),
      });
      qc.setQueryData(['exams', sheet.exam.id, 'marks', sheet.examSubject.id, sheet.section.id], res.data);
      void qc.invalidateQueries({ queryKey: ['exams', sheet.exam.id, 'progress'] });
      toast.success(`Saved · ${res.data.stats.entered} of ${res.data.stats.total} entered`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') setConflict(true);
      else if (err instanceof ApiError && err.details) {
        const map: Record<string, string> = {};
        for (const d of err.details) {
          const i = Number(/^entries\.(\d+)/.exec(d.field ?? '')?.[1]);
          if (!Number.isNaN(i) && changed[i]) map[changed[i]!.studentId] = d.message;
        }
        setServerErrors(map);
      }
      if (!(err instanceof ApiError && err.code === 'VERSION_CONFLICT')) toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the marks.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {readOnly && sheet.lockedReason && (
        <div className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-small text-warning"><Lock className="size-4 shrink-0" /> {sheet.lockedReason}</div>
      )}
      {conflict && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-small text-danger">
          <span className="flex items-center gap-2"><AlertTriangle className="size-4" /> Someone else saved these marks after you opened the sheet. Reload to see theirs — your unsaved changes will be lost.</span>
          <Button size="sm" variant="secondary" onClick={onReload}>Reload</Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-small">
          <div className="flex flex-wrap items-center gap-3 text-fg-secondary">
            <span><b className="text-fg">{filled}</b> of {sheet.students.length} entered</span>
            {sheet.stats.average !== null && <span>Average <b className="text-fg">{sheet.stats.average}</b></span>}
            {sheet.stats.highest !== null && <span>Highest <b className="text-fg">{sheet.stats.highest}</b></span>}
          </div>
          {!readOnly && (
            <span className="hidden items-center gap-1 text-caption text-fg-tertiary md:flex">
              <Kbd>Enter</Kbd> next · <Kbd>A</Kbd> absent · <Kbd>E</Kbd> exempt
            </span>
          )}
        </div>
        <div role="list">
          {sheet.students.map((st, i) => {
            const e = entries[st.studentId]!;
            const err = problem(e) ?? serverErrors[st.studentId];
            const n = e.marks === '' ? null : Number(e.marks);
            const failing = !err && n !== null && n < pass;
            return (
              <div key={st.studentId} role="listitem" className={cn('flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0', err && 'bg-danger-bg/40')}>
                <span className="tabular w-7 shrink-0 text-right text-small text-fg-tertiary">{st.rollNo ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium">{st.name}</div>
                  <div className="text-caption text-fg-tertiary">Adm. {st.admissionNo}{err ? <span className="ml-2 text-danger">{err}</span> : null}</div>
                </div>
                {e.absent || e.exempt ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => set(st.studentId, { absent: false, exempt: false })}
                    className="h-9 w-24 rounded-md border border-border bg-subtle text-small font-semibold text-fg-secondary"
                    title="Click to enter marks instead"
                  >
                    {e.absent ? 'Absent' : 'Exempt'}
                  </button>
                ) : (
                  <Input
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    inputMode="decimal"
                    value={e.marks}
                    onChange={(ev) => set(st.studentId, { marks: ev.target.value.replace(/[^\d.]/g, '') })}
                    onKeyDown={(ev) => onKey(ev, i, st.studentId)}
                    onFocus={(ev) => ev.target.select()}
                    disabled={readOnly}
                    aria-label={`Marks for ${st.name}`}
                    aria-invalid={!!err}
                    className={cn('tabular h-9 w-24 text-right', failing && 'text-danger')}
                  />
                )}
                <span className="tabular w-10 text-caption text-fg-tertiary">/ {max}</span>
                {!readOnly && (
                  <div className="hidden gap-1 sm:flex">
                    <Button variant={e.absent ? 'secondary' : 'ghost'} size="sm" onClick={() => set(st.studentId, { absent: !e.absent, exempt: false, marks: '' })}>AB</Button>
                    <Button variant={e.exempt ? 'secondary' : 'ghost'} size="sm" onClick={() => set(st.studentId, { exempt: !e.exempt, absent: false, marks: '' })}>EX</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <span className="mr-auto text-small text-fg-secondary">
            {changed.length ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'All changes saved'}
            {invalid.length > 0 && <Badge tone="danger" className="ml-2">{invalid.length} to fix</Badge>}
          </span>
          <Button onClick={() => void save()} loading={saving} disabled={!changed.length || conflict}>Save marks</Button>
        </div>
      )}
    </div>
  );
}

export default function MarksPage() {
  return (
    <Gate any={['marks.enter', 'exam.manage', 'results.view']} scopes={['ALL', 'ASSIGNED']}>
      <Suspense>
        <MarksPageContent />
      </Suspense>
    </Gate>
  );
}
