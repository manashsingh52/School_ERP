'use client';

import type { PageResponse, StudentListItem } from '@schoolos/contracts';
import { Avatar, Button, Card, CardHeader, EmptyState, Kbd, Skeleton } from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { classLabel, formatNumber, fullName, greeting, today } from '@/lib/format';
import { useMe } from '@/lib/me';

export default function DashboardPage() {
  const { me, can } = useMe();
  const firstName = me.user.name.split(' ')[0];
  const isParent = can('student.view', ['OWN_CHILDREN']);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-display font-semibold tracking-[-0.02em]">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1 text-body text-fg-secondary">{today()} · Here's what needs you today.</p>
      </div>
      {isParent ? <ParentHome /> : <StaffHome />}
    </div>
  );
}

function StaffHome() {
  const { can } = useMe();
  const students = useQuery({
    queryKey: ['students', 'count'],
    queryFn: () => apiFetch<PageResponse<StudentListItem>>('/students?pageSize=1'),
    enabled: can('student.view'),
  });

  return (
    <>
      <section aria-label="Key numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {can('student.view') && (
          <Link href="/students" className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
            <div className="flex items-center justify-between text-small text-fg-secondary">
              Students
              <ArrowRight className="size-4 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            {students.isPending ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <div className="tabular mt-1 text-kpi font-semibold">
                {students.data ? formatNumber(students.data.page.total) : '—'}
              </div>
            )}
            <div className="mt-1 text-caption text-fg-tertiary">Active this academic year</div>
          </Link>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attention required" description="Things that need someone today" />
          <EmptyState
            icon={<CheckCircle2 />}
            title="Nothing needs your attention"
            description="Absences, overdue fees and pending approvals will appear here as those modules go live."
          />
        </Card>
        <Card>
          <CardHeader title="Quick actions" />
          <div className="flex flex-col gap-1 p-3">
            {can('student.view') && (
              <Button asChild variant="ghost" className="justify-start">
                <Link href="/students">
                  <Users /> View students
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            >
              <Search /> Search anything <Kbd className="ml-auto">⌘K</Kbd>
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function ParentHome() {
  const children = useQuery({
    queryKey: ['students', 'mine'],
    queryFn: () => apiFetch<PageResponse<StudentListItem>>('/students?pageSize=20'),
  });

  return (
    <section aria-label="Your children">
      <h2 className="mb-3 text-h2 font-semibold">Your children</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {children.isPending &&
          [0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        {children.data?.data.map((s) => (
          <Link
            key={s.id}
            href={`/students/${s.id}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <Avatar name={fullName(s.firstName, s.lastName)} size={40} />
            <div className="min-w-0">
              <div className="truncate font-medium">{fullName(s.firstName, s.lastName)}</div>
              <div className="text-small text-fg-secondary">{classLabel(s.className, s.sectionName)}</div>
            </div>
            <ArrowRight className="ml-auto size-4 text-fg-tertiary" />
          </Link>
        ))}
      </div>
      {children.data?.data.length === 0 && (
        <Card>
          <EmptyState
            icon={<Users />}
            title="No children linked yet"
            description="The school office links your children to your account. Contact them if this looks wrong."
          />
        </Card>
      )}
    </section>
  );
}
