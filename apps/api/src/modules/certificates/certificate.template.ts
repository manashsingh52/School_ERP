export interface CertificateData {
  school: { name: string; address: string | null; accent: string; logoDataUri: string | null; affiliation: string | null };
  principal: { name: string | null; signatureDataUri: string | null };
  kind: 'PARTICIPATION' | 'ACHIEVEMENT';
  serialNo: string;
  studentName: string;
  classLabel: string | null;
  eventName: string;
  /** Already formatted, e.g. "20 October 2026". */
  eventDate: string;
  issuedOn: string;
  position: string | null;
  note: string | null;
  issuedBy: string;
}

/** Escape every value that goes into the HTML — names and event titles are user text. */
const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#2F6FEB');
const GOLD = '#C9962B';

/** A rosette: ribbon tails, a scalloped gold disc and a star (achievements), or the school's colour (participation). */
function seal(color: string, label: string): string {
  const points = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const r = i % 2 ? 40 : 46;
    return `${(50 + r * Math.sin(a)).toFixed(2)},${(50 - r * Math.cos(a)).toFixed(2)}`;
  }).join(' ');
  return `<svg class="seal" viewBox="0 0 100 130" aria-hidden="true">
    <path d="M30 80 L18 126 L32 116 L40 128 L50 86 Z" fill="${color}" opacity="0.85"/>
    <path d="M70 80 L82 126 L68 116 L60 128 L50 86 Z" fill="${color}" opacity="0.85"/>
    <polygon points="${points}" fill="${color}"/>
    <circle cx="50" cy="50" r="37" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="2 2.4"/>
    <path d="M50 24 l5.6 11.4 12.6 1.8 -9.1 8.9 2.2 12.5 -11.3 -5.9 -11.3 5.9 2.2 -12.5 -9.1 -8.9 12.6 -1.8 Z" fill="#fff"/>
    <text x="50" y="71" text-anchor="middle" font-size="6.4" font-weight="700" fill="#fff" letter-spacing="0.4">${esc(label)}</text>
  </svg>`;
}

/**
 * One certificate on an A4 landscape page: the school's name and logo, the student, what for,
 * and two signatures (the teacher who issued it and the principal). Colours follow the school's
 * branding; achievements get a gold seal.
 */
