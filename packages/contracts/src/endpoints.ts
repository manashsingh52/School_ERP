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
import { requestUploadSchema } from './files.js';
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

  'POST /v1/files/upload-url': { summary: 'Get a signed upload link', tag: 'Files', access: 'school', body: requestUploadSchema },
  'POST /v1/files/:id/complete': { summary: 'Verify an uploaded file', tag: 'Files', access: 'school' },
  'GET /v1/files/:id/download-url': { summary: 'Get a short-lived download link', tag: 'Files', access: 'school' },
  'PUT /v1/files/local/:token': { summary: 'Development storage upload (signed token)', tag: 'Files', access: 'public' },
  'GET /v1/files/local/:token': { summary: 'Development storage download (signed token)', tag: 'Files', access: 'public' },
};
