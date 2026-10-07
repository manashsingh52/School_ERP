/** School-local calendar days are stored as @db.Date (UTC midnight). */
export const toDate = (value: string | undefined | null): Date | undefined =>
  value ? new Date(`${value}T00:00:00.000Z`) : undefined;

export const fromDate = (value: Date | null | undefined): string | null => (value ? value.toISOString().slice(0, 10) : null);

/** Today's date in the school's timezone, as YYYY-MM-DD. */
export const todayIn = (timeZone = 'Asia/Kolkata'): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const fullName = (first: string, last?: string | null) => [first, last].filter(Boolean).join(' ');
