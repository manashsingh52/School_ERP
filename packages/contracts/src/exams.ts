import { z } from 'zod';
import { uuidSchema } from './common.js';

const dateOnly = z.iso.date({ message: 'Use YYYY-MM-DD' });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const marks = z.number().min(0).max(1000);

// ---------------------------------------------------------------- grading scales

export const gradeBandSchema = z.object({
  label: z.string().trim().min(1, 'Name the grade').max(10),
  minPercent: z.number().min(0).max(100),
  maxPercent: z.number().min(0).max(100),
  gradePoint: z.number().min(0).max(10).nullable().optional(),
  remark: z.string().trim().max(60).nullable().optional(),
});

export const gradingScaleSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the scale').max(60),
    isDefault: z.boolean().default(false),
    /** Empty = percentage only (no letter grades). */
    bands: z.array(gradeBandSchema).max(15),
  })
  .superRefine((v, ctx) => {
    const sorted = [...v.bands].map((b, i) => ({ ...b, i })).sort((a, b) => b.minPercent - a.minPercent);
    sorted.forEach((b, k) => {
      if (b.maxPercent < b.minPercent) ctx.addIssue({ code: 'custom', path: ['bands', b.i, 'maxPercent'], message: 'Must be at least the minimum' });
      const higher = sorted[k - 1];
      if (higher && b.maxPercent >= higher.minPercent) ctx.addIssue({ code: 'custom', path: ['bands', b.i, 'maxPercent'], message: `Overlaps ${higher.label}` });
    });
    const labels = v.bands.map((b) => b.label.toLowerCase());
    labels.forEach((l, i) => {
      if (labels.indexOf(l) !== i) ctx.addIssue({ code: 'custom', path: ['bands', i, 'label'], message: 'Used twice' });
    });
  });
export type GradingScaleRequest = z.input<typeof gradingScaleSchema>;

/** Ready-made scales schools pick during setup. */
export const GRADING_PRESETS = {
  CBSE_9: {
    name: 'CBSE 9-point',
    bands: [
      { label: 'A1', minPercent: 91, maxPercent: 100, gradePoint: 10, remark: 'Outstanding' },
      { label: 'A2', minPercent: 81, maxPercent: 90.99, gradePoint: 9, remark: 'Excellent' },
      { label: 'B1', minPercent: 71, maxPercent: 80.99, gradePoint: 8, remark: 'Very good' },
      { label: 'B2', minPercent: 61, maxPercent: 70.99, gradePoint: 7, remark: 'Good' },
      { label: 'C1', minPercent: 51, maxPercent: 60.99, gradePoint: 6, remark: 'Fair' },
      { label: 'C2', minPercent: 41, maxPercent: 50.99, gradePoint: 5, remark: 'Average' },
      { label: 'D', minPercent: 33, maxPercent: 40.99, gradePoint: 4, remark: 'Pass' },
      { label: 'E', minPercent: 0, maxPercent: 32.99, gradePoint: 0, remark: 'Needs improvement' },
    ],
  },
  A_TO_E: {
    name: 'A–E',
    bands: [
      { label: 'A', minPercent: 80, maxPercent: 100, remark: 'Excellent' },
      { label: 'B', minPercent: 60, maxPercent: 79.99, remark: 'Very good' },
      { label: 'C', minPercent: 45, maxPercent: 59.99, remark: 'Good' },
      { label: 'D', minPercent: 33, maxPercent: 44.99, remark: 'Satisfactory' },
      { label: 'E', minPercent: 0, maxPercent: 32.99, remark: 'Needs improvement' },
    ],
  },
  PERCENTAGE: { name: 'Percentage only', bands: [] },
} as const satisfies Record<string, { name: string; bands: z.input<typeof gradeBandSchema>[] }>;
export type GradingPreset = keyof typeof GRADING_PRESETS;
export const gradingPresetSchema = z.object({ preset: z.enum(Object.keys(GRADING_PRESETS) as [GradingPreset, ...GradingPreset[]]) });

