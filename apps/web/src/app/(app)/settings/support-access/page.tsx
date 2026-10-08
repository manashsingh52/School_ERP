'use client';

import type { SupportGrantItem } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Gate } from '@/components/gate';
import { ApiError, apiPost } from '@/lib/api-client';
import { timeAgo } from '@/lib/format';
import { useData } from '@/lib/hooks';

const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const STATUS = { PENDING: ['Waiting for you', 'warning'], ACTIVE: ['Has access', 'success'], EXPIRED: ['Ended', 'neutral'], REVOKED: ['Ended', 'neutral'] } as const;

/** SchoolOS support can only look at the school when an admin says yes — read-only, and only for a while. */
export default function SupportAccessPage() {
  return (
    <Gate any={['user.manage']}>
      <SupportAccess />
    </Gate>
  );
}

function SupportAccess() {
  const qc = useQueryClient();
  const grants = useData<SupportGrantItem[]>(['school', 'support-access'], '/school/support-access', { staleTime: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  async function act(g: SupportGrantItem, action: 'approve' | 'revoke') {
    setBusy(g.id);
    try {
      await apiPost(`/school/support-access/${g.id}/${action}`);
      toast.success(action === 'approve' ? `${g.requestedBy.name} can look (read-only) until the time is up` : 'Access ended');
      void qc.invalidateQueries({ queryKey: ['school', 'support-access'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(null);
    }
  }
  if (!grants.data) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader title="SchoolOS support access" description="When you ask SchoolOS for help, they may request to look at your school. They can view, never change, and access ends by itself. Every step is in your audit log." />
      {!grants.data.length ? (
        <EmptyState icon={<ShieldCheck />} title="No requests" description="Nobody from SchoolOS has asked to look at your school." />
      ) : (
        <ul className="mt-3 border-t border-border">
          {grants.data.map((g) => {
            const hours = Math.round((Date.parse(g.expiresAt) - Date.parse(g.createdAt)) / 3_600_000);
            return (
              <li key={g.id} className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
                <LifeBuoy className="mt-0.5 size-5 shrink-0 text-fg-tertiary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">{g.requestedBy.name}<Badge tone={STATUS[g.status][1]}>{STATUS[g.status][0]}</Badge></div>
                  <p className="mt-0.5 text-body">“{g.reason}”</p>
                  <div className="text-small text-fg-tertiary">
                    Asked {timeAgo(g.createdAt)} · {g.status === 'PENDING' ? `for ${hours} hour${hours === 1 ? '' : 's'}` : g.status === 'ACTIVE' ? `until ${when.format(new Date(g.expiresAt))}${g.approvedBy ? ` · approved by ${g.approvedBy}` : ''}` : g.approvedBy ? `approved by ${g.approvedBy}` : 'not approved'}
                  </div>
                </div>
                {g.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => void act(g, 'revoke')} disabled={busy === g.id}>Decline</Button>
                    <Button size="sm" onClick={() => void act(g, 'approve')} loading={busy === g.id}>Allow read-only access</Button>
                  </div>
                )}
                {g.status === 'ACTIVE' && <Button size="sm" variant="destructive" onClick={() => void act(g, 'revoke')} loading={busy === g.id}>End access now</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
