'use client';

import type { TeacherDetail } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Dialog, DialogBody, DialogContent, EmptyState, ErrorState, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Pencil, Send, UserX } from 'lucide-react';
import Link from 'next/link';
import { use, useState, type ReactNode } from 'react';
import { DocumentsPanel } from '@/components/documents/documents-panel';
import { PhotoUpload } from '@/components/photo-upload';
import { ApiError, apiPatch, apiPost } from '@/lib/api-client';
import { formatDate, fullName } from '@/lib/format';
import { useAction, useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';
import { LOGIN_BADGE } from '@/lib/labels';
import { TeacherForm } from '../teacher-form';

export default function TeacherProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, me } = useMe();
  const qc = useQueryClient();
  const teacher = useData<TeacherDetail>(['teacher', id], `/teachers/${id}`);
  const [editing, setEditing] = useState(false);
  const canManage = can('teacher.manage');
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['teacher', id] }), qc.invalidateQueries({ queryKey: ['teachers'] })]);
  const invite = useAction(() => apiPost(`/teachers/${id}/invite`), { success: 'Invitation created', invalidate: [['teacher', id], ['teachers']] });

  const back = <Link href="/teachers" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" /> Teachers</Link>;

  if (teacher.isError) {
    const notFound = teacher.error instanceof ApiError && teacher.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Card>{notFound ? <EmptyState icon={<UserX />} title="Teacher not found" description="This teacher doesn't exist or isn't visible to you." /> : <ErrorState onRetry={() => void teacher.refetch()} />}</Card>
      </div>
    );
  }
  const t = teacher.data;
  const name = t ? fullName(t.firstName, t.lastName) : '';

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-center gap-4">
        {t ? (
          <PhotoUpload
            name={name}
            src={t.photoUrl}
            purpose="teacher_photo"
            onUploaded={canManage ? async (fileId) => { await apiPatch(`/teachers/${id}`, { photoFileId: fileId }); await refresh(); } : undefined}
          />
        ) : <Skeleton className="size-14 rounded-full" />}
        <div className="min-w-0 flex-1">
          {t ? (
            <>
              <h1 className="text-h1 font-semibold tracking-[-0.01em]">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg-secondary">
                {t.designation && <span>{t.designation}</span>}
                {t.department && <span>· {t.department}</span>}
                <span>· <span className="font-mono">{t.employeeId}</span></span>
                {t.status === 'ACTIVE' ? <Badge tone={LOGIN_BADGE[t.login].tone} dot>{LOGIN_BADGE[t.login].label}</Badge> : <Badge>{t.status === 'LEFT' ? 'Left the school' : 'On leave'}</Badge>}
              </div>
            </>
          ) : <><Skeleton className="h-7 w-56" /><Skeleton className="mt-2 h-4 w-72" /></>}
        </div>
        {t && canManage && (
          <div className="flex gap-2">
            {t.login === 'NONE' && t.status !== 'LEFT' && <Button variant="secondary" loading={invite.isPending} onClick={() => invite.mutate(undefined)}><Send /> Invite to sign in</Button>}
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
            <Detail label="Mobile" value={t?.phone || '—'} />
            <Detail label="Email" value={t?.email ?? '—'} />
            <Detail label="Qualification" value={t?.qualification ?? '—'} />
            <Detail label="Joined" value={t && formatDate(t.joiningDate)} />
            <Detail label="Date of birth" value={t && formatDate(t.dateOfBirth)} />
            <Detail label="Gender" value={t && (t.gender ? t.gender.charAt(0) + t.gender.slice(1).toLowerCase() : '—')} />
          </dl>
        </Card>
        <Card>
          <CardHeader title="Classes & subjects" description="This academic year" />
          <div className="flex flex-col gap-3 p-5">
            {t?.classTeacherOf.length ? <p className="text-body">Class teacher of <span className="font-medium">{t.classTeacherOf.join(', ')}</span></p> : null}
            {t?.assignments.length ? (
              <ul className="flex flex-col gap-1.5">
                {t.assignments.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 text-body"><span>{a.subjectName}</span><span className="text-fg-secondary">{a.className.replace(/^Class\s+/i, '')}-{a.sectionName}</span></li>
                ))}
              </ul>
            ) : t ? (
              <div className="flex flex-col items-start gap-2 text-small text-fg-secondary">
                <span className="flex items-center gap-2"><BookOpen className="size-4" /> No subjects assigned yet.</span>
                {can('academic.manage') && <Link href="/academics?tab=assignments" className="text-accent-strong hover:underline">Assign in Academics</Link>}
              </div>
            ) : <Skeleton className="h-16" />}
          </div>
        </Card>
      </div>

      {(can('document.manage') || me.membership?.teacherId === id) && <DocumentsPanel ownerType="TEACHER" ownerId={id} title="Staff documents" />}

      {t && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent title={`Edit ${name}`} className="max-w-[720px]">
            <DialogBody>
              <TeacherForm
                teacher={t}
                submitLabel="Save changes"
                onCancel={() => setEditing(false)}
                onSubmit={async (values) => {
                  const { inviteToLogin: _ignored, ...rest } = values;
                  await apiPatch(`/teachers/${id}`, rest);
                  await refresh();
                  toast.success('Teacher updated');
                  setEditing(false);
                }}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode | undefined }) {
  return (
    <div>
      <dt className="text-caption font-medium text-fg-tertiary">{label}</dt>
      <dd className="mt-1 text-body">{value ?? <Skeleton className="h-5 w-28" />}</dd>
    </div>
  );
}
