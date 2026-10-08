'use client';

import type { BellScheduleItem, BellScheduleRequest } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Coffee, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiDelete, apiPost, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { clock } from '@/lib/timetable';

type Row = { name: string; startTime: string; endTime: string; isBreak: boolean };

const STARTER: Row[] = [
  { name: 'P1', startTime: '08:00', endTime: '08:40', isBreak: false },
  { name: 'P2', startTime: '08:40', endTime: '09:20', isBreak: false },
  { name: 'P3', startTime: '09:20', endTime: '10:00', isBreak: false },
  { name: 'Break', startTime: '10:00', endTime: '10:20', isBreak: true },
  { name: 'P4', startTime: '10:20', endTime: '11:00', isBreak: false },
  { name: 'P5', startTime: '11:00', endTime: '11:40', isBreak: false },
  { name: 'Lunch', startTime: '11:40', endTime: '12:10', isBreak: true },
  { name: 'P6', startTime: '12:10', endTime: '12:50', isBreak: false },
  { name: 'P7', startTime: '12:50', endTime: '13:30', isBreak: false },
];

/** "08:40" + 40 min → "09:20" */
const addMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const t = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function BellSchedules({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const schedules = useData<BellScheduleItem[]>(['bell-schedules'], '/bell-schedules');
  const [editing, setEditing] = useState<BellScheduleItem | 'new' | null>(null);

  async function remove(s: BellScheduleItem) {
    if (!window.confirm(`Delete the ${s.name} schedule?`)) return;
    try {
      await apiDelete(`/bell-schedules/${s.id}`);
      await qc.invalidateQueries({ queryKey: ['bell-schedules'] });
      toast.success('Schedule deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  if (!schedules.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}><Plus /> New bell schedule</Button>
        </div>
      )}
      {!schedules.data.length ? (
        <Card>
          <EmptyState icon={<Bell />} title="No bell schedule yet" description="Add your periods and breaks once — every section timetable is built on them." action={canManage && <Button onClick={() => setEditing('new')}><Plus /> New bell schedule</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {schedules.data.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-body font-semibold">
                    {s.name} {s.isDefault && <Badge tone="accent">Default</Badge>}
                  </div>
                  <div className="text-small text-fg-secondary">
                    {s.periods.filter((p) => !p.isBreak).length} periods · {clock(s.periods[0]!.startTime)}–{clock(s.periods.at(-1)!.endTime)} · used by {s.usedBy} section{s.usedBy === 1 ? '' : 's'}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => void remove(s)} disabled={s.usedBy > 0}><Trash2 /></Button>
                  </div>
                )}
              </div>
              <ol className="flex flex-col px-4 py-2">
                {s.periods.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1 text-small">
                    <span className={p.isBreak ? 'inline-flex items-center gap-1.5 text-fg-tertiary' : 'font-medium'}>
                      {p.isBreak && <Coffee className="size-3.5" />} {p.name}
                    </span>
                    <span className="tabular text-fg-secondary">{clock(p.startTime)}–{clock(p.endTime)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === 'new' ? 'New bell schedule' : `Edit ${editing.name}`} className="max-w-[640px]">
            <ScheduleForm existing={editing === 'new' ? undefined : editing} first={!schedules.data.length} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ScheduleForm({ existing, first, onDone }: { existing?: BellScheduleItem; first: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? (first ? 'Regular' : ''));
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? first);
  const [rows, setRows] = useState<Row[]>(existing?.periods.map(({ name, startTime, endTime, isBreak }) => ({ name, startTime, endTime, isBreak })) ?? STARTER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addRow = () =>
    setRows((r) => {
      const last = r.at(-1);
      const start = last?.endTime ?? '08:00';
      const n = r.filter((x) => !x.isBreak).length + 1;
      return [...r, { name: `P${n}`, startTime: start, endTime: addMinutes(start, 40), isBreak: false }];
    });

  async function save() {
    setSaving(true);
    setErrors({});
    const body: BellScheduleRequest = { name: name.trim(), isDefault, periods: rows };
    try {
      if (existing) await apiPut(`/bell-schedules/${existing.id}`, body);
      else await apiPost('/bell-schedules', body);
      await qc.invalidateQueries({ queryKey: ['bell-schedules'] });
      await qc.invalidateQueries({ queryKey: ['timetable'] });
      toast.success('Bell schedule saved');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!, d.message])));
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Name" htmlFor="bs-name" error={errors.name}>
            <Input id="bs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regular, Saturday, Winter" maxLength={60} />
          </Field>
          <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} label="Default" className="pb-2" />
        </div>
        <div>
          <div className="mb-1.5 grid grid-cols-[1fr_128px_128px_48px_32px] gap-2 text-caption font-medium text-fg-tertiary">
            <span>Period</span><span>Starts</span><span>Ends</span><span>Break</span><span />
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => {
              const err = errors[`periods.${i}.startTime`] ?? errors[`periods.${i}.endTime`] ?? errors[`periods.${i}.name`];
              return (
                <div key={i}>
                  <div className="grid grid-cols-[1fr_128px_128px_48px_32px] items-center gap-2">
                    <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={30} aria-label={`Period ${i + 1} name`} className="h-8" />
                    <Input type="time" value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} aria-label={`${r.name} start`} className="h-8" />
                    <Input type="time" value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} aria-label={`${r.name} end`} className="h-8" />
                    <Checkbox checked={r.isBreak} onChange={(e) => update(i, { isBreak: e.target.checked })} aria-label={`${r.name} is a break`} />
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.name}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} disabled={rows.length === 1}><Trash2 /></Button>
                  </div>
                  {err && <p className="mt-0.5 text-caption text-danger">{err}</p>}
                </div>
              );
            })}
          </div>
          <Button variant="secondary" size="sm" className="mt-2" onClick={addRow} disabled={rows.length >= 16}><Plus /> Add period</Button>
          {existing && existing.usedBy > 0 && <p className="mt-2 text-caption text-fg-tertiary">Timetables keep their classes: periods are matched by position.</p>}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving}>Save schedule</Button>
      </DialogFooter>
    </>
  );
}
