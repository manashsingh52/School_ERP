'use client';

import type { FeeStructureItem } from '@schoolos/contracts';
import { Badge, Button, Card, EmptyState, Skeleton } from '@schoolos/ui';
import { Layers, Plus } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';
import { rupees } from '@/lib/money';

export function StructuresTab() {
  const { can } = useMe();
  const structures = useData<FeeStructureItem[]>(['fees', 'structures'], '/fee-structures');
  if (!structures.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      {can('fee.manage') && <div className="flex justify-end"><Button asChild><Link href="/fees/structures/new"><Plus /> New fee structure</Link></Button></div>}
      {!structures.data.length ? (
        <Card><EmptyState icon={<Layers />} title="No fee structures yet" description="A structure says which classes pay which fees, in which installments." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {structures.data.map((s) => (
            <Link key={s.id} href={`/fees/structures/${s.id}`}>
              <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-h3 font-semibold">{s.name}</div>
                    <div className="text-small text-fg-secondary">{s.classes.map((c) => c.name).join(', ')}</div>
                  </div>
                  <Badge tone={s.status === 'PUBLISHED' ? 'success' : 'warning'} dot>{s.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-small">
                  <span><span className="text-fg-tertiary">Per year </span><b className="tabular">{rupees(s.annualPaise)}</b></span>
                  <span className="text-fg-secondary">{s.installments.length} installment{s.installments.length === 1 ? '' : 's'} · first due {formatDate(s.installments[0]?.dueDate)}</span>
                  {s.invoices > 0 && <span className="text-fg-secondary">{s.invoices} invoices</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
