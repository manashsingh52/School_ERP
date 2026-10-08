import { z } from 'zod';
import { uuidSchema } from './common.js';

export const importEntitySchema = z.enum(['STUDENTS', 'TEACHERS', 'CLASSES', 'SUBJECTS', 'FEE_ASSIGNMENTS']);
export type ImportEntity = z.infer<typeof importEntitySchema>;

export interface ImportField {
  key: string;
  label: string;
  /** Spreadsheet headers that auto-map to this field (compared ignoring case, spaces and punctuation). */
  aliases: string[];
  example: string;
  required?: boolean;
}

/**
 * Fields each import understands (docs/08 W10). Either first/last name OR full name; either
 * class + section OR a combined "8-A" column.
 */
export const IMPORT_FIELDS: Record<ImportEntity, ImportField[]> = {
  STUDENTS: [
    { key: 'admissionNo', label: 'Admission number', aliases: ['admission no', 'admission number', 'adm no', 'admno', 'scholar no', 'sr no', 'registration no', 'reg no', 'enrollment no'], example: '1042', required: true },
    { key: 'fullName', label: 'Student name (full)', aliases: ['student name', 'name', 'full name', 'name of student', 'student'], example: 'Rahul Kumar' },
    { key: 'firstName', label: 'First name', aliases: ['first name', 'firstname', 'given name'], example: 'Rahul' },
    { key: 'lastName', label: 'Last name', aliases: ['last name', 'surname', 'lastname', 'family name'], example: 'Kumar' },
    { key: 'classSection', label: 'Class & section (8-A)', aliases: ['class section', 'class sec', 'class and section', 'class & section', 'class/section', 'std div'], example: '8-A' },
    { key: 'class', label: 'Class', aliases: ['class', 'grade', 'std', 'standard'], example: '8' },
    { key: 'section', label: 'Section', aliases: ['section', 'sec', 'division', 'div'], example: 'A' },
    { key: 'rollNo', label: 'Roll number', aliases: ['roll no', 'roll number', 'roll'], example: '21' },
    { key: 'dateOfBirth', label: 'Date of birth', aliases: ['dob', 'date of birth', 'birth date', 'birthdate', 'd o b'], example: '14/03/2013' },
    { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'], example: 'M' },
    { key: 'admissionDate', label: 'Admission date', aliases: ['admission date', 'date of admission', 'doa', 'joining date'], example: '01/04/2026' },
    { key: 'bloodGroup', label: 'Blood group', aliases: ['blood group', 'blood'], example: 'B+' },
    { key: 'studentPhone', label: 'Student phone', aliases: ['student phone', 'student mobile', 'mobile', 'phone'], example: '' },
    { key: 'email', label: 'Student email', aliases: ['email', 'student email', 'e mail'], example: '' },
    { key: 'address', label: 'Address', aliases: ['address', 'residential address', 'address line 1'], example: '12 MG Road' },
    { key: 'city', label: 'City', aliases: ['city', 'town'], example: 'Pune' },
    { key: 'state', label: 'State', aliases: ['state'], example: 'Maharashtra' },
    { key: 'postalCode', label: 'PIN code', aliases: ['pin', 'pin code', 'pincode', 'postal code', 'zip'], example: '411001' },
    { key: 'fatherName', label: "Father's name", aliases: ['father name', 'fathers name', 'father'], example: 'Raj Kumar' },
    { key: 'fatherPhone', label: "Father's phone", aliases: ['father phone', 'father mobile', 'fathers phone', 'fathers mobile', 'father contact', 'father mobile no'], example: '9876543210' },
    { key: 'motherName', label: "Mother's name", aliases: ['mother name', 'mothers name', 'mother'], example: 'Meera Kumar' },
    { key: 'motherPhone', label: "Mother's phone", aliases: ['mother phone', 'mother mobile', 'mothers phone', 'mothers mobile', 'mother contact', 'mother mobile no'], example: '9876543211' },
    { key: 'guardianName', label: 'Guardian name', aliases: ['guardian name', 'guardian', 'parent name'], example: '' },
    { key: 'guardianPhone', label: 'Guardian phone', aliases: ['guardian phone', 'guardian mobile', 'parent phone', 'parent mobile', 'contact no', 'contact number', 'whatsapp no'], example: '' },
    { key: 'guardianEmail', label: 'Parent email', aliases: ['parent email', 'guardian email', 'father email', 'mother email'], example: '' },
  ],
  TEACHERS: [
    { key: 'employeeId', label: 'Employee ID', aliases: ['employee id', 'emp id', 'empid', 'employee code', 'staff id', 'staff code', 'emp code'], example: 'EMP-001', required: true },
    { key: 'fullName', label: 'Name (full)', aliases: ['name', 'teacher name', 'full name', 'staff name'], example: 'Priya Sharma' },
    { key: 'firstName', label: 'First name', aliases: ['first name', 'firstname'], example: 'Priya' },
    { key: 'lastName', label: 'Last name', aliases: ['last name', 'surname', 'lastname'], example: 'Sharma' },
    { key: 'phone', label: 'Mobile', aliases: ['phone', 'mobile', 'mobile no', 'contact', 'contact no', 'phone number'], example: '9876543210', required: true },
    { key: 'email', label: 'Email', aliases: ['email', 'e mail', 'email id'], example: 'priya@school.in' },
    { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'], example: 'F' },
    { key: 'dateOfBirth', label: 'Date of birth', aliases: ['dob', 'date of birth'], example: '' },
    { key: 'department', label: 'Department', aliases: ['department', 'dept', 'subject'], example: 'Mathematics' },
    { key: 'designation', label: 'Designation', aliases: ['designation', 'post', 'role'], example: 'TGT' },
    { key: 'qualification', label: 'Qualification', aliases: ['qualification', 'qualifications', 'degree'], example: 'M.Sc, B.Ed' },
    { key: 'joiningDate', label: 'Joining date', aliases: ['joining date', 'date of joining', 'doj'], example: '01/06/2019' },
  ],
  CLASSES: [
    { key: 'className', label: 'Class', aliases: ['class', 'class name', 'grade', 'std', 'standard'], example: 'Class 8', required: true },
    { key: 'sections', label: 'Sections (A, B, C)', aliases: ['sections', 'section', 'sections names', 'divisions', 'division', 'div'], example: 'A, B, C', required: true },
    { key: 'capacity', label: 'Seats per section', aliases: ['capacity', 'seats', 'strength', 'max students'], example: '40' },
    { key: 'displayOrder', label: 'Order', aliases: ['order', 'sequence', 'sort order', 'display order', 'sno', 's no'], example: '10' },
  ],
  SUBJECTS: [
    { key: 'name', label: 'Subject', aliases: ['subject', 'subject name', 'name'], example: 'Mathematics', required: true },
    { key: 'code', label: 'Code', aliases: ['code', 'subject code', 'short name'], example: 'MATH' },
    { key: 'type', label: 'Type (core / elective / co-scholastic)', aliases: ['type', 'subject type', 'category'], example: 'Core' },
    { key: 'classes', label: 'Taught in classes (1-5, 8 or All)', aliases: ['classes', 'class', 'taught in', 'for classes', 'grades'], example: '6-10' },
  ],
  FEE_ASSIGNMENTS: [
    { key: 'admissionNo', label: 'Admission number', aliases: ['admission no', 'admission number', 'adm no', 'admno', 'scholar no', 'sr no'], example: '1042', required: true },
    { key: 'optionalFees', label: 'Optional fees taken (Transport, Lab)', aliases: ['optional fees', 'opted fees', 'fees', 'optional', 'add ons', 'addons', 'services'], example: 'Transport', required: true },
  ],
};

export const importProblemsQuerySchema = z.object({ format: z.enum(['csv', 'xlsx']).default('csv') });

export const createImportSchema = z.object({
  entity: importEntitySchema,
  fileId: uuidSchema,
});

export const setImportMappingSchema = z.object({
  /** Spreadsheet column → field key, or "" to ignore the column. */
  mapping: z.record(z.string(), z.string()),
  /** Students: invite parents to log in. Teachers: invite teachers to log in. */
  inviteLogins: z.boolean().default(true),
});

export const listImportRowsQuerySchema = z.object({
  status: z.enum(['VALID', 'INVALID', 'DUPLICATE', 'IMPORTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export interface ImportStats {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  failed: number;
}

export interface ImportJobItem {
  id: string;
  entity: ImportEntity;
  status: 'MAPPING' | 'VALIDATING' | 'VALIDATED' | 'IMPORTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UPLOADED';
  fileName: string;
  detectedColumns: string[];
  mapping: Record<string, string>;
  /** Field keys that must be mapped before validating. */
  missingRequired: string[];
  stats: ImportStats | null;
  sample: Record<string, string>[];
  createdAt: string;
  completedAt: string | null;
}

export interface ImportRowItem {
  rowNumber: number;
  status: 'PENDING' | 'VALID' | 'INVALID' | 'DUPLICATE' | 'IMPORTED' | 'SKIPPED';
  summary: string;
  errors: { field?: string; message: string }[];
  entityId: string | null;
}
