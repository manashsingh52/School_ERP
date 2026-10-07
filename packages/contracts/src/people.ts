import { z } from 'zod';
import { PERMISSION_SCOPES, type Permission, type PermissionScope } from '@schoolos/permissions';
import { emailSchema, pageQuerySchema, phoneSchema, uuidSchema } from './common.js';

const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });
const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);
const optText = (max: number) => z.string().trim().max(max).optional();

export type LoginStatus = 'NONE' | 'INVITED' | 'ACTIVE' | 'SUSPENDED';

// ---------------------------------------------------------------- teachers

export const teacherStatusSchema = z.enum(['ACTIVE', 'ON_LEAVE', 'LEFT']);

export const createTeacherSchema = z.object({
  employeeId: z.string().trim().min(1, 'Employee ID is required').max(30),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: optText(80),
  gender: genderSchema.optional(),
  dateOfBirth: dateOnly.optional(),
  phone: phoneSchema,
  email: emailSchema.optional(),
  department: optText(60),
  designation: optText(60),
  qualification: optText(120),
  joiningDate: dateOnly.optional(),
  /** Create a login (Teacher role). They activate it by signing in with a one-time code. */
  inviteToLogin: z.boolean().default(true),
});
export type CreateTeacherRequest = z.input<typeof createTeacherSchema>;

export const updateTeacherSchema = createTeacherSchema
  .omit({ inviteToLogin: true })
  .partial()
  .extend({ status: teacherStatusSchema.optional(), photoFileId: uuidSchema.nullable().optional() });

export const listTeachersQuerySchema = pageQuerySchema.extend({ status: teacherStatusSchema.optional() });

export interface TeacherListItem {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string | null;
  department: string | null;
  designation: string | null;
  status: z.infer<typeof teacherStatusSchema>;
  login: LoginStatus;
  classTeacherOf: string[]; // "8-A"
}

export interface TeacherDetail extends TeacherListItem {
  gender: z.infer<typeof genderSchema> | null;
  dateOfBirth: string | null;
  phone: string;
  email: string | null;
  qualification: string | null;
  joiningDate: string | null;
  photoUrl: string | null;
  assignments: { id: string; className: string; sectionName: string; subjectName: string }[];
}

// ---------------------------------------------------------------- guardians (parents)

export const guardianRelationSchema = z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'OTHER']);

export const createGuardianSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: phoneSchema,
  email: emailSchema.optional(),
  occupation: optText(80),
  addressLine1: optText(200),
  city: optText(80),
  inviteToLogin: z.boolean().default(true),
});
export const updateGuardianSchema = createGuardianSchema.omit({ inviteToLogin: true }).partial();
export const listGuardiansQuerySchema = pageQuerySchema;

export const linkChildSchema = z.object({
  studentId: uuidSchema,
  relation: guardianRelationSchema,
  isPrimary: z.boolean().default(false),
});

export interface GuardianChild {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string | null;
  sectionName: string | null;
  relation: z.infer<typeof guardianRelationSchema>;
  isPrimary: boolean;
}

export interface GuardianItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  occupation: string | null;
  login: LoginStatus;
  children: GuardianChild[];
}

/** Guardian details inline on the student form (matched by phone within the school). */
export const studentGuardianInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: phoneSchema,
  email: emailSchema.optional(),
  relation: guardianRelationSchema,
  isPrimary: z.boolean().default(false),
});

// ---------------------------------------------------------------- members & roles

export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']);

export const inviteMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    roleIds: z.array(uuidSchema).min(1, 'Choose at least one role').max(10),
  })
  .refine((v) => v.phone || v.email, { path: ['phone'], message: 'Enter a phone number or email' });

export const updateMemberSchema = z.object({
  roleIds: z.array(uuidSchema).min(1, 'Choose at least one role').max(10).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const listMembersQuerySchema = pageQuerySchema.extend({
  roleId: uuidSchema.optional(),
  status: membershipStatusSchema.optional(),
});

export interface MemberItem {
  id: string; // membership id
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: z.infer<typeof membershipStatusSchema> | 'REMOVED';
  roles: { id: string; key: string; name: string }[];
  lastActiveAt: string | null;
  joinedAt: string | null;
}

const scopeSchema = z.enum(PERMISSION_SCOPES);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: optText(200),
  copyFromRoleId: uuidSchema.optional(),
});
export const updateRoleSchema = z.object({ name: z.string().trim().min(2).max(60).optional(), description: optText(200) });
export const setRolePermissionsSchema = z.object({
  permissions: z.array(z.object({ permission: z.string().min(3).max(60), scope: scopeSchema })).max(200),
  /** Must be true to give a role ALL-scope access to student records it didn't have (docs/04 §5). */
  confirmBroaden: z.boolean().default(false),
});

export interface RoleItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: { permission: Permission; scope: PermissionScope }[];
}

// ---------------------------------------------------------------- search

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });

export interface SearchResults {
  students: { id: string; name: string; admissionNo: string; className: string | null; sectionName: string | null }[];
  teachers: { id: string; name: string; employeeId: string; department: string | null }[];
  guardians: { id: string; name: string; phone: string | null; childCount: number }[];
}
