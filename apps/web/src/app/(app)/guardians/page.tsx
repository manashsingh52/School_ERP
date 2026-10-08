'use client';

import { Gate } from '@/components/gate';
import type { GuardianItem, PageResponse } from '@schoolos/contracts';
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, TD, TH, THead, TR, Table, TableSkeleton } from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PeopleTabs } from '@/components/people-tabs';
import { ApiError, apiFetch } from '@/lib/api-client';
import { classSection, formatNumber } from '@/lib/format';
import { LOGIN_BADGE, RELATION_LABEL } from '@/lib/labels';

function GuardiansPageContent() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ['guardians', { q, page }],
    queryFn: () => apiFetch<PageResponse<GuardianItem>>(`/guardians?page=${page}&pageSize=25&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });
  const total = query.data?.page.total;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Students" description={total === undefined ? 'Loading…' : `${formatNumber(total)} parents`} />
      <PeopleTabs />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-3">
          <div className="w-full max-w-sm">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or mobile number" leading={<Search />} aria-label="Search parents" />
          </div>
        </div>
        {query.isError ? (
          <ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} />
        ) : !query.isPending && !query.data?.data.length ? (
          <EmptyState icon={q ? <Search /> : <Users />} title={q ? `No parents match “${q}”` : 'No parents yet'} description={q ? 'Try a name or mobile number.' : 'Parents are added with their children — on the student form or by importing.'} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Parent</TH><TH>Children</TH><TH className="w-32">Parent app</TH></tr></THead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton columns={3} />
                ) : (
                  query.data!.data.map((g) => (
                    <TR key={g.id} interactive tabIndex={0} onClick={() => router.push(`/guardians/${g.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/guardians/${g.id}`)}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={g.name} size={28} />
                          <div>
                            <div className="font-medium">{g.name}</div>
                            <div className="text-small text-fg-tertiary">{g.phone}</div>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-fg-secondary">
                        {g.children.map((c) => `${c.name} (${classSection(c.className, c.sectionName)}, ${RELATION_LABEL[c.relation].toLowerCase()})`).join(' · ') || '—'}
                      </TD>
                      <TD><Badge tone={LOGIN_BADGE[g.login].tone} dot>{LOGIN_BADGE[g.login].label}</Badge></TD>
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

export default function GuardiansPage() {
  return (
    <Gate any={['guardian.view']} scopes={['ALL', 'ASSIGNED']}>
      <GuardiansPageContent />
    </Gate>
  );
}
