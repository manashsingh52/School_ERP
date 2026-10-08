'use client';

import type { PaymentItem, StudentFeeStatement } from '@schoolos/contracts';
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer, Receipt, UserRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { rupees } from '@/lib/money';
import { openReceipt } from './payment-dialog';
import { StudentPicker } from './student-picker';

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI_DIRECT', label: 'UPI' },
  { value: 'POS_CARD', label: 'Card (POS)' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
] as const;
type Method = (typeof METHODS)[number]['value'];

/** Counter collection (docs/08 W6): find student → tick invoices → method → collect → receipt. */
export function CollectTab() {
  const router = useRouter();
  const params = useSearchParams();
  const studentId = params.get('student');
  const setStudent = (id: string | null) => router.replace(`/payments?tab=collect${id ? `&student=${id}` : ''}`);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <StudentPicker onPick={(s) => setStudent(s.id)} autoFocus={!studentId} placeholder="Find student by name or admission number…" />
      </Card>
      {studentId ? <Counter key={studentId} studentId={studentId} onNext={() => setStudent(null)} /> : <Card><EmptyState icon={<UserRound />} title="Find a student to collect fees" description="Their open invoices appear here. Payments are for whole invoices." /></Card>}
    </div>
  );
}

function Counter({ studentId, onNext }: { studentId: string; onNext: () => void }) {
  const qc = useQueryClient();
  const st = useData<StudentFeeStatement>(['fees', 'statement', studentId], `/students/${studentId}/fees`);
  const open = useMemo(() => (st.data?.invoices ?? []).filter((i) => i.balancePaise > 0 && (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID')), [st.data]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PaymentItem | null>(null);
  useEffect(() => setPicked(new Set(open.map((i) => i.id))), [open]);
  const total = open.filter((i) => picked.has(i.id)).reduce((a, i) => a + i.balancePaise, 0);

  async function collect() {
    setBusy(true);
    try {
      const res = await apiFetch<{ data: PaymentItem }>('/payments/collect', {
        method: 'POST',
        body: JSON.stringify({ studentId, invoiceIds: [...picked], amountPaise: total, method, referenceNo: reference.trim() || undefined, notes: notes.trim() || undefined }),
        headers: { 'idempotency-key': key },
      });
      setDone(res.data);
      setKey(idempotencyKey());
      void qc.invalidateQueries({ queryKey: ['fees'] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t record the payment. Nothing was saved — try again.');
      if (err instanceof ApiError && err.code === 'INVOICE_CHANGED') void st.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function applyCredit(invoiceId: string) {
    try {
      await apiPost(`/students/${studentId}/credits/apply`, { invoiceId });
      toast.success('Credit used');
      await st.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  if (!st.data) return <Skeleton className="h-80" />;
  const s = st.data;
  if (done) return <Done payment={done} onNext={onNext} />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Avatar name={s.student.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{s.student.name}</div>
            <div className="text-small text-fg-secondary">{s.student.classLabel ?? '—'} · Adm. {s.student.admissionNo}</div>
          </div>
          <div className="text-right text-small">
            <div className="text-fg-tertiary">Due</div>
            <div className="tabular text-h3 font-semibold">{rupees(s.totals.balancePaise)}</div>
          </div>
        </div>
        {!open.length ? (
          <EmptyState icon={<CheckCircle2 />} title="Nothing to pay" description="All of this student's invoices are paid." />
        ) : (
          <ul>
            {open.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                <Checkbox checked={picked.has(i.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} aria-label={`Pay ${i.number}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{i.installment?.name ?? 'Fees'} <span className="tabular font-normal text-fg-tertiary">· {i.number}</span></div>
                  <div className={cn('text-small', i.overdue ? 'text-danger' : 'text-fg-secondary')}>Due {formatDate(i.dueDate)}{i.overdue ? ' · overdue' : ''}{i.lateFeePaise ? ` · includes ${rupees(i.lateFeePaise)} late fee` : ''}</div>
                </div>
                {s.totals.creditPaise > 0 && <Button size="sm" variant="ghost" onClick={() => void applyCredit(i.id)}>Use credit</Button>}
                <span className="tabular font-semibold">{rupees(i.balancePaise)}</span>
              </li>
            ))}
          </ul>
        )}
        {s.totals.creditPaise > 0 && <div className="border-t border-border px-5 py-3 text-small text-fg-secondary">Credit available: <b>{rupees(s.totals.creditPaise)}</b> (from an earlier overpayment)</div>}
      </Card>

      {open.length > 0 && (
        <Card className="flex h-fit flex-col gap-4 p-5">
          <div>
            <div className="text-small text-fg-secondary">Amount to collect</div>
            <div className="tabular text-display font-semibold">{rupees(total)}</div>
            <div className="text-caption text-fg-tertiary">Whole invoices only — part payments aren't taken.</div>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
            {METHODS.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => setMethod(m.value)} className={cn('h-10 rounded-md border text-small font-medium', method === m.value ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border text-fg-secondary hover:border-border-strong')}>
                {m.label}
              </button>
            ))}
          </div>
          {method !== 'CASH' && (
            <Field label={method === 'POS_CARD' ? 'Card slip / approval no.' : 'Transaction (UTR) reference'} htmlFor="col-ref">
              <Input id="col-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
            </Field>
          )}
          <Field label="Note" htmlFor="col-note" hint="Optional"><Input id="col-note" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="e.g. Paid by mother" /></Field>
          <Button size="lg" onClick={() => void collect()} loading={busy} disabled={!total || (method !== 'CASH' && !reference.trim())}>
            <Receipt /> Collect {rupees(total)}
          </Button>
        </Card>
      )}
    </div>
  );
}

function Done({ payment, onNext }: { payment: PaymentItem; onNext: () => void }) {
  const live = useData<PaymentItem>(['payments', payment.id, 'done'], `/payments/${payment.id}`, { staleTime: 0 });
  const p = live.data ?? payment;
  const qc = useQueryClient();
  useEffect(() => {
    if (p.receiptReady) return;
    const t = setInterval(() => void qc.invalidateQueries({ queryKey: ['payments', payment.id, 'done'] }), 1200);
    return () => clearInterval(t);
  }, [p.receiptReady, qc, payment.id]);
  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-6" /></span>
      <div>
        <div className="text-h2 font-semibold">{rupees(p.amountPaise)} received</div>
        <div className="text-body text-fg-secondary">{p.student.name} · receipt <b className="tabular">{p.receiptNo}</b></div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => void openReceipt(p.id)} disabled={!p.receiptReady} loading={!p.receiptReady}><Printer /> {p.receiptReady ? 'Print receipt' : 'Preparing receipt…'}</Button>
        <Button variant="secondary" onClick={onNext} autoFocus>Next student</Button>
      </div>
      <Badge tone="success">Parents have been notified</Badge>
    </Card>
  );
}
