'use client';

import { Card, CardHeader, Input } from '@schoolos/ui';
import { useDeferredValue, useState } from 'react';
import { Gate } from '@/components/gate';
import { AuditList } from '@/components/platform/audit-list';

/** The school's audit log (docs/09 §6): who changed what and when — including SchoolOS support. */
export default function AuditPage() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const a = useDeferredValue(action.trim());
  const params = new URLSearchParams({ ...(a ? { action: a } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return (
    <Gate any={['audit.view']}>
      <Card>
        <CardHeader title="Audit log" description="Every change, newest first. Click one to see what changed." />
        <div className="mt-3 flex flex-wrap gap-2 border-y border-border p-3">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter, e.g. payment or student." className="max-w-64" aria-label="Action" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
        </div>
        <AuditList key={params} path={`/audit${params ? `?${params}` : ''}`} />
      </Card>
    </Gate>
  );
}
