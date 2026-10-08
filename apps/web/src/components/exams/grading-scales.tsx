'use client';

import type { GradingPreset, GradingScaleItem } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Award, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiDelete, apiPost, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';

const PRESETS: { key: GradingPreset; label: string; hint: string }[] = [
  { key: 'CBSE_9', label: 'CBSE 9-point', hint: 'A1–E with grade points' },
  { key: 'A_TO_E', label: 'A–E', hint: 'Five letter grades' },
  { key: 'PERCENTAGE', label: 'Percentage only', hint: 'No letter grades' },
];

type Band = { label: string; minPercent: string; maxPercent: string; gradePoint: string; remark: string };

export function GradingScales({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const scales = useData<GradingScaleItem[]>(['grading-scales'], '/grading-scales');
  const [editing, setEditing] = useState<GradingScaleItem | 'new' | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['grading-scales'] });

  async function addPreset(preset: GradingPreset) {
    try {
      await apiPost('/grading-scales/presets', { preset });
      await refresh();
      toast.success('Grading scale added');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t add it.');
    }
  }
  async function remove(s: GradingScaleItem) {
    if (!window.confirm(`Delete “${s.name}”?`)) return;
    try {
      await apiDelete(`/grading-scales/${s.id}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  if (!scales.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small text-fg-secondary">Add a ready-made scale:</span>
          {PRESETS.map((p) => (
            <Button key={p.key} variant="secondary" size="sm" title={p.hint} onClick={() => void addPreset(p.key)} disabled={scales.data.some((s) => s.name === p.label)}>
              <Plus /> {p.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setEditing('new')}><Plus /> Custom scale</Button>
        </div>
      )}
      {!scales.data.length ? (
        <Card><EmptyState icon={<Award />} title="No grading scale yet" description="Add a ready-made scale above — every exam uses one." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scales.data.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">{s.name} {s.isDefault && <Badge tone="accent">Default</Badge>}</div>
                  <div className="text-small text-fg-secondary">{s.bands.length ? `${s.bands.length} grades` : 'Percentage only'} · used by {s.usedBy} exam{s.usedBy === 1 ? '' : 's'}</div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => void remove(s)} disabled={s.usedBy > 0}><Trash2 /></Button>
                  </div>
                )}
              </div>
              {s.bands.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-4">
                  {s.bands.map((b) => (
                    <span key={b.id} className="rounded-md border border-border px-2 py-1 text-small" title={b.remark ?? undefined}>
                      <b>{b.label}</b> <span className="tabular text-fg-secondary">{b.minPercent}–{Math.floor(b.maxPercent)}%</span>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === 'new' ? 'New grading scale' : `Edit ${editing.name}`} className="max-w-[640px]">
            <ScaleForm existing={editing === 'new' ? undefined : editing} onDone={() => { setEditing(null); void refresh(); }} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ScaleForm({ existing, onDone }: { existing?: GradingScaleItem; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [bands, setBands] = useState<Band[]>(
    existing?.bands.map((b) => ({ label: b.label, minPercent: String(b.minPercent), maxPercent: String(b.maxPercent), gradePoint: b.gradePoint === null ? '' : String(b.gradePoint), remark: b.remark ?? '' })) ?? [
      { label: 'A', minPercent: '80', maxPercent: '100', gradePoint: '', remark: '' },
    ],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<Band>) => setBands((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setSaving(true);
    setErrors({});
    const body = {
      name: name.trim(),
      isDefault,
      bands: bands.map((b) => ({ label: b.label.trim(), minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent), gradePoint: b.gradePoint === '' ? null : Number(b.gradePoint), remark: b.remark.trim() || null })),
    };
    try {
      if (existing) await apiPut(`/grading-scales/${existing.id}`, body);
      else await apiPost('/grading-scales', body);
      toast.success('Grading scale saved');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!, d.message])));
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save it.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Name" htmlFor="gs-name" error={errors.name}><Input id="gs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
          <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} label="Default" className="pb-2" />
        </div>
        <div>
          <div className="mb-1.5 grid grid-cols-[64px_80px_80px_64px_1fr_32px] gap-2 text-caption font-medium text-fg-tertiary">
            <span>Grade</span><span>From %</span><span>To %</span><span>Points</span><span>Remark</span><span />
          </div>
          <div className="flex flex-col gap-1.5">
            {bands.map((b, i) => {
              const err = errors[`bands.${i}.label`] ?? errors[`bands.${i}.maxPercent`] ?? errors[`bands.${i}.minPercent`];
              return (
                <div key={i}>
                  <div className="grid grid-cols-[64px_80px_80px_64px_1fr_32px] items-center gap-2">
                    <Input className="h-8" value={b.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={10} aria-label="Grade" />
                    <Input className="h-8" type="number" value={b.minPercent} onChange={(e) => set(i, { minPercent: e.target.value })} aria-label={`${b.label} from`} />
                    <Input className="h-8" type="number" value={b.maxPercent} onChange={(e) => set(i, { maxPercent: e.target.value })} aria-label={`${b.label} to`} />
                    <Input className="h-8" type="number" value={b.gradePoint} onChange={(e) => set(i, { gradePoint: e.target.value })} aria-label={`${b.label} points`} />
                    <Input className="h-8" value={b.remark} onChange={(e) => set(i, { remark: e.target.value })} maxLength={60} aria-label={`${b.label} remark`} />
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${b.label}`} onClick={() => setBands((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                  {err && <p className="mt-0.5 text-caption text-danger">{err}</p>}
                </div>
              );
            })}
          </div>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => setBands((b) => [...b, { label: '', minPercent: '0', maxPercent: '0', gradePoint: '', remark: '' }])} disabled={bands.length >= 15}>
            <Plus /> Add grade
          </Button>
          <p className="mt-2 text-caption text-fg-tertiary">A student gets the grade whose “From %” they reach. Leave no grades for percentage-only results.</p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving}>Save scale</Button>
      </DialogFooter>
    </>
  );
}
