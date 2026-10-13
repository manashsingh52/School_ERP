import { z } from 'zod';
import { uuidSchema } from './common.js';

export const CALENDAR_KINDS = ['HOLIDAY', 'VACATION', 'EVENT', 'PTM', 'EXAM', 'OTHER'] as const;
export const calendarKindSchema = z.enum(CALENDAR_KINDS);
export type CalendarKind = z.infer<typeof calendarKindSchema>;

export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  HOLIDAY: 'Holiday',
  VACATION: 'Vacation',
  EVENT: 'Event',
  PTM: 'Parent–teacher meeting',
  EXAM: 'Exam',
  OTHER: 'Other',
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(2, 'Add a title').max(120),
    description: z.string().trim().max(1000).optional(),
    kind: calendarKindSchema.default('EVENT'),
    startDate: isoDate,
    /** Same as startDate for a single day. */
    endDate: isoDate.optional(),
    /** Empty = the whole school. */
    classIds: z.array(uuidSchema).max(50).default([]),
    /** Tell parents (and staff) about it now. */
    notify: z.boolean().default(false),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'Ends before it starts' });
export type CalendarEventRequest = z.input<typeof calendarEventSchema>;

export const updateCalendarEventSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    kind: calendarKindSchema.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    classIds: z.array(uuidSchema).max(50).optional(),
  })
  .refine((v) => !v.endDate || !v.startDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'Ends before it starts' });

export const calendarQuerySchema = z.object({ from: isoDate, to: isoDate }).refine((v) => v.to >= v.from, { path: ['to'], message: 'Ends before it starts' });

/**
 * One entry on the calendar. Holidays, vacations and events come from the school's calendar;
 * exams come from the exams themselves (`source: EXAM`) — a span for the whole exam, and for a
 * parent each of their child's papers on its day.
 */
export interface CalendarItem {
  id: string;
  source: 'CALENDAR' | 'EXAM' | 'PAPER';
  kind: CalendarKind;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  /** "Whole school" or "Class 8, Class 9". */
  audience: string;
  /** Exams: link target; papers: the time. */
  examId: string | null;
  time: string | null;
  canEdit: boolean;
}
