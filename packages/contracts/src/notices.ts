import { z } from 'zod';
import { pageQuerySchema, uuidSchema } from './common.js';

export const noticeTypeSchema = z.enum(['NOTICE', 'CIRCULAR', 'ANNOUNCEMENT', 'EVENT']);
export type NoticeType = z.infer<typeof noticeTypeSchema>;

/** Whole-school audiences need notice.publish_school. */
export const SCHOOL_WIDE_AUDIENCES = ['SCHOOL', 'ALL_PARENTS', 'ALL_TEACHERS', 'ALL_STAFF', 'ROLE'] as const;
export const audienceTypeSchema = z.enum(['SCHOOL', 'ALL_PARENTS', 'ALL_TEACHERS', 'ALL_STAFF', 'CLASS', 'SECTION', 'ROLE', 'MEMBERSHIP']);
export type AudienceType = z.infer<typeof audienceTypeSchema>;

export const audienceSchema = z
  .object({
    type: audienceTypeSchema,
    /** Class id, section id, role key or membership id — depending on type. */
    refId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((a) => ['SCHOOL', 'ALL_PARENTS', 'ALL_TEACHERS', 'ALL_STAFF'].includes(a.type) || !!a.refId, { path: ['refId'], message: 'Choose who' });
export type Audience = z.infer<typeof audienceSchema>;

const noticeFields = {
  type: noticeTypeSchema.default('NOTICE'),
  title: z.string().trim().min(1, 'Add a title').max(200),
  /** Plain text with simple markdown (**bold**, lists, links). Rendered safely, never as HTML. */
  body: z.string().trim().min(1, 'Write the notice').max(10_000),
  audiences: z.array(audienceSchema).min(1, 'Choose who should see it').max(30),
  attachmentFileIds: z.array(uuidSchema).max(5, 'Up to 5 attachments').default([]),
  isPinned: z.boolean().default(false),
  /** Also send a phone notification (in-app inbox always). */
  sendPush: z.boolean().default(true),
  eventStartsAt: z.iso.datetime({ offset: true }).optional(),
  eventEndsAt: z.iso.datetime({ offset: true }).optional(),
};

export const createNoticeSchema = z
  .object({
    ...noticeFields,
    publish: z.enum(['NOW', 'DRAFT', 'SCHEDULE']).default('NOW'),
    publishAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.publish !== 'SCHEDULE' || !!v.publishAt, { path: ['publishAt'], message: 'Choose when to publish' })
  .refine((v) => !v.eventStartsAt || !v.eventEndsAt || v.eventEndsAt >= v.eventStartsAt, { path: ['eventEndsAt'], message: 'Ends before it starts' });
export type CreateNoticeRequest = z.input<typeof createNoticeSchema>;

export const updateNoticeSchema = z.object({
  type: noticeTypeSchema.optional(),
  title: noticeFields.title.optional(),
  body: noticeFields.body.optional(),
  audiences: noticeFields.audiences.optional(),
  attachmentFileIds: z.array(uuidSchema).max(5).optional(),
  isPinned: z.boolean().optional(),
  sendPush: z.boolean().optional(),
  eventStartsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  eventEndsAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type UpdateNoticeRequest = z.input<typeof updateNoticeSchema>;

export const publishNoticeSchema = z.object({ publishAt: z.iso.datetime({ offset: true }).optional() });

export const listNoticesQuerySchema = pageQuerySchema.extend({
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED']).optional(),
  type: noticeTypeSchema.optional(),
  /** Only notices I wrote. */
  mine: z.enum(['true', 'false']).optional(),
  unread: z.enum(['true', 'false']).optional(),
});

export interface NoticeItem {
  id: string;
  type: NoticeType;
  title: string;
  body: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  publishAt: string | null;
  publishedAt: string | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  isPinned: boolean;
  sendPush: boolean;
  audiences: { type: AudienceType; refId: string | null; label: string }[];
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
  author: { name: string };
  createdAt: string;
  /** When the caller opened it (null = unread). */
  readAt: string | null;
  canEdit: boolean;
}

export interface NoticeStats {
  recipients: number;
  read: number;
  /** Percent of recipients who opened it. */
  percent: number | null;
  byGroup: { group: 'Parents' | 'Staff'; recipients: number; read: number }[];
}

/** Choices for the audience picker, already limited to what the caller may target. */
export interface NoticeAudienceOptions {
  schoolWide: boolean;
  classes: { id: string; label: string }[];
  sections: { id: string; label: string }[];
  roles: { key: string; name: string }[];
}