export interface GradingScaleItem {
  id: string;
  name: string;
  isDefault: boolean;
  bands: { id: string; label: string; minPercent: number; maxPercent: number; gradePoint: number | null; remark: string | null }[];
  usedBy: number;
}

/** Grade for a percentage: the band with the highest minimum that the percentage reaches. */
export function gradeFor(percent: number, bands: { label: string; minPercent: number }[]): string | null {
  const band = [...bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent);
  return band?.label ?? null;
}

// ---------------------------------------------------------------- exams

export const examStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'RESULTS_PUBLISHED', 'ARCHIVED']);
export type ExamStatus = z.infer<typeof examStatusSchema>;

const examFields = {
  name: z.string().trim().min(1, 'Name the exam').max(80),
  term: z.string().trim().max(40).nullable().optional(),
  gradingScaleId: uuidSchema,
  startDate: dateOnly.nullable().optional(),
  endDate: dateOnly.nullable().optional(),
  rankingEnabled: z.boolean().default(false),
};

export const createExamSchema = z
  .object(examFields)
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'Ends before it starts' });
export type CreateExamRequest = z.input<typeof createExamSchema>;

export const updateExamSchema = z
  .object({
    name: examFields.name.optional(),
    term: examFields.term,
    gradingScaleId: uuidSchema.optional(),
    startDate: examFields.startDate,
    endDate: examFields.endDate,
    rankingEnabled: z.boolean().optional(),
    /** DRAFT (setup) → SCHEDULED (schedule visible to parents) → MARKS_ENTRY (teachers enter marks). */
    status: z.enum(['DRAFT', 'SCHEDULED', 'MARKS_ENTRY']).optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'Ends before it starts' });
export type UpdateExamRequest = z.input<typeof updateExamSchema>;

export const examSubjectRowSchema = z
  .object({
    classId: uuidSchema,
    subjectId: uuidSchema,
    maxMarks: marks.positive('Must be more than 0'),
    passMarks: marks,
    examDate: dateOnly.nullable().optional(),
    startTime: time.nullable().optional(),
    endTime: time.nullable().optional(),
  })
  .refine((r) => r.passMarks <= r.maxMarks, { path: ['passMarks'], message: 'More than the maximum' })
  .refine((r) => !r.startTime || !r.endTime || r.endTime > r.startTime, { path: ['endTime'], message: 'Ends before it starts' });

/** Replace the subject grid for these classes (rows for other classes are untouched). */
export const setExamSubjectsSchema = z.object({
  classIds: z.array(uuidSchema).min(1).max(30),
  rows: z.array(examSubjectRowSchema).max(30 * 20),
});
export type SetExamSubjectsRequest = z.input<typeof setExamSubjectsSchema>;

export const listExamsQuerySchema = z.object({
  /** Parents: exams of one child (with that child's schedule). */
  studentId: uuidSchema.optional(),
  status: examStatusSchema.optional(),
});

export interface ExamSubjectItem {
  id: string;
  classId: string;
  className: string;
  subject: { id: string; name: string };
  maxMarks: number;
  passMarks: number;
  examDate: string | null;
  startTime: string | null;
  endTime: string | null;
  lockedAt: string | null;
}

export interface ExamItem {
  id: string;
  name: string;
  term: string | null;
  status: ExamStatus;
  gradingScale: { id: string; name: string };
  startDate: string | null;
  endDate: string | null;
  rankingEnabled: boolean;
  publishedAt: string | null;
  classes: { id: string; name: string; subjects: number }[];
  createdAt: string;
}

export interface ExamDetail extends ExamItem {
  subjects: ExamSubjectItem[];
}

// ---------------------------------------------------------------- marks

export const marksSheetQuerySchema = z.object({ examSubjectId: uuidSchema, sectionId: uuidSchema });

