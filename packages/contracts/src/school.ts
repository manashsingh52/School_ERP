import { z } from 'zod';
import { contactPhoneSchema, emailSchema, uuidSchema } from './common.js';

const optText = (max: number) => z.string().trim().max(max).optional();

// ---------------------------------------------------------------- profile & branding

export const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB', 'CAMBRIDGE', 'OTHER'] as const;

export const updateSchoolProfileSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  legalName: optText(160),
  board: z.enum(BOARDS).optional(),
  phone: contactPhoneSchema.optional(),
  email: emailSchema.optional(),
  website: z.url({ message: 'Enter a full web address (https://…)' }).max(200).optional(),
  addressLine1: optText(200),
  addressLine2: optText(200),
  city: optText(80),
  state: optText(80),
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Use a 6-digit PIN code').optional(),
  timezone: z.enum(['Asia/Kolkata']).optional(),
});
export type UpdateSchoolProfileRequest = z.input<typeof updateSchoolProfileSchema>;

export const updateBrandingSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #2F6FEB')
    .transform((v) => v.toUpperCase())
    .optional(),
  logoFileId: uuidSchema.nullable().optional(),
});

export interface SchoolProfile {
  id: string;
  slug: string;
  code: string;
  name: string;
  legalName: string | null;
  board: string | null;
  status: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  timezone: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null };
  accentColor: string;
  logoUrl: string | null;
  currentAcademicYear: { id: string; name: string } | null;
  onboardingStep: number;
  wentLiveAt: string | null;
}

// ---------------------------------------------------------------- onboarding

export const ONBOARDING_STEPS = [
  { step: 1, key: 'school', label: 'School information' },
  { step: 2, key: 'year', label: 'Academic year' },
  { step: 3, key: 'classes', label: 'Classes' },
  { step: 4, key: 'sections', label: 'Sections' },
  { step: 5, key: 'subjects', label: 'Subjects' },
  { step: 6, key: 'teachers', label: 'Teachers' },
  { step: 7, key: 'students', label: 'Students' },
  { step: 8, key: 'fees', label: 'Fee structure' },
  { step: 9, key: 'notifications', label: 'Notifications' },
  { step: 10, key: 'live', label: 'Go live' },
] as const;

export const setOnboardingStepSchema = z.object({ step: z.number().int().min(1).max(10) });

export interface OnboardingCheck {
  key: string;
  label: string;
  done: boolean;
  /** Required to go live (others are recommended). */
  required: boolean;
  detail: string;
}

export interface OnboardingState {
  step: number;
  status: SchoolProfile['status'];
  checklist: OnboardingCheck[];
  canGoLive: boolean;
}

// ---------------------------------------------------------------- promotion (year end)

export const promotionPreviewSchema = z.object({ fromYearId: uuidSchema, toYearId: uuidSchema });

export const promotionCommitSchema = promotionPreviewSchema.extend({
  /** Where each section's students go. toSectionId null = graduate (leave the school as alumni). */
  moves: z.array(z.object({ fromSectionId: uuidSchema, toSectionId: uuidSchema.nullable() })).min(1).max(200),
  /** Repeat the same class next year (placed in that class's same-named section). */
  detainedStudentIds: z.array(uuidSchema).max(2000).default([]),
});

export interface PromotionSectionOption {
  id: string;
  label: string; // "9-A"
  classOrder: number;
}

export interface PromotionPlanRow {
  fromSection: { id: string; label: string; studentCount: number };
  suggestedToSectionId: string | null; // null = graduate
  alreadyPromoted: number;
}

export interface PromotionPlan {
  from: { id: string; name: string };
  to: { id: string; name: string };
  rows: PromotionPlanRow[];
  toSections: PromotionSectionOption[];
}

export interface PromotionResult {
  promoted: number;
  detained: number;
  graduated: number;
  skipped: number;
}

// ---------------------------------------------------------------- settings sections (docs/12 Phase 6)

const note = (max: number) => z.string().trim().max(max).nullable().default(null);

export const generalSettingsSchema = z.object({
  principalName: z.string().trim().max(100).nullable().default(null),
  /** Printed under the school name on report cards and receipts, e.g. "Affiliated to CBSE · No. 1130xxx". */
  affiliation: note(120),
  /** 1 = Monday … 7 = Sunday. */
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5, 6]),
});

export const feeSettingsSchema = z.object({
  /** Days before the due date that parents get a reminder. */
  reminderDaysBefore: z.array(z.number().int().min(1).max(30)).max(3).default([7, 1]),
  overdueReminderEveryDays: z.number().int().min(1).max(30).default(7),
  maxOverdueReminders: z.number().int().min(0).max(12).default(4),
  receiptNote: note(200),
});

export const reportCardLayoutSchema = z.enum(['classic', 'modern', 'compact']);
export type ReportCardLayout = z.infer<typeof reportCardLayoutSchema>;

export const examSettingsSchema = z.object({
  /** classic = bordered boxes; modern = coloured header band, airy; compact = smaller type, fits more. */
  reportCardLayout: reportCardLayoutSchema.default('classic'),
  /** Heading on the card, e.g. "Progress report". null = "Report card". */
  reportCardTitle: note(40),
  /** What the card shows. */
  reportCardShow: z
    .object({ photo: z.boolean().default(true), passMarks: z.boolean().default(true), rank: z.boolean().default(true), gradingKey: z.boolean().default(true), remarks: z.boolean().default(true), parentSignature: z.boolean().default(true) })
    .default({ photo: true, passMarks: true, rank: true, gradingKey: true, remarks: true, parentSignature: true }),
  showAttendanceOnReportCard: z.boolean().default(true),
  reportCardNote: note(300),
  /** Grades teachers may give in co-scholastic areas (best first). */
  coScholasticGrades: z.array(z.string().trim().min(1).max(4)).min(2).max(6).default(['A', 'B', 'C']),
});

export const brandingSettingsSchema = z.object({
  /** Principal's signature image (purpose "signature"), printed on report cards and receipts. */
  signatureFileId: z.uuid().nullable().default(null),
  showLogoOnReceipts: z.boolean().default(true),
});

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 21:00');

export const notificationSettingsSchema = z.object({
  /** App pushes and SMS wait until the morning. The in-app inbox and email are never held back. */
  quietHours: z
    .object({ enabled: z.boolean().default(true), start: clock.default('21:00'), end: clock.default('07:00') })
    .default({ enabled: true, start: '21:00', end: '07:00' }),
  /** Most SMS the school sends in one day, within the plan's monthly allowance. null = no daily limit. */
  dailySmsLimit: z.number().int().min(1).max(100_000).nullable().default(null),
});

export const SETTINGS_SECTIONS = { general: generalSettingsSchema, fees: feeSettingsSchema, examinations: examSettingsSchema, branding: brandingSettingsSchema, notifications: notificationSettingsSchema } as const;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;
export const settingsSectionSchema = z.enum(['general', 'fees', 'examinations', 'branding', 'notifications']);

export interface SchoolSettingsView {
  general: z.output<typeof generalSettingsSchema>;
  fees: z.output<typeof feeSettingsSchema>;
  examinations: z.output<typeof examSettingsSchema>;
  branding: z.output<typeof brandingSettingsSchema> & { signatureUrl: string | null };
  notifications: z.output<typeof notificationSettingsSchema>;
}
