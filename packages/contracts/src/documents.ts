import { z } from 'zod';
import { uuidSchema } from './common.js';

export const DOCUMENT_CATEGORIES = {
  birth_certificate: 'Birth certificate',
  transfer_certificate: 'Transfer certificate',
  id_proof: 'ID proof (Aadhaar etc.)',
  address_proof: 'Address proof',
  marksheet: 'Marksheet',
  medical: 'Medical record',
  certificate: 'Certificate',
  qualification: 'Qualification',
  policy: 'Policy / circular',
  other: 'Other',
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;
const categorySchema = z.enum(Object.keys(DOCUMENT_CATEGORIES) as [DocumentCategory, ...DocumentCategory[]]);

export const documentOwnerTypeSchema = z.enum(['SCHOOL', 'STUDENT', 'GUARDIAN', 'TEACHER']);
export type DocumentOwnerType = z.infer<typeof documentOwnerTypeSchema>;

export const listDocumentsQuerySchema = z.object({
  ownerType: documentOwnerTypeSchema,
  /** Not needed for SCHOOL documents. */
  ownerId: uuidSchema.optional(),
  category: categorySchema.optional(),
});

export const createDocumentSchema = z
  .object({
    ownerType: documentOwnerTypeSchema,
    ownerId: uuidSchema.optional(),
    category: categorySchema,
    title: z.string().trim().min(1).max(120),
    fileId: uuidSchema,
    visibleToGuardian: z.boolean().default(false),
  })
  .refine((d) => d.ownerType === 'SCHOOL' || !!d.ownerId, { path: ['ownerId'], message: 'Choose who this document belongs to' });
export type CreateDocumentRequest = z.input<typeof createDocumentSchema>;

export const updateDocumentSchema = z.object({
  category: categorySchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  visibleToGuardian: z.boolean().optional(),
});

export interface DocumentItem {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: DocumentCategory;
  title: string;
  visibleToGuardian: boolean;
  file: { id: string; name: string; mimeType: string; sizeBytes: number };
  uploadedBy: string | null;
  createdAt: string;
}
