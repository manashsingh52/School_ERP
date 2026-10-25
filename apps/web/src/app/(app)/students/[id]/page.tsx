'use client';

import type { StudentDetail } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Dialog, DialogBody, DialogContent, EmptyState, ErrorState, Skeleton, Tooltip, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, IdCard, Pencil, Star, UserX } from 'lucide-react';
import Link from 'next/link';
import { use, useState, type ReactNode } from 'react';
import { CertificateList, IssueCertificateDialog } from '@/components/certificates/certificates';
import { DocumentsPanel } from '@/components/documents/documents-panel';
import { StudentAttendance } from '@/components/student/attendance-view';
import { FeeStatement } from '@/components/student/fee-statement';
import { StudentHomework } from '@/components/student/homework-list';
import { StudentPerformanceView } from '@/components/student/performance-view';
import { StudentResults } from '@/components/student/results-list';
import { PhotoUpload } from '@/components/photo-upload';
import { AuditList } from '@/components/platform/audit-list';
import { ApiError, apiPatch } from '@/lib/api-client';
import { classLabel, formatDate, fullName } from '@/lib/format';
import { useData, useTabParam } from '@/lib/hooks';
import { LOGIN_BADGE, RELATION_LABEL } from '@/lib/labels';
import { useMe } from '@/lib/me';
import { StudentForm } from '../student-form';

const TABS = ['Overview', 'Attendance', 'Homework', 'Exams', 'Fees', 'Achievements', 'Documents', 'Activity'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEYS = TABS.map((t) => t.toLowerCase()) as Lowercase<Tab>[];

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useMe();
  const qc = useQueryClient();
  const student = useData<StudentDetail>(['student', id], `/students/${id}`);
  const [editing, setEditing] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [tabKey, setTabKey] = useTabParam(TAB_KEYS);
  const tab = TABS[TAB_KEYS.indexOf(tabKey)]!;
  const setTab = (t: Tab) => setTabKey(t.toLowerCase() as Lowercase<Tab>);
  const NEEDS: Record<Tab, Parameters<typeof can>[0] | null> = {
    Overview: null,
    Attendance: 'attendance.view',
    Homework: 'homework.view',
    Exams: 'results.view',
    Fees: 'invoice.view',
    Achievements: 'certificate.view',
    Documents: 'document.view',
    Activity: 'audit.view',
  };
  const enabled = (t: Tab) => NEEDS[t] === null || can(NEEDS[t]!);
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
        {s && canEdit && (
          <div className="flex gap-2">
            <Button variant="ghost" asChild><a href={`/api/v1/students/id-cards?studentId=${s.id}`} target="_blank" rel="noopener"><IdCard /> ID card</a></Button>
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" role="tablist">
        {TABS.map((t) => (
          <Tooltip key={t} content="You don't have access to this" disabled={enabled(t)}>
            <button
              role="tab"
              aria-selected={tab === t}
              aria-disabled={!enabled(t)}
              onClick={() => enabled(t) && setTab(t)}
              className={cn('-mb-px h-10 shrink-0 border-b-2 px-3 text-body', tab === t ? 'border-accent font-medium text-fg' : enabled(t) ? 'border-transparent text-fg-secondary hover:text-fg' : 'cursor-not-allowed border-transparent text-fg-tertiary')}
            >
              {t}
            </button>
          </Tooltip>
        ))}
      </div>

      {tab === 'Attendance' && enabled(tab) && <StudentAttendance studentId={id} />}
      {tab === 'Homework' && enabled(tab) && <StudentHomework studentId={id} staff />}
      {tab === 'Exams' && enabled(tab) && (
        <div className="flex flex-col gap-6">
          <StudentPerformanceView studentId={id} />
          <h2 className="text-h3 font-semibold">Results and report cards</h2>
          <StudentResults studentId={id} />
        </div>
      )}
      {tab === 'Fees' && enabled(tab) && s && <FeeStatement studentId={id} firstName={s.firstName} staff />}
      {tab === 'Achievements' && enabled(tab) && s && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h3 font-semibold">Certificates</h2>
            {can('certificate.issue') && <Button size="sm" onClick={() => setAwarding(true)}><Award /> Issue certificate</Button>}
          </div>
          <CertificateList studentId={id} showStudent={false} empty={{ title: 'No certificates yet', description: `Certificates for competitions and events ${s.firstName} takes part in show up here, and in the parents' app.` }} />
          <Dialog open={awarding} onOpenChange={setAwarding}>
            {awarding && <IssueCertificateDialog student={{ id, name }} onDone={() => setAwarding(false)} />}
          </Dialog>
        </div>
      )}
      {tab === 'Documents' && <DocumentsPanel ownerType="STUDENT" ownerId={id} shareLabel="Parents can see and download this" />}
      {tab === 'Activity' && <Card><CardHeader title="Activity" description="Every change to this student's record." /><div className="mt-3 border-t border-border"><AuditList path={`/audit?entityType=Student&entityId=${id}`} /></div></Card>}

      <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-3', tab !== 'Overview' && 'hidden')}>
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
