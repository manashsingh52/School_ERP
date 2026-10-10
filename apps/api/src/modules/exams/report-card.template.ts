import type { ResultRow } from '@schoolos/contracts';

export interface ReportCardData {
  school: { name: string; address: string | null; contact: string | null; board: string | null; accent: string; logoDataUri: string | null; affiliation?: string | null };
  principal?: { name: string | null; signatureDataUri: string | null };
  /** Settings → Examinations. */
  note?: string | null;
  showAttendance?: boolean;
  coScholastic?: { area: string; grade: string }[];
  academicYear: string;
  exam: { name: string; term: string | null; rankingEnabled: boolean };
  student: { dateOfBirth: string | null; guardian: string | null; photoDataUri: string | null };
  classTeacher: string | null;
  result: ResultRow;
  grades: { label: string; minPercent: number; maxPercent: number; remark: string | null }[];
}

/** Escape every value that goes into the HTML — names and remarks are user text. */
const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#2F6FEB');
const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));
const STATUS: Record<ResultRow['status'], string> = { PASS: 'Passed', FAIL: 'Not passed', INCOMPLETE: 'Incomplete', WITHHELD: 'Withheld' };

/** A4 report card (Master Prompt §33): branded header, student details, marks, result, remarks, signatures. */
export function reportCardHtml(d: ReportCardData): string {
  const accent = safeColor(d.school.accent);
  const r = d.result;
  const rows = r.subjects
    .map((s) => {
      const obtained = s.exempt ? 'Exempt' : s.absent ? 'Absent' : s.marks === null ? '—' : n(s.marks);
      const failed = s.passed === false;
      return `<tr${failed ? ' class="fail"' : ''}>
        <td>${esc(s.subject.name)}</td>
        <td class="num">${s.exempt ? '—' : n(s.maxMarks)}</td>
        <td class="num">${s.exempt ? '—' : n(s.passMarks)}</td>
        <td class="num strong">${esc(obtained)}</td>
        <td class="num">${esc(s.exempt ? '' : (s.grade ?? '—'))}</td>
      </tr>`;
    })
    .join('');
  const detail = (label: string, value: string | null | undefined) => `<div class="field"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
  const ranks = d.exam.rankingEnabled && r.rankInSection ? `<div class="stat"><span>Rank in section</span><b>${r.rankInSection}</b></div>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(r.name)} · ${esc(d.exam.name)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Helvetica Neue', Arial, sans-serif; color: #1b1f24; font-size: 10.5pt; margin: 0; }
  .head { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 3px solid ${accent}; }
  .head img.logo { width: 64px; height: 64px; object-fit: contain; }
  .head .school { flex: 1; }
  .head h1 { margin: 0; font-size: 18pt; letter-spacing: -0.01em; }
  .head p { margin: 2px 0 0; color: #57606a; font-size: 9pt; }
  .title { margin: 12px 0 10px; display: flex; justify-content: space-between; align-items: baseline; }
  .title h2 { margin: 0; font-size: 13pt; color: ${accent}; text-transform: uppercase; letter-spacing: 0.06em; }
  .title span { color: #57606a; font-size: 9.5pt; }
  .student { display: flex; gap: 14px; border: 1px solid #d0d7de; border-radius: 8px; padding: 10px 12px; }
  .student img { width: 72px; height: 88px; object-fit: cover; border-radius: 4px; border: 1px solid #d0d7de; }
  .fields { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
  .field span { display: block; color: #6e7781; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .field b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th { background: ${accent}; color: #fff; font-weight: 600; text-align: left; padding: 6px 8px; font-size: 9pt; }
  td { padding: 6px 8px; border-bottom: 1px solid #e6e9ed; }
  tr:nth-child(even) td { background: #f6f8fa; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.strong { font-weight: 600; }
  tr.fail td { color: #b42318; }
  tfoot td { font-weight: 700; border-top: 2px solid #1b1f24; border-bottom: none; background: none !important; }
  .stats { display: flex; gap: 10px; margin-top: 12px; }
  .stat { flex: 1; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 10px; }
  .stat span { display: block; color: #6e7781; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .stat b { font-size: 14pt; }
  .stat b.pass { color: #1a7f37; } .stat b.fail { color: #b42318; }
  .remarks { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .remark { border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 10px; min-height: 58px; }
  .remark span { display: block; color: #6e7781; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
  .scale { margin-top: 12px; font-size: 8pt; color: #57606a; }
  .scale b { color: #1b1f24; }
  .signs { margin-top: 42px; display: flex; justify-content: space-between; gap: 24px; }
  .sign { flex: 1; text-align: center; border-top: 1px solid #1b1f24; padding-top: 4px; font-size: 9pt; color: #57606a; }
  .foot { margin-top: 14px; font-size: 7.5pt; color: #8c959f; text-align: center; }
  .sign { position: relative; }
  .sig { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); max-height: 34px; max-width: 120px; }
  .note { margin-top: 12px; font-size: 8pt; color: #3d444d; white-space: pre-line; }
</style></head>
<body>
  <div class="head">
    ${d.school.logoDataUri ? `<img class="logo" src="${d.school.logoDataUri}" alt="">` : ''}
    <div class="school">
      <h1>${esc(d.school.name)}</h1>
      ${d.school.address ? `<p>${esc(d.school.address)}</p>` : ''}
      ${d.school.affiliation ? `<p>${esc(d.school.affiliation)}</p>` : ''}
      ${d.school.contact || (d.school.board && !d.school.affiliation) ? `<p>${esc([d.school.board && !d.school.affiliation ? `Affiliated: ${d.school.board}` : null, d.school.contact].filter(Boolean).join(' · '))}</p>` : ''}
    </div>
  </div>
  <div class="title">
    <h2>Report card · ${esc(d.exam.name)}</h2>
    <span>${esc([d.exam.term, `Academic year ${d.academicYear}`].filter(Boolean).join(' · '))}</span>
  </div>
  <div class="student">
    ${d.student.photoDataUri ? `<img src="${d.student.photoDataUri}" alt="">` : ''}
    <div class="fields">
      ${detail('Student', r.name)}
      ${detail('Class', r.section.label)}
      ${detail('Admission no.', r.admissionNo)}
      ${detail('Roll no.', r.rollNo === null ? null : String(r.rollNo))}
      ${detail('Date of birth', d.student.dateOfBirth)}
      ${detail('Parent / guardian', d.student.guardian)}
    </div>
  </div>
  <table>
    <thead><tr><th>Subject</th><th class="num">Max</th><th class="num">Pass</th><th class="num">Obtained</th><th class="num">Grade</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${n(r.totalMax)}</td><td></td><td class="num">${n(r.totalObtained)}</td><td class="num">${esc(r.grade ?? '')}</td></tr></tfoot>
  </table>
  <div class="stats">
    <div class="stat"><span>Percentage</span><b>${n(r.percentage)}%</b></div>
    <div class="stat"><span>Grade</span><b>${esc(r.grade ?? '—')}</b></div>
    <div class="stat"><span>Result</span><b class="${r.status === 'PASS' ? 'pass' : r.status === 'FAIL' ? 'fail' : ''}">${STATUS[r.status]}</b></div>
    ${ranks}
    ${d.showAttendance === false ? '' : `<div class="stat"><span>Attendance</span><b>${r.attendancePct === null ? '—' : `${n(r.attendancePct)}%`}</b></div>`}
  </div>
  ${d.coScholastic?.length ? `<table class="co"><thead><tr><th>Co-scholastic area</th><th class="num">Grade</th></tr></thead><tbody>${d.coScholastic.map((c) => `<tr><td>${esc(c.area)}</td><td class="num strong">${esc(c.grade)}</td></tr>`).join('')}</tbody></table>` : ''}
  <div class="remarks">
    <div class="remark"><span>Class teacher's remarks</span>${esc(r.teacherRemark ?? '')}</div>
    <div class="remark"><span>Principal's remarks</span>${esc(r.principalRemark ?? '')}</div>
  </div>
  ${d.grades.length ? `<div class="scale">Grading: ${d.grades.map((g) => `<b>${esc(g.label)}</b> ${n(g.minPercent)}–${n(Math.floor(g.maxPercent))}%`).join(' · ')}</div>` : ''}
  <div class="signs">
    <div class="sign">Class teacher${d.classTeacher ? ` (${esc(d.classTeacher)})` : ''}</div>
    <div class="sign">${d.principal?.signatureDataUri ? `<img class="sig" src="${d.principal.signatureDataUri}" alt="">` : ''}Principal${d.principal?.name ? ` (${esc(d.principal.name)})` : ''}</div>
    <div class="sign">Parent / guardian</div>
  </div>
  ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
  <div class="foot">This report card was generated electronically by ${esc(d.school.name)}.</div>
</body></html>`;
}
