'use client';

import type { DayClose, PageResponse, PaymentItem } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, ErrorState, Input, Pagination, Select, Skeleton, TD, TH, THead, TR, Table, TableSkeleton } from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CreditCard, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DateStepper } from '@/components/attendance/date-stepper';
import { ApiError, apiFetch } from '@/lib/api-client';
import { todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { METHOD_LABEL, PAYMENT_STATUS, rupees } from '@/lib/money';
import { PaymentDetailView } from './payment-dialog';

const PAGE = 25;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function PaymentRow({ p, onOpen }: { p: PaymentItem; onOpen: () => void }) {
  return (
    <TR interactive tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <TD className="tabular font-medium">{p.receiptNo ?? '—'}</TD>
      <TD><div>{p.student.name}</div><div className="text-caption text-fg-tertiary">{p.student.classLabel ?? '—'} · {p.student.admissionNo}</div></TD>
      <TD className="text-fg-secondary">{METHOD_LABEL[p.method]}{p.gatewayMethod ? ` · ${p.gatewayMethod.toUpperCase()}` : ''}</TD>
      <TD className="tabular text-fg-secondary">{when(p.receivedAt)}</TD>
      <TD className="text-fg-secondary">{p.collectedBy ?? 'Online'}</TD>
      <TD className="tabular text-right font-medium">{rupees(p.amountPaise)}</TD>
      <TD><Badge tone={PAYMENT_STATUS[p.status]!.tone} dot>{PAYMENT_STATUS[p.status]!.label}</Badge></TD>
    </TR>
  );
}

const HEAD = (
  <THead><tr><TH>Receipt</TH><TH>Student</TH><TH>Method</TH><TH>When</TH><TH>Received by</TH><TH className="text-right">Amount</TH><TH className="w-28">Status</TH></tr></THead>
);

export function PaymentsListTab() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (q) params.set('q', q);
  if (method) params.set('method', method);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = useQuery({ queryKey: ['payments', 'list', params.toString()], queryFn: () => apiFetch<PageResponse<PaymentItem>>(`/payments?${params}`), placeholderData: keepPreviousData });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Receipt, reference or student" leading={<Search />} aria-label="Search payments" /></div>
        <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="w-40" aria-label="Method">
          <option value="">All methods</option>
          {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label="From" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label="To" />
      </div>
      <Card className="overflow-hidden">
        {query.isError ? (
          <ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} />
        ) : !query.isPending && !query.data?.data.length ? (
          <EmptyState icon={<CreditCard />} title="No payments found" />
        ) : (
          <>
            <Table>{HEAD}<tbody>{query.isPending ? <TableSkeleton columns={7} /> : query.data!.data.map((p) => <PaymentRow key={p.id} p={p} onOpen={() => setOpen(p.id)} />)}</tbody></Table>
            {!!query.data?.page.total && <div className="border-t border-border"><Pagination page={page} pageSize={PAGE} total={query.data.page.total} onPageChange={setPage} /></div>}
          </>
        )}
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && <DialogContent title="Payment" className="max-w-[560px]"><PaymentDetailView paymentId={open} /></DialogContent>}
      </Dialog>
    </div>
  );
}

/** The accountant's day close — printable. */
export function DayCloseTab() {
  const [date, setDate] = useState(todayISO());
  const [open, setOpen] = useState<string | null>(null);
  const day = useData<DayClose>(['payments', 'day-close', date], `/payments/day-close?date=${date}`);
  const d = day.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <DateStepper value={date} onChange={setDate} />
        <Button variant="secondary" onClick={() => window.print()}><Printer /> Print</Button>
      </div>
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="p-5"><div className="text-small text-fg-secondary">Collected</div><div className="tabular mt-1 text-kpi font-semibold">{rupees(d.totalPaise)}</div><div className="text-caption text-fg-tertiary">{d.count} payment{d.count === 1 ? '' : 's'}</div></Card>
            <Card className="p-5">
              <div className="mb-2 text-small text-fg-secondary">By method</div>
              {d.byMethod.map((m) => <div key={m.method} className="flex justify-between text-small"><span>{m.method} · {m.count}</span><span className="tabular font-medium">{rupees(m.amountPaise)}</span></div>)}
              {!d.byMethod.length && <div className="text-small text-fg-tertiary">—</div>}
            </Card>
            <Card className="p-5">
              <div className="mb-2 text-small text-fg-secondary">By person</div>
              {d.byCollector.map((c) => <div key={c.collector} className="flex justify-between text-small"><span>{c.collector} · {c.count}</span><span className="tabular font-medium">{rupees(c.amountPaise)}</span></div>)}
              {d.voided.count > 0 && <div className="mt-2 text-caption text-danger">{d.voided.count} cancelled ({rupees(d.voided.amountPaise)}) not counted</div>}
            </Card>
          </div>
          <Card className="overflow-hidden">
            {!d.payments.length ? <EmptyState icon={<CreditCard />} title="No payments on this day" /> : <Table>{HEAD}<tbody>{d.payments.map((p) => <PaymentRow key={p.id} p={p} onOpen={() => setOpen(p.id)} />)}</tbody></Table>}
          </Card>
        </>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && <DialogContent title="Payment" className="max-w-[560px]"><PaymentDetailView paymentId={open} /></DialogContent>}
      </Dialog>
    </div>
  );
}
