import type { TermResultRow } from '@schoolos/contracts';
import { DEFAULT_CARD, layoutCss, type ReportCardOptions } from './report-card.layout.js';

export interface TermReportCardData {
  school: { name: string; address: string | null; contact: string | null; accent: string; logoDataUri: string | null; affiliation: string | null };
  principal: { name: string | null; signatureDataUri: string | null };
  academicYear: string;
  term: { name: string; components: { id: string; name: string; weight: number }[] };
  student: { dateOfBirth: string | null; guardian: string | null };
  result: TermResultRow;
  coScholastic?: { area: string; grade: string }[];
  grades: { label: string; minPercent: number; maxPercent: number }[];
  /** Layout and what to show (Settings → Examinations). */
  card?: ReportCardOptions;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#2F6FEB');
const pct = (v: number | null) => (v === null ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}%`);
const STATUS = { PASS: 'Passed', FAIL: 'Not passed', INCOMPLETE: 'Incomplete' } as const;

/** Consolidated A4 report card: one column per exam with its weight, then the term % and grade. Every value is escaped. */
export function termReportCardHtml(d: TermReportCardData): string {
  const accent = safeColor(d.school.accent);
  const card = d.card ?? DEFAULT_CARD;
  const r = d.result;
  const head = d.term.components.map((c) => `<th class="num">${esc(c.name)}<br><small>${c.weight}%</small></th>`).join('');
  const rows = r.subjects
    .map((s) => {
      const cells = d.term.components
        .map((c) => {
          const x = s.components.find((y) => y.examId === c.id);
          return `<td class="num">${esc(!x ? '—' : x.exempt ? 'Exempt' : x.absent ? 'Absent' : pct(x.percent))}</td>`;
        })
        .join('');
      return `<tr${s.passed === false ? ' class="fail"' : ''}><td>${esc(s.subject.name)}</td>${cells}<td class="num strong">${esc(pct(s.percent))}</td><td class="num">${esc(s.grade ?? '—')}</td></tr>`;
    })
    .join('');
  const field = (label: string, value: string | null | undefined) => `<div class="field"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(r.name)} · ${esc(d.term.name)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Helvetica Neue', Arial, sans-serif; color: #1b1f24; font-size: 10.5pt; margin: 0; }
  .head { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 3px solid ${accent}; }
  .head img { width: 64px; height: 64px; object-fit: contain; }
  .head .school { flex: 1; } .head h1 { margin: 0; font-size: 18pt; } .head p { margin: 2px 0 0; color: #57606a; font-size: 9pt; }
  .title { margin: 12px 0 10px; display: flex; justify-content: space-between; align-items: baseline; }
  .title h2 { margin: 0; font-size: 13pt; color: ${accent}; text-transform: uppercase; letter-spacing: .06em; }
  .title span { color: #57606a; font-size: 9.5pt; }
  .fields { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 18px; border: 1px solid #d0d7de; border-radius: 8px; padding: 10px 12px; }
  .field span { display: block; color: #6e7781; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; } .field b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th { background: ${accent}; color: #fff; font-weight: 600; text-align: left; padding: 6px 8px; font-size: 9pt; } th small { font-weight: 400; opacity: .85; }
  td { padding: 6px 8px; border-bottom: 1px solid #e6e9ed; } tr:nth-child(even) td { background: #f6f8fa; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; } td.strong { font-weight: 600; } tr.fail td { color: #b42318; }
  .stats { display: flex; gap: 10px; margin-top: 12px; }
  .stat { flex: 1; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 10px; }
  .stat span { display: block; color: #6e7781; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; } .stat b { font-size: 14pt; }
  .stat b.pass { color: #1a7f37; } .stat b.fail { color: #b42318; }
  .scale { margin-top: 12px; font-size: 8pt; color: #57606a; } .scale b { color: #1b1f24; }
  .how { margin-top: 6px; font-size: 8pt; color: #57606a; }
  .signs { margin-top: 42px; display: flex; justify-content: space-between; gap: 24px; }
  .sign { flex: 1; text-align: center; border-top: 1px solid #1b1f24; padding-top: 4px; font-size: 9pt; color: #57606a; position: relative; }
  .sig { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); max-height: 34px; max-width: 120px; }
  .foot { margin-top: 14px; font-size: 7.5pt; color: #8c959f; text-align: center; }
${layoutCss(card.layout, accent)}
</style></head>
<body>
  <div class="head">
    ${d.school.logoDataUri ? `<img src="${d.school.logoDataUri}" alt="">` : ''}
    <div class="school"><h1>${esc(d.school.name)}</h1>${d.school.affiliation ? `<p>${esc(d.school.affiliation)}</p>` : ''}${d.school.address ? `<p>${esc(d.school.address)}</p>` : ''}${d.school.contact ? `<p>${esc(d.school.contact)}</p>` : ''}</div>
  </div>
  <div class="title"><h2>${esc(card.title ?? 'Report card')} · ${esc(d.term.name)}</h2><span>Academic year ${esc(d.academicYear)}</span></div>
  <div class="fields">
    ${field('Student', r.name)}${field('Class', r.section.label)}${field('Admission no.', r.admissionNo)}
    ${field('Roll no.', r.rollNo === null ? null : String(r.rollNo))}${field('Date of birth', d.student.dateOfBirth)}${field('Parent / guardian', d.student.guardian)}
  </div>
  <table>
    <thead><tr><th>Subject</th>${head}<th class="num">${esc(d.term.name)}</th><th class="num">Grade</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="stats">
    <div class="stat"><span>Term percentage</span><b>${esc(pct(r.percentage))}</b></div>
    <div class="stat"><span>Grade</span><b>${esc(r.grade ?? '—')}</b></div>
    <div class="stat"><span>Result</span><b class="${r.status === 'PASS' ? 'pass' : r.status === 'FAIL' ? 'fail' : ''}">${STATUS[r.status]}</b></div>
    ${card.show.rank && r.rankInSection ? `<div class="stat"><span>Rank in section</span><b>${r.rankInSection}</b></div>` : ''}
  </div>
  ${d.coScholastic?.length ? `<table><thead><tr><th>Co-scholastic area</th><th class="num">Grade</th></tr></thead><tbody>${d.coScholastic.map((c) => `<tr><td>${esc(c.area)}</td><td class="num strong">${esc(c.grade)}</td></tr>`).join('')}</tbody></table>` : ''}
  <div class="how">How the term is worked out: ${d.term.components.map((c) => `${esc(c.name)} × ${c.weight}%`).join(' + ')}. An exempt subject leaves that exam out and the other weights are scaled up.</div>
  ${card.show.gradingKey && d.grades.length ? `<div class="scale">Grading: ${d.grades.map((g) => `<b>${esc(g.label)}</b> ${g.minPercent}–${Math.floor(g.maxPercent)}%`).join(' · ')}</div>` : ''}
  <div class="signs">
    <div class="sign">Class teacher</div>
    <div class="sign">${d.principal.signatureDataUri ? `<img class="sig" src="${d.principal.signatureDataUri}" alt="">` : ''}Principal${d.principal.name ? ` (${esc(d.principal.name)})` : ''}</div>
    ${card.show.parentSignature ? '<div class="sign">Parent / guardian</div>' : ''}
  </div>
  <div class="foot">This report card was generated electronically by ${esc(d.school.name)}.</div>
</body></html>`;
}
