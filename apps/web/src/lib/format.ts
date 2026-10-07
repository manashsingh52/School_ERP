/** Formatting standards (docs/07 §2): Indian number grouping, "7 Oct 2026" dates. */

const number = new Intl.NumberFormat('en-IN');
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export const formatNumber = (n: number) => number.format(n);

/** "2013-03-14" or ISO datetime → "14 Mar 2013" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export const today = () => weekdayFmt.format(new Date());

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
