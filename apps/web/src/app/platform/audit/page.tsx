'use client';

import type { PlatformSchoolItem } from '@schoolos/contracts';
import { Card, Input, PageHeader, Select } from '@schoolos/ui';
import { useDeferredValue, useState } from 'react';
import { AuditList } from '@/components/platform/audit-list';
import { useData } from '@/lib/hooks';

export default function PlatformAuditPage() {
  const schools = useData<PlatformSchoolItem[]>(['platform', 'schools', ''], '/platform/schools');
  const [schoolId, setSchoolId] = useState('');
  const [action, setAction] = useState('');
  const a = useDeferredValue(action.trim());
  const params = new URLSearchParams({ ...(schoolId ? { schoolId } : {}), ...(a ? { action: a } : {}) }).toString();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Every change across SchoolOS — console actions and each school's own." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} aria-label="School" className="w-64">
            <option value="">All schools and the console</option>
            {schools.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action starts with… e.g. school. or payment." className="max-w-72" aria-label="Action" />
        </div>
        <AuditList key={params} path={`/platform/audit${params ? `?${params}` : ''}`} showSchool />
      </Card>
    </div>
  );
}
