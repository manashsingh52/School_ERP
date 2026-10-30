import { formatRupees, rupeesInWords } from '@schoolos/contracts';

export interface ReceiptData {
  school: { name: string; address: string | null; contact: string | null; accent: string; logoDataUri: string | null; affiliation?: string | null };
  /** Settings → Fees / Branding. */
  note?: string | null;
  signatureDataUri?: string | null;
  receiptNo: string;
  date: string;
  student: { name: string; admissionNo: string; classLabel: string | null; guardian: string | null };
  lines: { description: string; amountPaise: number }[];
  creditPaise: number;
  amountPaise: number;
  method: string;
  reference: string | null;
  collector: string | null;
  cancelled: { at: string; reason: string | null } | null;
  /** A reprint by staff after the original. */
  duplicate?: boolean;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#0F5338');

/** Two letters for a school with no logo: "Demo Public School" → "DP". */
const monogram = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'S';

/** A5-landscape fee receipt (docs/11 §8). Every value is escaped. */
export function receiptHtml(d: ReceiptData): string {
  const accent = safeColor(d.school.accent);
  const field = (label: string, value: string | null) => `<div class="f"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
  const money = (paise: number) => esc(formatRupees(paise, { decimals: true }));
  const stamp = d.cancelled ? '<div class="stamp void">CANCELLED</div>' : d.duplicate ? '<div class="stamp dup">DUPLICATE</div>' : '<div class="stamp paid">PAID</div>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
<style>
  @page { size: A5 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: 'Inter', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif; color: #1b1f24; font-size: 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 210mm; height: 148mm; padding: 0 11mm 7mm; display: flex; flex-direction: column; overflow: hidden; }
  .band { height: 3.2mm; margin: 0 -11mm; background: ${accent}; }
  .head { display: flex; align-items: center; gap: 11px; padding: 6mm 0 4mm; border-bottom: 1px solid #e3e6ea; }
  .logo { width: 15mm; height: 15mm; border-radius: 3.5mm; object-fit: contain; flex: none; }
  .mono { width: 15mm; height: 15mm; border-radius: 3.5mm; flex: none; display: flex; align-items: center; justify-content: center; background: ${accent}; color: #fff; font-weight: 700; font-size: 15pt; letter-spacing: .02em; }
  .school { flex: 1; min-width: 0; }
  .school h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15.5pt; line-height: 1.15; font-weight: 700; color: #111418; }
  .school p { margin: 1.5px 0 0; color: #5d6670; font-size: 7.6pt; }
  .meta { text-align: right; flex: none; }
  .meta .tag { display: inline-block; padding: 3px 9px; border-radius: 999px; background: ${accent}14; color: ${accent}; font-size: 7.4pt; font-weight: 700; letter-spacing: .14em; }
  .meta .no { margin: 5px 0 0; font-size: 10.5pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .meta .dt { margin: 1px 0 0; color: #5d6670; font-size: 7.8pt; }
  .meta .duptag { margin: 3px 0 0; font-size: 7pt; font-weight: 700; letter-spacing: .1em; color: #5d6670; }
  .who { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1.5fr; gap: 10px; margin: 4mm 0 3.5mm; padding: 3mm 4mm; border-radius: 3mm; background: #f6f7f5; }
  .f span { display: block; color: #79828c; font-size: 6.6pt; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 1.5px; }
  .f b { font-weight: 600; font-size: 9pt; }
  .body { display: flex; gap: 6mm; flex: 1; min-height: 0; }
  .lines { flex: 1; min-width: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0 6px 4px; font-size: 6.8pt; font-weight: 700; color: #79828c; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1.5px solid #1b1f24; }
  td { padding: 5px 6px; border-bottom: 1px solid #eceef1; font-size: 8.8pt; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.i { width: 18px; color: #9aa2ab; font-variant-numeric: tabular-nums; }
  .total { width: 58mm; flex: none; display: flex; flex-direction: column; gap: 3mm; }
  .amount { border-radius: 3mm; padding: 4mm; background: ${accent}; color: #fff; }
  .amount span { display: block; font-size: 6.8pt; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; opacity: .8; }
  .amount b { display: block; margin-top: 1.5mm; font-size: 18pt; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
  .amount p { margin: 1.5mm 0 0; font-size: 7.4pt; line-height: 1.35; opacity: .9; }
  .pay { border: 1px solid #e3e6ea; border-radius: 3mm; padding: 3mm 4mm; display: grid; gap: 2.2mm; }
  .note { margin-top: 3mm; font-size: 7.6pt; color: #3d444d; white-space: pre-line; }
  .voidnote { margin-top: 2.5mm; color: #b42318; font-weight: 600; font-size: 8pt; }
  .foot { margin-top: auto; padding-top: 3mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; font-size: 7pt; color: #8c959f; }
  .foot .thanks { color: #3d444d; font-weight: 600; font-size: 8pt; margin-bottom: 1px; }
  .sign { position: relative; border-top: 1px solid #1b1f24; padding-top: 3px; min-width: 46mm; text-align: center; color: #57606a; }
  .sig { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); max-height: 11mm; max-width: 40mm; }
  .stamp { position: absolute; padding: 2mm 5mm; border: 2.4px solid currentColor; border-radius: 3mm; font-weight: 800; letter-spacing: .18em; pointer-events: none; }
  .stamp.paid { left: 52mm; top: 92mm; font-size: 19pt; color: ${accent}; opacity: .5; transform: rotate(-9deg); }
  .stamp.void, .stamp.dup { left: 50%; top: 55%; font-size: 32pt; transform: translate(-50%, -50%) rotate(-11deg); }
  .stamp.void { color: #b42318; opacity: .55; }
  .stamp.dup { color: #57606a; opacity: .3; }
</style></head><body><div class="page">
  <div class="band"></div>
  <div class="head">
    ${d.school.logoDataUri ? `<img class="logo" src="${d.school.logoDataUri}" alt="">` : `<div class="mono">${esc(monogram(d.school.name))}</div>`}
    <div class="school"><h1>${esc(d.school.name)}</h1>${d.school.affiliation ? `<p>${esc(d.school.affiliation)}</p>` : ''}${d.school.address ? `<p>${esc(d.school.address)}</p>` : ''}${d.school.contact ? `<p>${esc(d.school.contact)}</p>` : ''}</div>
    <div class="meta"><span class="tag">FEE RECEIPT</span>${d.duplicate ? '<p class="duptag">DUPLICATE COPY</p>' : ''}<p class="no">${esc(d.receiptNo)}</p><p class="dt">${esc(d.date)}</p></div>
  </div>
  ${stamp}
  <div class="who">
    ${field('Student', d.student.name)}${field('Admission no.', d.student.admissionNo)}${field('Class', d.student.classLabel)}${field('Parent / guardian', d.student.guardian)}
  </div>
  <div class="body">
    <div class="lines">
      <table>
        <thead><tr><th></th><th>Description</th><th class="n">Amount</th></tr></thead>
        <tbody>
          ${d.lines.map((l, i) => `<tr><td class="i">${i + 1}</td><td>${esc(l.description)}</td><td class="n">${money(l.amountPaise)}</td></tr>`).join('')}
          ${d.creditPaise ? `<tr><td class="i">${d.lines.length + 1}</td><td>Held as advance (student credit)</td><td class="n">${money(d.creditPaise)}</td></tr>` : ''}
        </tbody>
      </table>
      ${d.cancelled ? `<div class="voidnote">Cancelled on ${esc(d.cancelled.at)}${d.cancelled.reason ? ` — ${esc(d.cancelled.reason)}` : ''}</div>` : ''}
      ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
    </div>
    <div class="total">
      <div class="amount"><span>Total received</span><b>${money(d.amountPaise)}</b><p>${esc(rupeesInWords(d.amountPaise))}</p></div>
      <div class="pay">${field('Paid by', d.method)}${field('Reference', d.reference)}${d.collector ? field('Received by', d.collector) : ''}</div>
    </div>
  </div>
  <div class="foot">
    <div><div class="thanks">Thank you for your payment.</div>This is a computer-generated receipt${d.signatureDataUri ? '' : ' and needs no signature'}.</div>
    <span class="sign">${d.signatureDataUri ? `<img class="sig" src="${d.signatureDataUri}" alt="">` : ''}For ${esc(d.school.name)}</span>
  </div>
</div></body></html>`;
}