export function certificateHtml(d: CertificateData): string {
  const accent = safeColor(d.school.accent);
  const achievement = d.kind === 'ACHIEVEMENT';
  const title = achievement ? 'Certificate of Achievement' : 'Certificate of Participation';
  const what = achievement
    ? `for securing <b>${esc(d.position)}</b> in <b>${esc(d.eventName)}</b>`
    : `for taking part in <b>${esc(d.eventName)}</b>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(d.studentName)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 297mm; height: 210mm; }
  body { font-family: 'Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Helvetica Neue', Arial, sans-serif; color: #1f2430; background: #fff; }
  .page { position: relative; width: 297mm; height: 210mm; padding: 9mm; }
  .frame { position: relative; height: 100%; border: 2.2mm solid ${accent}; padding: 2mm; }
  .inner { position: relative; height: 100%; border: 0.5mm solid ${achievement ? GOLD : accent}; display: flex; flex-direction: column; align-items: center; padding: 9mm 18mm 8mm;
           background: radial-gradient(ellipse at 50% 45%, ${accent}0d 0%, #ffffff00 62%); }
  .corner { position: absolute; width: 16mm; height: 16mm; border-color: ${achievement ? GOLD : accent}; border-style: solid; border-width: 0; }
  .tl { top: 3mm; left: 3mm; border-top-width: 1mm; border-left-width: 1mm; }
  .tr { top: 3mm; right: 3mm; border-top-width: 1mm; border-right-width: 1mm; }
  .bl { bottom: 3mm; left: 3mm; border-bottom-width: 1mm; border-left-width: 1mm; }
  .br { bottom: 3mm; right: 3mm; border-bottom-width: 1mm; border-right-width: 1mm; }
  .school { display: flex; align-items: center; gap: 4mm; }
  .logo { width: 17mm; height: 17mm; object-fit: contain; }
  .sname { font-size: 19pt; font-weight: 700; color: ${accent}; letter-spacing: 0.01em; text-align: center; }
  .saddr { font-size: 9pt; color: #5b6475; text-align: center; margin-top: 0.6mm; }
  .title { margin-top: 8mm; font-family: 'Noto Serif', 'DejaVu Serif', Georgia, 'Times New Roman', serif; font-size: 31pt; font-weight: 700; letter-spacing: 0.04em; color: #1f2430; text-align: center; }
  .rule { margin-top: 2.5mm; width: 70mm; height: 0.7mm; background: linear-gradient(90deg, #ffffff00, ${achievement ? GOLD : accent}, #ffffff00); }
  .certify { margin-top: 7mm; font-size: 11.5pt; color: #5b6475; letter-spacing: 0.06em; text-transform: uppercase; }
  .name { margin-top: 3mm; font-family: 'Noto Serif', 'DejaVu Serif', Georgia, 'Times New Roman', serif; font-style: italic; font-size: 34pt; font-weight: 700; color: ${accent};
          padding: 0 10mm 1.5mm; border-bottom: 0.4mm solid #c8ced8; text-align: center; max-width: 220mm; }
  .class { margin-top: 2.5mm; font-size: 11pt; color: #5b6475; }
  .what { margin-top: 5mm; font-size: 14.5pt; line-height: 1.55; text-align: center; max-width: 215mm; }
  .what b { color: #1f2430; }
  .note { margin-top: 2mm; font-size: 11pt; font-style: italic; color: #5b6475; text-align: center; max-width: 200mm; }
  .foot { margin-top: auto; width: 100%; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8mm; }
  .sign { display: flex; flex-direction: column; align-items: center; font-size: 10pt; }
  .sign .img { height: 14mm; display: flex; align-items: flex-end; }
  .sign img { max-height: 14mm; max-width: 50mm; object-fit: contain; }
  .sign .line { width: 62mm; border-top: 0.35mm solid #8a93a3; margin-top: 1mm; padding-top: 1.5mm; text-align: center; font-weight: 600; }
  .sign .role { color: #5b6475; font-size: 9pt; margin-top: 0.5mm; }
  .seal { width: 30mm; height: 39mm; }
  .serial { position: absolute; bottom: 2.5mm; left: 0; right: 0; text-align: center; font-size: 7.5pt; color: #8a93a3; letter-spacing: 0.04em; }
</style></head>
<body><div class="page"><div class="frame"><div class="inner">
  <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
  <div class="school">
    ${d.school.logoDataUri ? `<img class="logo" src="${d.school.logoDataUri}" alt="">` : ''}
    <div>
      <div class="sname">${esc(d.school.name)}</div>
      ${d.school.address || d.school.affiliation ? `<div class="saddr">${esc([d.school.address, d.school.affiliation].filter(Boolean).join(' · '))}</div>` : ''}
    </div>
  </div>
  <div class="title">${esc(title)}</div>
  <div class="rule"></div>
  <div class="certify">This is to certify that</div>
  <div class="name">${esc(d.studentName)}</div>
  ${d.classLabel ? `<div class="class">of ${esc(d.classLabel)}</div>` : ''}
  <div class="what">is awarded this certificate ${what},<br>held on <b>${esc(d.eventDate)}</b>.</div>
  ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
  <div class="foot">
    <div class="sign"><div class="img"></div><div class="line">${esc(d.issuedBy)}</div><div class="role">Teacher in charge</div></div>
    ${seal(achievement ? GOLD : accent, achievement ? 'EXCELLENCE' : 'PARTICIPATION')}
    <div class="sign"><div class="img">${d.principal.signatureDataUri ? `<img src="${d.principal.signatureDataUri}" alt="">` : ''}</div><div class="line">${esc(d.principal.name || 'Principal')}</div><div class="role">Principal</div></div>
  </div>
  <div class="serial">Certificate no. ${esc(d.serialNo)} · Issued on ${esc(d.issuedOn)}</div>
</div></div></div></body></html>`;
}
