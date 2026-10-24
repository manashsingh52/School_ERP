'use client';

import type { PageResponse, StudentListItem } from '@schoolos/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
} from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Plus, Search, Upload, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { PeopleTabs } from '@/components/people-tabs';
import { IdCardsDialog } from '@/components/student/id-cards-dialog';
import { classSection, formatNumber, fullName } from '@/lib/format';
import { useMe } from '@/lib/me';

const PAGE_SIZE = 25;

export default function StudentsPage() {
  return (
    <Suspense>
      <Students />
    </Suspense>
  );
}

function Students() {
  const router = useRouter();
  const { can } = useMe();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);

  // URL is the source of truth (shareable, back button works); the input is debounced into it.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() === q) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set('q', search.trim());
      else next.delete('q');
      next.delete('page');
      router.replace(`${pathname}?${next}`);
    }, 250);
    return () => clearTimeout(t);
  }, [search, q, params, pathname, router]);

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    router.push(`${pathname}?${next}`);
  };

  const query = useQuery({
    queryKey: ['students', { page, q }],
    queryFn: () =>
      apiFetch<PageResponse<StudentListItem>>(`/students?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.page.total;
  const rows = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        description={total === undefined ? 'Loading…' : `${formatNumber(total)} ${q ? 'matching' : 'active'} students in this academic year`}
        actions={
          <>
            {can('student.promote') && <Button variant="ghost" asChild><Link href="/students/promotion"><ArrowUpRight /> Promote</Link></Button>}
            {can('student.edit') && <IdCardsDialog />}
            {can('import.run') && <Button variant="secondary" asChild><Link href="/imports/new?entity=STUDENTS"><Upload /> Import</Link></Button>}
            {can('student.create') && <Button asChild><Link href="/students/new"><Plus /> Add student</Link></Button>}
          </>
        }
      />
      <PeopleTabs />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="w-full max-w-sm">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or admission number"
              leading={<Search />}
              aria-label="Search students"
            />
          </div>
          {query.isFetching && !query.isPending && <span className="text-small text-fg-tertiary">Updating…</span>}
        </div>

        {query.isError ? (
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : undefined}
            supportRef={query.error instanceof ApiError ? query.error.supportRef : undefined}
            onRetry={() => void query.refetch()}
          />
        ) : !query.isPending && rows.length === 0 ? (
          q ? (
            <EmptyState
              icon={<Search />}
              title={`No students match “${q}”`}
              description="Try a different name or admission number."
              action={
                <Button variant="secondary" onClick={() => setSearch('')}>
                  <X /> Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users />}
              title="No students yet"
              description="Add students one by one or import your Excel sheet."
              action={
                can('student.create') && (
                  <>
                    <Button asChild><Link href="/students/new"><Plus /> Add student</Link></Button>
                    {can('import.run') && <Button variant="secondary" asChild><Link href="/imports/new?entity=STUDENTS"><Upload /> Import</Link></Button>}
                  </>
                )
              }
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH className="w-28">Class</TH>
                  <TH className="w-20 text-right">Roll</TH>
                  <TH className="w-28">Status</TH>
                </tr>
              </THead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton columns={4} />
                ) : (
                  rows.map((s) => (
                    <TR
                      key={s.id}
                      interactive
                      tabIndex={0}
                      onClick={() => router.push(`/students/${s.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(`/students/${s.id}`)}
                    >
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={fullName(s.firstName, s.lastName)} size={28} />
                          <span className="font-medium">{fullName(s.firstName, s.lastName)}</span>
                          <span className="font-mono text-small text-fg-tertiary">{s.admissionNo}</span>
                        </div>
                      </TD>
                      <TD className="tabular">{classSection(s.className, s.sectionName)}</TD>
                      <TD className="tabular text-right text-fg-secondary">{s.rollNo ?? '—'}</TD>
                      <TD>
                        <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                          {s.status === 'ACTIVE' ? 'Active' : s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                        </Badge>
                      </TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
            {total !== undefined && total > 0 && (
              <div className="border-t border-border">
                <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
