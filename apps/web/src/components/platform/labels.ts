import type { BadgeProps } from '@schoolos/ui';

type Tone = NonNullable<BadgeProps['tone']>;
export const SCHOOL_STATUS: Record<string, { label: string; tone: Tone }> = {
  ONBOARDING: { label: 'Onboarding', tone: 'info' },
  ACTIVE: { label: 'Live', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};
export const SUB_STATUS: Record<string, { label: string; tone: Tone }> = {
  TRIALING: { label: 'Trial', tone: 'info' },
  ACTIVE: { label: 'Paid', tone: 'success' },
  PAST_DUE: { label: 'Past due', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
export const GRANT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Waiting for school', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  EXPIRED: { label: 'Ended', tone: 'neutral' },
  REVOKED: { label: 'Ended by school', tone: 'neutral' },
};
export const limitText = (v: number | null, unit = '') => (v === null ? 'Unlimited' : `${v.toLocaleString('en-IN')}${unit}`);
