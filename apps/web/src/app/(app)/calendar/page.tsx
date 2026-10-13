'use client';

import { CALENDAR_KINDS, CALENDAR_KIND_LABELS, type CalendarItem, type CalendarKind } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, ErrorState, Field, Input, PageHeader, Select, Skeleton, Textarea, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { Gate } from '@/components/gate';
import { useClasses } from '@/lib/academics';
import { ApiError, apiDelete, apiPatch, apiPost } from '@/lib/api-client';
import { addMonths, formatMonth, todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

/** One colour per kind, used for the dot, the chip and the badge. */
const KIND_STYLE: Record<CalendarKind, { chip: string; dot: string; tone: 'danger' | 'warning' | 'info' | 'accent' | 'success' | 'neutral' }> = {
  HOLIDAY: { chip: 'bg-danger-bg text-danger border-danger-border', dot: 'bg-danger', tone: 'danger' },
  VACATION: { chip: 'bg-warning-bg text-warning border-warning-border', dot: 'bg-warning', tone: 'warning' },
  EXAM: { chip: 'bg-accent-soft text-accent-strong border-transparent', dot: 'bg-accent', tone: 'accent' },
  EVENT: { chip: 'bg-info-bg text-info border-info-border', dot: 'bg-info', tone: 'info' },
  PTM: { chip: 'bg-success-bg text-success border-success-border', dot: 'bg-success', tone: 'success' },
  OTHER: { chip: 'bg-subtle text-fg-secondary border-border', dot: 'bg-fg-tertiary', tone: 'neutral' },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000));
const nice = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const when = (i: CalendarItem) => (i.startDate === i.endDate ? nice(i.startDate) : `${nice(i.startDate)} – ${nice(i.endDate)}`);
const daysLong = (i: CalendarItem) => Math.round((Date.parse(i.endDate) - Date.parse(i.startDate)) / 86_400_000) + 1;

