import { z } from 'zod';
import { uuidSchema } from './common.js';

// ---------------------------------------------------------------- conversations (messages & complaints)

export const CONVERSATION_CATEGORIES = ['GENERAL', 'ACADEMIC', 'ATTENDANCE', 'HOMEWORK', 'BEHAVIOUR', 'COMPLAINT', 'SUGGESTION', 'OTHER'] as const;
export const conversationCategorySchema = z.enum(CONVERSATION_CATEGORIES);
export type ConversationCategory = z.infer<typeof conversationCategorySchema>;

export const CONVERSATION_CATEGORY_LABELS: Record<ConversationCategory, string> = {
  GENERAL: 'General query',
  ACADEMIC: 'Academic issue',
  ATTENDANCE: 'Attendance issue',
  HOMEWORK: 'Homework',
  BEHAVIOUR: 'Behaviour',
  COMPLAINT: 'Complaint',
  SUGGESTION: 'Suggestion or feedback',
  OTHER: 'Other concern',
};

export const conversationStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

const body = z.string().trim().min(1, 'Write a message').max(4000, 'Keep it under 4,000 characters');

/**
 * Start a thread about one child. A parent writes to one of the child's teachers (or the school
 * office: `toMemberId: null`); a teacher writes to one of the child's parents.
 */
export const startConversationSchema = z.object({
  studentId: uuidSchema,
  toMemberId: uuidSchema.nullable(),
  category: conversationCategorySchema.default('GENERAL'),
  subject: z.string().trim().min(3, 'Add a short subject').max(120),
  body,
});
export type StartConversationRequest = z.input<typeof startConversationSchema>;

export const sendMessageSchema = z.object({ body });
export type SendMessageRequest = z.input<typeof sendMessageSchema>;

export const updateConversationSchema = z.object({ status: conversationStatusSchema });

export const listConversationsQuerySchema = z.object({
  status: conversationStatusSchema.optional(),
  category: conversationCategorySchema.optional(),
  studentId: uuidSchema.optional(),
  /** Staff with school-wide access: only threads addressed to me (default) or every thread. */
  view: z.enum(['mine', 'all']).default('mine'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const contactsQuerySchema = z.object({ studentId: uuidSchema });

export interface ConversationParty {
  memberId: string;
  name: string;
}

export interface ConversationItem {
  id: string;
  student: { id: string; name: string; classLabel: string | null };
  parent: ConversationParty;
  /** null = the school office. */
  staff: ConversationParty | null;
  category: ConversationCategory;
  subject: string;
  status: ConversationStatus;
  lastMessageAt: string;
  lastMessage: { body: string; senderName: string; fromMe: boolean } | null;
  /** Something new since I last opened it. */
  unread: boolean;
  /** Which side I'm on; OFFICE = school-wide staff looking in (can reply and change status). */
  myRole: 'PARENT' | 'STAFF' | 'OFFICE';
  canChangeStatus: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ConversationMessageItem {
  id: string;
  body: string;
  sender: ConversationParty & { side: 'PARENT' | 'STAFF' };
  fromMe: boolean;
  /** The other side has opened the thread since this was sent. */
  seen: boolean;
  createdAt: string;
}

export interface ConversationDetail extends ConversationItem {
  messages: ConversationMessageItem[];
}

/** Who I can start a conversation with about this child. */
export interface MessageContact {
  /** null = the school office. */
  memberId: string | null;
  name: string;
  /** "Class teacher", "Mathematics, Science", "Father", "School office". */
  role: string;
}

// ---------------------------------------------------------------- meetings (video)

export const meetingStatusSchema = z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']);
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;

const future = z.iso.datetime({ offset: true, error: 'Pick a date and time' });

export const createMeetingSchema = z.object({
  studentId: uuidSchema,
  title: z.string().trim().min(3, 'Add a title').max(120),
  agenda: z.string().trim().max(1000).optional(),
  category: conversationCategorySchema.default('GENERAL'),
  scheduledAt: future,
  durationMinutes: z.coerce.number().int().min(10).max(120).default(30),
});
export type CreateMeetingRequest = z.input<typeof createMeetingSchema>;

/** Reschedule or edit. Parents are told when the time changes. */
export const updateMeetingSchema = createMeetingSchema.omit({ studentId: true }).partial();

export const cancelMeetingSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const listMeetingsQuerySchema = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
  studentId: uuidSchema.optional(),
});

export interface MeetingItem {
  id: string;
  student: { id: string; name: string; classLabel: string | null };
  organizer: ConversationParty;
  title: string;
  agenda: string | null;
  category: ConversationCategory;
  scheduledAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  cancelReason: string | null;
  /** Open in a browser or the Jitsi app; null once cancelled or finished. */
  joinUrl: string | null;
  /** From 15 minutes before the start until the end. */
  joinable: boolean;
  canManage: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------- reminders

export const reminderRepeatSchema = z.enum(['NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY']);
export type ReminderRepeat = z.infer<typeof reminderRepeatSchema>;

export const REMINDER_REPEAT_LABELS: Record<ReminderRepeat, string> = {
  NONE: 'Once',
  DAILY: 'Every day',
  WEEKDAYS: 'Monday to Saturday',
  WEEKLY: 'Every week',
};

export const createReminderSchema = z.object({
  title: z.string().trim().min(1, 'What should we remind you about?').max(120),
  notes: z.string().trim().max(500).optional(),
  remindAt: future,
  repeat: reminderRepeatSchema.default('NONE'),
  studentId: uuidSchema.nullable().optional(),
});
export type CreateReminderRequest = z.input<typeof createReminderSchema>;

export const updateReminderSchema = createReminderSchema.partial().extend({
  /** true = done (stops repeating); false = active again. */
  completed: z.boolean().optional(),
});
export type UpdateReminderRequest = z.input<typeof updateReminderSchema>;

export const listRemindersQuerySchema = z.object({ status: z.enum(['active', 'done']).default('active') });

export interface ReminderItem {
  id: string;
  title: string;
  notes: string | null;
  remindAt: string;
  repeat: ReminderRepeat;
  student: { id: string; name: string } | null;
  completedAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
}
