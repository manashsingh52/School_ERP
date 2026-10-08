export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export const isoDay = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** "08:00" → "8:00" (school clocks read better without the leading zero). */
export const clock = (hhmm: string) => hhmm.replace(/^0/, '');

/** Current time in the school's timezone as "HH:MM". */
export const nowHHMM = () =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date());

/** Short initials for a teacher in tight grid cells: "Priya Sharma" → "P. Sharma". */
export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]![0]}. ${parts.slice(1).join(' ')}` : name;
};
