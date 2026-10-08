'use client';

import type { FeeStructureItem, InvoiceItem, InvoicePreview, PageResponse } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, ErrorState, Field, Input, Pagination, Select, Skeleton, TD, TH, THead, TR, Table, TableSkeleton, cn, toast } from '@schoolos/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { useClasses } from '@/lib/academics';
import { formatDate, formatNumber } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';
import { INVOICE_STATUS, rupees } from '@/lib/money';
import { InvoiceDetailView } from './invoice-dialog';

const PAGE = 25;

export function InvoicesTab() {
  const { can } = useMe();
  const classes = useClasses();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (q) params.set('q', q);
  if (status === 'OVERDUE') params.set('overdue', 'true');
  else if (status) params.set('status', status);
  if (classId) params.set('classId', classId);
  const query = useQuery({ queryKey: ['invoices', 'list', params.toString()], queryFn: () => apiFetch<PageResponse<InvoiceItem>>(`/invoices?${params}`), placeholderData: keepPreviousData });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student, admission or invoice no." leading={<Search />} aria-label="Search invoices" /></div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40" aria-label="Status">
          <option value="">All open & paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="ISSUED">Due</option>
          <option value="PARTIALLY_PAID">Part paid</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} className="w-40" aria-label="Class">
          <option value="">All classes</option>
          {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {can('invoice.generate') && <Button className="ml-auto" onClick={() => setGenerating(true)}><FilePlus2 /> Make invoices</Button>}
      </div>
      <Card className="overflow-hidden">
        {query.isError ? (
          <ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} />
        ) : !query.isPending && !query.data?.data.length ? (
          <EmptyState icon={<Receipt />} title={q || status || classId ? 'No invoices match' : 'No invoices yet'} description={can('invoice.generate') && !q ? 'Set up a fee structure, publish it, then make invoices for an installment.' : undefined} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Invoice</TH><TH>Student</TH><TH>Installment</TH><TH>Due</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH className="w-28">Status</TH></tr></THead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton columns={7} />
                ) : (
                  query.data!.data.map((i) => (
                    <TR key={i.id} interactive tabIndex={0} onClick={() => setOpen(i.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(i.id)}>
                      <TD className="tabular font-medium">{i.number}</TD>
                      <TD><div>{i.student.name}</div><div className="text-caption text-fg-tertiary">{i.student.classLabel ?? '—'} · {i.student.admissionNo}</div></TD>
                      <TD className="text-fg-secondary">{i.installment?.name ?? '—'}</TD>
                      <TD className={cn('tabular', i.overdue && 'font-medium text-danger')}>{formatDate(i.dueDate)}</TD>
                      <TD className="tabular text-right">{rupees(i.totalPaise)}</TD>
                      <TD className={cn('tabular text-right font-medium', i.balancePaise > 0 ? 'text-fg' : 'text-fg-tertiary')}>{rupees(i.balancePaise)}</TD>
                      <TD><Badge tone={i.overdue ? 'danger' : INVOICE_STATUS[i.status]!.tone} dot>{i.overdue ? 'Overdue' : INVOICE_STATUS[i.status]!.label}</Badge></TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
            {!!query.data?.page.total && <div className="border-t border-border"><Pagination page={page} pageSize={PAGE} total={query.data.page.total} onPageChange={setPage} /></div>}
          </>
        )}
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent title="Invoice" className="max-w-[600px]">
            <InvoiceDetailView invoiceId={open} onClose={() => setOpen(null)} />
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={generating} onOpenChange={setGenerating}>
        <DialogContent title="Make invoices" description="Pick an installment. You'll see a preview before anything is issued." className="max-w-[640px]">
          {generating && <GenerateWizard onDone={() => setGenerating(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GenerateWizard({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const structures = useData<FeeStructureItem[]>(['fees', 'structures'], '/fee-structures');
  const published = structures.data?.filter((s) => s.status === 'PUBLISHED') ?? [];
  const [structureId, setStructureId] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const structure = published.find((s) => s.id === (structureId || published[0]?.id));
  const installment = structure?.installments.find((i) => i.id === installmentId) ?? structure?.installments[0];

  async function load() {
    if (!installment) return;
    setBusy(true);
    try {
      setPreview((await apiPost<{ data: InvoicePreview }>('/invoices/preview', { installmentId: installment.id })).data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t prepare the preview.');
    } finally {
      setBusy(false);
    }
  }
  async function issue() {
    if (!installment) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ data: { queued: number } }>('/invoices/generate', { method: 'POST', body: JSON.stringify({ installmentId: installment.id }), headers: { 'idempotency-key': idempotencyKey() } });
      toast.success(`Issuing ${formatNumber(res.data.queued)} invoices — they'll appear in a moment`);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['invoices'] }), 2500);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['invoices'] }), 8000);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t issue the invoices.');
    } finally {
      setBusy(false);
    }
  }

  if (!structures.data) return <DialogBody><Skeleton className="h-40" /></DialogBody>;
  if (!published.length) return <DialogBody><p className="text-body text-fg-secondary">Publish a fee structure first (Structures tab).</p></DialogBody>;
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fee structure" htmlFor="gen-s">
            <Select id="gen-s" value={structure?.id ?? ''} onChange={(e) => { setStructureId(e.target.value); setInstallmentId(''); setPreview(null); }}>
              {published.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Installment" htmlFor="gen-i">
            <Select id="gen-i" value={installment?.id ?? ''} onChange={(e) => { setInstallmentId(e.target.value); setPreview(null); }}>
              {structure?.installments.map((i) => <option key={i.id} value={i.id}>{i.name} · due {formatDate(i.dueDate)} · {rupees(i.amountPaise)}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-small text-fg-secondary">For {structure?.classes.map((c) => c.name).join(', ')}. Approved concessions and opted optional fees are applied per student.</p>
        {preview && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Students', formatNumber(preview.students)],
                ['New invoices', formatNumber(preview.toCreate)],
                ['Already invoiced', formatNumber(preview.alreadyInvoiced)],
                ['Total to bill', rupees(preview.totalPaise)],
              ].map(([k, v]) => <div key={k}><div className="text-caption text-fg-tertiary">{k}</div><div className="tabular text-h3 font-semibold">{v}</div></div>)}
            </div>
            {preview.concessionPaise > 0 && <p className="text-small text-fg-secondary">Includes {rupees(preview.concessionPaise)} of concessions.</p>}
            {preview.sample.map((s) => (
              <div key={s.student} className="rounded-md bg-subtle/60 p-2.5 text-small">
                <div className="mb-1 font-medium">{s.student} · {s.classLabel}</div>
                {s.lines.map((l, i) => <div key={i} className="flex justify-between text-fg-secondary"><span>{l.description}</span><span className="tabular">{rupees(l.amountPaise)}</span></div>)}
                <div className="mt-1 flex justify-between font-medium"><span>Total</span><span className="tabular">{rupees(s.totalPaise)}</span></div>
              </div>
            ))}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        {!preview ? (
          <Button onClick={() => void load()} loading={busy}>Preview</Button>
        ) : (
          <Button onClick={() => void issue()} loading={busy} disabled={!preview.toCreate}>Issue {formatNumber(preview.toCreate)} invoices</Button>
        )}
      </DialogFooter>
    </>
  );
}
