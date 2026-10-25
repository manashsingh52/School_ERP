export interface IdCardStudent {
  name: string;
  admissionNo: string;
  classSection: string | null;
  rollNo: number | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  guardian: { name: string; relation: string; phone: string } | null;
  address: string | null;
  photoDataUri: string | null;
}

export interface IdCardData {
  school: { name: string; address: string | null; phone: string | null; accent: string; logoDataUri: string | null };
  principal: { signatureDataUri: string | null };
  academicYear: string | null;
  students: IdCardStudent[];
}

/** Escape every value that goes into the HTML — names and addresses are user text. */
const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#0F5338');
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const RELATION: Record<string, string> = { FATHER: 'Father', MOTHER: 'Mother', GUARDIAN: 'Guardian', GRANDPARENT: 'Grandparent', SIBLING: 'Sibling', OTHER: 'Guardian' };

/**
 * Student identity cards at the standard card size (54 × 85.6 mm, portrait), nine to an A4 sheet
 * with cut lines. The school's colour, logo and principal's signature come from its branding.
 */
export function idCardsHtml(d: IdCardData): string {
  const accent = safeColor(d.school.accent);
  const row = (label: string, value: string | null | undefined) => (value ? `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : '');
  const cards = d.students
    .map((s) => {
      const photo = s.photoDataUri ? `<img class="photo" src="${s.photoDataUri}" alt="">` : `<div class="photo none">${esc(initials(s.name))}</div>`;
      const guardian = s.guardian ? `${s.guardian.name} (${RELATION[s.guardian.relation] ?? 'Guardian'})` : null;
      return `<div class="card">
        <div class="band">
          ${d.school.logoDataUri ? `<img class="logo" src="${d.school.logoDataUri}" alt="">` : ''}
          <div class="sname">${esc(d.school.name)}</div>
          ${d.school.address ? `<div class="saddr">${esc(d.school.address)}</div>` : ''}
        </div>
        <div class="body">
        <div class="label">Student identity card</div>
        ${photo}
        <div class="name">${esc(s.name)}</div>
        ${s.classSection ? `<div class="class">${esc(s.classSection)}${s.rollNo ? ` · Roll ${s.rollNo}` : ''}</div>` : ''}
        <div class="rows">
          ${row('Adm. no', s.admissionNo)}
          ${row('Date of birth', s.dateOfBirth)}
          ${row('Blood group', s.bloodGroup)}
          ${row('Parent', guardian)}
          ${row('Phone', s.guardian?.phone)}
          ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}
        </div>
        </div>
        <div class="foot">
          <div class="valid">${d.academicYear ? `Valid ${esc(d.academicYear)}` : ''}</div>
          <div class="sign">${d.principal.signatureDataUri ? `<img src="${d.principal.signatureDataUri}" alt="">` : ''}<span>Principal</span></div>
        </div>
        ${d.school.phone ? `<div class="found">If found, please call ${esc(d.school.phone)}</div>` : ''}
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ID cards · ${esc(d.school.name)}</title>
<style>
  @page { size: A4; margin: 12mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Helvetica Neue', Arial, sans-serif; color: #1b1f24; }
  .sheet { display: grid; grid-template-columns: repeat(3, 54mm); grid-auto-rows: 85.6mm; gap: 6mm; justify-content: center; }
  .card { position: relative; width: 54mm; height: 85.6mm; overflow: hidden; border-radius: 3mm; outline: 0.2mm dashed #b7bec9; outline-offset: 1.2mm;
          background: #fff; border: 0.3mm solid #dfe3ea; display: flex; flex-direction: column; align-items: center; break-inside: avoid; }
  .band { width: 100%; background: ${accent}; color: #fff; padding: 2.4mm 2.5mm 2.2mm; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.6mm; }
  .logo { width: 8mm; height: 8mm; object-fit: contain; background: #fff; border-radius: 50%; padding: 0.6mm; }
  .sname { font-size: 7.4pt; font-weight: 700; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
  .saddr { font-size: 4.9pt; opacity: 0.9; line-height: 1.2; max-height: 1.2em; overflow: hidden; }
  .body { flex: 1; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-bottom: 1mm; }
  .label { font-size: 4.8pt; letter-spacing: 0.12em; text-transform: uppercase; color: ${accent}; font-weight: 700; }
  .photo { margin-top: 1.4mm; width: 21mm; height: 25mm; object-fit: cover; border-radius: 2mm; border: 0.5mm solid ${accent}; }
  .photo.none { display: flex; align-items: center; justify-content: center; background: ${accent}1a; color: ${accent}; font-size: 15pt; font-weight: 700; }
  .name { margin-top: 1.5mm; padding: 0 2mm; font-size: 8.6pt; font-weight: 700; text-align: center; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
  .class { margin-top: 0.8mm; font-size: 6.2pt; font-weight: 600; color: #fff; background: ${accent}; border-radius: 99px; padding: 0.4mm 2.2mm; }
  .rows { width: 100%; padding: 1.6mm 3mm 0; display: flex; flex-direction: column; gap: 0.55mm; }
  .row { display: flex; justify-content: space-between; gap: 2mm; font-size: 5.6pt; line-height: 1.25; }
  .row span { color: #6b7280; white-space: nowrap; }
  .row b { font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .addr { font-size: 5.1pt; color: #4b5563; line-height: 1.25; max-height: 2.5em; overflow: hidden; }
  .foot { width: 100%; padding: 0 3mm 1.2mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .valid { font-size: 5.2pt; font-weight: 600; color: ${accent}; }
  .sign { display: flex; flex-direction: column; align-items: center; font-size: 4.8pt; color: #6b7280; }
  .sign span { border-top: 0.2mm solid #9ca3af; padding-top: 0.4mm; min-width: 14mm; text-align: center; }
  .sign img { height: 4.5mm; max-width: 16mm; object-fit: contain; }
  .found { width: 100%; background: ${accent}14; color: #374151; font-size: 4.6pt; text-align: center; padding: 0.8mm 2mm; }
</style></head>
<body><div class="sheet">${cards}</div></body></html>`;
}
