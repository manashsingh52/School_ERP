'use client';

import type { OnlineOrder, OnlinePaymentResult, StudentFeeStatement } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, PageHeader, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, CreditCard, Download, IndianRupee, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { openReceipt } from '@/components/fees/payment-dialog';
import { ForChild } from '@/components/parent/parent-gate';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { METHOD_LABEL, PAYMENT_STATUS, rupees } from '@/lib/money';

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

/** Razorpay Checkout script, loaded only when a parent actually pays (real gateway). */
function loadRazorpay(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Checkout did not load')));
    s.onerror = () => reject(new Error('Checkout did not load'));
    document.body.appendChild(s);
  });
}

function Statement({ studentId, firstName }: { studentId: string; firstName: string }) {
  const qc = useQueryClient();
  const st = useData<StudentFeeStatement>(['fees', 'statement', studentId], `/students/${studentId}/fees`);
  const open = useMemo(() => (st.data?.invoices ?? []).filter((i) => i.balancePaise > 0 && (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID')), [st.data]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [mockOrder, setMockOrder] = useState<OnlineOrder | null>(null);
  const [result, setResult] = useState<OnlinePaymentResult | null>(null);
  useEffect(() => setPicked(new Set(open.map((i) => i.id))), [open]);
  const total = open.filter((i) => picked.has(i.id)).reduce((a, i) => a + i.balancePaise, 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ['fees', 'statement', studentId] });

  async function verify(payload: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    try {
      const res = await apiPost<{ data: OnlinePaymentResult }>('/payments/online/verify', payload);
      setResult(res.data);
    } catch (err) {
      setResult({ status: 'PENDING', paymentId: null, receiptNo: null, message: err instanceof ApiError ? err.message : "We're confirming your payment. You'll get a notification when it's done." });
    }
    void refresh();
  }

  async function pay() {
    setBusy(true);
    try {
      const order = (await apiFetch<{ data: OnlineOrder }>('/payments/online/orders', { method: 'POST', body: JSON.stringify({ studentId, invoiceIds: [...picked] }), headers: { 'idempotency-key': idempotencyKey() } })).data;
      if (order.driver === 'mock') {
        setMockOrder(order);
        return;
      }
      const Razorpay = await loadRazorpay();
      const rz = new Razorpay({
        key: order.keyId,
        order_id: order.providerOrderId,
        amount: order.amountPaise,
        currency: 'INR',
        name: order.schoolName,
        description: order.description,
        prefill: order.prefill,
        theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2F6FEB' },
        handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
          void verify({ providerOrderId: r.razorpay_order_id, providerPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      });
      rz.open();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Online payment is not available right now. You can pay at the school office.');
    } finally {
      setBusy(false);
    }
  }

  async function mockPay(outcome: 'success' | 'failure', method: 'upi' | 'card') {
    if (!mockOrder) return;
    setBusy(true);
    try {
      const sim = await apiPost<{ data: { providerOrderId: string; providerPaymentId: string; signature: string } }>('/payments/online/mock-checkout', { providerOrderId: mockOrder.providerOrderId, outcome, method });
      setMockOrder(null);
      await verify(sim.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  if (!st.data) return <Skeleton className="h-96" />;
  const s = st.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Due now', rupees(s.totals.balancePaise), s.totals.balancePaise > 0],
          ['Overdue', rupees(s.totals.overduePaise), s.totals.overduePaise > 0],
          ['Paid this year', rupees(s.totals.paidPaise), false],
          ['Credit', rupees(s.totals.creditPaise), false],
        ].map(([label, value, warn]) => (
          <Card key={String(label)} className="p-4">
            <div className="text-small text-fg-secondary">{label}</div>
            <div className={cn('tabular mt-1 text-h2 font-semibold', warn && label === 'Overdue' && 'text-danger')}>{value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="To pay" description={s.onlinePayments ? 'Pick the bills to pay. Each bill is paid in full.' : 'Online payment is not available yet — please pay at the school office.'} />
        {!open.length ? (
          <EmptyState icon={<CheckCircle2 />} title={`All of ${firstName}'s fees are paid`} />
        ) : (
          <>
            <ul className="mt-3 border-t border-border">
              {open.map((i) => (
                <li key={i.id} className="flex items-center gap-3 border-b border-border px-5 py-3">
                  {s.onlinePayments && <Checkbox checked={picked.has(i.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} aria-label={`Pay ${i.installment?.name ?? i.number}`} />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.installment?.name ?? 'Fees'}</div>
                    <div className={cn('text-small', i.overdue ? 'text-danger' : 'text-fg-secondary')}>Due {formatDate(i.dueDate)}{i.overdue ? ' · overdue' : ''} · {i.number}</div>
                  </div>
                  <span className="tabular font-semibold">{rupees(i.balancePaise)}</span>
                </li>
              ))}
            </ul>
            {s.onlinePayments && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className="text-small text-fg-secondary">UPI, cards and net banking</span>
                <Button size="lg" onClick={() => void pay()} loading={busy} disabled={!total}><CreditCard /> Pay {rupees(total)}</Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Payments and receipts" />
        {!s.payments.length ? (
          <EmptyState icon={<IndianRupee />} title="No payments yet" />
        ) : (
          <ul className="mt-3 border-t border-border">
            {s.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium tabular">{rupees(p.amountPaise)} <span className="font-normal text-fg-tertiary">· {METHOD_LABEL[p.method]}</span></div>
                  <div className="text-small text-fg-secondary">{formatDate(p.receivedAt)} · {p.receiptNo}</div>
                </div>
                <Badge tone={PAYMENT_STATUS[p.status]!.tone}>{PAYMENT_STATUS[p.status]!.label}</Badge>
                {p.receiptNo && <Button variant="ghost" size="sm" onClick={() => void openReceipt(p.id)}><Download /> Receipt</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={!!mockOrder} onOpenChange={(o) => !o && setMockOrder(null)}>
        {mockOrder && (
          <DialogContent title="Test checkout" description={`${mockOrder.schoolName} · ${rupees(mockOrder.amountPaise)} · sandbox — no real money`}>
            <DialogBody className="flex flex-col gap-2">
              <p className="text-small text-fg-secondary">This server uses the payment sandbox. Choose what the bank should do:</p>
              <Button onClick={() => void mockPay('success', 'upi')} loading={busy}>Pay with UPI (succeeds)</Button>
              <Button variant="secondary" onClick={() => void mockPay('success', 'card')} disabled={busy}>Pay with card (succeeds)</Button>
              <Button variant="ghost" className="text-danger" onClick={() => void mockPay('failure', 'upi')} disabled={busy}>Payment fails</Button>
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        {result && (
          <DialogContent title={result.status === 'PAID' ? 'Payment received' : result.status === 'FAILED' ? 'Payment did not go through' : 'Payment pending'}>
            <DialogBody className="flex flex-col items-center gap-3 py-6 text-center">
              {result.status === 'PAID' ? <CheckCircle2 className="size-10 text-success" /> : result.status === 'FAILED' ? <XCircle className="size-10 text-danger" /> : <Clock className="size-10 text-warning" />}
              <p className="text-body">{result.message}</p>
              {result.receiptNo && <p className="text-small text-fg-secondary">Receipt {result.receiptNo}</p>}
            </DialogBody>
            <DialogFooter>
              {result.paymentId && <Button variant="secondary" onClick={() => void openReceipt(result.paymentId!)}><Download /> Receipt</Button>}
              <Button onClick={() => setResult(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default function ChildFeesPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s fees`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          <Statement key={child.id} studentId={child.id} firstName={child.firstName} />
        </div>
      )}
    </ForChild>
  );
}
