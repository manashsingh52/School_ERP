import { z } from 'zod';

export const notificationChannelSchema = z.enum(['IN_APP', 'PUSH', 'SMS', 'EMAIL']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export interface NotificationEventDef {
  label: string;
  description: string;
  audience: string;
  /** Channels a school can turn on for this event (IN_APP is always on — it's the inbox). */
  channels: NotificationChannel[];
  defaultChannels: NotificationChannel[];
  defaultEnabled: boolean;
  /** Someone's own alert (a reminder they set): always on, not in the school's alert settings. */
  personal?: boolean;
  /** {{placeholders}} are filled from the event. */
  title: string;
  body: string;
}

/**
 * Every event the notification engine knows (Master Prompt §39). Modules publish events;
 * only this catalog + the engine decide who hears about it and how.
 */
export const NOTIFICATION_EVENTS = {
  'attendance.absent': {
    label: 'Absent today',
    description: 'When a student is marked absent.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'SMS'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '{{student}} was marked absent',
    body: '{{student}} ({{class}}) was marked absent on {{date}}. Please contact the school if this is unexpected.',
  },
  'attendance.arrived': {
    label: 'Arrived at school',
    description: "When today's register marks a student present, late or half day.",
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '{{student}} has arrived at school',
    body: '{{student}} ({{class}}) was marked {{status}} at {{time}} today, {{date}}.',
  },
  'attendance.late': {
    label: 'Arrived late',
    description: 'When a student is marked late.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP'],
    defaultEnabled: false,
    title: '{{student}} arrived late',
    body: '{{student}} ({{class}}) was marked late on {{date}}.',
  },
  'homework.published': {
    label: 'New homework',
    description: 'When a teacher publishes homework.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '{{subject}} homework for {{student}}',
    body: '{{title}}{{due}}',
  },
  'exam.results_published': {
    label: 'Exam results',
    description: 'When the school publishes exam results.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'SMS'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '{{exam}} results are out',
    body: "{{student}}'s {{exam}} results and report card are now available.",
  },
  'message.received': {
    label: 'New message',
    description: 'When a parent or teacher replies in a conversation.',
    audience: 'Parents and staff',
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '{{sender}}: {{subject}}',
    body: '{{preview}}',
  },
  'complaint.status_changed': {
    label: 'Query or complaint updated',
    description: "When the school marks a parent's query or complaint in progress or resolved.",
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '"{{subject}}" is now {{status}}',
    body: '{{who}} updated your {{category}} about {{student}}.',
  },
  'meeting.scheduled': {
    label: 'Meeting scheduled',
    description: 'When a teacher schedules a video meeting with parents.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Video meeting with {{teacher}} on {{when}}',
    body: '{{title}} — about {{student}}. Join from the app when it starts.',
  },
  'meeting.rescheduled': {
    label: 'Meeting moved',
    description: 'When a meeting is moved to a new time.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Meeting moved to {{when}}',
    body: '{{teacher}} moved "{{title}}" (about {{student}}) to {{when}}.',
  },
  'meeting.cancelled': {
    label: 'Meeting cancelled',
    description: 'When a meeting is cancelled.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Meeting cancelled: {{title}}',
    body: '{{teacher}} cancelled the meeting on {{when}}.{{reason}}',
  },
  'meeting.starting': {
    label: 'Meeting starting soon',
    description: '15 minutes before a meeting (parents and the teacher).',
    audience: 'Parents and staff',
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '"{{title}}" starts at {{time}}',
    body: 'Video meeting about {{student}}. Tap to join.',
  },
  'reminder.due': {
    label: 'Personal reminder',
    description: 'A reminder someone set for themselves (always delivered).',
    audience: 'Whoever set it',
    personal: true,
    channels: ['IN_APP', 'PUSH'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '⏰ {{title}}',
    body: '{{notes}}',
  },
  'payment.received': {
    label: 'Payment received',
    description: 'When a fee payment is recorded (online or at the counter).',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'SMS', 'EMAIL'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Payment received: {{amount}}',
    body: 'We received {{amount}} for {{student}}. Receipt {{receipt}}.',
  },
  'fee.due': {
    label: 'Fee due soon',
    description: 'A few days before an invoice is due.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'SMS'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Fee due on {{due}}',
    body: "{{student}}'s {{installment}} fee of {{amount}} is due on {{due}}.",
  },
  'fee.overdue': {
    label: 'Fee overdue',
    description: 'Weekly while an invoice is unpaid after its due date.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'SMS'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Fee overdue for {{student}}',
    body: '{{amount}} for {{installment}} was due on {{due}}. Please pay online or at the school office.',
  },
  'refund.processed': {
    label: 'Refund processed',
    description: 'When a refund is completed.',
    audience: 'Parents',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: 'Refund of {{amount}} processed',
    body: 'A refund of {{amount}} for {{student}} has been processed.',
  },
  'notice.published': {
    label: 'Notices',
    description: 'When the school publishes a notice to someone.',
    audience: 'Chosen audience',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    defaultChannels: ['IN_APP', 'PUSH'],
    defaultEnabled: true,
    title: '{{title}}',
    body: '{{preview}}',
  },
  'support.access_requested': {
    label: 'Support access requests',
    description: 'When SchoolOS support asks to look at your school to help with a problem.',
    audience: 'School admins',
    channels: ['IN_APP', 'EMAIL'],
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultEnabled: true,
    title: 'SchoolOS support is asking for access',
    body: '{{requester}} wants read-only access for {{hours}} hours: "{{reason}}". Approve or decline in Settings → Support access.',
  },
} as const satisfies Record<string, NotificationEventDef>;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
export const NOTIFICATION_EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[];

/** Fill {{placeholders}}; unknown ones become empty. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? '')).trim();
}

export interface NotificationItem {
  id: string;
  event: string;
  title: string;
  body: string;
  /** Where tapping it goes, e.g. { route: "/attendance" }. */
  data: { route?: string; [key: string]: unknown };
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRuleItem {
  event: NotificationEvent;
  label: string;
  description: string;
  audience: string;
  enabled: boolean;
  channels: NotificationChannel[];
  availableChannels: NotificationChannel[];
}

export const updateNotificationRulesSchema = z.object({
  rules: z
    .array(
      z.object({
        event: z.enum(NOTIFICATION_EVENT_KEYS as [NotificationEvent, ...NotificationEvent[]]),
        enabled: z.boolean(),
        channels: z.array(notificationChannelSchema).max(4),
      }),
    )
    .min(1),
});

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).optional(),
});
