import type { ReportCardLayout } from '@schoolos/contracts';

/** Settings → Examinations: how a school's report cards look (both single-exam and term cards). */
export interface ReportCardOptions {
  layout: ReportCardLayout;
  title: string | null;
  show: { photo: boolean; passMarks: boolean; rank: boolean; gradingKey: boolean; remarks: boolean; parentSignature: boolean };
}

export const DEFAULT_CARD: ReportCardOptions = {
  layout: 'classic',
  title: null,
  show: { photo: true, passMarks: true, rank: true, gradingKey: true, remarks: true, parentSignature: true },
};

/** CSS layered over the classic template. */
export function layoutCss(layout: ReportCardLayout, accent: string): string {
  if (layout === 'modern') {
    return `
  .head { background: ${accent}; color: #fff; border-bottom: none; padding: 14px 16px; border-radius: 10px; }
  .head p { color: rgba(255,255,255,0.85); }
  .head img.logo { background: #fff; border-radius: 8px; padding: 4px; }
  .title h2 { text-transform: none; letter-spacing: -0.01em; font-size: 15pt; }
  .student, .stat, .remark { border: none; background: #f4f6f8; }
  th { background: #f4f6f8; color: #1b1f24; border-bottom: 2px solid ${accent}; }
  tr:nth-child(even) td { background: none; }`;
  }
  if (layout === 'compact') {
    return `
  @page { size: A4; margin: 10mm 10mm 12mm; }
  body { font-size: 9pt; }
  .head h1 { font-size: 14pt; }
  .head img.logo { width: 44px; height: 44px; }
  .title { margin: 8px 0 6px; }
  .student { padding: 6px 8px; }
  .student img { width: 52px; height: 64px; }
  th, td { padding: 3px 6px; }
  table { margin-top: 8px; }
  .stats { margin-top: 8px; }
  .stat { padding: 5px 8px; }
  .stat b { font-size: 11pt; }
  .remark { min-height: 40px; padding: 5px 8px; }
  .signs { margin-top: 30px; }`;
  }
  return '';
}
