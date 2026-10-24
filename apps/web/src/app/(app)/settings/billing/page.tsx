'use client';

import type { Entitlements } from '@schoolos/contracts';
import { Badge, Card, CardHeader, Skeleton, cn } from '@schoolos/ui';
import { Gate } from '@/components/gate';
import { formatNumber } from '@/lib/format';
import { useData } from '@/lib/hooks';

const GB = 1024 ** 3;
const STATUS = { TRIALING: ['Free trial', 'info'], ACTIVE: ['Active', 'success'], PAST_DUE: ['Payment due', 'warning'], CANCELLED: ['Cancelled', 'neutral'] } as const;

function Meter({ label, used, limit, fmt = formatNumber }: { label: string; used: number; limit: number | null; fmt?: (n: number) => string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-body"><span>{label}</span><span className="tabular text-fg-secondary">{fmt(used)} of {limit === null ? 'unlimited' : fmt(limit)}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-accent')} style={{ width: `${pct}%` }} /></div>
      {limit !== null && pct >= 85 && <p className={cn('mt-1 text-small', pct >= 100 ? 'text-danger' : 'text-warning')}>{pct >= 100 ? 'Limit reached — contact Bastaa to upgrade.' : 'Nearly at your limit.'}</p>}
    </div>
  );
}

/** Plan and usage (docs/12 Phase 6). Billing is handled by Bastaa directly for now. */
export default function BillingPage() {
  return (
    <Gate any={['billing.view']}>
      <Billing />
    </Gate>
  );
}

function Billing() {
  const e = useData<Entitlements>(['school', 'subscription'], '/school/subscription');
  if (!e.data) return <Skeleton className="h-64" />;
  const x = e.data;
  return (
    <Card>
      <CardHeader
        title={x.plan ? `${x.plan.name} plan` : 'No plan'}
        description="To change plan or pay, contact Bastaa — online billing comes later."
        action={x.status && <Badge tone={STATUS[x.status][1]}>{STATUS[x.status][0]}</Badge>}
      />
      <div className="flex flex-col gap-5 p-5">
        <Meter label="Students" used={x.usage.students} limit={x.limits.students} />
        <Meter label="File storage" used={x.usage.storageBytes} limit={x.limits.storageGb === null ? null : x.limits.storageGb * GB} fmt={(n) => `${(n / GB).toFixed(n < GB ? 2 : 1)} GB`} />
        <Meter label="SMS this month" used={x.usage.smsThisMonth} limit={x.limits.smsPerMonth} />
      </div>
      {x.features.length > 0 && <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3"><span className="mr-1 text-small text-fg-secondary">Included:</span>{x.features.map((f) => <Badge key={f} tone="accent">{f.replace(/_/g, ' ')}</Badge>)}</div>}
    </Card>
  );
}
