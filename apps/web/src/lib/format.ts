/** Formatting standards (docs/07 §2): Indian number grouping, "7 Oct 2026" dates. */

const number = new Intl.NumberFormat('en-IN');
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export const formatNumber = (n: number) => number.format(n);

/**
 * Dates are assembled from their parts: Node and browsers ship different locale data and punctuate
 * en-IN differently ("Thursday, 22 Oct" vs "Thursday 22 Oct"), which broke server-rendered pages.
 */
const assemble = (fmt: Intl.DateTimeFormat, d: Date, order: Intl.DateTimeFormatPartTypes[]) => {
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return order.map((t) => parts[t]).filter(Boolean).join(' ');
};

/** "2013-03-14" or ISO datetime → "14 Mar 2013" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value);
  return Number.isNaN(d.getTime()) ? '—' : assemble(dateFmt, d, ['day', 'month', 'year']);
}

/** "Thursday 22 Oct" */
export const today = () => assemble(weekdayFmt, new Date(), ['weekday', 'day', 'month']);

export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const fullName = (first: string, last?: string | null) => [first, last].filter(Boolean).join(' ');

/** Long form for headings: "Class 8-A", "Nursery-B" (no "Class" before named classes). */
export function classLabel(className: string | null, sectionName: string | null): string {
  if (!className) return '—';
  const short = classSection(className, sectionName);
  return /^Class\s+/i.test(className) ? `Class ${short}` : short;
}

/** "Class 8" + "A" → "8-A"; "Nursery" + "B" → "Nursery-B" */
export function classSection(className: string | null, sectionName: string | null): string {
  if (!className) return '—';
  const short = className.replace(/^Class\s+/i, '');
  return sectionName ? `${short}-${sectionName}` : short;
}

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Today in the school's timezone as YYYY-MM-DD. */
export const todayISO = () => isoFmt.format(new Date());

/** "2026-10-08" + 1 → "2026-10-09" */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "2026-10-08" → "Thu, 8 Oct" */
export const formatDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

/** "2026-10" → "October 2026" */
export const formatMonth = (month: string) => monthFmt.format(new Date(`${month}-01T00:00:00Z`));

/** "2026-10" + -1 → "2026-09" */
export function addMonths(month: string, n: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

export const formatPercent = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n % 1 ? n.toFixed(1) : n}%`);

/** "5 min ago", "Yesterday", "3 Oct" */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172_800) return 'Yesterday';
  return formatDate(iso);
}
