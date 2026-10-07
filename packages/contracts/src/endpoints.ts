import type { ZodType } from 'zod';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  otpSendRequestSchema,
  otpVerifyRequestSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  selectSchoolRequestSchema,
} from './auth.js';
import {
  bulkCreateClassesSchema,
  bulkCreateSectionsSchema,
  bulkCreateSubjectsSchema,
  createAcademicYearSchema,
  createAssignmentSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  listAssignmentsQuerySchema,
  listSectionsQuerySchema,
  setClassSubjectsSchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateSectionSchema,
  updateSubjectSchema,
} from './academics.js';
import { requestUploadSchema } from './files.js';
import { createImportSchema, listImportRowsQuerySchema, setImportMappingSchema } from './imports.js';
import {
  createGuardianSchema,
  createRoleSchema,
  createTeacherSchema,
  inviteMemberSchema,
  linkChildSchema,
  listGuardiansQuerySchema,
  listMembersQuerySchema,
  listTeachersQuerySchema,
  searchQuerySchema,
  setRolePermissionsSchema,
  updateGuardianSchema,
  updateMemberSchema,
  updateRoleSchema,
  updateTeacherSchema,
} from './people.js';
import { createStudentSchema, listStudentsQuerySchema, updateStudentSchema } from './students.js';

export interface EndpointDef {
  summary: string;
  tag: string;
  access: 'public' | 'authenticated' | 'school' | `permission:${string}`;
  body?: ZodType;
  query?: ZodType;
  /** Send an Idempotency-Key header (docs/05 §4). */
  idempotent?: boolean;
}

/**
 * Every API route, keyed "METHOD /v1/path". Source for openapi.json (→ Flutter client).
 * An API test fails if a route exists without an entry here.
 */
