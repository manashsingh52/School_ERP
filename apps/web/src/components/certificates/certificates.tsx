'use client';

import { CERTIFICATE_KIND_LABELS, POSITION_SUGGESTIONS, type CertificateItem, type CertificateKind, type DownloadLink, type PageResponse, type StudentListItem } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, DialogBody, DialogContent, DialogFooter, EmptyState, ErrorState, Field, Input, Pagination, Select, Skeleton, cn, toast } from '@schoolos/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Download, Medal, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiDelete, apiFetch, apiPost } from '@/lib/api-client';
import { sectionLabel, useClasses } from '@/lib/academics';
import { formatDate, fullName, todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';

const PAGE = 20;

export async function downloadCertificate(id: string) {
  try {
    window.open((await apiFetch<{ data: DownloadLink }>(`/certificates/${id}/download`)).data.url, '_blank', 'noopener');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
  }
}

/** Certificates as cards: one student's achievements, or everything the member can see. */
export function CertificateList({ studentId, kind, q, mine, showStudent = true, empty }: { studentId?: string; kind?: CertificateKind; q?: string; mine?: boolean; showStudent?: boolean; empty: { title: string; description?: string } }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (studentId) params.set('studentId', studentId);
  if (kind) params.set('kind', kind);
  if (q) params.set('q', q);
  if (mine) params.set('mine', 'true');
  const query = useQuery({
    queryKey: ['certificates', params.toString()],
    queryFn: () => apiFetch<PageResponse<CertificateItem>>(`/certificates?${params}`),
    placeholderData: keepPreviousData,
  });

  async function withdraw(c: CertificateItem) {
    if (!window.confirm(`Withdraw ${c.student.name}'s certificate for “${c.eventName}”? Parents will no longer see it.`)) return;
    try {
      await apiDelete(`/certificates/${c.id}`);
      toast.success('Certificate withdrawn');
      await qc.invalidateQueries({ queryKey: ['certificates'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  if (query.isError) return <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>;
  if (!query.data) return <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!query.data.data.length) return <Card><EmptyState icon={<Award />} title={empty.title} description={empty.description} /></Card>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        {query.data.data.map((c) => {
          const achievement = c.kind === 'ACHIEVEMENT';
          const Icon = achievement ? Trophy : Medal;
          return (
            <Card key={c.id} className="flex gap-4 p-4">
              <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-full', achievement ? 'bg-[#FFF4D6] text-[#B7791F]' : 'bg-accent-tint text-accent-strong')}>
                <Icon className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.eventName}</span>
                  {achievement ? <Badge tone="warning">{c.position}</Badge> : <Badge>{CERTIFICATE_KIND_LABELS[c.kind]}</Badge>}
                </div>
                {showStudent && <div className="mt-0.5 text-body">{c.student.name}{c.student.classLabel && <span className="text-fg-secondary"> · {c.student.classLabel}</span>}</div>}
                <div className="mt-0.5 text-small text-fg-tertiary">{[formatDate(c.eventDate), `Issued by ${c.issuedBy}`, c.serialNo].join(' · ')}</div>
                {c.note && <div className="mt-1 text-small text-fg-secondary">{c.note}</div>}
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => void downloadCertificate(c.id)} aria-label={`Download certificate for ${c.eventName}`}><Download /> Certificate</Button>
                  {c.canDelete && <Button size="sm" variant="ghost" className="text-danger" onClick={() => void withdraw(c)} aria-label={`Withdraw certificate for ${c.eventName}`}><Trash2 /></Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {query.data.page.total > PAGE && <Pagination page={page} pageSize={PAGE} total={query.data.page.total} onPageChange={setPage} />}
    </div>
  );
}

const KINDS: { kind: CertificateKind; icon: typeof Trophy; title: string; text: string }[] = [
  { kind: 'PARTICIPATION', icon: Medal, title: 'Participation', text: 'For taking part in a competition, event or activity.' },
  { kind: 'ACHIEVEMENT', icon: Trophy, title: 'Achievement', text: 'For a position or prize: 1st place, winner, runner-up…' },
];

/**
 * Issue certificates: the type first, then the event, date, position (achievements) and the
 * students: one fixed student, or ticked from a section (a whole team at once).
 */
export function IssueCertificateDialog({ student, onDone }: { student?: { id: string; name: string }; onDone: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<CertificateKind | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(todayISO());
  const [position, setPosition] = useState('');
  const [note, setNote] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const classes = useClasses();
  const sections = (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ id: s.id, label: sectionLabel(c.name, s.name) })));
  const chosenSection = sectionId || sections[0]?.id || '';
  const roster = useData<StudentListItem[]>(['students', 'section', chosenSection], !student && chosenSection ? `/students?sectionId=${chosenSection}&status=ACTIVE&pageSize=100` : null);
  const studentIds = student ? [student.id] : [...picked];

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function issue() {
    setBusy(true);
    setErrors({});
    try {
      const res = await apiPost<{ data: CertificateItem[] }>('/certificates', {
        kind,
        eventName: eventName.trim(),
        eventDate,
        position: kind === 'ACHIEVEMENT' ? position.trim() || undefined : undefined,
        note: note.trim() || undefined,
        studentIds,
      });
      const n = res.data.length;
      toast.success(n === 1 ? 'Certificate issued · parents will be told' : `${n} certificates issued · parents will be told`);
      await qc.invalidateQueries({ queryKey: ['certificates'] });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!.split('.')[0]!, d.message])));
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  if (!kind) {
    return (
      <DialogContent title="Issue a certificate" description={student ? `For ${student.name}. What is it for?` : 'What is it for?'}>
        <DialogBody className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" onClick={() => setKind(k.kind)} className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left hover:border-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent">
              <k.icon className={cn('size-7', k.kind === 'ACHIEVEMENT' ? 'text-[#B7791F]' : 'text-accent-strong')} />
              <span className="text-h3 font-semibold">{k.title}</span>
              <span className="text-small text-fg-secondary">{k.text}</span>
            </button>
          ))}
        </DialogBody>
      </DialogContent>
    );
  }

  const rows = roster.data ?? [];
  const allPicked = rows.length > 0 && rows.every((s) => picked.has(s.id));
  return (
    <DialogContent title={`${CERTIFICATE_KIND_LABELS[kind]} certificate`} description={student ? `For ${student.name}` : 'Choose one student or the whole team.'} className="max-w-[600px]">
      <DialogBody className="flex flex-col gap-4">
        <Field label="Competition or event" htmlFor="cert-event" error={errors.eventName}>
          <Input id="cert-event" value={eventName} maxLength={120} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Inter-school Science Quiz" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of the event" htmlFor="cert-date" error={errors.eventDate}>
            <Input id="cert-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          {kind === 'ACHIEVEMENT' && (
            <Field label="Position" htmlFor="cert-position" error={errors.position}>
              <Input id="cert-position" value={position} maxLength={40} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. 1st place" list="cert-positions" />
              <datalist id="cert-positions">{POSITION_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
          )}
        </div>
        {kind === 'ACHIEVEMENT' && (
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {POSITION_SUGGESTIONS.map((p) => (
              <button key={p} type="button" onClick={() => setPosition(p)} className={cn('rounded-full border px-2.5 py-1 text-small', position === p ? 'border-accent bg-accent-tint text-accent-strong' : 'border-border text-fg-secondary hover:text-fg')}>{p}</button>
            ))}
          </div>
        )}
        <Field label="Extra line (optional)" htmlFor="cert-note" hint="Printed under the main line, e.g. “District level, organised by …”" error={errors.note}>
          <Input id="cert-note" value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {!student && (
          <div className="flex flex-col gap-2">
            <Field label="Section" htmlFor="cert-section">
              <Select id="cert-section" value={chosenSection} onChange={(e) => { setSectionId(e.target.value); setPicked(new Set()); }} disabled={!sections.length}>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <div className="rounded-lg border border-border">
              {!roster.data ? (
                <Skeleton className="m-3 h-20" />
              ) : !rows.length ? (
                <p className="p-3 text-small text-fg-secondary">No students you can award in this section.</p>
              ) : (
                <>
                  <div className="border-b border-border px-3 py-2">
                    <Checkbox label={`Select all (${rows.length})`} checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((s) => s.id)) : new Set())} />
                  </div>
                  <ul className="max-h-56 overflow-y-auto px-3 py-1">
                    {rows.map((s) => (
                      <li key={s.id} className="py-1.5">
                        <Checkbox label={`${s.rollNo ? `${s.rollNo}. ` : ''}${fullName(s.firstName, s.lastName)}`} checked={picked.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {errors.studentIds && <p role="alert" className="text-small text-danger">{errors.studentIds}</p>}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setKind(null)}><ArrowLeft /> Back</Button>
        <Button onClick={() => void issue()} disabled={busy || !eventName.trim() || !studentIds.length || (kind === 'ACHIEVEMENT' && !position.trim())}>
          <Award /> {studentIds.length > 1 ? `Issue ${studentIds.length} certificates` : 'Issue certificate'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
