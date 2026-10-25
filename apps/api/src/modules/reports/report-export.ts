import type { ExportFormat, ReportTable } from '@schoolos/contracts';
import writeXlsxFile from 'write-excel-file/node';

type Col = ReportTable['columns'][number];
type Cell = string | number | null | undefined;

export const EXPORT_MIME: Record<ExportFormat, string> = {
  CSV: 'text/csv',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf',
};

export const exportFileName = (t: ReportTable, format: ExportFormat, at = new Date()) =>
  `${t.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}-${at.toISOString().slice(0, 10)}.${format.toLowerCase()}`;

/** Money in rupees for files (screens show ₹ formatting themselves). */
const plain = (c: Col, v: Cell): string | number | null => (v === undefined ? null : c.type === 'money' && typeof v === 'number' ? v / 100 : v);
const heading = (c: Col) => (c.type === 'money' ? `${c.label} (₹)` : c.type === 'percent' ? `${c.label} (%)` : c.label);

/**
 * Spreadsheet formula injection: a cell like "=HYPERLINK(...)" from a student's name would run when
 * the file is opened. Text that starts with a formula character is prefixed with an apostrophe.
 */
export const neutralise = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function toCsv(t: ReportTable): Buffer {
  const cell = (c: Col, v: Cell) => {
    const p = plain(c, v);
    let s = p === null ? '' : typeof p === 'number' ? (c.type === 'money' ? p.toFixed(2) : String(p)) : neutralise(p);
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [t.columns.map((c) => cell({ ...c, type: 'text' }, heading(c))).join(',')];
  for (const row of t.rows) lines.push(t.columns.map((c) => cell(c, row[c.key])).join(','));
  if (t.totals) lines.push(t.columns.map((c, i) => (i === 0 ? 'Total' : cell(c, t.totals![c.key] ?? null))).join(','));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'); // BOM: Excel reads UTF-8 (₹) correctly
}

export async function toXlsx(t: ReportTable): Promise<Buffer> {
  const format = (c: Col) => (c.type === 'money' ? '#,##0.00' : c.type === 'percent' ? '0.0' : c.type === 'number' ? '#,##0.##' : undefined);
  const cell = (c: Col, v: Cell, bold = false) => {
    const p = plain(c, v);
    if (p === null) return null;
    if (typeof p === 'number') return { value: p, type: Number, format: format(c), fontWeight: bold ? ('bold' as const) : undefined };
    return { value: c.type === 'text' ? neutralise(p) : p, type: String, fontWeight: bold ? ('bold' as const) : undefined };
  };
  const data = [
    [{ value: t.title, type: String, fontWeight: 'bold' as const }],
    ...(t.subtitle ? [[{ value: t.subtitle, type: String }]] : []),
    [],
    t.columns.map((c) => ({ value: heading(c), type: String, fontWeight: 'bold' as const })),
    ...t.rows.map((row) => t.columns.map((c) => cell(c, row[c.key]))),
    ...(t.totals ? [t.columns.map((c, i) => (i === 0 ? { value: 'Total', type: String, fontWeight: 'bold' as const } : cell(c, t.totals![c.key] ?? null, true)))] : []),
  ];
  const widths = t.columns.map((c) => ({ width: Math.min(40, Math.max(heading(c).length + 2, ...t.rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length + 2), 8)) }));
  return writeXlsxFile(data as never, { columns: widths, sheet: t.title.slice(0, 31) }).toBuffer();
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#0F5338');
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function display(c: Col, v: Cell): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return c.type === 'money' ? `₹${inr.format(v / 100)}` : c.type === 'percent' ? `${num.format(v)}%` : num.format(v);
  if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${v}T00:00:00Z`));
  return v;
}

/** Printable A4 table with the school's name and accent. Every value is escaped. */
export function reportHtml(t: ReportTable, school: { name: string; accent: string }, generatedBy: string, at = new Date()): string {
  const accent = safeColor(school.accent);
  const landscape = t.columns.length > 6;
  const right = (c: Col) => c.type !== 'text' && c.type !== 'date';
  const head = t.columns.map((c) => `<th class="${right(c) ? 'r' : ''}">${esc(c.label)}</th>`).join('');
  const body = t.rows.length
    ? t.rows.map((row) => `<tr>${t.columns.map((c) => `<td class="${right(c) ? 'r' : ''}">${esc(display(c, row[c.key]))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${t.columns.length}" class="empty">Nothing to show for these filters.</td></tr>`;
  const foot = t.totals ? `<tr class="total">${t.columns.map((c, i) => `<td class="${right(c) ? 'r' : ''}">${i === 0 ? 'Total' : esc(t.totals![c.key] === undefined ? '' : display(c, t.totals![c.key]))}</td>`).join('')}</tr>` : '';
  const stamp = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(at);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif; color: #1a1d23; font-size: 10.5px; margin: 0; }
header { border-bottom: 3px solid ${accent}; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
.school { font-size: 15px; font-weight: 700; }
h1 { font-size: 13px; margin: 2px 0 0; color: ${accent}; }
.sub { color: #5b6270; margin-top: 2px; }
.meta { text-align: right; color: #5b6270; font-size: 9.5px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 600; background: #f3f4f6; border-bottom: 1px solid #d1d5db; padding: 5px 6px; }
td { padding: 4px 6px; border-bottom: 1px solid #eceef1; }
tr { page-break-inside: avoid; }
.r { text-align: right; font-variant-numeric: tabular-nums; }
.total td { font-weight: 700; border-top: 1.5px solid #9ca3af; background: #fafafa; }
.empty { text-align: center; color: #6b7280; padding: 24px; }
</style></head><body>
<header><div><div class="school">${esc(school.name)}</div><h1>${esc(t.title)}</h1>${t.subtitle ? `<div class="sub">${esc(t.subtitle)}</div>` : ''}</div>
<div class="meta">${esc(t.rows.length)} rows<br>Generated ${esc(stamp)}<br>by ${esc(generatedBy)}</div></header>
<table><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>
</body></html>`;
}
