'use client';

import type { BellScheduleItem, PeriodItem, TimetableView } from '@schoolos/contracts';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Select,
  Skeleton,
  toast,
} from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiDelete, apiFetch, apiPost, apiPut } from '@/lib/api-client';
import { useAssignments, useSubjects, useTeacherOptions } from '@/lib/academics';
import { useData } from '@/lib/hooks';
import { formatDate, fullName, todayISO } from '@/lib/format';
import { DAY_LONG, isoDay } from '@/lib/timetable';
import { WeekGrid, cellKey, type GridCell } from './week-grid';

export function SectionTimetable({ sectionId, canManage }: { sectionId: string; canManage: boolean }) {
  const query = useQuery({
    queryKey: ['timetable', 'section', sectionId],
    queryFn: () => apiFetch<{ data: TimetableView | null }>(`/timetables?sectionId=${sectionId}`).then((r) => r.data),
  });
  if (query.isError) return <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>;
  if (query.isPending) return <Skeleton className="h-[420px]" />;
  if (!query.data) return canManage ? <CreateTimetable sectionId={sectionId} /> : <Card><EmptyState icon={<CalendarClock />} title="No timetable yet" description="The school hasn't published this section's timetable." /></Card>;
  const view = query.data;
  return canManage ? <Editor key={`${view.id}|${JSON.stringify(view.entries)}|${view.bellSchedule.periods.length}`} view={view} sectionId={sectionId} /> : <ReadOnly view={view} />;
}

function ReadOnly({ view }: { view: TimetableView }) {
  const cells = useMemo(() => new Map(view.entries.map((e) => [cellKey(e.dayOfWeek, e.periodId), e as GridCell])), [view]);
  return (
    <Card className="p-2">
      <WeekGrid days={view.days} periods={view.bellSchedule.periods} cells={cells} today={isoDay(todayISO())} />
    </Card>
  );
}

