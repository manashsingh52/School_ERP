import { z } from 'zod';
import type { Permission, PermissionScope } from '@schoolos/permissions';
import { identifierSchema, phoneSchema, uuidSchema } from './common.js';

export const clientPlatformSchema = z.enum(['WEB', 'ANDROID', 'IOS']);
export type ClientPlatform = z.infer<typeof clientPlatformSchema>;

const deviceFields = {
  platform: clientPlatformSchema.default('WEB'),
  deviceName: z.string().trim().max(100).optional(),
};

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

export const loginRequestSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'Enter your password').max(128),
  /** When logging in on a school subdomain, the session is opened directly for that school. */
  schoolSlug: z.string().trim().toLowerCase().max(40).optional(),
  ...deviceFields,
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const otpPurposeSchema = z.enum(['LOGIN', 'RESET_PASSWORD', 'ACTIVATE_ACCOUNT']);

export const otpSendRequestSchema = z.object({
  phone: phoneSchema,
  purpose: otpPurposeSchema.default('LOGIN'),
});
export type OtpSendRequest = z.input<typeof otpSendRequestSchema>;

export const otpVerifyRequestSchema = z.object({
  challengeId: uuidSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  schoolSlug: z.string().trim().toLowerCase().max(40).optional(),
  ...deviceFields,
});
export type OtpVerifyRequest = z.input<typeof otpVerifyRequestSchema>;

export const passwordResetRequestSchema = z.object({
  challengeId: uuidSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: passwordSchema,
});
export type PasswordResetRequest = z.input<typeof passwordResetRequestSchema>;

/** Codes from the school office: 8 letters/digits, typed with or without the dash. */
export const schoolCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[A-Z0-9]{8}$/, 'Enter the 8-character code from your school'));

/**
 * Sign in with a code the school office handed over (no SMS needed): first sign-in for an
 * invited parent or teacher, or a forgotten password. Sets the password and opens a session.
 */
export const schoolCodeRedeemSchema = z.object({
  identifier: identifierSchema,
  code: schoolCodeSchema,
  newPassword: passwordSchema,
  schoolSlug: z.string().trim().toLowerCase().max(40).optional(),
  ...deviceFields,
});
export type SchoolCodeRedeemRequest = z.input<typeof schoolCodeRedeemSchema>;

export interface SchoolSignInCode {
  /** Shown once, formatted "ABCD-EFGH". */
  code: string;
  expiresAt: string;
  /** The phone or email to sign in with. */
  signInWith: string;
}

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshRequest = z.input<typeof refreshRequestSchema>;

export const selectSchoolRequestSchema = z.object({
  membershipId: uuidSchema,
});
export type SelectSchoolRequest = z.input<typeof selectSchoolRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;

export interface MembershipSummary {
  membershipId: string;
  school: { id: string; slug: string; name: string; logoUrl: string | null; accentColor: string };
  roles: { key: string; name: string }[];
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/**
 * Login result. If the user has exactly one school (or logged in on a school subdomain) the
 * session is already scoped to it (`activeMembershipId` set). Otherwise the client shows a
 * school picker and calls /auth/select-school.
 */
export interface AuthResponse {
  user: { id: string; name: string; phone: string | null; email: string | null };
  memberships: MembershipSummary[];
  activeMembershipId: string | null;
  isPlatformAdmin: boolean;
  tokens: TokenPair;
}

export interface OtpSendResponse {
  challengeId: string;
  expiresAt: string;
  /** Seconds before another code can be requested. */
  resendAfter: number;
}

export interface MeResponse {
  user: { id: string; name: string; phone: string | null; email: string | null };
  membership:
    | (MembershipSummary & {
        permissions: Partial<Record<Permission, PermissionScope>>;
        /** Set when this member is a teacher (for "my timetable", "my classes"). */
        teacherId: string | null;
        /** Set for parents: their children in this school (child switcher). */
        children: { id: string; name: string; firstName: string; classLabel: string | null; sectionId: string | null }[];
      })
    | null;
  memberships: MembershipSummary[];
  platformRole: 'SUPER_ADMIN' | 'SUPPORT' | null;
}

export interface SessionSummary {
  id: string;
  platform: ClientPlatform;
  deviceName: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface PublicSchoolBranding {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  accentColor: string;
  status: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  /** False when codes by SMS aren't set up: the login page offers only password and school codes. */
  otpLogin: boolean;
}

// ---------------------------------------------------------------- mobile app (docs/01 §7)

export interface AppConfig {
  /** Versions below this must update (forced-update gate). */
  minVersion: string;
  latestVersion: string;
  storeUrls: { android: string | null; ios: string | null };
  /** For "pay online": which checkout to show (mock = sandbox screen in the app). */
  paymentsDriver: 'razorpay' | 'mock';
  /** False when codes by SMS aren't set up: sign in with a password or a code from the school. */
  otpLogin: boolean;
}

export const registerDeviceSchema = z.object({
  /** FCM registration token. */
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(['ANDROID', 'IOS']),
});
