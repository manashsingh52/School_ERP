'use client';

import type { HomeworkItem, HomeworkTargets } from '@schoolos/contracts';
import { Button, DialogBody, DialogFooter, Field, Input, Select, Skeleton, Textarea, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AttachmentsField, type Attachment } from '@/components/attachments-field';
import { ApiError, apiPatch, apiPost } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { fullName, todayISO } from '@/lib/format';
import { useTeacherOptions } from '@/lib/academics';

type Publish = 'NOW' | 'DRAFT' | 'SCHEDULE';
const MAX_FILES = 5;

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> one hour from now. */
function inAnHour(): string {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Create or edit homework. Sections first (chips), then a subject taught in all of them. */
/** Pre-filled text for a new homework (e.g. from an AI worksheet draft). */
export interface HomeworkDraft {
  title: string;
  description: string;
}
export const HOMEWORK_DRAFT_KEY = 'schoolos-homework-draft';

export function HomeworkForm({ existing, draft, onDone }: { existing?: HomeworkItem; draft?: HomeworkDraft; onDone: () => void }) {
  const qc = useQueryClient();
  const targets = useData<HomeworkTargets>(['homework', 'targets'], '/homework/targets', { staleTime: 60_000 });
  const teachers = useTeacherOptions(!!targets.data?.anyTeacher && !existing);
  const [sectionIds, setSectionIds] = useState<string[]>(existing?.sections.map((s) => s.id) ?? []);
  const [subjectId, setSubjectId] = useState(existing?.subject.id ?? '');
  const [title, setTitle] = useState(existing?.title ?? draft?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? draft?.description ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [teacherId, setTeacherId] = useState('');
  const [files, setFiles] = useState<Attachment[]>(existing?.attachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [publish, setPublish] = useState<Publish>('NOW');
  const [publishAt, setPublishAt] = useState(inAnHour);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => targets.data?.sections ?? [], [targets.data]);
  /** Subjects available in every chosen section. */
  const subjects = useMemo(() => {
    const chosen = sections.filter((s) => sectionIds.includes(s.id));
    if (!chosen.length) return [];
    return chosen[0]!.subjects.filter((sub) => chosen.every((c) => c.subjects.some((x) => x.id === sub.id)));
  }, [sections, sectionIds]);
  /** Who teaches the chosen subject in the chosen sections (first section's teacher is the default). */
  const subjectTeacher = useMemo(() => {
    const names = sectionIds
      .map((id) => sections.find((s) => s.id === id)?.subjects.find((x) => x.id === subjectId)?.teacherName)
      .filter((n): n is string => !!n);
    return [...new Set(names)].join(', ') || null;
  }, [sections, sectionIds, subjectId]);

  const toggleSection = (id: string) => {
    setSectionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setErrors((e) => ({ ...e, sectionIds: '' }));
  };

  async function save() {
    const next: Record<string, string> = {};
    if (!sectionIds.length) next.sectionIds = 'Choose at least one section';
    if (!subjectId || !subjects.some((s) => s.id === subjectId)) next.subjectId = 'Choose a subject';
    if (!title.trim()) next.title = 'Add a title';
    if (!existing && publish === 'SCHEDULE' && (!publishAt || new Date(publishAt).getTime() <= Date.now())) next.publishAt = 'Choose a time in the future';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    try {
      const body = {
        subjectId,
        sectionIds,
        title: title.trim(),
        description: description.trim() || (existing ? null : undefined),
        dueDate: dueDate || (existing ? null : undefined),
        attachmentFileIds: files.map((f) => f.id),
      };
      if (existing) {
        await apiPatch(`/homework/${existing.id}`, body);
        toast.success('Homework updated');
      } else {
        await apiPost('/homework', {
          ...body,
          teacherId: teacherId || undefined,
          publish,
          publishAt: publish === 'SCHEDULE' ? new Date(publishAt).toISOString() : undefined,
        });
        toast.success(publish === 'NOW' ? 'Homework published · parents will be told' : publish === 'DRAFT' ? 'Draft saved' : 'Homework scheduled');
      }
      await qc.invalidateQueries({ queryKey: ['homework'] });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!, d.message])));
      }
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the homework.');
    } finally {
      setSaving(false);
    }
  }

  if (!targets.data) {
    return (
      <DialogBody>
        <Skeleton className="h-64" />
      </DialogBody>
    );
  }
  if (!sections.length) {
    return (
      <DialogBody>
        <p className="text-body text-fg-secondary">You don't have any sections with subjects to set homework for. Ask your admin to assign your subjects in Academics.</p>
      </DialogBody>
    );
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Sections" htmlFor="hw-sections" error={errors.sectionIds}>
          <div id="hw-sections" className="flex flex-wrap gap-1.5" role="group" aria-label="Sections">
            {sections.map((s) => {
              const on = sectionIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSection(s.id)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-small font-medium transition-colors',
                    on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border bg-surface text-fg-secondary hover:border-border-strong hover:text-fg',
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Subject" htmlFor="hw-subject" error={errors.subjectId} hint={subjectTeacher && targets.data.anyTeacher ? `Taught by ${subjectTeacher}` : undefined}>
            <Select id="hw-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} invalid={!!errors.subjectId} disabled={!sectionIds.length}>
              <option value="">{sectionIds.length ? (subjects.length ? 'Choose subject' : 'No subject common to these sections') : 'Choose sections first'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="hw-due" hint="Optional">
            <Input id="hw-due" type="date" value={dueDate} min={todayISO()} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Title" htmlFor="hw-title" error={errors.title}>
          <Input id="hw-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Exercise 4.2, questions 1–10" />
        </Field>
        <Field label="Instructions" htmlFor="hw-desc" hint="Optional">
          <Textarea id="hw-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000} />
        </Field>
        <AttachmentsField
          value={files}
          onChange={setFiles}
          purpose="homework_attachment"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
          hint={`PDF, images, Word or Excel · up to 15 MB each · ${MAX_FILES} files`}
          max={MAX_FILES}
          onBusyChange={(b) => setUploading(b ? 1 : 0)}
        />
        {!existing && targets.data.anyTeacher && (
          <Field label="From teacher" htmlFor="hw-teacher" hint="Leave as subject teacher unless someone else set it." error={errors.teacherId}>
            <Select id="hw-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">{subjectTeacher ? `Subject teacher (${subjectTeacher.split(', ')[0]})` : 'Subject teacher'}</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>{fullName(t.firstName, t.lastName)}</option>
              ))}
            </Select>
          </Field>
        )}
        {!existing && (
          <fieldset>
            <legend className="mb-1.5 text-body font-medium">When</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(
                [
                  ['NOW', 'Publish now'],
                  ['SCHEDULE', 'Schedule'],
                  ['DRAFT', 'Save as draft'],
                ] as const
              ).map(([value, text]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-body">
                  <input type="radio" name="hw-publish" value={value} checked={publish === value} onChange={() => setPublish(value)} className="accent-[var(--accent)]" />
                  {text}
                </label>
              ))}
            </div>
            {publish === 'SCHEDULE' && (
              <Field label="Publish at" htmlFor="hw-at" error={errors.publishAt} className="mt-3 max-w-xs">
                <Input id="hw-at" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
              </Field>
            )}
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving} disabled={uploading > 0}>
          {existing ? 'Save changes' : publish === 'NOW' ? 'Publish' : publish === 'DRAFT' ? 'Save draft' : 'Schedule'}
        </Button>
      </DialogFooter>
    </>
  );
}
