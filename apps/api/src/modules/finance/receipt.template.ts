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

/** A5-landscape fee receipt (docs/11 §8). Every value is escaped. */
export function receiptHtml(d: ReceiptData): string {
  const accent = safeColor(d.school.accent);
  const field = (label: string, value: string | null) => `<div class="f"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
<style>
  @page { size: A5 landscape; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif; color: #1b1f24; font-size: 9.5pt; margin: 0; position: relative; }
  .head { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; border-bottom: 3px solid ${accent}; }
  .head img { width: 48px; height: 48px; object-fit: contain; }
  .head .s { flex: 1; } .head h1 { margin: 0; font-size: 14pt; } .head p { margin: 1px 0 0; color: #57606a; font-size: 8pt; }
  .head .r { text-align: right; } .head .r h2 { margin: 0; color: ${accent}; font-size: 12pt; letter-spacing: .08em; } .head .r p { margin: 2px 0 0; font-weight: 600; }
  .fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; margin: 10px 0; }
  .f span { display: block; color: #6e7781; font-size: 7pt; text-transform: uppercase; letter-spacing: .04em; } .f b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${accent}; color: #fff; text-align: left; padding: 5px 8px; font-size: 8pt; }
  td { padding: 5px 8px; border-bottom: 1px solid #e6e9ed; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #1b1f24; border-bottom: none; }
  .words { margin-top: 6px; font-style: italic; color: #3d444d; }
  .pay { display: flex; gap: 18px; margin-top: 8px; }
  .foot { margin-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 7.5pt; color: #8c959f; }
  .sign { border-top: 1px solid #1b1f24; padding-top: 3px; min-width: 150px; text-align: center; color: #57606a; }
  .void { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: 800; color: rgba(180, 35, 24, .18); transform: rotate(-12deg); letter-spacing: .1em; }
  .voidnote { margin-top: 6px; color: #b42318; font-weight: 600; }
  .dup { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: 800; color: rgba(87, 96, 106, .14); transform: rotate(-12deg); letter-spacing: .1em; }
  .duptag { margin: 2px 0 0; font-size: 8pt; letter-spacing: .08em; color: #57606a; }
  .note { margin-top: 8px; font-size: 8pt; color: #3d444d; white-space: pre-line; }
  .sign { position: relative; } .sig { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); max-height: 30px; max-width: 110px; }
</style></head><body>
  ${d.cancelled ? '<div class="void">CANCELLED</div>' : d.duplicate ? '<div class="dup">DUPLICATE</div>' : ''}
  <div class="head">
    ${d.school.logoDataUri ? `<img src="${d.school.logoDataUri}" alt="">` : ''}
    <div class="s"><h1>${esc(d.school.name)}</h1>${d.school.affiliation ? `<p>${esc(d.school.affiliation)}</p>` : ''}${d.school.address ? `<p>${esc(d.school.address)}</p>` : ''}${d.school.contact ? `<p>${esc(d.school.contact)}</p>` : ''}</div>
    <div class="r"><h2>FEE RECEIPT</h2>${d.duplicate ? '<p class="duptag">DUPLICATE COPY</p>' : ''}<p>${esc(d.receiptNo)}</p><p style="font-weight:400;color:#57606a">${esc(d.date)}</p></div>
  </div>
  <div class="fields">
    ${field('Student', d.student.name)}${field('Admission no.', d.student.admissionNo)}${field('Class', d.student.classLabel)}${field('Parent / guardian', d.student.guardian)}
  </div>
  <table>
    <thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
    <tbody>
      ${d.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="n">${esc(formatRupees(l.amountPaise, { decimals: true }))}</td></tr>`).join('')}
      ${d.creditPaise ? `<tr><td>Held as advance (student credit)</td><td class="n">${esc(formatRupees(d.creditPaise, { decimals: true }))}</td></tr>` : ''}
    </tbody>
    <tfoot><tr><td>Total received</td><td class="n">${esc(formatRupees(d.amountPaise, { decimals: true }))}</td></tr></tfoot>
  </table>
  <div class="words">${esc(rupeesInWords(d.amountPaise))}</div>
  <div class="pay">${field('Paid by', d.method)}${field('Reference', d.reference)}${d.collector ? field('Received by', d.collector) : ''}</div>
  ${d.cancelled ? `<div class="voidnote">Cancelled on ${esc(d.cancelled.at)}${d.cancelled.reason ? ` — ${esc(d.cancelled.reason)}` : ''}</div>` : ''}
  ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
  <div class="foot"><span>This is a computer-generated receipt${d.signatureDataUri ? '' : ' and needs no signature'}.</span><span class="sign">${d.signatureDataUri ? `<img class="sig" src="${d.signatureDataUri}" alt="">` : ''}For ${esc(d.school.name)}</span></div>
</body></html>`;
}
