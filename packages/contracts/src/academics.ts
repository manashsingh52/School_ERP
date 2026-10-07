import { z } from 'zod';
import { uuidSchema } from './common.js';

export const dateOnlySchema = z.iso.date({ message: 'Use YYYY-MM-DD' });

// ---------------------------------------------------------------- academic years

export const academicYearStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'CLOSED']);

export const createAcademicYearSchema = z
  .object({
    name: z.string().trim().min(4, 'Name it like 2026–27').max(20),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    makeCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, { path: ['endDate'], message: 'End date must be after the start date' })
  .refine((v) => (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86_400_000 <= 550, {
    path: ['endDate'],
    message: 'An academic year can be at most 18 months long',
  });
export type CreateAcademicYearRequest = z.input<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(4).max(20).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
});

export interface AcademicYearItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: z.infer<typeof academicYearStatusSchema>;
  isCurrent: boolean;
  sectionCount: number;
  studentCount: number;
}

// ---------------------------------------------------------------- classes & sections

export const createClassSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  displayOrder: z.number().int().min(0).max(999).optional(),
});
export const bulkCreateClassesSchema = z.object({
  names: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
});
export const updateClassSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export interface ClassItem {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  sections: SectionItem[];
}

export const createSectionSchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema,
  name: z.string().trim().min(1).max(10),
  capacity: z.number().int().min(1).max(200).optional(),
  room: z.string().trim().max(40).optional(),
  classTeacherId: uuidSchema.nullable().optional(),
});
export const bulkCreateSectionsSchema = z.object({
  academicYearId: uuidSchema,
  classIds: z.array(uuidSchema).min(1).max(30),
  names: z.array(z.string().trim().min(1).max(10)).min(1).max(12),
});
export const updateSectionSchema = z.object({
  name: z.string().trim().min(1).max(10).optional(),
  capacity: z.number().int().min(1).max(200).nullable().optional(),
  room: z.string().trim().max(40).nullable().optional(),
  classTeacherId: uuidSchema.nullable().optional(),
});

export interface SectionItem {
  id: string;
  name: string;
  classId: string;
  academicYearId: string;
  capacity: number | null;
  room: string | null;
  classTeacher: { id: string; name: string } | null;
  studentCount: number;
}

export const listSectionsQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

// ---------------------------------------------------------------- subjects

export const subjectTypeSchema = z.enum(['CORE', 'ELECTIVE', 'CO_SCHOLASTIC']);

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,12}$/, 'Use up to 12 letters or digits'),
  type: subjectTypeSchema.default('CORE'),
});
export const bulkCreateSubjectsSchema = z.object({ subjects: z.array(createSubjectSchema).min(1).max(40) });
export const updateSubjectSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  type: subjectTypeSchema.optional(),
  isActive: z.boolean().optional(),
});

export interface SubjectItem {
  id: string;
  name: string;
  code: string;
  type: z.infer<typeof subjectTypeSchema>;
  isActive: boolean;
}

/** Replace the subject list of one or more classes for a year. */
export const setClassSubjectsSchema = z.object({
  academicYearId: uuidSchema,
  classIds: z.array(uuidSchema).min(1).max(30),
  subjectIds: z.array(uuidSchema).max(40),
  optionalSubjectIds: z.array(uuidSchema).max(40).default([]),
});

export interface ClassSubjectItem {
  classId: string;
  subjectId: string;
  isOptional: boolean;
}

// ---------------------------------------------------------------- teaching assignments

export const createAssignmentSchema = z.object({
  sectionId: uuidSchema,
  subjectId: uuidSchema,
  teacherId: uuidSchema,
});
export const listAssignmentsQuerySchema = z.object({
  academicYearId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  teacherId: uuidSchema.optional(),
});

export interface AssignmentItem {
  id: string;
  section: { id: string; name: string; className: string };
  subject: { id: string; name: string; code: string };
  teacher: { id: string; name: string };
}
