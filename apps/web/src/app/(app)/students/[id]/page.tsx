'use client';

import type { StudentDetail } from '@schoolos/contracts';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, Skeleton, Tooltip, cn } from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserX } from 'lucide-react';
import Link from 'next/link';
import { use, type ReactNode } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { classLabel, formatDate, fullName } from '@/lib/format';

const TABS = ['Overview', 'Attendance', 'Homework', 'Exams', 'Fees', 'Documents', 'Activity'];

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const student = useQuery({
    queryKey: ['student', id],
    queryFn: () => apiFetch<{ data: StudentDetail }>(`/students/${id}`).then((r) => r.data),
  });

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
            <ErrorState
              message={err instanceof ApiError ? err.message : undefined}
              supportRef={err instanceof ApiError ? err.supportRef : undefined}
              onRetry={() => void student.refetch()}
            />
          )}
        </Card>
      </div>
    );
  }

  const s = student.data;
  const name = s ? fullName(s.firstName, s.lastName) : '';

  return (
    <div className="flex flex-col gap-6">
      {back}

      <div className="flex items-center gap-4">
        {s ? <Avatar name={name} size={56} /> : <Skeleton className="size-14 rounded-full" />}
        <div className="min-w-0">
          {s ? (
            <>
              <h1 className="text-h1 font-semibold tracking-[-0.01em]">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg-secondary">
                <span>{classLabel(s.className, s.sectionName)}</span>
                {s.rollNo && <span>· Roll {s.rollNo}</span>}
                <span>
                  · Adm <span className="font-mono">{s.admissionNo}</span>
                </span>
                <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                  {s.status === 'ACTIVE' ? 'Active' : s.status.toLowerCase()}
                </Badge>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-7 w-56" />
              <Skeleton className="mt-2 h-4 w-72" />
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" role="tablist">
        {TABS.map((tab, i) => (
          <Tooltip key={tab} content="Coming with its module" disabled={i === 0}>
            <button
              role="tab"
              aria-selected={i === 0}
              aria-disabled={i !== 0}
              className={cn(
                '-mb-px h-10 shrink-0 border-b-2 px-3 text-body',
                i === 0 ? 'border-accent font-medium text-fg' : 'cursor-not-allowed border-transparent text-fg-tertiary',
              )}
            >
              {tab}
            </button>
          </Tooltip>
        ))}
      </div>

      <Card>
        <CardHeader title="Details" />
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Admission number" value={s?.admissionNo} mono />
          <Detail label="Class & section" value={s && classLabel(s.className, s.sectionName)} />
          <Detail label="Roll number" value={s && (s.rollNo ?? '—')} />
          <Detail label="Date of birth" value={s && formatDate(s.dateOfBirth)} />
          <Detail label="Gender" value={s && (s.gender ? s.gender.charAt(0) + s.gender.slice(1).toLowerCase() : '—')} />
          <Detail label="Admission date" value={s && formatDate(s.admissionDate)} />
          {s && 'phone' in s && <Detail label="Phone" value={s.phone ?? '—'} />}
          {s && 'email' in s && <Detail label="Email" value={s.email ?? '—'} />}
        </dl>
      </Card>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: ReactNode | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption font-medium text-fg-tertiary">{label}</dt>
      <dd className={cn('mt-1 text-body', mono && 'font-mono')}>{value ?? <Skeleton className="h-5 w-28" />}</dd>
    </div>
  );
}