function CreateTimetable({ sectionId }: { sectionId: string }) {
  const qc = useQueryClient();
  const schedules = useData<BellScheduleItem[]>(['bell-schedules'], '/bell-schedules');
  const [scheduleId, setScheduleId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!scheduleId && schedules.data?.length) setScheduleId((schedules.data.find((s) => s.isDefault) ?? schedules.data[0]!).id);
  }, [schedules.data, scheduleId]);

  async function create() {
    setBusy(true);
    try {
      await apiPost('/timetables', { sectionId, bellScheduleId: scheduleId });
      await qc.invalidateQueries({ queryKey: ['timetable'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t start the timetable.');
    } finally {
      setBusy(false);
    }
  }

  if (!schedules.data) return <Skeleton className="h-48" />;
  if (!schedules.data.length) {
    return (
      <Card>
        <EmptyState icon={<CalendarClock />} title="Set up your bell schedule first" description="Add your periods and breaks under Bell schedules, then come back to build timetables." />
      </Card>
    );
  }
  return (
    <Card>
      <EmptyState
        icon={<CalendarClock />}
        title="No timetable for this section yet"
        description="Pick the bell schedule this section follows, then fill in the week."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} aria-label="Bell schedule" className="w-48">
              {schedules.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button onClick={() => void create()} loading={busy}>Start timetable</Button>
          </div>
        }
      />
    </Card>
  );
}

type Slot = { day: number; period: PeriodItem };

function Editor({ view, sectionId }: { view: TimetableView; sectionId: string }) {
  const qc = useQueryClient();
  const initial = useMemo(() => new Map(view.entries.map((e) => [cellKey(e.dayOfWeek, e.periodId), { subject: e.subject, teacher: e.teacher, room: e.room } as GridCell])), [view]);
  const [cells, setCells] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify([...cells].sort()) !== JSON.stringify([...initial].sort()), [cells, initial]);
  const periods = view.bellSchedule.periods;
  const teaching = periods.filter((p) => !p.isBreak).length * view.days.length;
  const filled = [...cells.values()].filter((c) => c.subject || c.teacher).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(): Promise<boolean> {
    setSaving(true);
    setErrors({});
    const keys = [...cells.keys()].filter((k) => cells.get(k)!.subject || cells.get(k)!.teacher);
    const entries = keys.map((k) => {
      const [day, periodId] = k.split('|');
      const c = cells.get(k)!;
      return { dayOfWeek: Number(day), periodId: periodId!, subjectId: c.subject?.id ?? null, teacherId: c.teacher?.id ?? null, room: c.room || null };
    });
    try {
      const res = await apiPut<{ data: TimetableView }>(`/timetables/${view.id}/entries`, { entries });
      qc.setQueryData(['timetable', 'section', sectionId], res.data);
      void qc.invalidateQueries({ queryKey: ['timetable', 'overview'] });
      toast.success(view.status === 'PUBLISHED' ? 'Timetable saved · teachers and parents see the change' : 'Timetable saved');
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TEACHER_CLASH') {
        const map: Record<string, string> = {};
        for (const d of err.details ?? []) {
          const i = Number(d.field?.split('.')[1]);
          if (keys[i]) map[keys[i]!] = d.message;
        }
        setErrors(map);
      }
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the timetable.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    try {
      const res = await apiPost<{ data: TimetableView }>(`/timetables/${view.id}/publish`);
      qc.setQueryData(['timetable', 'section', sectionId], res.data);
      void qc.invalidateQueries({ queryKey: ['timetable', 'overview'] });
      toast.success('Published · teachers and parents can see it now');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t publish it.');
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the ${view.section.label} timetable? This can't be undone.`)) return;
    try {
      await apiDelete(`/timetables/${view.id}`);
      await qc.invalidateQueries({ queryKey: ['timetable'] });
      toast.success('Timetable deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
            <Badge tone={view.status === 'PUBLISHED' ? 'success' : 'warning'} dot>{view.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
            <span>{view.bellSchedule.name} schedule</span>
            <span>· {filled} of {teaching} periods filled</span>
            {view.publishedAt && <span>· published {formatDate(view.publishedAt)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant={view.status === 'PUBLISHED' ? 'primary' : 'secondary'} onClick={() => void save()} loading={saving} disabled={!dirty}>Save</Button>
            {view.status !== 'PUBLISHED' && <Button onClick={() => void publish()} disabled={saving}><Send /> Publish</Button>}
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem destructive onSelect={() => void remove()}><Trash2 /> Delete timetable</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
        <div className="p-2">
          <WeekGrid days={view.days} periods={periods} cells={cells} errors={errors} onCell={(day, period) => setEditing({ day, period })} today={isoDay(todayISO())} />
        </div>
        {Object.keys(errors).length > 0 && (
          <ul className="flex flex-col gap-1 border-t border-border px-4 py-3 text-small text-danger">
            {Object.values(errors).map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`${DAY_LONG[editing.day]} · ${editing.period.name}`} description={`${view.section.label} · ${editing.period.startTime}–${editing.period.endTime}`}>
            <CellEditor
              sectionId={sectionId}
              cell={cells.get(cellKey(editing.day, editing.period.id))}
              onCancel={() => setEditing(null)}
              onApply={(cell, everyDay) => {
                setCells((prev) => {
                  const next = new Map(prev);
                  for (const d of everyDay ? view.days : [editing.day]) {
                    const k = cellKey(d, editing.period.id);
                    if (cell) next.set(k, cell);
                    else next.delete(k);
                  }
                  return next;
                });
                setErrors((e) => {
                  const next = { ...e };
                  for (const d of everyDay ? view.days : [editing.day]) delete next[cellKey(d, editing.period.id)];
                  return next;
                });
                setEditing(null);
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function CellEditor({
  sectionId,
  cell,
  onApply,
  onCancel,
}: {
  sectionId: string;
  cell: GridCell | undefined;
  onApply: (cell: GridCell | null, everyDay: boolean) => void;
  onCancel: () => void;
}) {
  const subjects = useSubjects();
  const teachers = useTeacherOptions();
  const assignments = useAssignments(`sectionId=${sectionId}`);
  const [subjectId, setSubjectId] = useState(cell?.subject?.id ?? '');
  const [teacherId, setTeacherId] = useState(cell?.teacher?.id ?? '');
  const [room, setRoom] = useState(cell?.room ?? '');
  const [everyDay, setEveryDay] = useState(false);

  const assigned = (assignments.data ?? []).filter((a) => a.subject.id === subjectId);
  const pickSubject = (id: string) => {
    setSubjectId(id);
    const match = (assignments.data ?? []).find((a) => a.subject.id === id);
    if (match) setTeacherId(match.teacher.id);
  };

  function apply() {
    const subject = subjects.data?.find((s) => s.id === subjectId);
    const t = teachers.data?.find((x) => x.id === teacherId);
    if (!subject && !t) return onApply(null, everyDay);
    onApply({ subject: subject ? { id: subject.id, name: subject.name } : null, teacher: t ? { id: t.id, name: fullName(t.firstName, t.lastName) } : null, room: room.trim() || null }, everyDay);
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Subject" htmlFor="tt-subject">
          <Select id="tt-subject" value={subjectId} onChange={(e) => pickSubject(e.target.value)}>
            <option value="">No subject</option>
            {subjects.data?.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Teacher" htmlFor="tt-teacher" hint={assigned.length ? `Teaches this subject here: ${assigned.map((a) => a.teacher.name).join(', ')}` : undefined}>
          <Select id="tt-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">No teacher</option>
            {assigned.length > 0 && (
              <optgroup label="Subject teacher">
                {assigned.map((a) => <option key={`a-${a.teacher.id}`} value={a.teacher.id}>{a.teacher.name}</option>)}
              </optgroup>
            )}
            <optgroup label="All teachers">
              {teachers.data?.filter((t) => t.status !== 'LEFT').map((t) => <option key={t.id} value={t.id}>{fullName(t.firstName, t.lastName)}</option>)}
            </optgroup>
          </Select>
        </Field>
        <Field label="Room" htmlFor="tt-room" hint="Optional">
          <Input id="tt-room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={30} placeholder="e.g. Lab 2" />
        </Field>
        <Checkbox checked={everyDay} onChange={(e) => setEveryDay(e.target.checked)} label="Same for every day" description="Fill this period the same way across the week." />
      </DialogBody>
      <DialogFooter>
        {cell && <Button variant="ghost" className="mr-auto text-danger" onClick={() => onApply(null, everyDay)}>Clear slot</Button>}
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={apply}>Done</Button>
      </DialogFooter>
    </>
  );
}
