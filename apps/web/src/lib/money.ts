import { formatRupees } from '@schoolos/contracts';

export { formatRupees };

/** "₹6,000" / "₹6,000.50" — decimals only when there are paise. */
export const rupees = (paise: number | null | undefined) => (paise === null || paise === undefined ? '—' : formatRupees(paise));

/** "1,250.50" typed by a person → 125050 paise (null if not a valid amount). */
export function toPaise(input: string): number | null {
  const clean = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [r, p = ''] = clean.split('.');
  return Number(r) * 100 + Number(p.padEnd(2, '0'));
}

/** 125050 → "1250.50" for an input box. */
export const toRupeeInput = (paise: number) => (paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100));

export const METHOD_LABEL: Record<string, string> = { ONLINE: 'Online', CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', UPI_DIRECT: 'UPI', POS_CARD: 'Card (POS)' };

export const INVOICE_STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ISSUED: { label: 'Due', tone: 'info' },
  PARTIALLY_PAID: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  CAPTURED: { label: 'Received', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Part refunded', tone: 'warning' },
  VOIDED: { label: 'Cancelled', tone: 'danger' },
};
