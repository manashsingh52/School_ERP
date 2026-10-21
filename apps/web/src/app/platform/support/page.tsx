'use client';

import type { SupportGrantItem } from '@schoolos/contracts';
import { Badge, Button, Card, EmptyState, PageHeader, Table, TableSkeleton, Tabs, TD, TH, THead, TR } from '@schoolos/ui';
import { ExternalLink, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useIsSuperAdmin } from '@/components/platform/console-shell';
import { GRANT_STATUS } from '@/components/platform/labels';
import { timeAgo } from '@/lib/format';
import { useData } from '@/lib/hooks';

const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const schoolUrl = (slug: string) => {
  const { protocol, host } = window.location;
  return `${protocol}//${slug}.${host.split('.').slice(1).join('.')}/login`;
};

export default function SupportPage() {
  const superAdmin = useIsSuperAdmin();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const grants = useData<SupportGrantItem[]>(['platform', 'support', scope], `/platform/support-access${scope === 'all' ? '?all=true' : ''}`, { staleTime: 0 });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Support access" description="Ask from a school's page. Once the school approves, sign in at the school's address with your own account — you can look, not change." />
      {superAdmin && <Tabs value={scope} onChange={setScope} items={[{ value: 'mine', label: 'My requests' }, { value: 'all', label: 'Everyone' }]} />}
      <Card>
        {!grants.data ? (
          <Table><tbody><TableSkeleton columns={5} /></tbody></Table>
        ) : !grants.data.length ? (
          <EmptyState icon={<LifeBuoy />} title="No requests yet" description="Open a school and choose “Ask for access”." />
        ) : (
          <Table>
            <THead><TR><TH>School</TH>{scope === 'all' && <TH>Asked by</TH>}<TH>Reason</TH><TH>Status</TH><TH>Until</TH><TH /></TR></THead>
            <tbody>
              {grants.data.map((g) => (
                <TR key={g.id}>
                  <TD><Link href={`/platform/schools/${g.school.id}`} className="font-medium hover:underline">{g.school.name}</Link><div className="text-small text-fg-tertiary">asked {timeAgo(g.createdAt)}</div></TD>
                  {scope === 'all' && <TD>{g.requestedBy.name}</TD>}
                  <TD className="max-w-80 text-small text-fg-secondary">{g.reason}</TD>
                  <TD><Badge tone={GRANT_STATUS[g.status]!.tone}>{GRANT_STATUS[g.status]!.label}</Badge>{g.approvedBy && <div className="text-caption text-fg-tertiary">by {g.approvedBy}</div>}</TD>
                  <TD className="text-small">{when.format(new Date(g.expiresAt))}</TD>
                  <TD className="text-right">{g.status === 'ACTIVE' && scope === 'mine' && <Button size="sm" variant="secondary" asChild><a href={schoolUrl(g.school.slug)} target="_blank" rel="noreferrer"><ExternalLink /> Open school</a></Button>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
