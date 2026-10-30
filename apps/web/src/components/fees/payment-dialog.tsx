'use client';

import type { PaymentItem } from '@schoolos/contracts';
import { Badge, Button, DialogBody, DialogFooter, Field, Input, Skeleton, Textarea, toast } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { useMe } from '@/lib/me';
import { METHOD_LABEL, PAYMENT_STATUS, rupees, toPaise, toRupeeInput } from '@/lib/money';

type ReceiptLink = { url: string; duplicate?: boolean };

async function receiptLink(paymentId: string): Promise<ReceiptLink | null> {
  // Imported and older payments get their receipt made on the first request: wait briefly for it.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await apiFetch<{ data: ReceiptLink }>(`/payments/${paymentId}/receipt`);
      if (res.data.duplicate) toast.info('This is a reprint, so it says DUPLICATE COPY. The reprint is recorded in the audit log.');
      return res.data;
    } catch (err) {
      const preparing = err instanceof ApiError && err.code === 'RECEIPT_NOT_READY';
      if (preparing && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (preparing) toast.info('The receipt is being prepared. Try again in a few seconds.');
      else toast.error(err instanceof ApiError ? err.message : 'We couldn’t open the receipt.');
      return null;
    }
  }
}

async function receiptFile(paymentId: string, receiptNo?: string | null): Promise<{ blob: Blob; name: string } | null> {
  const link = await receiptLink(paymentId);
  if (!link) return null;
  try {
    const res = await fetch(link.url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get('content-disposition') ?? '')?.[1];
    return { blob: await res.blob(), name: named ? decodeURIComponent(named) : `Receipt ${(receiptNo ?? paymentId).replace(/\//g, '-')}.pdf` };
  } catch {
    toast.error('We couldn’t load the receipt. Please try again.');
    return null;
  }
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Phones, tablets, Safari and browsers without a PDF viewer can't print a PDF from inside the page, so there the receipt is
 * downloaded instead. (No browser can tell whether a printer is attached: on a computer the print
 * window opens, and offers "Save as PDF" when there's no printer.)
 */
function canPrintPdf() {
  const ua = navigator.userAgent;
  const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua);
  // A browser set to download PDFs (no viewer) would print a blank page.
  return !safari && navigator.pdfViewerEnabled !== false && !window.matchMedia('(pointer: coarse)').matches;
}

/** Load the PDF into a hidden frame and open the print window for it. */
function printPdf(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.title = 'Receipt';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    const cleanup = () => setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
    const fail = setTimeout(() => { cleanup(); resolve(false); }, 10_000);
    frame.onload = () => {
      // The PDF viewer needs a moment after load before it can print.
      setTimeout(() => {
        clearTimeout(fail);
        try {
          frame.contentWindow!.focus();
          frame.contentWindow!.print();
          resolve(true);
        } catch {
          resolve(false);
        }
        cleanup();
      }, 400);
    };
    frame.src = url;
    document.body.append(frame);
  });
}

/** Print button: straight to the printer where the browser can print, otherwise a download. */
export async function printReceipt(paymentId: string, receiptNo?: string | null) {
  const file = await receiptFile(paymentId, receiptNo);
  if (!file) return;
  if (canPrintPdf() && (await printPdf(file.blob))) return;
  saveFile(file.blob, file.name);
  toast.info('Printing isn’t available here, so the receipt was downloaded. Print it from your downloads.');
}

export async function downloadReceipt(paymentId: string, receiptNo?: string | null) {
  const file = await receiptFile(paymentId, receiptNo);
  if (file) saveFile(file.blob, file.name);
}

/** Opens the receipt in a new tab (parents and the student page). */
export async function openReceipt(paymentId: string) {
  const link = await receiptLink(paymentId);
  if (link) window.open(link.url, '_blank', 'noopener');
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
      <DialogFooter className="flex-wrap">
        {mode === 'view' ? (
          <>
            {p.status === 'CAPTURED' && p.method !== 'ONLINE' && can('payment.void') && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setMode('void')}>Cancel receipt</Button>}
            {(p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED') && can('payment.refund') && (
              <Button variant="secondary" onClick={() => { setAmount(toRupeeInput(refundable)); setMode('refund'); }}>Refund</Button>
            )}
            {p.receiptNo && (
              <>
                <Button variant="secondary" onClick={() => void downloadReceipt(p.id, p.receiptNo)} aria-label={`Download receipt ${p.receiptNo}`}>
                  <Download /> Download
                </Button>
                <Button onClick={() => void printReceipt(p.id, p.receiptNo)}>
                  <Printer /> Print receipt
                </Button>
              </>
            )}
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
