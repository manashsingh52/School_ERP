import type { AttendanceStatus, LoginStatus } from '@schoolos/contracts';

/** How a person's login state is shown everywhere (teachers, parents, members). */
export const LOGIN_BADGE: Record<LoginStatus, { tone: 'success' | 'warning' | 'neutral' | 'danger'; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Signed in' },
  INVITED: { tone: 'warning', label: 'Invited' },
  NONE: { tone: 'neutral', label: 'No login' },
  SUSPENDED: { tone: 'danger', label: 'Suspended' },
};

export const RELATION_LABEL = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
  GRANDPARENT: 'Grandparent',
  SIBLING: 'Sibling',
  OTHER: 'Other',
} as const;

export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; key: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }> = {
  PRESENT: { label: 'Present', short: 'P', key: 'p', tone: 'success' },
  ABSENT: { label: 'Absent', short: 'A', key: 'a', tone: 'danger' },
  LATE: { label: 'Late', short: 'L', key: 'l', tone: 'warning' },
  HALF_DAY: { label: 'Half day', short: 'H', key: 'h', tone: 'info' },
  LEAVE: { label: 'Leave', short: 'Lv', key: 'v', tone: 'neutral' },
};
export const ATTENDANCE_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE'];

export const REGISTER_STATUS: Record<'NOT_TAKEN' | 'DRAFT' | 'SUBMITTED', { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  NOT_TAKEN: { label: 'Not taken', tone: 'neutral' },
  DRAFT: { label: 'Draft', tone: 'warning' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
};
