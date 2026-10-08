'use client';

import { updateGuardianSchema, type GuardianItem, type PageResponse, type StudentListItem } from '@schoolos/contracts';
import {
  Avatar,
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
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
} from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Link2, Pencil, Send, Star, Unlink, UserX } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiError, apiDelete, apiFetch, apiPatch, apiPost } from '@/lib/api-client';
import { classLabel, classSection, fullName } from '@/lib/format';
import { contractResolver } from '@/lib/forms';
import { applyServerErrors, useAction, useData } from '@/lib/hooks';
import { LOGIN_BADGE, RELATION_LABEL } from '@/lib/labels';
import { useMe } from '@/lib/me';

export default function GuardianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useMe();
  const guardian = useData<GuardianItem>(['guardian', id], `/guardians/${id}`);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const canManage = can('guardian.manage');
  const refreshKeys = [['guardian', id], ['guardians'], ['student']];
  const invite = useAction(() => apiPost(`/guardians/${id}/invite`), { success: 'Invited to the parent app', invalidate: refreshKeys });
  const unlink = useAction((studentId: string) => apiDelete(`/guardians/${id}/children/${studentId}`), { success: 'Child unlinked', invalidate: refreshKeys });

  const back = <Link href="/guardians" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" /> Parents</Link>;
  if (guardian.isError) {
    const notFound = guardian.error instanceof ApiError && guardian.error.status === 404;
    return <div className="flex flex-col gap-6">{back}<Card>{notFound ? <EmptyState icon={<UserX />} title="Parent not found" description="This parent doesn't exist or isn't visible to you." /> : <ErrorState onRetry={() => void guardian.refetch()} />}</Card></div>;
  }
  const g = guardian.data;

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-center gap-4">
        {g ? <Avatar name={g.name} size={56} /> : <Skeleton className="size-14 rounded-full" />}
        <div className="min-w-0 flex-1">
          {g ? (
            <>
              <h1 className="text-h1 font-semibold tracking-[-0.01em]">{g.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg-secondary">
                <span>{g.phone}</span>
                {g.email && <span>· {g.email}</span>}
                {g.occupation && <span>· {g.occupation}</span>}
                <Badge tone={LOGIN_BADGE[g.login].tone} dot>{LOGIN_BADGE[g.login].label}</Badge>
              </div>
            </>
          ) : <Skeleton className="h-12 w-72" />}
        </div>
        {g && canManage && (
          <div className="flex gap-2">
            {g.login === 'NONE' && <Button variant="secondary" loading={invite.isPending} onClick={() => invite.mutate(undefined)}><Send /> Invite to parent app</Button>}
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader title="Children" action={canManage && <Button size="sm" variant="secondary" onClick={() => setLinking(true)}><Link2 /> Link a child</Button>} />
        <ul className="flex flex-col divide-y divide-border p-2">
          {!g ? <Skeleton className="m-3 h-12" /> : !g.children.length ? (
            <li className="px-3 py-4 text-small text-fg-secondary">No children linked.</li>
          ) : (
            g.children.map((c) => (
              <li key={c.studentId} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={c.name} size={32} />
                <Link href={`/students/${c.studentId}`} className="min-w-0 flex-1 hover:underline">
                  <div className="flex items-center gap-1.5 font-medium">{c.name}{c.isPrimary && <Star className="size-3.5 fill-current text-warning" aria-label="Primary contact" />}</div>
                  <div className="text-small text-fg-secondary">{classLabel(c.className, c.sectionName)} · {RELATION_LABEL[c.relation]} · Adm <span className="font-mono">{c.admissionNo}</span></div>
                </Link>
                {canManage && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Unlink ${c.name}`} onClick={() => unlink.mutate(c.studentId)}><Unlink /></Button>
                )}
              </li>
            ))
          )}
        </ul>
      </Card>

      {g && editing && <EditGuardianDialog guardian={g} onClose={() => setEditing(false)} />}
      {g && linking && <LinkChildDialog guardianId={id} onClose={() => setLinking(false)} />}
    </div>
  );
}

const FIELDS = ['name', 'phone', 'email', 'occupation'];

function EditGuardianDialog({ guardian, onClose }: { guardian: GuardianItem; onClose: () => void }) {
  const form = useForm<z.input<typeof updateGuardianSchema>, unknown, z.output<typeof updateGuardianSchema>>({
    resolver: contractResolver(updateGuardianSchema) as never,
    defaultValues: { name: guardian.name, phone: guardian.phone, email: guardian.email ?? '', occupation: guardian.occupation ?? '' },
  });
  const save = useAction((values: z.output<typeof updateGuardianSchema>) => apiPatch(`/guardians/${guardian.id}`, values), {
    success: 'Parent updated',
    invalidate: [['guardian', guardian.id], ['guardians'], ['student']],
    onSuccess: onClose,
    quietErrors: true,
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((values) => save.mutate(values, { onError: (err) => applyServerErrors(err, form.setError, FIELDS) }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit parent">
        <form onSubmit={submit} noValidate>
          <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="pg-name" error={e.name?.message} className="sm:col-span-2"><Input id="pg-name" {...form.register('name')} /></Field>
            <Field label="Mobile" htmlFor="pg-phone" error={e.phone?.message} hint="Changing it changes how they sign in"><Input id="pg-phone" type="tel" {...form.register('phone')} /></Field>
            <Field label="Email" htmlFor="pg-email" error={e.email?.message}><Input id="pg-email" type="email" {...form.register('email')} /></Field>
            <Field label="Occupation" htmlFor="pg-occ" className="sm:col-span-2"><Input id="pg-occ" {...form.register('occupation')} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkChildDialog({ guardianId, onClose }: { guardianId: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [studentId, setStudentId] = useState('');
  const [relation, setRelation] = useState('FATHER');
  const [primary, setPrimary] = useState(false);
  const results = useQuery({
    queryKey: ['link-search', q],
    queryFn: () => apiFetch<PageResponse<StudentListItem>>(`/students?pageSize=8&q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  const link = useAction(() => apiPost(`/guardians/${guardianId}/children`, { studentId, relation, isPrimary: primary }), {
    success: 'Child linked',
    invalidate: [['guardian', guardianId], ['guardians'], ['student']],
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Link a child" description="Find the student by name or admission number.">
        <DialogBody className="flex flex-col gap-4">
          <Input autoFocus placeholder="Search students" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {results.data?.data.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
                <input type="radio" name="child" value={s.id} checked={studentId === s.id} onChange={() => setStudentId(s.id)} className="accent-[var(--accent-500)]" />
                <span className="flex-1">{fullName(s.firstName, s.lastName)}</span>
                <span className="text-small text-fg-tertiary">{classSection(s.className, s.sectionName)} · {s.admissionNo}</span>
              </label>
            ))}
            {q.trim().length >= 2 && results.data?.data.length === 0 && <p className="px-2 text-small text-fg-secondary">No students found.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Relation" htmlFor="lk-rel">
              <Select id="lk-rel" value={relation} onChange={(e) => setRelation(e.target.value)}>
                {Object.entries(RELATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Checkbox className="self-end pb-2" label="Primary contact" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!studentId} loading={link.isPending} onClick={() => link.mutate(undefined)}>Link child</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
