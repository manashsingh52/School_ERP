'use client';

import type { InvoiceDetail } from '@schoolos/contracts';
import { Badge, Button, DialogBody, DialogFooter, Field, Input, Skeleton, Textarea, cn, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useMe } from '@/lib/me';
import { INVOICE_STATUS, METHOD_LABEL, rupees, toPaise } from '@/lib/money';

/** Invoice detail: lines, payments, adjust / cancel. Body of a dialog. */
export function InvoiceDetailView({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['invoices', invoiceId], queryFn: () => apiFetch<{ data: InvoiceDetail }>(`/invoices/${invoiceId}`).then((r) => r.data) });
  const [mode, setMode] = useState<'view' | 'adjust' | 'cancel'>('view');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const inv = query.data;

  async function submit() {
    if (!inv) return;
    setBusy(true);
    try {
      if (mode === 'adjust') {
        const paise = toPaise(amount);
        if (!paise) throw new ApiError(422, 'VALIDATION_FAILED', 'Enter an amount like 500 or 500.50');
        await apiFetch(`/invoices/${inv.id}/adjustments`, { method: 'POST', body: JSON.stringify({ amountPaise: direction * paise, reason, version: inv.version }), headers: { 'idempotency-key': idempotencyKey() } });
        toast.success('Adjustment added');
      } else {
        await apiPost(`/invoices/${inv.id}/cancel`, { reason, version: inv.version });
        toast.success('Invoice cancelled');
      }
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['fees'] });
      setMode('view');
      setAmount('');
      setReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  if (!inv) return <DialogBody><Skeleton className="h-64" /></DialogBody>;
  const open = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID';
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
          <Badge tone={INVOICE_STATUS[inv.status]!.tone} dot>{INVOICE_STATUS[inv.status]!.label}</Badge>
          {inv.overdue && <Badge tone="danger">Overdue</Badge>}
          <span>{inv.student.name} · {inv.student.classLabel ?? '—'} · Adm. {inv.student.admissionNo}</span>
          <span>· Due {formatDate(inv.dueDate)}</span>
        </div>
        <table className="w-full text-small">
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-b-0">
                <td className="py-1.5">
                  {l.description}
                  {l.reason && <span className="block text-caption text-fg-tertiary">{l.reason}</span>}
                </td>
                <td className={cn('tabular py-1.5 text-right', l.amountPaise < 0 && 'text-success')}>{rupees(l.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-fg/80 font-semibold"><td className="py-1.5">Total</td><td className="tabular py-1.5 text-right">{rupees(inv.totalPaise)}</td></tr>
            <tr><td className="py-0.5 text-fg-secondary">Paid</td><td className="tabular py-0.5 text-right text-fg-secondary">{rupees(inv.paidPaise)}</td></tr>
            <tr className="font-semibold"><td className="py-0.5">Balance</td><td className={cn('tabular py-0.5 text-right', inv.balancePaise > 0 && 'text-danger')}>{rupees(inv.balancePaise)}</td></tr>
          </tfoot>
        </table>
        {inv.payments.length > 0 && (
          <div>
            <div className="mb-1 text-caption font-medium text-fg-tertiary">Payments</div>
            {inv.payments.map((p) => (
              <div key={p.paymentId} className={cn('flex justify-between text-small', p.voided && 'text-fg-tertiary line-through')}>
                <span>{p.receiptNo ?? '—'} · {METHOD_LABEL[p.method] ?? p.method} · {formatDate(p.receivedAt)}</span>
                <span className="tabular">{rupees(p.amountPaise)}</span>
              </div>
            ))}
          </div>
        )}
        {inv.cancelReason && <p className="text-small text-fg-secondary">Cancelled: {inv.cancelReason}</p>}
        {mode !== 'view' && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-subtle/50 p-3">
            {mode === 'adjust' && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex rounded-md border border-border bg-surface p-0.5 text-small">
                  {([[1, 'Add charge'], [-1, 'Reduce']] as const).map(([d, text]) => (
                    <button key={d} type="button" onClick={() => setDirection(d)} className={cn('rounded px-2.5 py-1', direction === d ? 'bg-accent-soft font-medium text-accent-strong' : 'text-fg-secondary')}>{text}</button>
                  ))}
                </div>
                <Field label="Amount (₹)" htmlFor="adj-amt" className="w-36"><Input id="adj-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              </div>
            )}
            <Field label={mode === 'adjust' ? 'Reason (shown on the invoice)' : 'Why cancel?'} htmlFor="adj-why">
              <Textarea id="adj-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        {mode === 'view' ? (
          <>
            {open && can('invoice.cancel') && inv.paidPaise === 0 && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setMode('cancel')}>Cancel invoice</Button>}
            {open && can('invoice.adjust') && <Button variant="secondary" onClick={() => setMode('adjust')}>Adjust</Button>}
            {open && can('payment.collect') && <Button asChild><Link href={`/payments?tab=collect&student=${inv.student.id}`} onClick={onClose}>Collect payment</Link></Button>}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setMode('view')}>Back</Button>
            <Button variant={mode === 'cancel' ? 'destructive' : 'primary'} onClick={() => void submit()} loading={busy} disabled={reason.trim().length < 3}>
              {mode === 'adjust' ? 'Add adjustment' : 'Cancel invoice'}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
