import { z } from 'zod';
import { pageQuerySchema, phoneSchema, emailSchema, uuidSchema } from './common.js';
import { studentGuardianInputSchema, type GuardianChild, type LoginStatus } from './people.js';

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
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Use a 6-digit PIN code').optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  /** Parents/guardians, matched by phone within the school (an existing parent is reused, not duplicated). */
  guardians: z.array(studentGuardianInputSchema).max(4).default([]),
  /** Create logins for new guardians (Parent role); they activate with a one-time code. */
  inviteGuardians: z.boolean().default(true),
});
export type CreateStudentRequest = z.input<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema
  .omit({ sectionId: true, rollNo: true, guardians: true, inviteGuardians: true })
  .partial()
  .extend({ status: studentStatusSchema.optional(), photoFileId: uuidSchema.nullable().optional() });
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
  bloodGroup: string | null;
  photoUrl: string | null;
  /** Present only when the caller has `student.contact.view` for this student. */
  phone?: string | null;
  email?: string | null;
  address?: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null };
  emergencyContact?: { name: string | null; phone: string | null };
  guardians: (Omit<GuardianChild, 'studentId' | 'admissionNo' | 'className' | 'sectionName' | 'name'> & {
    guardianId: string;
    name: string;
    phone?: string;
    email?: string | null;
    login: LoginStatus;
  })[];
  sectionId: string | null;
  classId: string | null;
  academicYearId: string | null;
  createdAt: string;
}