function EntryForm({ existing, onDone }: { existing?: CalendarItem; onDone: () => void }) {
  const qc = useQueryClient();
  const classes = useClasses();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<CalendarKind>(existing?.kind ?? 'HOLIDAY');
  const [start, setStart] = useState(existing?.startDate ?? todayISO());
  const [end, setEnd] = useState(existing?.endDate ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [notify, setNotify] = useState(!existing);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body = { title, kind, startDate: start, endDate: end || start, description, ...(existing ? {} : { classIds, notify }) };
      if (existing) await apiPatch(`/calendar/${existing.id}`, body);
      else await apiPost('/calendar', body);
      await qc.invalidateQueries({ queryKey: ['calendar'] });
      toast.success(existing ? 'Calendar updated' : notify ? 'Added — everyone it concerns has been told.' : 'Added to the calendar');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title={existing ? 'Edit calendar entry' : 'Add to the calendar'} description="Holidays, vacations, events and parent–teacher meetings. Exams appear on their own from each exam's date sheet." className="max-w-[560px]">
      <DialogBody className="flex flex-col gap-4">
        <Field label="Title" htmlFor="cal-title"><Input id="cal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Diwali break" autoFocus /></Field>
        <Field label="Type" htmlFor="cal-kind">
          <Select id="cal-kind" value={kind} onChange={(e) => setKind(e.target.value as CalendarKind)}>
            {CALENDAR_KINDS.filter((k) => k !== 'EXAM').map((k) => <option key={k} value={k}>{CALENDAR_KIND_LABELS[k]}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="cal-start"><Input id="cal-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To" htmlFor="cal-end" hint="Leave empty for one day"><Input id="cal-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {!existing && (
          <Field label="Who it's for" htmlFor="cal-classes" hint={classIds.length ? `${classIds.length} class${classIds.length === 1 ? '' : 'es'}` : 'Whole school'}>
            <div id="cal-classes" className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border p-2">
              {(classes.data ?? []).map((c) => {
                const on = classIds.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setClassIds(on ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])} className={cn('rounded-full border px-2.5 py-1 text-caption', on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border text-fg-secondary hover:border-border-strong')}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="Details" htmlFor="cal-desc" hint="Optional"><Textarea id="cal-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. School reopens on Monday" /></Field>
        {!existing && (
          <label className="flex items-center gap-2 text-body">
            <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Tell parents and staff now (app notification)
          </label>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={title.trim().length < 2 || !start}>{existing ? 'Save' : 'Add'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ItemRow({ i, onEdit, onDelete }: { i: CalendarItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
      <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', KIND_STYLE[i.kind].dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{i.title}</span>
          <Badge tone={KIND_STYLE[i.kind].tone}>{i.source === 'PAPER' ? 'Paper' : CALENDAR_KIND_LABELS[i.kind]}</Badge>
        </div>
        <div className="text-small text-fg-secondary">
          {when(i)}{daysLong(i) > 1 ? ` · ${daysLong(i)} days` : ''}{i.time ? ` · ${i.time}` : ''} · {i.audience}
        </div>
        {i.description && <p className="mt-0.5 text-small text-fg-tertiary">{i.description}</p>}
      </div>
      {i.canEdit && (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${i.title}`} onClick={onEdit}><Pencil /></Button>
          <Button variant="ghost" size="icon-sm" className="text-danger" aria-label={`Delete ${i.title}`} onClick={onDelete}><Trash2 /></Button>
        </div>
      )}
    </li>
  );
}

function CalendarPageContent() {
  const { can } = useMe();
  const qc = useQueryClient();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarItem | 'new' | null>(null);
  const first = `${month}-01`;
  const daysIn = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const last = `${month}-${String(daysIn).padStart(2, '0')}`;
  const items = useData<CalendarItem[]>(['calendar', month], `/calendar?from=${first}&to=${last}`, { staleTime: 0 });
  const today = todayISO();
  const upcoming = useData<CalendarItem[]>(['calendar', 'upcoming'], `/calendar?from=${today}&to=${addDays(today, 120)}`);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const i of items.data ?? []) {
      for (let d = i.startDate < first ? first : i.startDate; d <= i.endDate && d <= last; d = addDays(d, 1)) map.set(d, [...(map.get(d) ?? []), i]);
    }
    return map;
  }, [items.data, first, last]);

  async function remove(i: CalendarItem) {
    try {
      await apiDelete(`/calendar/${i.id}`);
      await qc.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Removed from the calendar');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    }
  }

  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const listed = picked ? (byDay.get(picked) ?? []) : (items.data ?? []).filter((i) => i.source !== 'PAPER');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Holidays, vacations, exams and events for the whole year — plan ahead."
        actions={can('calendar.manage') && <Button onClick={() => setEditing('new')}><Plus /> Add to calendar</Button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => { setMonth(addMonths(month, -1)); setPicked(null); }}><ChevronLeft /></Button>
          <span className="min-w-40 text-center text-h3 font-semibold">{formatMonth(month)}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => { setMonth(addMonths(month, 1)); setPicked(null); }}><ChevronRight /></Button>
          {month !== today.slice(0, 7) && <Button variant="secondary" size="sm" onClick={() => { setMonth(today.slice(0, 7)); setPicked(null); }}>Today</Button>}
        </div>
        <div className="flex flex-wrap gap-3 text-caption text-fg-secondary">
          {(['HOLIDAY', 'VACATION', 'EXAM', 'EVENT', 'PTM'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('size-2.5 rounded-full', KIND_STYLE[k].dot)} />{CALENDAR_KIND_LABELS[k]}</span>
          ))}
        </div>
      </div>

      {items.isError ? (
        <Card><ErrorState message={items.error instanceof ApiError ? items.error.message : undefined} onRetry={() => void items.refetch()} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-caption font-medium text-fg-tertiary">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            {!items.data ? (
              <Skeleton className="h-96" />
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: offset }, (_, i) => <div key={`pad${i}`} />)}
                {Array.from({ length: daysIn }, (_, i) => {
                  const date = `${month}-${String(i + 1).padStart(2, '0')}`;
                  const list = byDay.get(date) ?? [];
                  const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
                  const holiday = list.some((x) => x.kind === 'HOLIDAY' || x.kind === 'VACATION');
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setPicked(picked === date ? null : date)}
                      aria-label={`${nice(date, { day: 'numeric', month: 'long' })}${list.length ? `: ${list.map((x) => x.title).join(', ')}` : ''}`}
                      className={cn(
                        'flex min-h-16 flex-col gap-0.5 rounded-md border p-1 text-left sm:min-h-24 sm:p-1.5',
                        picked === date ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-border-strong',
                        holiday && 'bg-danger-bg/40',
                      )}
                    >
                      <span className={cn('tabular text-small', date === today ? 'inline-flex size-6 items-center justify-center rounded-full bg-accent font-semibold text-accent-fg' : sunday || holiday ? 'text-danger' : 'text-fg-secondary')}>{i + 1}</span>
                      {list.slice(0, 2).map((x) => (
                        <span key={x.id} className={cn('hidden truncate rounded border px-1 text-[11px] leading-4 sm:block', KIND_STYLE[x.kind].chip)}>{x.title}</span>
                      ))}
                      {list.length > 0 && (
                        <span className="flex gap-0.5 sm:hidden">{list.slice(0, 3).map((x) => <span key={x.id} className={cn('size-1.5 rounded-full', KIND_STYLE[x.kind].dot)} />)}</span>
                      )}
                      {list.length > 2 && <span className="hidden text-[11px] text-fg-tertiary sm:block">+{list.length - 2} more</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title={picked ? nice(picked, { weekday: 'long', day: 'numeric', month: 'long' }) : `In ${formatMonth(month)}`} description={picked ? undefined : 'Tap a day for its details'} />
              {!items.data ? (
                <Skeleton className="m-5 h-24" />
              ) : !listed.length ? (
                <p className="px-5 py-6 text-center text-small text-fg-secondary">{picked ? (new Date(`${picked}T00:00:00Z`).getUTCDay() === 0 ? 'Sunday' : 'A regular school day') : 'Nothing on the calendar this month'}</p>
              ) : (
                <ul className="mt-3 border-t border-border">{listed.map((i) => <ItemRow key={i.id} i={i} onEdit={() => setEditing(i)} onDelete={() => void remove(i)} />)}</ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Coming up" description="Holidays and exams in the next four months" />
              {!upcoming.data ? (
                <Skeleton className="m-5 h-24" />
              ) : (
                <ul className="mt-3 border-t border-border">
                  {upcoming.data.filter((i) => i.source !== 'PAPER' && ['HOLIDAY', 'VACATION', 'EXAM', 'PTM'].includes(i.kind)).slice(0, 8).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
                      <div className={cn('flex w-12 shrink-0 flex-col items-center rounded-md border py-1', KIND_STYLE[i.kind].chip)}>
                        <span className="text-[10px] uppercase">{nice(i.startDate, { month: 'short' })}</span>
                        <span className="tabular text-body font-semibold leading-5">{Number(i.startDate.slice(8))}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{i.title}</div>
                        <div className="text-caption text-fg-secondary">{CALENDAR_KIND_LABELS[i.kind]}{daysLong(i) > 1 ? ` · ${daysLong(i)} days` : ''}</div>
                      </div>
                    </li>
                  ))}
                  {!upcoming.data.length && <li className="flex items-center gap-2 px-5 py-6 text-small text-fg-secondary"><CalendarDays className="size-4" /> Nothing planned yet</li>}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <EntryForm existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Gate any={['calendar.view']}>
      <Suspense>
        <CalendarPageContent />
      </Suspense>
    </Gate>
  );
}
