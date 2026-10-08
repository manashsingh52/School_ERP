import { z } from 'zod';
import { uuidSchema } from './common.js';

const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE']);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/** Per-school attendance rules (stored in school_settings.attendance). */
export const attendanceSettingsSchema = z.object({
  /** Days after the date during which the marker can still correct a submitted register. */
  editWindowDays: z.number().int().min(0).max(30).default(2),
  /** CLASS_TEACHER: only the class teacher marks. ANY_ASSIGNED: any teacher of the section. */
  markedBy: z.enum(['CLASS_TEACHER', 'ANY_ASSIGNED']).default('CLASS_TEACHER'),
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6).default([0]),
});
export type AttendanceSettings = z.output<typeof attendanceSettingsSchema>;

export const registerQuerySchema = z.object({ date: dateOnly.optional() });

export const saveRegisterSchema = z.object({
  date: dateOnly,
  records: z
    .array(z.object({ studentId: uuidSchema, status: attendanceStatusSchema, remark: z.string().trim().max(200).optional() }))
    .max(200),
  /** false = save as draft. */
  submit: z.boolean().default(true),
  /** Set by offline-capable clients: replays of the same submission are ignored (docs/12 Phase 7). */
  clientMutationId: z.string().min(8).max(64).optional(),
});
export type SaveRegisterRequest = z.input<typeof saveRegisterSchema>;

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  HALF_DAY: number;
  LEAVE: number;
  unmarked: number;
}

export interface AttendanceRegister {
  section: { id: string; label: string; classTeacher: string | null };
  date: string;
  status: 'NOT_TAKEN' | 'DRAFT' | 'SUBMITTED';
  submittedAt: string | null;
  takenBy: string | null;
  /** Can the caller change it right now? If not, `lockedReason` says why. */
  editable: boolean;
  lockedReason: string | null;
  isWeeklyOff: boolean;
  students: { studentId: string; name: string; rollNo: number | null; admissionNo: string; status: AttendanceStatus | null; remark: string | null }[];
  counts: AttendanceCounts;
}

export const overviewQuerySchema = z.object({ date: dateOnly.optional() });

export interface AttendanceOverview {
  date: string;
  isWeeklyOff: boolean;
  totals: AttendanceCounts & { students: number; percentPresent: number | null; sectionsTaken: number; sectionsTotal: number };
  sections: {
    sectionId: string;
    label: string;
    classTeacher: string | null;
    status: AttendanceRegister['status'];
    students: number;
    present: number;
    absent: number;
    late: number;
    canMark: boolean;
  }[];
}

export const historyQuerySchema = z.object({ from: dateOnly.optional(), to: dateOnly.optional() });

export interface StudentAttendanceHistory {
  studentId: string;
  from: string;
  to: string;
  counts: AttendanceCounts;
  /** PRESENT/LATE count as present, HALF_DAY as half (docs/12). */
  percentPresent: number | null;
  days: { date: string; status: AttendanceStatus; remark: string | null }[];
}

export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM') });

export interface SectionMonth {
  section: { id: string; label: string };
  month: string;
  days: string[]; // dates with a submitted register
  students: { studentId: string; name: string; rollNo: number | null; marks: Record<string, AttendanceStatus>; percentPresent: number | null }[];
}

export const saveStaffAttendanceSchema = z.object({
  date: dateOnly,
  records: z.array(z.object({ teacherId: uuidSchema, status: attendanceStatusSchema, remark: z.string().trim().max(200).optional() })).max(500),
});

export interface StaffAttendanceDay {
  date: string;
  teachers: { teacherId: string; name: string; employeeId: string; status: AttendanceStatus | null; remark: string | null }[];
  counts: AttendanceCounts;
}

/** Present-equivalent share: LATE counts as present, HALF_DAY as half; LEAVE excluded from the base. */
export function percentPresent(c: Pick<AttendanceCounts, 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY'>): number | null {
  const base = c.PRESENT + c.ABSENT + c.LATE + c.HALF_DAY;
  if (!base) return null;
  return Math.round(((c.PRESENT + c.LATE + c.HALF_DAY / 2) / base) * 1000) / 10;
}

export const updateAttendanceSettingsSchema = attendanceSettingsSchema.partial();
export type UpdateAttendanceSettingsRequest = z.input<typeof updateAttendanceSettingsSchema>;
