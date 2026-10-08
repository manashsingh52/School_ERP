'use client';

import type { PlatformDashboard } from '@schoolos/contracts';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@schoolos/ui';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatNumber } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { rupees } from '@/lib/money';

function Kpi({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <Card className="h-full p-4 transition-colors hover:border-border-strong">
      <div className="text-small text-fg-secondary">{label}</div>
      <div className="tabular mt-1 text-kpi font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-caption text-fg-tertiary">{hint}</div>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function PlatformHome() {
  const d = useData<PlatformDashboard>(['platform', 'dashboard'], '/platform/dashboard', { staleTime: 30_000 });
  if (!d.data) return <Skeleton className="h-96" />;
  const x = d.data;
  const healthy = !x.health.failedJobs && !x.health.outboxFailed && !x.health.webhookFailures24h;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="Every school on SchoolOS at a glance." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Schools" value={formatNumber(x.schools.total)} hint={`${x.schools.active} live · ${x.schools.onboarding} onboarding · ${x.schools.suspended} suspended`} href="/platform/schools" />
        <Kpi label="Active students" value={formatNumber(x.students)} />
        <Kpi label="People active (7 days)" value={formatNumber(x.activeUsers7d)} />
        <Kpi label="Fees collected (30 days)" value={rupees(x.payments30d.amountPaise)} hint={`${formatNumber(x.payments30d.count)} payments`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscriptions" description="Billing is manual for now — record payments on each school." />
          <div className="grid grid-cols-4 gap-2 p-5">
            {([['Trial', x.subscriptions.trialing, 'info'], ['Active', x.subscriptions.active, 'success'], ['Past due', x.subscriptions.pastDue, 'warning'], ['Cancelled', x.subscriptions.cancelled, 'neutral']] as const).map(([l, n, tone]) => (
              <div key={l} className="flex flex-col items-start gap-1">
                <Badge tone={tone}>{l}</Badge>
                <span className="tabular text-h2 font-semibold">{n}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-5 py-3">
            <div className="mb-2 text-small font-medium">Trials ending in the next 14 days</div>
            {x.trialsEndingSoon.length ? (
              <ul className="flex flex-col gap-1">
                {x.trialsEndingSoon.map((t) => (
                  <li key={t.schoolId} className="flex justify-between text-body">
                    <Link href={`/platform/schools/${t.schoolId}`} className="text-accent-strong hover:underline">{t.name}</Link>
                    <span className="text-fg-secondary">{formatDate(t.trialEndsAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-fg-tertiary">None.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Health" action={<Link href="/platform/system" className="text-small text-accent-strong hover:underline">System →</Link>} />
          {healthy && !x.health.outboxPending ? (
            <EmptyState icon={<CheckCircle2 />} title="All systems normal" description="No failed jobs, stuck events or webhook failures." />
          ) : (
            <dl className="grid grid-cols-2 gap-4 p-5">
              {([['Failed jobs', x.health.failedJobs], ['Events waiting', x.health.outboxPending], ['Events failed', x.health.outboxFailed], ['Webhook failures (24 h)', x.health.webhookFailures24h]] as const).map(([l, n]) => (
                <div key={l}>
                  <dt className="text-small text-fg-secondary">{l}</dt>
                  <dd className={`tabular text-h2 font-semibold ${n && l !== 'Events waiting' ? 'text-danger' : ''}`}>{n}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}
