import type { LoginStatus } from '@schoolos/contracts';

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
