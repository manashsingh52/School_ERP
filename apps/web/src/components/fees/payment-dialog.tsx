'use client';

import type { PaymentItem } from '@schoolos/contracts';
import { Badge, Button, DialogBody, DialogFooter, Field, Input, Skeleton, Textarea, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { useMe } from '@/lib/me';
import { METHOD_LABEL, PAYMENT_STATUS, rupees, toPaise, toRupeeInput } from '@/lib/money';

export async function openReceipt(paymentId: string) {
  try {
    const res = await apiFetch<{ data: { url: string; duplicate?: boolean } }>(`/payments/${paymentId}/receipt`);
    window.open(res.data.url, '_blank', 'noopener');
    if (res.data.duplicate) toast.info('This is a reprint, so it says DUPLICATE COPY. The reprint is recorded in the audit log.');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'We couldn’t open the receipt.');
  }
}

/** Payment detail with receipt, void (counter) and refund. Body of a dialog. */
export function PaymentDetailView({ paymentId }: { paymentId: string }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['payments', paymentId],
    queryFn: () => apiFetch<{ data: PaymentItem }>(`/payments/${paymentId}`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data && !q.state.data.receiptReady && q.state.data.status === 'CAPTURED' ? 1500 : false),
  });
  const [mode, setMode] = useState<'view' | 'void' | 'refund'>('view');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const p = query.data;

  async function submit() {
    if (!p) return;
    setBusy(true);
    try {
      if (mode === 'void') {
        await apiPost(`/payments/${p.id}/void`, { reason });
        toast.success('Receipt cancelled — the invoices are open again');
      } else {
        const paise = toPaise(amount);
        if (!paise) throw new ApiError(422, 'VALIDATION_FAILED', 'Enter an amount like 500 or 500.50');
        await apiFetch(`/payments/${p.id}/refunds`, { method: 'POST', body: JSON.stringify({ amountPaise: paise, reason }), headers: { 'idempotency-key': idempotencyKey() } });
        toast.success(p.method === 'ONLINE' ? 'Refund sent to Razorpay — it completes in a few days' : 'Refund recorded');
      }
      await qc.invalidateQueries({ queryKey: ['payments'] });
      await qc.invalidateQueries({ queryKey: ['fees'] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      setMode('view');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <DialogBody><Skeleton className="h-48" /></DialogBody>;
  const refundable = p.amountPaise - p.refundedPaise;
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
          <Badge tone={PAYMENT_STATUS[p.status]!.tone} dot>{PAYMENT_STATUS[p.status]!.label}</Badge>
          <span>{p.student.name} · {p.student.classLabel ?? '—'}</span>
          <span>· {new Date(p.receivedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-small">
          <div><dt className="text-fg-tertiary">Amount</dt><dd className="tabular text-h3 font-semibold">{rupees(p.amountPaise)}</dd></div>
          <div><dt className="text-fg-tertiary">Method</dt><dd>{METHOD_LABEL[p.method]}{p.gatewayMethod ? ` (${p.gatewayMethod.toUpperCase()})` : ''}</dd></div>
          <div><dt className="text-fg-tertiary">Reference</dt><dd className="break-all">{p.gatewayPaymentId ?? p.referenceNo ?? '—'}</dd></div>
          <div><dt className="text-fg-tertiary">Received by</dt><dd>{p.collectedBy ?? 'Online'}</dd></div>
          {p.refundedPaise > 0 && <div><dt className="text-fg-tertiary">Refunded</dt><dd className="tabular">{rupees(p.refundedPaise)}</dd></div>}
          {p.creditPaise > 0 && <div><dt className="text-fg-tertiary">Held as credit</dt><dd className="tabular">{rupees(p.creditPaise)}</dd></div>}
        </dl>
        <div>
          <div className="mb-1 text-caption font-medium text-fg-tertiary">Paid towards</div>
          {p.allocations.map((a) => (
            <div key={a.invoiceId} className="flex justify-between text-small"><span>{a.invoiceNumber}</span><span className="tabular">{rupees(a.amountPaise)}</span></div>
          ))}
        </div>
        {p.voidReason && <p className="text-small text-danger">Cancelled: {p.voidReason}</p>}
        {mode !== 'view' && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-subtle/50 p-3">
            {mode === 'refund' && (
              <Field label={`Amount (₹, up to ${rupees(refundable)})`} htmlFor="rf-amt" className="w-48">
                <Input id="rf-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            )}
            <Field label={mode === 'void' ? 'Why cancel this receipt?' : 'Reason for refund'} htmlFor="pd-why">
              <Textarea id="pd-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        {mode === 'view' ? (
          <>
            {p.status === 'CAPTURED' && p.method !== 'ONLINE' && can('payment.void') && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setMode('void')}>Cancel receipt</Button>}
            {(p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED') && can('payment.refund') && (
              <Button variant="secondary" onClick={() => { setAmount(toRupeeInput(refundable)); setMode('refund'); }}>Refund</Button>
            )}
            <Button onClick={() => void openReceipt(p.id)} disabled={!p.receiptReady}>
              {p.receiptReady ? <><Printer /> Receipt {p.receiptNo}</> : <><Download /> Preparing receipt…</>}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setMode('view')}>Back</Button>
            <Button variant={mode === 'void' ? 'destructive' : 'primary'} onClick={() => void submit()} loading={busy} disabled={reason.trim().length < 3}>
              {mode === 'void' ? 'Cancel receipt' : 'Refund'}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
