import { z } from 'zod';
import type { Permission } from '@schoolos/permissions';

const MB = 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const PDF = ['application/pdf'];
const DOCX = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const XLSX = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const CSV = ['text/csv'];

export interface FilePurposeRule {
  label: string;
  mimeTypes: readonly string[];
  maxBytes: number;
  /** Needed (at any scope) to upload and to download files of this purpose. */
  permission: Permission;
}

/**
 * Every upload declares a purpose; the purpose decides allowed types, size and permission
 * (docs/09 §3 "File uploads"). SVG is never accepted (it can carry scripts).
 */
export const FILE_PURPOSES = {
  student_photo: { label: 'Student photo', mimeTypes: IMAGES, maxBytes: 5 * MB, permission: 'student.edit' },
  teacher_photo: { label: 'Teacher photo', mimeTypes: IMAGES, maxBytes: 5 * MB, permission: 'teacher.manage' },
  school_logo: { label: 'School logo', mimeTypes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 2 * MB, permission: 'school.branding.manage' },
  document: { label: 'Document', mimeTypes: [...PDF, ...IMAGES, ...DOCX], maxBytes: 15 * MB, permission: 'document.manage' },
  homework_attachment: { label: 'Homework attachment', mimeTypes: [...PDF, ...IMAGES, ...DOCX, ...XLSX], maxBytes: 15 * MB, permission: 'homework.manage' },
  notice_attachment: { label: 'Notice attachment', mimeTypes: [...PDF, ...IMAGES], maxBytes: 15 * MB, permission: 'notice.create' },
  import: { label: 'Import file', mimeTypes: [...XLSX, ...CSV], maxBytes: 10 * MB, permission: 'import.run' },
} as const satisfies Record<string, FilePurposeRule>;

export type FilePurpose = keyof typeof FILE_PURPOSES;
export const FILE_PURPOSE_KEYS = Object.keys(FILE_PURPOSES) as FilePurpose[];

export const requestUploadSchema = z
  .object({
    purpose: z.enum(FILE_PURPOSE_KEYS as [FilePurpose, ...FilePurpose[]]),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().toLowerCase().max(120),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const rule: FilePurposeRule = FILE_PURPOSES[value.purpose];
    if (!rule.mimeTypes.includes(value.mimeType)) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: `This file type isn't allowed for ${rule.label.toLowerCase()}.` });
    }
    if (value.sizeBytes > rule.maxBytes) {
      ctx.addIssue({ code: 'custom', path: ['sizeBytes'], message: `Files must be ${Math.round(rule.maxBytes / MB)} MB or smaller.` });
    }
  });
export type RequestUploadRequest = z.input<typeof requestUploadSchema>;

export interface UploadTicket {
  fileId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
}

export interface FileInfo {
  id: string;
  purpose: FilePurpose | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING_UPLOAD' | 'READY' | 'REJECTED' | 'DELETED';
  createdAt: string;
}

export interface DownloadLink {
  url: string;
  expiresAt: string;
}
