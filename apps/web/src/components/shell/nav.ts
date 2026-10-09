import type { Permission, PermissionScope } from '@schoolos/permissions';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the member has ANY of these permissions (at a staff scope unless `scopes` says otherwise). */
  any: Permission[];
  scopes?: PermissionScope[];
  /** Built and usable now. Others show a "coming soon" page with the phase from docs/12. */
  ready: boolean;
  phase?: string;
}

const STAFF: PermissionScope[] = ['ALL', 'ASSIGNED', 'SELF'];

/** Sidebar order from docs/06 §1. */
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, any: ['dashboard.view'], scopes: ['ALL'], ready: true },
  { href: '/students', label: 'Students', icon: Users, any: ['student.view'], scopes: STAFF, ready: true },
  { href: '/teachers', label: 'Teachers', icon: GraduationCap, any: ['teacher.view'], scopes: STAFF, ready: true },
  { href: '/academics', label: 'Academics', icon: BookOpen, any: ['academic.view'], scopes: STAFF, ready: true },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck, any: ['attendance.view', 'staff_attendance.manage'], scopes: STAFF, ready: true },
  { href: '/homework', label: 'Homework', icon: NotebookPen, any: ['homework.view'], scopes: STAFF, ready: true },
  { href: '/timetable', label: 'Timetable', icon: CalendarClock, any: ['timetable.view'], scopes: STAFF, ready: true },
  { href: '/exams', label: 'Examinations', icon: ClipboardList, any: ['exam.view', 'exam.manage'], scopes: STAFF, ready: true },
  { href: '/fees', label: 'Fees', icon: IndianRupee, any: ['fee.manage', 'invoice.view'], scopes: ['ALL'], ready: true },
  { href: '/payments', label: 'Payments', icon: CreditCard, any: ['payment.view', 'payment.collect'], scopes: ['ALL'], ready: true },
  { href: '/notices', label: 'Notices', icon: Megaphone, any: ['notice.view', 'notice.create'], scopes: STAFF, ready: true },
  { href: '/documents', label: 'Documents', icon: FileText, any: ['document.view'], scopes: STAFF, ready: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, any: ['report.academic', 'report.finance'], scopes: STAFF, ready: true },
  { href: '/assistant', label: 'Assistant', icon: Sparkles, any: ['ai.use'], scopes: STAFF, ready: true },
];

/** Parent web view (docs/06 §4): one child at a time, chosen in the header. */
export const PARENT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, any: [], ready: true },
  { href: '/my/attendance', label: 'Attendance', icon: CalendarCheck, any: [], ready: true },
  { href: '/my/homework', label: 'Homework', icon: NotebookPen, any: [], ready: true },
  { href: '/my/timetable', label: 'Timetable', icon: CalendarClock, any: [], ready: true },
  { href: '/my/results', label: 'Results', icon: ClipboardList, any: [], ready: true },
  { href: '/my/fees', label: 'Fees', icon: IndianRupee, any: [], ready: true },
  { href: '/my/documents', label: 'Documents', icon: FileText, any: [], ready: true },
  { href: '/notices', label: 'Notices', icon: Megaphone, any: [], ready: true },
];

export const SETTINGS_NAV: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
  any: ['school.settings.view'],
  scopes: STAFF,
  ready: true,
};

export const ALL_NAV = [...NAV, SETTINGS_NAV];

export function visibleNav(can: (p: Permission, s?: PermissionScope[]) => boolean, items = NAV): NavItem[] {
  return items.filter((item) => item.any.some((p) => can(p, item.scopes)));
}
