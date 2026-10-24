'use client';

import type { SchoolSettingsView, SettingsSection } from '@schoolos/contracts';
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Skeleton, Spinner, Textarea, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ImageUp, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ApiError, apiPut } from '@/lib/api-client';
import { uploadFile, useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

export const useSettings = () => useData<SchoolSettingsView>(['school', 'settings'], '/school/settings');

/** One card per settings section: edit locally, save the whole section. */
function SectionCard<S extends Exclude<SettingsSection, 'branding'>>({ section, title, description, children }: { section: S; title: string; description: string; children: (v: SchoolSettingsView[S], set: (patch: Partial<SchoolSettingsView[S]>) => void, readOnly: boolean) => ReactNode }) {
  const settings = useSettings();
  const qc = useQueryClient();
  const { can } = useMe();
  const readOnly = !can('school.settings.manage');
  const [draft, setDraft] = useState<SchoolSettingsView[S] | null>(null);
  const [saving, setSaving] = useState(false);
  if (!settings.data) return <Skeleton className="h-64" />;
  const value = draft ?? settings.data[section];
  async function save() {
    setSaving(true);
    try {
      qc.setQueryData(['school', 'settings'], (await apiPut<{ data: SchoolSettingsView }>(`/school/settings/${section}`, value)).data);
      setDraft(null);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'We couldn’t save that.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <fieldset disabled={readOnly} className="flex flex-col gap-4 p-5">{children(value, (patch) => setDraft({ ...value, ...patch }), readOnly)}</fieldset>
      {!readOnly && (
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {draft && <Button variant="ghost" onClick={() => setDraft(null)}>Discard</Button>}
          <Button disabled={!draft} loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      )}
    </Card>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const days = (s: string) => s.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);

export function GeneralExtrasCard() {
  return (
    <SectionCard section="general" title="On receipts and report cards" description="Printed under the school's name, and on the principal's signature line.">
      {(v, set) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Principal's name" htmlFor="gs-principal"><Input id="gs-principal" value={v.principalName ?? ''} maxLength={100} onChange={(e) => set({ principalName: e.target.value || null })} /></Field>
            <Field label="Affiliation line" htmlFor="gs-aff" hint="e.g. Affiliated to CBSE · No. 1130456"><Input id="gs-aff" value={v.affiliation ?? ''} maxLength={120} onChange={(e) => set({ affiliation: e.target.value || null })} /></Field>
          </div>
          <div>
            <div className="mb-2 text-small font-medium">Working days</div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = v.workingDays.includes(i + 1);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => set({ workingDays: on ? v.workingDays.filter((x) => x !== i + 1) : [...v.workingDays, i + 1].sort() })} className={cn('h-8 w-12 rounded-md border text-small font-medium disabled:opacity-60', on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border text-fg-secondary hover:border-border-strong')}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function FeeSettingsCard() {
  return (
    <SectionCard section="fees" title="Reminders and receipts" description="Parents get reminders in the app (and by SMS/email when those are switched on in Notifications).">
      {(v, set) => (
        <>
          <Field label="Remind before the due date (days)" htmlFor="fs-before" hint="Up to 3 values, e.g. 7, 1">
            <Input id="fs-before" defaultValue={v.reminderDaysBefore.join(', ')} onChange={(e) => set({ reminderDaysBefore: days(e.target.value).slice(0, 3) })} className="w-48" />
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <Field label="After the due date, remind every" htmlFor="fs-every" hint="days"><Input id="fs-every" type="number" min={1} max={30} value={v.overdueReminderEveryDays} onChange={(e) => set({ overdueReminderEveryDays: Number(e.target.value) })} /></Field>
            <Field label="…at most this many times" htmlFor="fs-max" hint="0 = no overdue reminders"><Input id="fs-max" type="number" min={0} max={12} value={v.maxOverdueReminders} onChange={(e) => set({ maxOverdueReminders: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Note on every receipt" htmlFor="fs-note" hint="Optional, up to 200 characters"><Textarea id="fs-note" rows={2} maxLength={200} value={v.receiptNote ?? ''} onChange={(e) => set({ receiptNote: e.target.value || null })} placeholder="e.g. Fees once paid are not refundable." /></Field>
        </>
      )}
    </SectionCard>
  );
}

export function ExamSettingsCard() {
  return (
    <SectionCard section="examinations" title="Report cards" description="Applies to report cards generated from now on.">
      {(v, set) => (
        <>
          <div className="flex flex-wrap gap-4">
            <Field label="Layout" htmlFor="es-layout" hint="Classic: boxes · Modern: coloured header · Compact: smaller, fits more" className="w-72">
              <Select id="es-layout" value={v.reportCardLayout} onChange={(e) => set({ reportCardLayout: e.target.value as typeof v.reportCardLayout })}>
                <option value="classic">Classic</option>
                <option value="modern">Modern</option>
                <option value="compact">Compact</option>
              </Select>
            </Field>
            <Field label="Heading" htmlFor="es-title" hint="Empty = “Report card”" className="w-64">
              <Input id="es-title" maxLength={40} value={v.reportCardTitle ?? ''} onChange={(e) => set({ reportCardTitle: e.target.value || null })} placeholder="Report card" />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-small font-medium">Show on the card</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['photo', 'Student photo'],
                  ['passMarks', 'Pass marks column'],
                  ['rank', 'Rank in section (when the exam ranks)'],
                  ['gradingKey', 'Grading key'],
                  ['remarks', 'Teacher and principal remarks'],
                  ['parentSignature', 'Parent signature line'],
                ] as const
              ).map(([key, label]) => (
                <Checkbox key={key} checked={v.reportCardShow[key]} onChange={(e) => set({ reportCardShow: { ...v.reportCardShow, [key]: e.target.checked } })} label={label} />
              ))}
            </div>
          </div>
          <Checkbox checked={v.showAttendanceOnReportCard} onChange={(e) => set({ showAttendanceOnReportCard: e.target.checked })} label="Show attendance %" />
          <Field label="Co-scholastic grades (best first)" htmlFor="es-co" hint="Comma-separated, 2–6 grades, e.g. A, B, C">
            <Input id="es-co" defaultValue={v.coScholasticGrades.join(', ')} onChange={(e) => set({ coScholasticGrades: e.target.value.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 6) })} className="w-64" />
          </Field>
          <Field label="Note at the bottom" htmlFor="es-note" hint="Optional, up to 300 characters"><Textarea id="es-note" rows={3} maxLength={300} value={v.reportCardNote ?? ''} onChange={(e) => set({ reportCardNote: e.target.value || null })} placeholder="e.g. School reopens on 2 June. Parent–teacher meeting on Saturday." /></Field>
        </>
      )}
    </SectionCard>
  );
}

/** Signature image + logo on receipts (needs school.branding.manage). */
export function DocumentBrandingCard() {
  const settings = useSettings();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!settings.data) return <Skeleton className="h-40" />;
  const b = settings.data.branding;
  async function save(patch: Partial<SchoolSettingsView['branding']>) {
    setBusy(true);
    try {
      const next = { signatureFileId: b.signatureFileId, showLogoOnReceipts: b.showLogoOnReceipts, ...patch };
      qc.setQueryData(['school', 'settings'], (await apiPut<{ data: SchoolSettingsView }>('/school/settings/branding', next)).data);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save that.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const f = await uploadFile(file, 'signature');
      await save({ signatureFileId: f.id });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The upload didn’t work.');
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Receipts and report cards" description="The principal's signature is printed on report cards and receipts. Use a clear PNG on a white or transparent background, up to 1 MB." />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-48 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
            {b.signatureUrl ? <img src={b.signatureUrl} alt="Principal's signature" className="max-h-14 max-w-44 object-contain" /> : <span className="text-small text-neutral-400">No signature</span>}
          </div>
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Spinner /> : <ImageUp />} {b.signatureUrl ? 'Replace' : 'Upload signature'}</Button>
          {b.signatureFileId && <Button variant="ghost" onClick={() => void save({ signatureFileId: null })} disabled={busy}><X /> Remove</Button>}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
        <Checkbox checked={b.showLogoOnReceipts} disabled={busy} onChange={(e) => void save({ showLogoOnReceipts: e.target.checked })} label="Show the school logo on receipts" />
      </div>
    </Card>
  );
}
