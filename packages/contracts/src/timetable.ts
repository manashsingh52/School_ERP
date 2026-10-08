import { z } from 'zod';
import { uuidSchema } from './common.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });

export const periodInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the period').max(30),
  startTime: time,
  endTime: time,
  isBreak: z.boolean().default(false),
});

export const bellScheduleSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the schedule').max(60),
    isDefault: z.boolean().default(false),
    periods: z.array(periodInputSchema).min(1, 'Add at least one period').max(16),
  })
  .superRefine((v, ctx) => {
    v.periods.forEach((p, i) => {
      if (p.endTime <= p.startTime) ctx.addIssue({ code: 'custom', path: ['periods', i, 'endTime'], message: 'Ends before it starts' });
      const prev = v.periods[i - 1];
      if (prev && p.startTime < prev.endTime) ctx.addIssue({ code: 'custom', path: ['periods', i, 'startTime'], message: 'Overlaps the previous period' });
    });
  });
export type BellScheduleRequest = z.input<typeof bellScheduleSchema>;

export interface PeriodItem {
  id: string;
  name: string;
  order: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface BellScheduleItem {
  id: string;
  name: string;
  isDefault: boolean;
  periods: PeriodItem[];
  /** Number of section timetables using it. */
  usedBy: number;
}

export const createTimetableSchema = z.object({ sectionId: uuidSchema, bellScheduleId: uuidSchema });

export const timetableQuerySchema = z.object({ sectionId: uuidSchema });

export const saveTimetableSchema = z.object({
  /** Switch the section to another bell schedule (entries must use its periods). */
  bellScheduleId: uuidSchema.optional(),
  entries: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7), // 1 = Monday … 7 = Sunday
        periodId: uuidSchema,
        subjectId: uuidSchema.nullable().optional(),
        teacherId: uuidSchema.nullable().optional(),
        room: z.string().trim().max(30).nullable().optional(),
      }),
    )
    .max(7 * 16),
});
export type SaveTimetableRequest = z.input<typeof saveTimetableSchema>;

export interface TimetableEntryItem {
  dayOfWeek: number;
  periodId: string;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  room: string | null;
}

export interface TimetableView {
  id: string;
  section: { id: string; label: string };
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  bellSchedule: BellScheduleItem;
  /** Working days shown in the grid (1 = Monday … 7 = Sunday), from the school's weekly off. */
  days: number[];
  entries: TimetableEntryItem[];
}

/** One teaching slot, with its own times (sections can use different bell schedules). */
export interface ScheduleSlot {
  dayOfWeek: number;
  periodName: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  section: { id: string; label: string } | null;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  room: string | null;
}

export interface TeacherWeek {
  teacher: { id: string; name: string };
  days: number[];
  slots: ScheduleSlot[];
  periodsPerWeek: number;
}

export const todayQuerySchema = z.object({ date: dateOnly.optional(), studentId: uuidSchema.optional() });

export interface TodaySchedule {
  date: string;
  dayOfWeek: number;
  isWeeklyOff: boolean;
  /** Whose day this is. */
  for: { kind: 'teacher' | 'section'; label: string };
  slots: ScheduleSlot[];
}