export const saveMarksSchema = z.object({
  examSubjectId: uuidSchema,
  sectionId: uuidSchema,
  /** The sheet's `version` when it was opened; a newer save by someone else → 409 VERSION_CONFLICT. */
  version: z.string().max(40).optional(),
  entries: z
    .array(
      z.object({
        studentId: uuidSchema,
        marks: marks.nullable(),
        absent: z.boolean().default(false),
        exempt: z.boolean().default(false),
        remarks: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .max(200),
});
export type SaveMarksRequest = z.input<typeof saveMarksSchema>;

export interface MarksSheet {
  exam: { id: string; name: string; status: ExamStatus };
  examSubject: ExamSubjectItem;
  section: { id: string; label: string };
  editable: boolean;
  lockedReason: string | null;
  /** Opaque; send back with the save. */
  version: string;
  students: {
    studentId: string;
    name: string;
    rollNo: number | null;
    admissionNo: string;
    marks: number | null;
    absent: boolean;
    exempt: boolean;
    remarks: string | null;
  }[];
  stats: { entered: number; total: number; average: number | null; highest: number | null; passed: number };
}

export interface MarksProgressRow {
  examSubjectId: string;
  classId: string;
  className: string;
  subject: { id: string; name: string };
  section: { id: string; label: string };
  teacher: string | null;
  entered: number;
  total: number;
  locked: boolean;
}

// ---------------------------------------------------------------- results

export const resultStatusSchema = z.enum(['PASS', 'FAIL', 'WITHHELD', 'INCOMPLETE']);
export type ResultStatus = z.infer<typeof resultStatusSchema>;

export const computeResultsSchema = z.object({
  /** Recompute after publishing (corrections). Audited. */
  force: z.boolean().default(false),
});

export const resultsQuerySchema = z.object({ sectionId: uuidSchema.optional() });

export const updateResultSchema = z.object({
  teacherRemark: z.string().trim().max(300).nullable().optional(),
  principalRemark: z.string().trim().max(300).nullable().optional(),
  /** Hold back one student's result (e.g. pending fees or re-exam). */
  withheld: z.boolean().optional(),
});

export interface ResultSubject {
  examSubjectId: string;
  subject: { id: string; name: string };
  maxMarks: number;
  passMarks: number;
  marks: number | null;
  absent: boolean;
  exempt: boolean;
  grade: string | null;
  passed: boolean | null;
}

export interface ResultRow {
  studentId: string;
  name: string;
  admissionNo: string;
  rollNo: number | null;
  section: { id: string; label: string };
  subjects: ResultSubject[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string | null;
  status: ResultStatus;
  rankInSection: number | null;
  rankInClass: number | null;
  attendancePct: number | null;
  teacherRemark: string | null;
  principalRemark: string | null;
  publishedAt: string | null;
}

export interface ResultsSummary {
  computedAt: string | null;
  publishedAt: string | null;
  students: number;
  passed: number;
  failed: number;
  incomplete: number;
  withheld: number;
  average: number | null;
}

/** A parent's view: published results of one child across exams. */
export interface StudentResultItem {
  exam: { id: string; name: string; term: string | null; publishedAt: string | null };
  result: ResultRow;
  reportCard: { version: number; generatedAt: string } | null;
  coScholastic?: CoScholasticItem[];
}

// ---------------------------------------------------------------- report cards

export const generateReportCardsSchema = z.object({
  sectionId: uuidSchema,
  /** Omit for the whole section. */
  studentIds: z.array(uuidSchema).max(200).optional(),
});

export interface ReportCardStatus {
  studentId: string;
  name: string;
  rollNo: number | null;
  version: number | null;
  generatedAt: string | null;
}

// ---------------------------------------------------------------- consolidated term results

/** A term made of several exams with weights that add up to 100 (e.g. Unit Test 1 × 20 + Half-Yearly × 80). */
export const examTermSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    gradingScaleId: uuidSchema,
    components: z
      .array(z.object({ examId: uuidSchema, weight: z.number().int().min(1).max(100) }))
      .min(1, 'Add at least one exam')
      .max(6),
  })
  .refine((t) => t.components.reduce((a, c) => a + c.weight, 0) === 100, { path: ['components'], message: 'Weights must add up to 100' })
  .refine((t) => new Set(t.components.map((c) => c.examId)).size === t.components.length, { path: ['components'], message: 'Each exam once' });
export type ExamTermRequest = z.input<typeof examTermSchema>;

export interface ExamTermItem {
  id: string;
  name: string;
  gradingScale: { id: string; name: string };
  components: { exam: { id: string; name: string; status: ExamStatus }; weight: number }[];
  /** All component exams have published results — the term can be published. */
  ready: boolean;
  publishedAt: string | null;
}

export interface TermSubjectResult {
  subject: { id: string; name: string };
  /** Per component exam: the % in this subject (null = no marks), absent or exempt. */
  components: { examId: string; percent: number | null; absent: boolean; exempt: boolean }[];
  /** Weighted %, exempt exams left out and the weights scaled up. */
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
}

export interface TermResultRow {
  studentId: string;
  name: string;
  admissionNo: string;
  rollNo: number | null;
  section: { id: string; label: string };
  subjects: TermSubjectResult[];
  percentage: number | null;
  grade: string | null;
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  rankInSection: number | null;
}

export const termResultsQuerySchema = z.object({ sectionId: uuidSchema.optional() });

export interface StudentTermResultItem {
  term: { id: string; name: string; publishedAt: string | null; components: { name: string; weight: number }[] };
  result: TermResultRow;
  /** From the last exam in the term that has co-scholastic grades. */
  coScholastic?: CoScholasticItem[];
}

// ---------------------------------------------------------------- marks from a spreadsheet

/** Upload a filled-in marks sheet (from the template). apply=false only checks it. */
export const marksImportSchema = z.object({
  examSubjectId: uuidSchema,
  sectionId: uuidSchema,
  fileId: uuidSchema,
  /** The sheet version shown when the teacher started — someone else's save in between → 409. */
  version: z.string().max(40).optional(),
  apply: z.boolean().default(false),
});

export interface MarksImportRow {
  /** Row number in the spreadsheet (header = 1). */
  row: number;
  admissionNo: string;
  name: string | null;
  value: string;
  marks: number | null;
  absent: boolean;
  exempt: boolean;
  /** blank = left as it is; same = no change. */
  change: 'new' | 'changed' | 'same' | 'blank';
  error: string | null;
}

export interface MarksImportResult {
  rows: MarksImportRow[];
  errors: number;
  changes: number;
  /** Students in the section the file didn't mention (left as they are). */
  missing: string[];
  applied: boolean;
  sheet: MarksSheet | null;
}

// ---------------------------------------------------------------- co-scholastic areas

export const coScholasticQuerySchema = z.object({ sectionId: uuidSchema });

/** Class teacher's grid: students × co-scholastic areas, on the school's short scale. */
export interface CoScholasticSheet {
  exam: { id: string; name: string; status: ExamStatus };
  section: { id: string; label: string };
  editable: boolean;
  lockedReason: string | null;
  /** Allowed grades, best first (Settings → Examinations). */
  grades: string[];
  areas: { id: string; name: string }[];
  students: { studentId: string; name: string; rollNo: number | null; grades: Record<string, string | null> }[];
}

export const saveCoScholasticSchema = z.object({
  sectionId: uuidSchema,
  entries: z.array(z.object({ studentId: uuidSchema, subjectId: uuidSchema, grade: z.string().trim().max(4).nullable() })).min(1).max(2000),
});

/** On report cards and the parent's results. */
export type CoScholasticItem = { area: string; grade: string };
