'use client';

import { PageHeader, Tabs } from '@schoolos/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ConcessionsTab } from '@/components/fees/concessions-tab';
import { HeadsTab } from '@/components/fees/heads-tab';
import { InvoicesTab } from '@/components/fees/invoices-tab';
import { StructuresTab } from '@/components/fees/structures-tab';
import { Gate } from '@/components/gate';
import { useMe } from '@/lib/me';

type Tab = 'invoices' | 'structures' | 'heads' | 'concessions';

function FeesPageContent() {
  const { can } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tabs: { value: Tab; label: string }[] = [
    { value: 'invoices', label: 'Invoices' },
    { value: 'structures', label: 'Fee structures' },
    { value: 'heads', label: 'Fee heads' },
    ...(can('concession.request') || can('fee.manage') ? [{ value: 'concessions' as const, label: 'Concessions' }] : []),
  ];
  const tab = (tabs.find((t) => t.value === params.get('tab'))?.value ?? 'invoices') as Tab;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Fees" description="Fee setup, invoices and concessions" />
      <Tabs<Tab> value={tab} onChange={(v) => router.replace(`/fees?tab=${v}`)} items={tabs} />
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'heads' && <HeadsTab />}
      {tab === 'concessions' && <ConcessionsTab />}
    </div>
  );
}

export default function FeesPage() {
  return (
    <Gate any={['fee.manage', 'invoice.view', 'fee.view']} scopes={['ALL']}>
      <Suspense>
        <FeesPageContent />
      </Suspense>
    </Gate>
  );
}
