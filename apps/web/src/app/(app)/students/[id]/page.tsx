'use client';

import type { StudentDetail } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Dialog, DialogBody, DialogContent, EmptyState, ErrorState, Skeleton, Tooltip, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Star, UserX } from 'lucide-react';
import Link from 'next/link';
import { use, useState, type ReactNode } from 'react';
import { PhotoUpload } from '@/components/photo-upload';
import { ApiError, apiPatch } from '@/lib/api-client';
import { classLabel, formatDate, fullName } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { LOGIN_BADGE, RELATION_LABEL } from '@/lib/labels';
import { useMe } from '@/lib/me';
import { StudentForm } from '../student-form';

const TABS = ['Overview', 'Attendance', 'Homework', 'Exams', 'Fees', 'Documents', 'Activity'];

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useMe();
  const qc = useQueryClient();
  const student = useData<StudentDetail>(['student', id], `/students/${id}`);
  const [editing, setEditing] = useState(false);
  const canEdit = can('student.edit');
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['student', id] }), qc.invalidateQueries({ queryKey: ['students'] })]);

  const back = (
    <Link href="/students" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg">
      <ArrowLeft className="size-4" /> Students
    </Link>
  );

  if (student.isError) {
    const err = student.error;
    const notFound = err instanceof ApiError && (err.status === 404 || err.status === 422);
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Card>
          {notFound ? (
            <EmptyState icon={<UserX />} title="Student not found" description="This student doesn't exist or isn't visible to you." />
          ) : (
            <ErrorState message={err instanceof ApiError ? err.message : undefined} supportRef={err instanceof ApiError ? err.supportRef : undefined} onRetry={() => void student.refetch()} />
          )}
        </Card>
      </div>
    );
  }

  const s = student.data;
  const name = s ? fullName(s.firstName, s.lastName) : '';
  const address = s?.address ? [s.address.line1, s.address.line2, s.address.city, s.address.state, s.address.postalCode].filter(Boolean).join(', ') : null;

  return (
    <div className="flex flex-col gap-6">
      {back}

      <div className="flex flex-wrap items-center gap-4">
        {s ? (
          <PhotoUpload
            name={name}
            src={s.photoUrl}
            purpose="student_photo"
            onUploaded={canEdit ? async (fileId) => { await apiPatch(`/students/${id}`, { photoFileId: fileId }); await refresh(); } : undefined}
          />
        ) : <Skeleton className="size-14 rounded-full" />}
        <div className="min-w-0 flex-1">
          {s ? (
            <>
              <h1 className="text-h1 font-semibold tracking-[-0.01em]">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg-secondary">
                <span>{classLabel(s.className, s.sectionName)}</span>
                {s.rollNo && <span>· Roll {s.rollNo}</span>}
                <span>· Adm <span className="font-mono">{s.admissionNo}</span></span>
                <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'} dot>{s.status === 'ACTIVE' ? 'Active' : s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Badge>
              </div>
            </>
          ) : (
            <><Skeleton className="h-7 w-56" /><Skeleton className="mt-2 h-4 w-72" /></>
          )}
        </div>
        {s && canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" role="tablist">
        {TABS.map((tab, i) => (
          <Tooltip key={tab} content="Coming with its module" disabled={i === 0}>
            <button
              role="tab"
              aria-selected={i === 0}
              aria-disabled={i !== 0}
              className={cn('-mb-px h-10 shrink-0 border-b-2 px-3 text-body', i === 0 ? 'border-accent font-medium text-fg' : 'cursor-not-allowed border-transparent text-fg-tertiary')}
            >
              {tab}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Admission number" value={s?.admissionNo} mono />
            <Detail label="Class & section" value={s && classLabel(s.className, s.sectionName)} />
            <Detail label="Roll number" value={s && (s.rollNo ?? '—')} />
            <Detail label="Date of birth" value={s && formatDate(s.dateOfBirth)} />
            <Detail label="Gender" value={s && (s.gender ? s.gender.charAt(0) + s.gender.slice(1).toLowerCase() : '—')} />
            <Detail label="Blood group" value={s && (s.bloodGroup ?? '—')} />
            <Detail label="Admission date" value={s && formatDate(s.admissionDate)} />
            {s && 'phone' in s && <Detail label="Student mobile" value={s.phone ?? '—'} />}
            {s?.emergencyContact && (
              <Detail label="Emergency contact" value={[s.emergencyContact.name, s.emergencyContact.phone].filter(Boolean).join(' · ') || '—'} />
            )}
            {address !== null && <Detail label="Address" value={address || '—'} className="sm:col-span-2 lg:col-span-3" />}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Parents" />
          <div className="flex flex-col gap-1 p-3">
            {!s ? (
              <Skeleton className="m-2 h-16" />
            ) : !s.guardians.length ? (
              <p className="px-2 py-3 text-small text-fg-secondary">No parent linked yet.</p>
            ) : (
              s.guardians.map((g) => (
                <Link key={g.guardianId} href={`/guardians/${g.guardianId}`} className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-hover">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {g.name}
                      {g.isPrimary && <Star className="size-3.5 fill-current text-warning" aria-label="Primary contact" />}
                    </div>
                    <div className="text-small text-fg-secondary">{RELATION_LABEL[g.relation]}{g.phone ? ` · ${g.phone}` : ''}</div>
                  </div>
                  <Badge tone={LOGIN_BADGE[g.login].tone}>{LOGIN_BADGE[g.login].label}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {s && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent title={`Edit ${name}`} className="max-w-[760px]">
            <DialogBody>
              <StudentForm
                student={s}
                submitLabel="Save changes"
                onCancel={() => setEditing(false)}
                onSubmit={async (values) => {
                  await apiPatch(`/students/${id}`, values);
                  await refresh();
                  toast.success('Student updated');
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

function Detail({ label, value, mono, className }: { label: string; value: ReactNode | undefined; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-caption font-medium text-fg-tertiary">{label}</dt>
      <dd className={cn('mt-1 text-body', mono && 'font-mono')}>{value ?? <Skeleton className="h-5 w-28" />}</dd>
    </div>
  );
}
