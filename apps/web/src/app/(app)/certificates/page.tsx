'use client';

import type { CertificateKind } from '@schoolos/contracts';
import { Button, Dialog, Input, PageHeader, Tabs } from '@schoolos/ui';
import { Award, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CertificateList, IssueCertificateDialog } from '@/components/certificates/certificates';
import { Gate } from '@/components/gate';
import { useTabParam } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const TABS = ['all', 'achievement', 'participation', 'mine'] as const;

/** Every certificate the member can see, with search, and "Issue certificate" for the office and teachers. */
export default function CertificatesPage() {
  const { can } = useMe();
  const canIssue = can('certificate.issue');
  const [tab, setTab] = useTabParam(TABS);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [issuing, setIssuing] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const kind: CertificateKind | undefined = tab === 'achievement' ? 'ACHIEVEMENT' : tab === 'participation' ? 'PARTICIPATION' : undefined;

  return (
    <Gate any={['certificate.view']} scopes={['ALL', 'ASSIGNED']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Certificates"
          description="Participation and achievement certificates. Parents are told, and see them under their child's Achievements."
          actions={canIssue && <Button onClick={() => setIssuing(true)}><Award /> Issue certificate</Button>}
        />
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All' },
            { value: 'achievement', label: 'Achievements' },
            { value: 'participation', label: 'Participation' },
            ...(canIssue ? [{ value: 'mine' as const, label: 'Issued by me' }] : []),
          ]}
        />
        <div className="w-full max-w-xs">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event, student or number" leading={<Search />} aria-label="Search certificates" />
        </div>
        <CertificateList
          key={`${tab}-${q}`}
          kind={kind}
          mine={tab === 'mine'}
          q={q || undefined}
          empty={q ? { title: `Nothing matches “${q}”` } : { title: 'No certificates yet', description: canIssue ? 'Issue one for a competition, sports day or any event, to one student or a whole team.' : undefined }}
        />
        <Dialog open={issuing} onOpenChange={setIssuing}>
          {issuing && <IssueCertificateDialog onDone={() => setIssuing(false)} />}
        </Dialog>
      </div>
    </Gate>
  );
}
