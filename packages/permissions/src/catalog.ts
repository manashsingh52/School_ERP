/**
 * Permission catalog — the single source of truth for every permission key (docs/04-rbac.md).
 * The API guard, the roles editor UI and the mobile app all read from this list.
 */

export const PERMISSION_SCOPES = ['ALL', 'ASSIGNED', 'OWN_CHILDREN', 'SELF'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/** Broadest first — used when a member has the same permission through several roles. */
export const SCOPE_RANK: Record<PermissionScope, number> = {
  ALL: 4,
  ASSIGNED: 3,
  OWN_CHILDREN: 2,
  SELF: 1,
};

export interface PermissionDef {
  module: string;
  label: string;
  /** Scopes that make sense for this permission. Empty = not record-scoped (granted or not). */
  scopes: readonly PermissionScope[];
}

const s = (module: string, label: string, ...scopes: PermissionScope[]): PermissionDef => ({
  module,
  label,
  scopes,
});

export const PERMISSIONS = {
  // School setup & people
  'dashboard.view': s('School', 'View dashboard'),
  'school.settings.view': s('School', 'View school settings'),
  'school.settings.manage': s('School', 'Change school settings'),
  'school.branding.manage': s('School', 'Change branding'),
  'academic.view': s('Academics', 'View years, classes, sections, subjects'),
  'academic.manage': s('Academics', 'Manage years, classes, sections, subjects'),
  'user.view': s('Users', 'View members'),
  'user.manage': s('Users', 'Invite, deactivate and assign roles'),
  'role.manage': s('Users', 'Manage roles and permissions'),
  'student.view': s('Students', 'View students', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'student.create': s('Students', 'Add students'),
  'student.edit': s('Students', 'Edit students', 'ALL', 'ASSIGNED'),
  'student.promote': s('Students', 'Promote students to next year'),
  'student.contact.view': s('Students', 'View contact details', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'guardian.view': s('Guardians', 'View guardians', 'ALL', 'ASSIGNED', 'SELF'),
  'guardian.manage': s('Guardians', 'Manage guardians'),
  'teacher.view': s('Teachers', 'View teachers', 'ALL', 'OWN_CHILDREN'),
  'teacher.manage': s('Teachers', 'Manage teachers'),

  // Daily operations
  'attendance.view': s('Attendance', 'View attendance', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'attendance.mark': s('Attendance', 'Mark attendance', 'ALL', 'ASSIGNED'),
  'attendance.edit_past': s('Attendance', 'Edit attendance after the edit window', 'ALL'),
  'staff_attendance.view': s('Attendance', 'View staff attendance', 'ALL', 'SELF'),
  'staff_attendance.manage': s('Attendance', 'Manage staff attendance'),
  'homework.view': s('Homework', 'View homework', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'homework.manage': s('Homework', 'Create and edit homework', 'ALL', 'ASSIGNED'),
  'timetable.view': s('Timetable', 'View timetable', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'timetable.manage': s('Timetable', 'Manage timetable'),
  'notice.view': s('Communication', 'View notices'),
  'notice.create': s('Communication', 'Create notices', 'ALL', 'ASSIGNED'),
  'notice.publish_school': s('Communication', 'Publish to whole-school audiences'),
  'notification.settings.manage': s('Communication', 'Manage notification settings'),
  'message.use': s('Communication', 'Message parents and teachers', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'complaint.manage': s('Communication', 'Manage every conversation and complaint status'),
  'meeting.view': s('Communication', 'View parent–teacher meetings', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'meeting.manage': s('Communication', 'Schedule parent–teacher meetings', 'ALL', 'ASSIGNED'),
  'reminder.use': s('Communication', 'Set personal reminders'),
  'calendar.view': s('Calendar', 'View the school calendar'),
  'calendar.manage': s('Calendar', 'Add holidays and events to the calendar'),

  // Exams
  'exam.view': s('Exams', 'View exams', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'exam.manage': s('Exams', 'Create and configure exams'),
  'marks.enter': s('Exams', 'Enter marks', 'ALL', 'ASSIGNED'),
  'marks.edit_locked': s('Exams', 'Edit locked marks', 'ALL'),
  'results.view': s('Exams', 'View results', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'results.publish': s('Exams', 'Publish results'),
  'report_card.generate': s('Exams', 'Generate report cards'),
  'certificate.view': s('Certificates', 'View certificates and achievements', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'certificate.issue': s('Certificates', 'Issue certificates', 'ALL', 'ASSIGNED'),

  // Finance
  'fee.view': s('Fees', 'View fee structures', 'ALL', 'OWN_CHILDREN'),
  'fee.manage': s('Fees', 'Manage fee heads and structures'),
  'fee.assign': s('Fees', 'Assign fee structures'),
  'concession.request': s('Fees', 'Request concessions'),
  'concession.approve': s('Fees', 'Approve concessions'),
  'invoice.view': s('Fees', 'View invoices', 'ALL', 'OWN_CHILDREN'),
  'invoice.generate': s('Fees', 'Generate and issue invoices'),
  'invoice.adjust': s('Fees', 'Adjust invoices'),
  'invoice.cancel': s('Fees', 'Cancel invoices'),
  'payment.view': s('Payments', 'View payments', 'ALL', 'OWN_CHILDREN'),
  'payment.collect': s('Payments', 'Collect payments at the counter'),
  'payment.pay_online': s('Payments', 'Pay fees online', 'OWN_CHILDREN'),
  'payment.void': s('Payments', 'Void counter receipts'),
  'payment.refund': s('Payments', 'Refund payments'),
  'gateway.manage': s('Payments', 'Connect payment gateway'),

  // Platform services
  'document.view': s('Documents', 'View documents', 'ALL', 'ASSIGNED', 'OWN_CHILDREN'),
  'document.manage': s('Documents', 'Upload and delete documents', 'ALL'),
  'report.academic': s('Reports', 'Academic reports', 'ALL', 'ASSIGNED'),
  'report.finance': s('Reports', 'Finance reports'),
  'report.export': s('Reports', 'Export reports'),
  'import.run': s('Imports', 'Run data imports'),
  'audit.view': s('Audit', 'View audit log'),
  'billing.view': s('Billing', 'View subscription'),
  'ai.use': s('AI', 'Use AI assistant'),
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** Platform (super admin) permissions — granted by PlatformRole, never stored per school. */
export const PLATFORM_PERMISSIONS = [
  'platform.dashboard.view',
  'platform.schools.manage',
  'platform.subscriptions.manage',
  'platform.flags.manage',
  'platform.support_access.request',
  'platform.system.view',
  'platform.audit.view',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLE_PERMISSIONS: Record<'SUPER_ADMIN' | 'SUPPORT', readonly PlatformPermission[]> = {
  SUPER_ADMIN: PLATFORM_PERMISSIONS,
  SUPPORT: ['platform.dashboard.view', 'platform.support_access.request', 'platform.system.view'],
};
