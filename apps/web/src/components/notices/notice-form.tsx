'use client';

import type { Audience, NoticeAudienceOptions, NoticeItem, NoticeType } from '@schoolos/contracts';
import { Button, Checkbox, DialogBody, DialogFooter, Field, Input, Select, Skeleton, Textarea, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { AttachmentsField, type Attachment } from '@/components/attachments-field';
import { ApiError, apiPatch, apiPost } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { NOTICE_TYPE } from '@/lib/labels';

type Publish = 'NOW' | 'DRAFT' | 'SCHEDULE';
type Picked = Audience & { label: string };

const GROUPS: { type: Audience['type']; label: string }[] = [
  { type: 'SCHOOL', label: 'Everyone' },
  { type: 'ALL_PARENTS', label: 'All parents' },
  { type: 'ALL_TEACHERS', label: 'All teachers' },
  { type: 'ALL_STAFF', label: 'All staff' },
];

/** "2026-10-08T14:00" (local) ⇄ ISO */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const inAnHour = () => {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  return toLocal(d.toISOString());
};

export function NoticeForm({ existing, onDone }: { existing?: NoticeItem; onDone: (id?: string) => void }) {
  const qc = useQueryClient();
  const options = useData<NoticeAudienceOptions>(['notices', 'audience-options'], '/notices/audience-options', { staleTime: 60_000 });
  const [type, setType] = useState<NoticeType>(existing?.type ?? 'NOTICE');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [audiences, setAudiences] = useState<Picked[]>(existing?.audiences.map((a) => ({ type: a.type, refId: a.refId ?? undefined, label: a.label })) ?? []);
  const [files, setFiles] = useState<Attachment[]>(existing?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const [isPinned, setIsPinned] = useState(existing?.isPinned ?? false);
  const [sendPush, setSendPush] = useState(existing?.sendPush ?? true);
  const [eventStartsAt, setEventStartsAt] = useState(toLocal(existing?.eventStartsAt ?? null));
  const [eventEndsAt, setEventEndsAt] = useState(toLocal(existing?.eventEndsAt ?? null));
  const [publish, setPublish] = useState<Publish>('NOW');
  const [publishAt, setPublishAt] = useState(inAnHour);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const opts = options.data;
  const addAudience = (value: string) => {
    if (!value || !opts) return;
    const [kind, refId] = value.split(':') as [Audience['type'], string | undefined];
    const label =
      GROUPS.find((g) => g.type === kind)?.label ??
      (kind === 'CLASS' ? opts.classes.find((c) => c.id === refId)?.label : kind === 'SECTION' ? opts.sections.find((s) => s.id === refId)?.label : opts.roles.find((r) => r.key === refId)?.name) ??
      kind;
    setAudiences((a) => (a.some((x) => x.type === kind && x.refId === refId) ? a : [...a, { type: kind, refId, label }]));
    setErrors((e) => ({ ...e, audiences: '' }));
  };

  async function save() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Add a title';
    if (!body.trim()) next.body = 'Write the notice';
    if (!audiences.length) next.audiences = 'Choose who should see it';
    if (!existing && publish === 'SCHEDULE' && (!publishAt || new Date(publishAt).getTime() <= Date.now())) next.publishAt = 'Choose a time in the future';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    const iso = (v: string) => (v ? new Date(v).toISOString() : existing ? null : undefined);
    const payload = {
      type,
      title: title.trim(),
      body: body.trim(),
      audiences: audiences.map(({ type: t, refId }) => ({ type: t, refId })),
      attachmentFileIds: files.map((f) => f.id),
      isPinned,
      sendPush,
      eventStartsAt: type === 'EVENT' ? iso(eventStartsAt) : existing ? null : undefined,
      eventEndsAt: type === 'EVENT' ? iso(eventEndsAt) : existing ? null : undefined,
    };
    try {
      let id = existing?.id;
      if (existing) {
        await apiPatch(`/notices/${existing.id}`, payload);
        toast.success('Notice updated');
      } else {
        const res = await apiPost<{ data: NoticeItem }>('/notices', { ...payload, publish, publishAt: publish === 'SCHEDULE' ? new Date(publishAt).toISOString() : undefined });
        id = res.data.id;
        toast.success(publish === 'NOW' ? 'Notice published' : publish === 'DRAFT' ? 'Draft saved' : 'Notice scheduled');
      }
      await qc.invalidateQueries({ queryKey: ['notices'] });
      onDone(id);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!.split('.')[0]!, d.message])));
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the notice.');
    } finally {
      setSaving(false);
    }
  }

  if (!opts) return <DialogBody><Skeleton className="h-72" /></DialogBody>;
  const noTargets = !opts.schoolWide && !opts.sections.length;

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Type" htmlFor="nt-type">
            <Select id="nt-type" value={type} onChange={(e) => setType(e.target.value as NoticeType)}>
              {(Object.keys(NOTICE_TYPE) as NoticeType[]).map((t) => <option key={t} value={t}>{NOTICE_TYPE[t]}</option>)}
            </Select>
          </Field>
          <Field label="Title" htmlFor="nt-title" error={errors.title}>
            <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. School closed on Friday" />
          </Field>
        </div>
        <Field label="Message" htmlFor="nt-body" error={errors.body} hint="**bold**, *italic*, “- ” for a list. Links work.">
          <Textarea id="nt-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={10_000} />
        </Field>
        {type === 'EVENT' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="nt-start"><Input id="nt-start" type="datetime-local" value={eventStartsAt} onChange={(e) => setEventStartsAt(e.target.value)} /></Field>
            <Field label="Ends" htmlFor="nt-end" error={errors.eventEndsAt}><Input id="nt-end" type="datetime-local" value={eventEndsAt} onChange={(e) => setEventEndsAt(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Send to" htmlFor="nt-audience" error={errors.audiences}>
          {noTargets ? (
            <p className="text-small text-fg-secondary">You don't teach any section this year, so there's no one you can send notices to.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {audiences.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {audiences.map((a) => (
                    <span key={`${a.type}:${a.refId}`} className="inline-flex h-7 items-center gap-1 rounded-full border border-accent/30 bg-accent-soft pr-1 pl-2.5 text-small font-medium text-accent-strong">
                      {a.label}
                      <button type="button" className="rounded-full p-0.5 hover:bg-accent/10" aria-label={`Remove ${a.label}`} onClick={() => setAudiences((x) => x.filter((y) => y !== a))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Select id="nt-audience" value="" onChange={(e) => addAudience(e.target.value)} className="max-w-xs">
                <option value="">Add people…</option>
                {opts.schoolWide && <optgroup label="Groups">{GROUPS.map((g) => <option key={g.type} value={g.type}>{g.label}</option>)}</optgroup>}
                {opts.classes.length > 0 && <optgroup label="Whole class (parents & teachers)">{opts.classes.map((c) => <option key={c.id} value={`CLASS:${c.id}`}>{c.label}</option>)}</optgroup>}
                {opts.sections.length > 0 && <optgroup label="Section (parents & teachers)">{opts.sections.map((s) => <option key={s.id} value={`SECTION:${s.id}`}>{s.label}</option>)}</optgroup>}
                {opts.roles.length > 0 && <optgroup label="Role">{opts.roles.map((r) => <option key={r.key} value={`ROLE:${r.key}`}>{r.name}</option>)}</optgroup>}
              </Select>
            </div>
          )}
        </Field>
        <AttachmentsField value={files} onChange={setFiles} purpose="notice_attachment" accept=".pdf,.jpg,.jpeg,.png,.webp" hint="PDF or images · up to 15 MB each · 5 files" onBusyChange={setBusy} />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} label="Send a phone notification" description="Everyone also gets it in their inbox." />
          {opts.schoolWide && <Checkbox checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} label="Pin to the top" />}
        </div>
        {!existing && (
          <fieldset>
            <legend className="mb-1.5 text-body font-medium">When</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([['NOW', 'Publish now'], ['SCHEDULE', 'Schedule'], ['DRAFT', 'Save as draft']] as const).map(([value, text]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-body">
                  <input type="radio" name="nt-publish" value={value} checked={publish === value} onChange={() => setPublish(value)} className="accent-[var(--accent)]" />
                  {text}
                </label>
              ))}
            </div>
            {publish === 'SCHEDULE' && (
              <Field label="Publish at" htmlFor="nt-at" error={errors.publishAt} className="mt-3 max-w-xs">
                <Input id="nt-at" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
              </Field>
            )}
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone()}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving} disabled={busy || noTargets}>
          {existing ? 'Save changes' : publish === 'NOW' ? 'Publish' : publish === 'DRAFT' ? 'Save draft' : 'Schedule'}
        </Button>
      </DialogFooter>
    </>
  );
}
