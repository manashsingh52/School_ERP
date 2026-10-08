'use client';

import type { SubjectItem } from '@schoolos/contracts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  TD,
  TH,
  THead,
  TR,
  Table,
  cn,
} from '@schoolos/ui';
import { BookOpen, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiPatch, apiPost, apiPut } from '@/lib/api-client';
import { keys, useClasses, useClassSubjects, useSubjects } from '@/lib/academics';
import { useAction, useSchool } from '@/lib/hooks';

const PRESETS: { name: string; code: string; type?: 'CORE' | 'ELECTIVE' | 'CO_SCHOLASTIC' }[] = [
  { name: 'English', code: 'ENG' },
  { name: 'Hindi', code: 'HIN' },
  { name: 'Mathematics', code: 'MATH' },
  { name: 'Science', code: 'SCI' },
  { name: 'Social Science', code: 'SST' },
  { name: 'Environmental Studies', code: 'EVS' },
  { name: 'Computer Science', code: 'COMP' },
  { name: 'Sanskrit', code: 'SKT', type: 'ELECTIVE' },
  { name: 'Physics', code: 'PHY' },
  { name: 'Chemistry', code: 'CHEM' },
  { name: 'Biology', code: 'BIO' },
  { name: 'Accountancy', code: 'ACC' },
  { name: 'Business Studies', code: 'BST' },
  { name: 'Economics', code: 'ECO' },
  { name: 'Art & Craft', code: 'ART', type: 'CO_SCHOLASTIC' },
  { name: 'Physical Education', code: 'PE', type: 'CO_SCHOLASTIC' },
  { name: 'Music', code: 'MUS', type: 'CO_SCHOLASTIC' },
];
const TYPE_LABEL = { CORE: 'Core', ELECTIVE: 'Elective', CO_SCHOLASTIC: 'Co-scholastic' } as const;

