'use client';

import { REMINDER_REPEAT_LABELS, type ReminderItem, type ReminderRepeat } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Suspense, useState } from 'react';
import { Gate } from '@/components/gate';
import { ApiError, apiDelete, apiPatch, apiPost } from '@/lib/api-client';
import { useChild } from '@/lib/child';
import { todayISO } from '@/lib/format';
import { useData, useTabParam } from '@/lib/hooks';

const pad = (n: number) => String(n).padStart(2, '0');
const local = (iso: string) => {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const when = (iso: string) => {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d).toUpperCase();
  const today = todayISO();
  const tomorrow = local(new Date(Date.now() + 86_400_000).toISOString()).date;
  const date = local(iso).date;
  const dayLabel = date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${dayLabel}, ${time}`;
};

/** Ready-made reminders parents set most. */
const PRESETS = ['Pick up from school', 'School bus', 'Parent–teacher meeting', 'Pay school fees', 'Pack sports kit', 'School event'];

function ReminderForm({ existing, onDone }: { existing?: ReminderItem; onDone: () => void }) {
  const qc = useQueryClient();
  const { children: kids } = useChild();
  const start = existing ? local(existing.remindAt) : { date: todayISO(), time: '13:30' };
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [repeat, setRepeat] = useState<ReminderRepeat>(existing?.repeat ?? 'NONE');
  const [studentId, setStudentId] = useState(existing?.student?.id ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body = { title, notes, remindAt: new Date(`${date}T${time}:00`).toISOString(), repeat, studentId: studentId || null };
      if (existing) await apiPatch(`/reminders/${existing.id}`, existing.completedAt ? { ...body, completed: false } : body);
      else await apiPost('/reminders', body);
      await qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(`Reminder set for ${when(body.remindAt)}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title={existing ? 'Edit reminder' : 'New reminder'} description="You'll get a notification on the app (and here) at this time." className="max-w-[520px]">
      <DialogBody className="flex flex-col gap-4">
        <Field label="Remind me to" htmlFor="rm-title">
          <Input id="rm-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Pick up Rahul" autoFocus />
        </Field>
        {!existing && (
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setTitle(p)} className="rounded-full border border-border px-2.5 py-1 text-caption hover:border-accent hover:bg-accent-tint">{p}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="rm-date"><Input id="rm-date" type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Time" htmlFor="rm-time"><Input id="rm-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeat" htmlFor="rm-repeat">
            <Select id="rm-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}>
              {(Object.keys(REMINDER_REPEAT_LABELS) as ReminderRepeat[]).map((r) => <option key={r} value={r}>{REMINDER_REPEAT_LABELS[r]}</option>)}
            </Select>
          </Field>
          {kids.length > 0 && (
            <Field label="Child" htmlFor="rm-child">
              <Select id="rm-child" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">—</option>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.firstName}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Note" htmlFor="rm-notes" hint="Optional — shown in the notification"><Textarea id="rm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Gate 2, bring the umbrella" /></Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={!title.trim() || !date || !time}>{existing ? 'Save' : 'Set reminder'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RemindersPageContent() {
  const qc = useQueryClient();
  const [status, setStatus] = useTabParam<'active' | 'done'>(['active', 'done']);
  const list = useData<ReminderItem[]>(['reminders', status], `/reminders?status=${status}`, { staleTime: 0 });
  const [editing, setEditing] = useState<ReminderItem | 'new' | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['reminders'] });

  async function act(r: ReminderItem, action: 'done' | 'delete') {
    try {
      if (action === 'done') await apiPatch(`/reminders/${r.id}`, { completed: true });
      else await apiDelete(`/reminders/${r.id}`);
      await refresh();
      toast.success(action === 'done' ? 'Marked done' : 'Reminder deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reminders"
        description="Your own alarms for school things — pick-up time, meetings, events. Only you can see them."
        actions={<Button onClick={() => setEditing('new')}><Plus /> New reminder</Button>}
      />
      <Tabs<'active' | 'done'> value={status} onChange={setStatus} items={[{ value: 'active', label: 'Upcoming' }, { value: 'done', label: 'Done' }]} />
      {list.isError ? (
        <Card><ErrorState message={list.error instanceof ApiError ? list.error.message : undefined} onRetry={() => void list.refetch()} /></Card>
      ) : !list.data ? (
        <Skeleton className="h-40" />
      ) : !list.data.length ? (
        <Card><EmptyState icon={<AlarmClock />} title={status === 'active' ? 'No reminders set' : 'Nothing done yet'} description="For example: “Pick up Rahul at 1:30 PM”, Monday to Saturday." /></Card>
      ) : (
        <Card>
          <ul>
            {list.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', r.completedAt ? 'bg-subtle text-fg-tertiary' : 'bg-accent-soft text-accent-strong')}><AlarmClock className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className={cn('font-medium', r.completedAt && 'text-fg-secondary line-through')}>{r.title}</div>
                  <div className="text-small text-fg-secondary">
                    {r.completedAt ? `Done · was ${when(r.remindAt)}` : when(r.remindAt)}
                    {r.student && ` · ${r.student.name.split(' ')[0]}`}
                    {r.notes && ` · ${r.notes}`}
                  </div>
                </div>
                {r.repeat !== 'NONE' && <Badge tone="accent">{REMINDER_REPEAT_LABELS[r.repeat]}</Badge>}
                <div className="flex gap-1">
                  {r.completedAt ? (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><RotateCcw /> Set again</Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(r)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Mark done" onClick={() => void act(r, 'done')}><Check /></Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label="Delete" className="text-danger" onClick={() => void act(r, 'delete')}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <ReminderForm existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

export default function RemindersPage() {
  return (
    <Gate any={['reminder.use']}>
      <Suspense>
        <RemindersPageContent />
      </Suspense>
    </Gate>
  );
}
