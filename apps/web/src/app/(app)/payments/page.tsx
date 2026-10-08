'use client';

import { PageHeader, Tabs } from '@schoolos/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CollectTab } from '@/components/fees/collect-tab';
import { GatewayTab } from '@/components/fees/gateway-tab';
import { DayCloseTab, PaymentsListTab } from '@/components/fees/payments-list-tab';
import { ReportsTab } from '@/components/fees/reports-tab';
import { Gate } from '@/components/gate';
import { useMe } from '@/lib/me';

type Tab = 'collect' | 'payments' | 'day' | 'reports' | 'online';

function PaymentsPageContent() {
  const { can } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tabs: { value: Tab; label: string }[] = [
    ...(can('payment.collect') ? [{ value: 'collect' as const, label: 'Collect' }] : []),
    { value: 'payments', label: 'Payments' },
    ...(can('payment.collect') ? [{ value: 'day' as const, label: 'Day close' }] : []),
    ...(can('report.finance') ? [{ value: 'reports' as const, label: 'Reports' }] : []),
    ...(can('gateway.manage') ? [{ value: 'online' as const, label: 'Online payments' }] : []),
  ];
  const tab = (tabs.find((t) => t.value === params.get('tab'))?.value ?? tabs[0]!.value) as Tab;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments" description="Counter collection, receipts, day close and reports" />
      <Tabs<Tab> value={tab} onChange={(v) => router.replace(`/payments?tab=${v}`)} items={tabs} />
      {tab === 'collect' && <CollectTab />}
      {tab === 'payments' && <PaymentsListTab />}
      {tab === 'day' && <DayCloseTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'online' && <GatewayTab />}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Gate any={['payment.view', 'payment.collect']} scopes={['ALL']}>
      <Suspense>
        <PaymentsPageContent />
      </Suspense>
    </Gate>
  );
}
