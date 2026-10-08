import type { ImportEntity } from '@schoolos/contracts';

/** Per-import wording and where "back" / "view them" go. */
export const IMPORT_META: Record<ImportEntity, { label: string; what: string; href: string; backLabel: string; invite: string | null }> = {
  STUDENTS: { label: 'Students', what: 'students', href: '/students', backLabel: 'Students', invite: 'Invite parents to the parent app' },
  TEACHERS: { label: 'Teachers', what: 'teachers', href: '/teachers', backLabel: 'Teachers', invite: 'Invite teachers to sign in' },
  CLASSES: { label: 'Classes & sections', what: 'classes', href: '/academics?tab=classes', backLabel: 'Academics', invite: null },
  SUBJECTS: { label: 'Subjects', what: 'subjects', href: '/academics?tab=subjects', backLabel: 'Academics', invite: null },
  FEE_ASSIGNMENTS: { label: 'Optional fees', what: 'students’ optional fees', href: '/fees', backLabel: 'Fees', invite: null },
};
