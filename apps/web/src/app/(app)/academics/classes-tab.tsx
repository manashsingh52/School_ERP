'use client';

import type { ClassItem, SectionItem } from '@schoolos/contracts';
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
  Select,
  Skeleton,
  cn,
} from '@schoolos/ui';
import { Layers, Plus, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { apiDelete, apiPatch, apiPost } from '@/lib/api-client';
import { keys, sectionLabel, useClasses, useTeacherOptions } from '@/lib/academics';
import { fullName } from '@/lib/format';
import { useAction, useSchool } from '@/lib/hooks';

const PRESET_CLASSES = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`)];

export function ClassesTab({ canManage }: { canManage: boolean }) {
  const classes = useClasses();
  const school = useSchool();
  const [addClasses, setAddClasses] = useState(false);
  const [addSections, setAddSections] = useState(false);
  const [editing, setEditing] = useState<{ section: SectionItem; className: string } | null>(null);
  const year = school.data?.currentAcademicYear;

  if (classes.isError) return <Card><ErrorState onRetry={() => void classes.refetch()} /></Card>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">
          {year ? <>Sections for <span className="font-medium text-fg">{year.name}</span>. Classes stay the same every year.</> : 'Create an academic year to add sections.'}
        </p>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAddClasses(true)}>
              <Plus /> Add classes
            </Button>
            <Button onClick={() => setAddSections(true)} disabled={!year || !classes.data?.length}>
              <Plus /> Add sections
            </Button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {classes.isPending ? (
          <div className="flex flex-col gap-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !classes.data?.length ? (
          <EmptyState
            icon={<Layers />}
            title="No classes yet"
            description="Add the classes your school runs — Nursery to Class 12, or just the ones you have."
            action={canManage && <Button onClick={() => setAddClasses(true)}><Plus /> Add classes</Button>}
          />
        ) : (
          <ul className="divide-y divide-border">
            {classes.data.map((c) => (
              <ClassRow key={c.id} cls={c} canManage={canManage} onEdit={(section) => setEditing({ section, className: c.name })} />
            ))}
          </ul>
        )}
      </Card>

      <AddClassesDialog open={addClasses} onOpenChange={setAddClasses} existing={classes.data ?? []} />
      {year && <AddSectionsDialog open={addSections} onOpenChange={setAddSections} classes={classes.data ?? []} yearId={year.id} />}
      {editing && <EditSectionDialog key={editing.section.id} {...editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ClassRow({ cls, canManage, onEdit }: { cls: ClassItem; canManage: boolean; onEdit: (s: SectionItem) => void }) {
  const total = cls.sections.reduce((n, s) => n + s.studentCount, 0);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="w-40 shrink-0">
        <div className="font-medium">{cls.name}</div>
        <div className="text-small text-fg-tertiary tabular">{total} students</div>
      </div>
      <div className="flex flex-1 flex-wrap gap-2">
        {cls.sections.length === 0 && <span className="text-small text-fg-tertiary">No sections this year</span>}
        {cls.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!canManage}
            onClick={() => onEdit(s)}
            className={cn(
              'flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-left text-small transition-colors',
              canManage && 'hover:border-border-strong hover:bg-hover',
            )}
          >
            <span className="font-semibold">{s.name}</span>
            <span className="tabular text-fg-secondary">{s.studentCount}</span>
            {s.classTeacher ? (
              <span className="flex items-center gap-1 text-fg-secondary"><User className="size-3" />{s.classTeacher.name}</span>
            ) : (
              <span className="text-fg-tertiary">No class teacher</span>
            )}
          </button>
        ))}
      </div>
      {!cls.isActive && <Badge>Inactive</Badge>}
    </li>
  );
}

function AddClassesDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: ClassItem[] }) {
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState('');
  const save = useAction((names: string[]) => apiPost<{ data: { created: number } }>('/classes/bulk', { names }), {
    success: (r) => `${r.data.created} ${r.data.created === 1 ? 'class' : 'classes'} added`,
    invalidate: [['classes']],
    onSuccess: () => {
      setPicked(new Set());
      setCustom('');
      onOpenChange(false);
    },
  });
  const toggle = (name: string) => setPicked((p) => { const n = new Set(p); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const preset = (from: number, to: number) => setPicked(new Set(PRESET_CLASSES.slice(from, to).filter((n) => !have.has(n.toLowerCase()))));
  const names = [...picked, ...custom.split(',').map((s) => s.trim()).filter(Boolean)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add classes" description="Pick the classes your school has. You can add more later.">
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => preset(0, 13)}>Nursery – Class 10</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(0, 15)}>Nursery – Class 12</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(3, 13)}>Class 1 – 10</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_CLASSES.map((name) => {
              const exists = have.has(name.toLowerCase());
              const on = picked.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={exists}
                  onClick={() => toggle(name)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-small transition-colors',
                    exists ? 'border-border bg-subtle text-fg-tertiary' : on ? 'border-accent bg-accent-tint font-medium text-fg' : 'border-border-strong hover:bg-hover',
                  )}
                >
                  {name}
                  {exists && ' ✓'}
                </button>
              );
            })}
          </div>
          <Field label="Other classes" htmlFor="custom-classes" hint="Separate with commas, e.g. Pre-Nursery, Playgroup">
            <Input id="custom-classes" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!names.length} loading={save.isPending} onClick={() => save.mutate(names)}>
            Add {names.length || ''} {names.length === 1 ? 'class' : 'classes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSectionsDialog({ open, onOpenChange, classes, yearId }: { open: boolean; onOpenChange: (o: boolean) => void; classes: ClassItem[]; yearId: string }) {
  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const [names, setNames] = useState('A, B');
  const sectionNames = names.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const save = useAction(
    () => apiPost<{ data: { created: number; skipped: number } }>('/sections/bulk', { academicYearId: yearId, classIds: [...classIds], names: sectionNames }),
    {
      success: (r) => `${r.data.created} sections added${r.data.skipped ? ` (${r.data.skipped} already existed)` : ''}`,
      invalidate: [['classes']],
      onSuccess: () => onOpenChange(false),
    },
  );
  const all = classIds.size === classes.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add sections" description="Sections are created for the current academic year.">
        <DialogBody className="flex flex-col gap-4">
          <Field label="Section names" htmlFor="section-names" hint="Separate with commas — e.g. A, B, C">
            <Input id="section-names" value={names} onChange={(e) => setNames(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-small font-medium">Classes</span>
              <Button size="sm" variant="ghost" onClick={() => setClassIds(all ? new Set() : new Set(classes.map((c) => c.id)))}>
                {all ? 'Clear' : 'Select all'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {classes.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={classIds.has(c.id)}
                  onChange={(e) => setClassIds((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}
                />
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!classIds.size || !sectionNames.length} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Add {classIds.size * sectionNames.length || ''} sections
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSectionDialog({ section, className, onClose }: { section: SectionItem; className: string; onClose: () => void }) {
  const teachers = useTeacherOptions();
  const [name, setName] = useState(section.name);
  const [room, setRoom] = useState(section.room ?? '');
  const [capacity, setCapacity] = useState(section.capacity?.toString() ?? '');
  const [teacherId, setTeacherId] = useState(section.classTeacher?.id ?? '');
  const save = useAction(
    () =>
      apiPatch(`/sections/${section.id}`, {
        name: name.trim().toUpperCase(),
        room: room.trim() || null,
        capacity: capacity ? Number(capacity) : null,
        classTeacherId: teacherId || null,
      }),
    { success: 'Section updated', invalidate: [['classes'], keys.teachersAll], onSuccess: onClose },
  );
  const remove = useAction(() => apiDelete(`/sections/${section.id}`), { success: 'Section deleted', invalidate: [['classes']], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Section ${sectionLabel(className, section.name)}`} description={`${section.studentCount} students this year`}>
        <DialogBody className="grid grid-cols-2 gap-4">
          <Field label="Section name" htmlFor="sec-name">
            <Input id="sec-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={10} />
          </Field>
          <Field label="Room" htmlFor="sec-room">
            <Input id="sec-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 204" />
          </Field>
          <Field label="Class teacher" htmlFor="sec-teacher" className="col-span-2" hint="The class teacher takes daily attendance.">
            <Select id="sec-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">No class teacher</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>{fullName(t.firstName, t.lastName)} · {t.employeeId}</option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity" htmlFor="sec-cap">
            <Input id="sec-cap" type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button
            variant="ghost"
            className="text-danger"
            disabled={section.studentCount > 0}
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined)}
            title={section.studentCount > 0 ? 'Sections with students cannot be deleted' : undefined}
          >
            <Trash2 /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

