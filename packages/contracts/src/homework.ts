import { z } from 'zod';
import { pageQuerySchema, uuidSchema } from './common.js';

const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });

export const homeworkStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']);
export type HomeworkStatus = z.infer<typeof homeworkStatusSchema>;

const homeworkFields = {
  subjectId: uuidSchema,
  sectionIds: z.array(uuidSchema).min(1, 'Choose at least one section').max(20),
  title: z.string().trim().min(1, 'Add a title').max(200),
  description: z.string().trim().max(5000).optional(),
  dueDate: dateOnly.optional(),
  attachmentFileIds: z.array(uuidSchema).max(5, 'Up to 5 attachments').default([]),
  /** Admins may set homework on behalf of a teacher; teachers always post as themselves. */
  teacherId: uuidSchema.optional(),
};

export const createHomeworkSchema = z
  .object({
    ...homeworkFields,
    /** NOW = publish and notify parents; DRAFT = keep private; SCHEDULE = publish at `publishAt`. */
    publish: z.enum(['NOW', 'DRAFT', 'SCHEDULE']).default('NOW'),
    publishAt: z.iso.datetime({ offset: true, message: 'Choose a date and time' }).optional(),
  })
  .refine((v) => v.publish !== 'SCHEDULE' || !!v.publishAt, { path: ['publishAt'], message: 'Choose when to publish' });
export type CreateHomeworkRequest = z.input<typeof createHomeworkSchema>;

export const updateHomeworkSchema = z.object({
  subjectId: homeworkFields.subjectId.optional(),
  sectionIds: homeworkFields.sectionIds.optional(),
  title: homeworkFields.title.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  attachmentFileIds: z.array(uuidSchema).max(5, 'Up to 5 attachments').optional(),
});
export type UpdateHomeworkRequest = z.input<typeof updateHomeworkSchema>;

export const publishHomeworkSchema = z.object({
  /** Omit to publish now. */
  publishAt: z.iso.datetime({ offset: true }).optional(),
});

export const listHomeworkQuerySchema = pageQuerySchema.extend({
  sectionId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  /** Parents: one child's homework. */
  studentId: uuidSchema.optional(),
  status: homeworkStatusSchema.optional(),
  /** "mine" = homework I set (teachers). */
  mine: z.enum(['true', 'false']).optional(),
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
});

export interface HomeworkItem {
  id: string;
  title: string;
  description: string | null;
  subject: { id: string; name: string };
  teacher: { id: string; name: string };
  sections: { id: string; label: string }[];
  dueDate: string | null;
  status: HomeworkStatus;
  publishAt: string | null;
  publishedAt: string | null;
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
  createdAt: string;
  /** Can the caller edit/delete it? */
  canEdit: boolean;
  /** Only when listing one child's homework (parents): that child's progress and the teacher's feedback. */
  submission?: { status: HomeworkProgress; feedback: string | null; reviewedAt: string | null } | null;
}

// ---------------------------------------------------------------- submissions (who handed it in)

export type HomeworkProgress = 'ASSIGNED' | 'VIEWED' | 'SUBMITTED' | 'REVIEWED';

export interface HomeworkSubmissionRow {
  studentId: string;
  name: string;
  rollNo: number | null;
  admissionNo: string;
  section: string;
  status: HomeworkProgress;
  /** When a parent opened it. */
  viewedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  feedback: string | null;
}

export interface HomeworkSubmissions {
  homeworkId: string;
  dueDate: string | null;
  rows: HomeworkSubmissionRow[];
  counts: Record<HomeworkProgress, number>;
}

export const saveSubmissionsSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: uuidSchema,
        /** ASSIGNED = not handed in (undo). VIEWED is set only when a parent opens it. */
        status: z.enum(['ASSIGNED', 'SUBMITTED', 'REVIEWED']),
        feedback: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const homeworkSeenSchema = z.object({ studentId: uuidSchema });

/** What the caller may set homework for: sections and, per section, subjects. */
export interface HomeworkTargets {
  /** True when the caller can post on behalf of any teacher (admins). */
  anyTeacher: boolean;
  sections: { id: string; label: string; subjects: { id: string; name: string; teacherName: string | null }[] }[];
}
