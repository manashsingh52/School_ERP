import { z } from 'zod';
import { pageQuerySchema, phoneSchema, emailSchema, uuidSchema } from './common.js';

export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);
export const studentStatusSchema = z.enum(['ACTIVE', 'ALUMNI', 'TRANSFERRED', 'WITHDRAWN', 'ARCHIVED']);

const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });

export const createStudentSchema = z.object({
  admissionNo: z.string().trim().min(1, 'Admission number is required').max(30),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().max(80).optional(),
  dateOfBirth: dateOnly.optional(),
  gender: genderSchema.optional(),
  sectionId: uuidSchema,
  rollNo: z.number().int().min(1).max(999).optional(),
  admissionDate: dateOnly.optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
});
export type CreateStudentRequest = z.input<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema
  .omit({ sectionId: true, rollNo: true })
  .partial()
  .extend({ status: studentStatusSchema.optional() });
export type UpdateStudentRequest = z.input<typeof updateStudentSchema>;

export const listStudentsQuerySchema = pageQuerySchema.extend({
  classId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  status: studentStatusSchema.optional(),
});
export type ListStudentsQuery = z.input<typeof listStudentsQuerySchema>;

export interface StudentListItem {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string | null;
  status: z.infer<typeof studentStatusSchema>;
  className: string | null;
  sectionName: string | null;
  rollNo: number | null;
}

export interface StudentDetail extends StudentListItem {
  dateOfBirth: string | null;
  gender: z.infer<typeof genderSchema> | null;
  admissionDate: string | null;
  /** Present only when the caller has `student.contact.view` for this student. */
  phone?: string | null;
  email?: string | null;
  sectionId: string | null;
  classId: string | null;
  createdAt: string;
}
