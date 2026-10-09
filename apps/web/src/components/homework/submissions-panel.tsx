'use client';

import type { HomeworkItem, HomeworkProgress, HomeworkSubmissions } from '@schoolos/contracts';
import { Badge, Button, DialogBody, DialogContent, DialogFooter, Input, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';

type Choice = 'ASSIGNED' | 'SUBMITTED' | 'REVIEWED';
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'ASSIGNED', label: 'Not in' },
  { value: 'SUBMITTED', label: 'Handed in' },
  { value: 'REVIEWED', label: 'Checked' },
];
const asChoice = (s: HomeworkProgress): Choice => (s === 'VIEWED' ? 'ASSIGNED' : s);

/** Who handed it in: tap each student's status, add a note, save once. Body of a dialog. */
export function SubmissionsDialog({ hw, onDone }: { hw: HomeworkItem; onDone: () => void }) {
  const qc = useQueryClient();
  const data = useData<HomeworkSubmissions>(['homework', hw.id, 'submissions'], `/homework/${hw.id}/submissions`, { staleTime: 0 });
  const [draft, setDraft] = useState<Record<string, { status: Choice; feedback: string }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data.data) setDraft(Object.fromEntries(data.data.rows.map((r) => [r.studentId, { status: asChoice(r.status), feedback: r.feedback ?? '' }])));
  }, [data.data]);
  const changed = useMemo(
    () => (data.data?.rows ?? []).filter((r) => draft[r.studentId] && (draft[r.studentId]!.status !== asChoice(r.status) || draft[r.studentId]!.feedback !== (r.feedback ?? ''))),
    [data.data, draft],
  );
  const set = (id: string, patch: Partial<{ status: Choice; feedback: string }>) => setDraft((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
  const handedIn = Object.values(draft).filter((d) => d.status !== 'ASSIGNED').length;

  async function save() {
    setSaving(true);
    try {
      await apiPut(`/homework/${hw.id}/submissions`, { entries: changed.map((r) => ({ studentId: r.studentId, status: draft[r.studentId]!.status, feedback: draft[r.studentId]!.feedback.trim() || null })) });
      await qc.invalidateQueries({ queryKey: ['homework', hw.id, 'submissions'] });
      toast.success('Saved — parents see the status and your notes');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save that.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent title={`Who handed in “${hw.title}”`} description={`${hw.subject.name} · ${hw.sections.map((s) => s.label).join(', ')}`} className="max-w-[760px]">
      <DialogBody className="flex flex-col gap-3">
        {!data.data ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">{handedIn} of {data.data.rows.length} handed in</Badge>
              <Badge><Eye className="size-3" /> {data.data.rows.filter((r) => r.viewedAt).length} seen by parents</Badge>
              <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.status === 'ASSIGNED' ? { ...v, status: 'SUBMITTED' as Choice } : v])))}>
                Mark everyone handed in
              </Button>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto rounded-md border border-border">
              {data.data.rows.map((r) => {
                const d = draft[r.studentId];
                if (!d) return null;
                return (
                  <li key={r.studentId} className="flex flex-col gap-2 border-b border-border px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="tabular w-6 text-small text-fg-tertiary">{r.rollNo ?? ''}</span>
                        {r.name}
                        {r.viewedAt && <Eye className="size-3.5 text-fg-tertiary" aria-label="Seen by a parent" />}
                      </div>
                    </div>
                    <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label={`Status for ${r.name}`}>
                      {CHOICES.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={d.status === c.value}
                          onClick={() => set(r.studentId, { status: c.value })}
                          className={cn('rounded px-2.5 py-1 text-small', d.status === c.value ? (c.value === 'ASSIGNED' ? 'bg-subtle font-medium' : 'bg-accent-soft font-medium text-accent-strong') : 'text-fg-secondary hover:text-fg')}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <Input value={d.feedback} onChange={(e) => set(r.studentId, { feedback: e.target.value })} placeholder="Note for parents (optional)" maxLength={500} className="sm:w-56" aria-label={`Note for ${r.name}`} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Close</Button>
        <Button onClick={() => void save()} loading={saving} disabled={!changed.length}>Save {changed.length ? `(${changed.length})` : ''}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
