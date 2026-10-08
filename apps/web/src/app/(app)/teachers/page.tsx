'use client';

import { Gate } from '@/components/gate';
import type { PageResponse, TeacherListItem } from '@schoolos/contracts';
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
import { GraduationCap, Plus, Search, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatNumber, fullName } from '@/lib/format';
import { LOGIN_BADGE } from '@/lib/labels';
import { useMe } from '@/lib/me';

function TeachersPageContent() {
  const router = useRouter();
  const { can } = useMe();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ['teachers', { q, page }],
    queryFn: () => apiFetch<PageResponse<TeacherListItem>>(`/teachers?page=${page}&pageSize=25&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });
  const total = query.data?.page.total;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teachers"
        description={total === undefined ? 'Loading…' : `${formatNumber(total)} teachers`}
        actions={
          can('teacher.manage') && (
            <>
              {can('import.run') && <Button variant="secondary" asChild><Link href="/imports/new?entity=TEACHERS"><Upload /> Import</Link></Button>}
              <Button asChild><Link href="/teachers/new"><Plus /> Add teacher</Link></Button>
            </>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-3">
          <div className="w-full max-w-sm">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee ID or department" leading={<Search />} aria-label="Search teachers" />
          </div>
        </div>
        {query.isError ? (
          <ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} />
        ) : !query.isPending && !query.data?.data.length ? (
          q ? (
            <EmptyState icon={<Search />} title={`No teachers match “${q}”`} description="Try a different name or employee ID." />
          ) : (
            <EmptyState
              icon={<GraduationCap />}
              title="No teachers yet"
              description="Add teachers one by one or import them from Excel."
              action={can('teacher.manage') && <><Button asChild><Link href="/teachers/new"><Plus /> Add teacher</Link></Button><Button variant="secondary" asChild><Link href="/imports/new?entity=TEACHERS"><Upload /> Import</Link></Button></>}
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Teacher</TH>
                  <TH>Department</TH>
                  <TH>Class teacher</TH>
                  <TH className="w-32">Login</TH>
                </tr>
              </THead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton columns={4} />
                ) : (
                  query.data!.data.map((t) => (
                    <TR key={t.id} interactive tabIndex={0} onClick={() => router.push(`/teachers/${t.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/teachers/${t.id}`)}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={fullName(t.firstName, t.lastName)} size={28} />
                          <div className="min-w-0">
                            <div className="font-medium">{fullName(t.firstName, t.lastName)}</div>
                            <div className="text-small text-fg-tertiary"><span className="font-mono">{t.employeeId}</span>{t.designation ? ` · ${t.designation}` : ''}</div>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-fg-secondary">{t.department ?? '—'}</TD>
                      <TD className="text-fg-secondary">{t.classTeacherOf.join(', ') || '—'}</TD>
                      <TD>
                        {t.status !== 'ACTIVE' ? (
                          <Badge tone={t.status === 'LEFT' ? 'neutral' : 'info'}>{t.status === 'LEFT' ? 'Left' : 'On leave'}</Badge>
                        ) : (
                          <Badge tone={LOGIN_BADGE[t.login].tone} dot>{LOGIN_BADGE[t.login].label}</Badge>
                        )}
                      </TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
            {!!total && <div className="border-t border-border"><Pagination page={page} pageSize={25} total={total} onPageChange={setPage} /></div>}
          </>
        )}
      </Card>
    </div>
  );
}

export default function TeachersPage() {
  return (
    <Gate any={['teacher.view']} scopes={['ALL', 'ASSIGNED']}>
      <TeachersPageContent />
    </Gate>
  );
}