export const ENDPOINTS: Record<string, EndpointDef> = {
  'GET /health': { summary: 'Liveness check', tag: 'System', access: 'public' },

  'POST /v1/auth/login': { summary: 'Sign in with phone/email and password', tag: 'Auth', access: 'public', body: loginRequestSchema },
  'POST /v1/auth/otp/send': { summary: 'Send a one-time code', tag: 'Auth', access: 'public', body: otpSendRequestSchema },
  'POST /v1/auth/otp/verify': { summary: 'Sign in with a one-time code', tag: 'Auth', access: 'public', body: otpVerifyRequestSchema },
  'POST /v1/auth/password/reset': { summary: 'Set a new password with a one-time code', tag: 'Auth', access: 'public', body: passwordResetRequestSchema },
  'POST /v1/auth/refresh': { summary: 'Rotate the refresh token', tag: 'Auth', access: 'public', body: refreshRequestSchema },
  'POST /v1/auth/select-school': { summary: 'Scope the session to one school', tag: 'Auth', access: 'authenticated', body: selectSchoolRequestSchema },
  'POST /v1/auth/logout': { summary: 'Sign out this device', tag: 'Auth', access: 'authenticated' },

  'GET /v1/me': { summary: 'Current user, school, permissions', tag: 'Me', access: 'authenticated' },
  'GET /v1/me/sessions': { summary: 'Signed-in devices', tag: 'Me', access: 'authenticated' },
  'DELETE /v1/me/sessions/:id': { summary: 'Sign out a device', tag: 'Me', access: 'authenticated' },
  'PATCH /v1/me/password': { summary: 'Change password', tag: 'Me', access: 'authenticated', body: changePasswordRequestSchema },

  'GET /v1/public/schools/:slug': { summary: 'School branding for the login page', tag: 'Public', access: 'public' },

  'GET /v1/students': { summary: 'List students', tag: 'Students', access: 'permission:student.view', query: listStudentsQuerySchema },
  'GET /v1/students/:id': { summary: 'Student profile', tag: 'Students', access: 'permission:student.view' },
  'POST /v1/students': { summary: 'Add a student', tag: 'Students', access: 'permission:student.create', body: createStudentSchema, idempotent: true },
  'PATCH /v1/students/:id': { summary: 'Edit a student', tag: 'Students', access: 'permission:student.edit', body: updateStudentSchema },

  'GET /v1/academic-years': { summary: 'List academic years', tag: 'Academics', access: 'permission:academic.view' },
  'POST /v1/academic-years': { summary: 'Create an academic year', tag: 'Academics', access: 'permission:academic.manage', body: createAcademicYearSchema },
  'PATCH /v1/academic-years/:id': { summary: 'Edit an academic year', tag: 'Academics', access: 'permission:academic.manage', body: updateAcademicYearSchema },
  'POST /v1/academic-years/:id/activate': { summary: 'Make the current academic year', tag: 'Academics', access: 'permission:academic.manage' },
  'POST /v1/academic-years/:id/close': { summary: 'Close an academic year', tag: 'Academics', access: 'permission:academic.manage' },
  'GET /v1/classes': { summary: 'Classes with their sections for a year', tag: 'Academics', access: 'permission:academic.view', query: listSectionsQuerySchema },
  'POST /v1/classes': { summary: 'Add a class', tag: 'Academics', access: 'permission:academic.manage', body: createClassSchema },
  'POST /v1/classes/bulk': { summary: 'Add several classes', tag: 'Academics', access: 'permission:academic.manage', body: bulkCreateClassesSchema },
  'PATCH /v1/classes/:id': { summary: 'Edit a class', tag: 'Academics', access: 'permission:academic.manage', body: updateClassSchema },
  'DELETE /v1/classes/:id': { summary: 'Delete an unused class', tag: 'Academics', access: 'permission:academic.manage' },
  'POST /v1/sections': { summary: 'Add a section', tag: 'Academics', access: 'permission:academic.manage', body: createSectionSchema },
  'POST /v1/sections/bulk': { summary: 'Add sections to several classes', tag: 'Academics', access: 'permission:academic.manage', body: bulkCreateSectionsSchema },
  'PATCH /v1/sections/:id': { summary: 'Edit a section (incl. class teacher)', tag: 'Academics', access: 'permission:academic.manage', body: updateSectionSchema },
  'DELETE /v1/sections/:id': { summary: 'Delete an unused section', tag: 'Academics', access: 'permission:academic.manage' },
  'GET /v1/subjects': { summary: 'List subjects', tag: 'Academics', access: 'permission:academic.view' },
  'POST /v1/subjects': { summary: 'Add a subject', tag: 'Academics', access: 'permission:academic.manage', body: createSubjectSchema },
  'POST /v1/subjects/bulk': { summary: 'Add several subjects', tag: 'Academics', access: 'permission:academic.manage', body: bulkCreateSubjectsSchema },
  'PATCH /v1/subjects/:id': { summary: 'Edit a subject', tag: 'Academics', access: 'permission:academic.manage', body: updateSubjectSchema },
  'GET /v1/class-subjects': { summary: 'Subjects each class studies', tag: 'Academics', access: 'permission:academic.view', query: listSectionsQuerySchema },
  'PUT /v1/class-subjects': { summary: 'Set subjects for classes', tag: 'Academics', access: 'permission:academic.manage', body: setClassSubjectsSchema },
  'GET /v1/teaching-assignments': { summary: 'Who teaches what', tag: 'Academics', access: 'permission:academic.view', query: listAssignmentsQuerySchema },
  'POST /v1/teaching-assignments': { summary: 'Assign a teacher', tag: 'Academics', access: 'permission:academic.manage', body: createAssignmentSchema },
  'DELETE /v1/teaching-assignments/:id': { summary: 'Remove an assignment', tag: 'Academics', access: 'permission:academic.manage' },

  'GET /v1/teachers': { summary: 'List teachers', tag: 'Teachers', access: 'permission:teacher.view', query: listTeachersQuerySchema },
  'GET /v1/teachers/:id': { summary: 'Teacher profile', tag: 'Teachers', access: 'permission:teacher.view' },
  'POST /v1/teachers': { summary: 'Add a teacher (optionally invite to log in)', tag: 'Teachers', access: 'permission:teacher.manage', body: createTeacherSchema, idempotent: true },
  'PATCH /v1/teachers/:id': { summary: 'Edit a teacher', tag: 'Teachers', access: 'permission:teacher.manage', body: updateTeacherSchema },
  'POST /v1/teachers/:id/invite': { summary: 'Create a login for a teacher', tag: 'Teachers', access: 'permission:teacher.manage' },

  'GET /v1/guardians': { summary: 'List parents/guardians', tag: 'Parents', access: 'permission:guardian.view', query: listGuardiansQuerySchema },
  'GET /v1/guardians/:id': { summary: 'Parent profile with children', tag: 'Parents', access: 'permission:guardian.view' },
  'POST /v1/guardians': { summary: 'Add a parent', tag: 'Parents', access: 'permission:guardian.manage', body: createGuardianSchema },
  'PATCH /v1/guardians/:id': { summary: 'Edit a parent', tag: 'Parents', access: 'permission:guardian.manage', body: updateGuardianSchema },
  'POST /v1/guardians/:id/children': { summary: 'Link a child', tag: 'Parents', access: 'permission:guardian.manage', body: linkChildSchema },
  'DELETE /v1/guardians/:id/children/:studentId': { summary: 'Unlink a child', tag: 'Parents', access: 'permission:guardian.manage' },
  'POST /v1/guardians/:id/invite': { summary: 'Create a login for a parent', tag: 'Parents', access: 'permission:guardian.manage' },

  'GET /v1/members': { summary: 'People with access to this school', tag: 'Users', access: 'permission:user.view', query: listMembersQuerySchema },
  'POST /v1/members': { summary: 'Invite someone', tag: 'Users', access: 'permission:user.manage', body: inviteMemberSchema },
  'PATCH /v1/members/:id': { summary: 'Change roles or suspend', tag: 'Users', access: 'permission:user.manage', body: updateMemberSchema },
  'GET /v1/roles': { summary: 'Roles and their permissions', tag: 'Users', access: 'permission:user.view' },
  'POST /v1/roles': { summary: 'Create a custom role', tag: 'Users', access: 'permission:role.manage', body: createRoleSchema },
  'PATCH /v1/roles/:id': { summary: 'Rename a role', tag: 'Users', access: 'permission:role.manage', body: updateRoleSchema },
  'PUT /v1/roles/:id/permissions': { summary: 'Set role permissions', tag: 'Users', access: 'permission:role.manage', body: setRolePermissionsSchema },
  'DELETE /v1/roles/:id': { summary: 'Delete an unused custom role', tag: 'Users', access: 'permission:role.manage' },
  'GET /v1/permissions': { summary: 'Permission catalog', tag: 'Users', access: 'permission:user.view' },

  'GET /v1/imports': { summary: 'Recent imports', tag: 'Imports', access: 'permission:import.run' },
  'POST /v1/imports': { summary: 'Start an import from an uploaded file', tag: 'Imports', access: 'permission:import.run', body: createImportSchema },
  'GET /v1/imports/templates/:entity': { summary: 'Download an Excel template', tag: 'Imports', access: 'permission:import.run' },
  'GET /v1/imports/:id': { summary: 'Import status, mapping and stats', tag: 'Imports', access: 'permission:import.run' },
  'PUT /v1/imports/:id/mapping': { summary: 'Map columns and validate every row', tag: 'Imports', access: 'permission:import.run', body: setImportMappingSchema },
  'GET /v1/imports/:id/rows': { summary: 'Rows with status and problems', tag: 'Imports', access: 'permission:import.run', query: listImportRowsQuerySchema },
  'POST /v1/imports/:id/commit': { summary: 'Import the valid rows (background job)', tag: 'Imports', access: 'permission:import.run', idempotent: true },
  'GET /v1/imports/:id/problems': { summary: 'CSV of rows that need fixing', tag: 'Imports', access: 'permission:import.run' },

  'GET /v1/search': { summary: 'Search students, teachers and parents', tag: 'Search', access: 'school', query: searchQuerySchema },

  'POST /v1/files/upload-url': { summary: 'Get a signed upload link', tag: 'Files', access: 'school', body: requestUploadSchema },
  'POST /v1/files/:id/complete': { summary: 'Verify an uploaded file', tag: 'Files', access: 'school' },
  'GET /v1/files/:id/download-url': { summary: 'Get a short-lived download link', tag: 'Files', access: 'school' },
  'PUT /v1/files/local/:token': { summary: 'Development storage upload (signed token)', tag: 'Files', access: 'public' },
  'GET /v1/files/local/:token': { summary: 'Development storage download (signed token)', tag: 'Files', access: 'public' },
};
