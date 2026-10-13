'use client';

import { CONVERSATION_CATEGORIES, CONVERSATION_CATEGORY_LABELS, type ConversationCategory, type MeetingItem } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Plus, Video, XCircle } from 'lucide-react';
import { Suspense, useState } from 'react';
import { StudentPicker, type PickedStudent } from '@/components/fees/student-picker';
import { Gate } from '@/components/gate';
import { ApiError, apiPatch, apiPost } from '@/lib/api-client';
import { classSection, todayISO } from '@/lib/format';
import { useData, useTabParam } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).toUpperCase();
/** Local date and time inputs → an ISO instant with the browser's offset. */
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
const localParts = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

const STATUS = {
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  COMPLETED: { label: 'Held', tone: 'success' },
} as const;

function MeetingForm({ existing, onDone }: { existing?: MeetingItem; onDone: () => void }) {
  const qc = useQueryClient();
  const start = existing ? localParts(existing.scheduledAt) : { date: todayISO(), time: '16:00' };
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [title, setTitle] = useState(existing?.title ?? 'Parent–teacher meeting');
  const [category, setCategory] = useState<ConversationCategory>(existing?.category ?? 'ACADEMIC');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 30);
  const [agenda, setAgenda] = useState(existing?.agenda ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body = { title, category, scheduledAt: toIso(date, time), durationMinutes: duration, agenda };
      if (existing) await apiPatch(`/meetings/${existing.id}`, body);
      else await apiPost('/meetings', { ...body, studentId: student!.id });
      await qc.invalidateQueries({ queryKey: ['meetings'] });
      toast.success(existing ? 'Meeting updated — parents were told if the time changed.' : 'Meeting booked — the parents have been notified.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title={existing ? 'Edit or reschedule' : 'Schedule a video meeting'} description="Parents join from the app or a browser. Free video (Jitsi) — nothing to install on a computer." className="max-w-[560px]">
      <DialogBody className="flex flex-col gap-4">
        {!existing &&
          (student ? (
            <Field label="Student" htmlFor="mt-student">
              <div id="mt-student" className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span>{student.name} <span className="text-fg-tertiary">· {classSection(student.className, student.sectionName)}</span></span>
                <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>Change</Button>
              </div>
            </Field>
          ) : (
            <Field label="Which student's parents?" htmlFor="mt-pick">
              <StudentPicker autoFocus onPick={setStudent} />
            </Field>
          ))}
        <Field label="Title" htmlFor="mt-title"><Input id="mt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></Field>
        <Field label="Topic" htmlFor="mt-cat">
          <Select id="mt-cat" value={category} onChange={(e) => setCategory(e.target.value as ConversationCategory)}>
            {CONVERSATION_CATEGORIES.map((c) => <option key={c} value={c}>{CONVERSATION_CATEGORY_LABELS[c]}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" htmlFor="mt-date"><Input id="mt-date" type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Time" htmlFor="mt-time"><Input id="mt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Length" htmlFor="mt-len">
            <Select id="mt-len" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </Select>
          </Field>
        </div>
        <Field label="What to discuss" htmlFor="mt-agenda" hint="Optional — parents see this"><Textarea id="mt-agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3} maxLength={1000} /></Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={(!existing && !student) || title.trim().length < 3 || !date || !time}>{existing ? 'Save' : 'Book and notify parents'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CancelForm({ meeting, onDone }: { meeting: MeetingItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      await apiPost(`/meetings/${meeting.id}/cancel`, { reason });
      await qc.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting cancelled — the parents have been told.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title="Cancel this meeting?" description={`${meeting.title} · ${day(meeting.scheduledAt)}, ${clock(meeting.scheduledAt)}`}>
      <DialogBody>
        <Field label="Reason" htmlFor="mt-reason" hint="Optional — sent to the parents"><Input id="mt-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Keep it</Button>
        <Button variant="destructive" onClick={() => void cancel()} loading={busy}>Cancel meeting</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function MeetingCard({ m, onEdit, onCancel }: { m: MeetingItem; onEdit: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const end = new Date(Date.parse(m.scheduledAt) + m.durationMinutes * 60_000).toISOString();
  async function complete() {
    try {
      await apiPost(`/meetings/${m.id}/complete`);
      await qc.invalidateQueries({ queryKey: ['meetings'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
    }
  }
  return (
    <Card className="flex flex-wrap items-start gap-4 p-5">
      <div className={cn('flex w-20 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-center', m.joinable ? 'border-success-border bg-success-bg text-success' : 'border-border')}>
        <span className="text-caption uppercase">{day(m.scheduledAt).split(' ')[0]}</span>
        <span className="text-h2 font-semibold tabular">{new Date(m.scheduledAt).getDate()}</span>
        <span className="text-caption">{day(m.scheduledAt).split(' ').slice(-1)[0]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{m.title}</span>
          <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
          <Badge>{CONVERSATION_CATEGORY_LABELS[m.category]}</Badge>
        </div>
        <div className="mt-1 text-small text-fg-secondary">
          {clock(m.scheduledAt)}–{clock(end)} · About {m.student.name}{m.student.classLabel ? ` (${m.student.classLabel})` : ''} · With {m.organizer.name}
        </div>
        {m.agenda && <p className="mt-2 whitespace-pre-line text-small">{m.agenda}</p>}
        {m.cancelReason && <p className="mt-2 text-small text-danger">Reason: {m.cancelReason}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {m.joinUrl && (
          m.joinable ? (
            <Button asChild><a href={m.joinUrl} target="_blank" rel="noopener noreferrer"><Video /> Join now</a></Button>
          ) : (
            <span className="text-caption text-fg-tertiary">Join opens 15 min before</span>
          )
        )}
        {m.canManage && (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}><CalendarClock /> Reschedule</Button>
            {Date.parse(m.scheduledAt) <= Date.now() && <Button variant="secondary" size="sm" onClick={() => void complete()}><CheckCircle2 /> Mark as held</Button>}
            <Button variant="ghost" size="sm" className="text-danger" onClick={onCancel}><XCircle /> Cancel</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function MeetingsPageContent() {
  const { can } = useMe();
  const [when, setWhen] = useTabParam<'upcoming' | 'past'>(['upcoming', 'past']);
  const list = useData<MeetingItem[]>(['meetings', when], `/meetings?when=${when}`, { staleTime: 0 });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MeetingItem | null>(null);
  const [cancelling, setCancelling] = useState<MeetingItem | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Meetings"
        description="Live video meetings between parents and teachers — when visiting the school isn't possible."
        actions={can('meeting.manage') && <Button onClick={() => setCreating(true)}><Plus /> Schedule meeting</Button>}
      />
      <Tabs<'upcoming' | 'past'> value={when} onChange={setWhen} items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past and cancelled' }]} />
      {list.isError ? (
        <Card><ErrorState message={list.error instanceof ApiError ? list.error.message : undefined} onRetry={() => void list.refetch()} /></Card>
      ) : !list.data ? (
        <Skeleton className="h-40" />
      ) : !list.data.length ? (
        <Card><EmptyState icon={<Video />} title={when === 'upcoming' ? 'No meetings coming up' : 'No past meetings'} description={can('meeting.manage') ? 'Book a video meeting with a student’s parents — they are notified straight away.' : 'When a teacher books a meeting with you, it appears here with a Join button.'} /></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {list.data.map((m) => <MeetingCard key={m.id} m={m} onEdit={() => setEditing(m)} onCancel={() => setCancelling(m)} />)}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>{creating && <MeetingForm onDone={() => setCreating(false)} />}</Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>{editing && <MeetingForm existing={editing} onDone={() => setEditing(null)} />}</Dialog>
      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>{cancelling && <CancelForm meeting={cancelling} onDone={() => setCancelling(null)} />}</Dialog>
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Gate any={['meeting.view']}>
      <Suspense>
        <MeetingsPageContent />
      </Suspense>
    </Gate>
  );
}