export function SubjectsTab({ canManage }: { canManage: boolean }) {
  const subjects = useSubjects();
  const [adding, setAdding] = useState(false);
  const toggle = useAction((s: SubjectItem) => apiPatch(`/subjects/${s.id}`, { isActive: !s.isActive }), { invalidate: [keys.subjects] });

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          title="Subjects"
          description="Every subject taught anywhere in the school."
          action={canManage && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add subjects</Button>}
        />
        <div className="mt-3">
          {subjects.isPending ? (
            <div className="flex flex-col gap-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : !subjects.data?.length ? (
            <EmptyState icon={<BookOpen />} title="No subjects yet" description="Add the subjects your school teaches." action={canManage && <Button onClick={() => setAdding(true)}><Plus /> Add subjects</Button>} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH className="w-28">Code</TH>
                  <TH className="w-36">Type</TH>
                  <TH className="w-32" />
                </tr>
              </THead>
              <tbody>
                {subjects.data.map((s) => (
                  <TR key={s.id}>
                    <TD className={cn('font-medium', !s.isActive && 'text-fg-tertiary')}>{s.name}</TD>
                    <TD className="font-mono text-small text-fg-secondary">{s.code}</TD>
                    <TD className="text-fg-secondary">{TYPE_LABEL[s.type]}</TD>
                    <TD className="text-right">
                      {!s.isActive && <Badge className="mr-2">Inactive</Badge>}
                      {canManage && (
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>
                          {s.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {!!subjects.data?.length && <ClassSubjectMatrix canManage={canManage} subjects={subjects.data.filter((s) => s.isActive)} />}
      <AddSubjectsDialog open={adding} onOpenChange={setAdding} existing={subjects.data ?? []} />
    </div>
  );
}

/** Classes × subjects grid for the current year (docs/02: ClassSubject). */
function ClassSubjectMatrix({ canManage, subjects }: { canManage: boolean; subjects: SubjectItem[] }) {
  const school = useSchool();
  const yearId = school.data?.currentAcademicYear?.id;
  const classes = useClasses();
  const current = useClassSubjects();
  const [cells, setCells] = useState<Set<string>>(new Set());
  const original = useMemo(() => new Set((current.data ?? []).map((r) => `${r.classId}:${r.subjectId}`)), [current.data]);
  useEffect(() => setCells(new Set(original)), [original]);
  const dirty = cells.size !== original.size || [...cells].some((c) => !original.has(c));

  const save = useAction(
    async () => {
      const classIds = (classes.data ?? []).map((c) => c.id);
      // One request per distinct subject set keeps it simple and atomic per class group.
      const groups = new Map<string, string[]>();
      for (const classId of classIds) {
        const ids = subjects.filter((s) => cells.has(`${classId}:${s.id}`)).map((s) => s.id).sort();
        const k = ids.join(',');
        groups.set(k, [...(groups.get(k) ?? []), classId]);
      }
      for (const [ids, groupClassIds] of groups) {
        await apiPut('/class-subjects', { academicYearId: yearId, classIds: groupClassIds, subjectIds: ids ? ids.split(',') : [] });
      }
    },
    { success: 'Subjects saved for all classes', invalidate: [['class-subjects']] },
  );

  if (!yearId || !classes.data?.length) return null;
  const toggle = (key: string) => setCells((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleColumn = (subjectId: string) => {
    const keysFor = classes.data!.map((c) => `${c.id}:${subjectId}`);
    const allOn = keysFor.every((k) => cells.has(k));
    setCells((s) => { const n = new Set(s); keysFor.forEach((k) => (allOn ? n.delete(k) : n.add(k))); return n; });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Subjects by class"
        description={`What each class studies in ${school.data?.currentAcademicYear?.name}. Click a subject name to toggle the whole column.`}
        action={canManage && <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save changes</Button>}
      />
      <div className="mt-3">
        {current.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="sticky left-0 bg-surface">Class</TH>
                {subjects.map((s) => (
                  <TH key={s.id} className="text-center">
                    <button type="button" disabled={!canManage} onClick={() => toggleColumn(s.id)} className="whitespace-nowrap hover:text-fg" title={s.name}>
                      {s.code}
                    </button>
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {classes.data.map((c) => (
                <TR key={c.id}>
                  <TD className="sticky left-0 bg-surface font-medium whitespace-nowrap">{c.name}</TD>
                  {subjects.map((s) => {
                    const key = `${c.id}:${s.id}`;
                    return (
                      <TD key={s.id} className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`${c.name} studies ${s.name}`}
                          className="size-4 accent-[var(--accent-500)]"
                          disabled={!canManage}
                          checked={cells.has(key)}
                          onChange={() => toggle(key)}
                        />
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}

function AddSubjectsDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: SubjectItem[] }) {
  const have = new Set(existing.map((s) => s.code));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'CORE' | 'ELECTIVE' | 'CO_SCHOLASTIC'>('CORE');
  const custom = name.trim() && code.trim() ? [{ name: name.trim(), code: code.trim().toUpperCase(), type }] : [];
  const rows = [...PRESETS.filter((p) => picked.has(p.code)).map((p) => ({ type: 'CORE' as const, ...p })), ...custom];

  const save = useAction(() => apiPost<{ data: { created: number } }>('/subjects/bulk', { subjects: rows }), {
    success: (r) => `${r.data.created} subjects added`,
    invalidate: [keys.subjects],
    onSuccess: () => {
      setPicked(new Set());
      setName('');
      setCode('');
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add subjects" description="Pick common subjects or add your own.">
        <DialogBody className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <Checkbox
                key={p.code}
                label={p.name}
                disabled={have.has(p.code)}
                checked={have.has(p.code) || picked.has(p.code)}
                onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(p.code); else n.delete(p.code); return n; })}
              />
            ))}
          </div>
          <div className="grid grid-cols-[1fr_7rem_9rem] gap-2 border-t border-border pt-4">
            <Field label="Other subject" htmlFor="sub-name"><Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. French" /></Field>
            <Field label="Code" htmlFor="sub-code"><Input id="sub-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="FRE" maxLength={12} /></Field>
            <Field label="Type" htmlFor="sub-type">
              <Select id="sub-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="CORE">Core</option>
                <option value="ELECTIVE">Elective</option>
                <option value="CO_SCHOLASTIC">Co-scholastic</option>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!rows.length} loading={save.isPending} onClick={() => save.mutate(undefined)}>Add {rows.length || ''} subjects</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
