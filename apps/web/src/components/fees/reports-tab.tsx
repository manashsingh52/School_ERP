'use client';

import type { FinanceReport, FinanceReportKey } from '@schoolos/contracts';
import { Button, Card, EmptyState, Input, Select, Skeleton, cn } from '@schoolos/ui';
import { BarChart3, Download } from 'lucide-react';
import { useState } from 'react';
import { useClasses } from '@/lib/academics';
import { formatDate, formatNumber, todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { rupees } from '@/lib/money';

const REPORTS: { key: FinanceReportKey; label: string; ranged: boolean }[] = [
  { key: 'collection', label: 'Daily collection', ranged: true },
  { key: 'outstanding', label: 'Outstanding by class', ranged: false },
  { key: 'defaulters', label: 'Defaulters', ranged: false },
  { key: 'heads', label: 'Head-wise collection', ranged: true },
  { key: 'concessions', label: 'Concessions given', ranged: false },
  { key: 'reconciliation', label: 'Online payments reconciliation', ranged: true },
];

const show = (type: string, v: string | number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  if (type === 'money') return rupees(Number(v));
  if (type === 'number') return formatNumber(Number(v));
  if (type === 'percent') return `${v}%`;
  if (type === 'date') return formatDate(String(v));
  return String(v);
};

export function ReportsTab() {
  const classes = useClasses();
  const [key, setKey] = useState<FinanceReportKey>('collection');
  const [from, setFrom] = useState(`${todayISO().slice(0, 8)}01`);
  const [to, setTo] = useState(todayISO());
  const [classId, setClassId] = useState('');
  const meta = REPORTS.find((r) => r.key === key)!;
  const qs = new URLSearchParams({ report: key });
  if (meta.ranged) { qs.set('from', from); qs.set('to', to); }
  if (classId) qs.set('classId', classId);
  const report = useData<FinanceReport>(['finance-report', qs.toString()], `/finance/reports?${qs}`);
  const r = report.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={key} onChange={(e) => setKey(e.target.value as FinanceReportKey)} className="w-64" aria-label="Report">
          {REPORTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </Select>
        {meta.ranged && (
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
          </>
        )}
        {key !== 'reconciliation' && (
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-40" aria-label="Class">
            <option value="">All classes</option>
            {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Button variant="secondary" className="ml-auto" asChild>
          <a href={`/api/v1/finance/reports?${qs}&format=csv`}><Download /> Download CSV</a>
        </Button>
      </div>
      {!r ? (
        <Skeleton className="h-80" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <div className="font-semibold">{r.title}</div>
            <div className="text-small text-fg-secondary">{r.description}{r.range ? ` · ${formatDate(r.range.from)} – ${formatDate(r.range.to)}` : ''}</div>
          </div>
          {!r.rows.length ? (
            <EmptyState icon={<BarChart3 />} title="Nothing to show for this selection" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-fg-tertiary">
                    {r.columns.map((c) => <th key={c.key} className={cn('px-4 py-2 font-medium', c.type !== 'text' && c.type !== 'date' && 'text-right')}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0 hover:bg-hover">
                      {r.columns.map((c) => <td key={c.key} className={cn('px-4 py-2', c.type !== 'text' && c.type !== 'date' && 'tabular text-right')}>{show(c.type, row[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
                {r.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-fg/70 font-semibold">
                      {r.columns.map((c, i) => <td key={c.key} className={cn('px-4 py-2', c.type !== 'text' && c.type !== 'date' && 'tabular text-right')}>{i === 0 ? 'Total' : r.totals![c.key] !== undefined ? show(c.type, r.totals![c.key]) : ''}</td>)}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
