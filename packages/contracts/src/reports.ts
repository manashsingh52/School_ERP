import { z } from 'zod';
import type { Permission } from '@schoolos/permissions';
import { uuidSchema } from './common.js';

/** One table shape for every report — rendered on screen and exported as CSV, Excel or PDF. */
export interface ReportTable {
  key: string;
  title: string;
  description: string;
  /** e.g. "1 Oct – 31 Oct 2026 · Class 8" */
  subtitle: string | null;
  columns: { key: string; label: string; type: 'text' | 'money' | 'number' | 'date' | 'percent' }[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number> | null;
}

export type ReportParam = 'range' | 'month' | 'class' | 'exam' | 'threshold';

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  group: 'Students' | 'Attendance' | 'Exams' | 'Fees';
  permission: Permission;
  params: ReportParam[];
}

/**
 * The report catalogue (docs/12 Phase 6). Finance reports are the Phase 5 ones; the rest are new.
 * Teachers (report.academic ASSIGNED) see only their sections.
 */
export const REPORTS = [
  { key: 'student_strength', title: 'Class strength', description: 'Students per class and section, by gender.', group: 'Students', permission: 'report.academic', params: [] },
  { key: 'student_list', title: 'Student list', description: 'Students with admission number, class, date of birth and parent.', group: 'Students', permission: 'report.academic', params: ['class'] },
  { key: 'attendance_monthly', title: 'Monthly attendance', description: 'Working days, average attendance and students below 75% per section.', group: 'Attendance', permission: 'report.academic', params: ['month', 'class'] },
  { key: 'attendance_low', title: 'Low attendance', description: 'Students below a chosen attendance % in a period.', group: 'Attendance', permission: 'report.academic', params: ['range', 'class', 'threshold'] },
  { key: 'exam_summary', title: 'Exam result summary', description: 'Per section: appeared, passed, pass %, average % and the topper.', group: 'Exams', permission: 'report.academic', params: ['exam'] },
  { key: 'exam_subjects', title: 'Subject-wise analysis', description: 'Per subject: average, highest, pass % — find weak subjects.', group: 'Exams', permission: 'report.academic', params: ['exam', 'class'] },
  { key: 'collection', title: 'Daily collection', description: 'Money received per day, by payment method.', group: 'Fees', permission: 'report.finance', params: ['range', 'class'] },
  { key: 'outstanding', title: 'Outstanding by class', description: 'Billed, collected and due per section.', group: 'Fees', permission: 'report.finance', params: ['class'] },
  { key: 'defaulters', title: 'Defaulters', description: 'Students with overdue fees, oldest first.', group: 'Fees', permission: 'report.finance', params: ['class'] },
  { key: 'heads', title: 'Fee head-wise', description: 'Billed, concessions and net by fee head.', group: 'Fees', permission: 'report.finance', params: ['range'] },
  { key: 'concessions', title: 'Concessions', description: 'Approved concessions by type and student.', group: 'Fees', permission: 'report.finance', params: ['range'] },
  { key: 'reconciliation', title: 'Online payment reconciliation', description: 'Gateway orders, webhooks and refunds.', group: 'Fees', permission: 'report.finance', params: ['range'] },
] as const satisfies readonly ReportDef[];
export type ReportKey = (typeof REPORTS)[number]['key'];
export const REPORT_KEYS = REPORTS.map((r) => r.key) as [ReportKey, ...ReportKey[]];

export const reportParamsSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  classId: uuidSchema.optional(),
  examId: uuidSchema.optional(),
  threshold: z.coerce.number().int().min(1).max(100).optional(),
});
export type ReportParams = z.infer<typeof reportParamsSchema>;

export const reportPreviewQuerySchema = reportParamsSchema.extend({ report: z.enum(REPORT_KEYS) });

export const exportFormatSchema = z.enum(['PDF', 'XLSX', 'CSV']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const createReportRunSchema = z.object({ report: z.enum(REPORT_KEYS), params: reportParamsSchema.default({}), format: exportFormatSchema });

export interface ReportRunItem {
  id: string;
  report: ReportKey;
  title: string;
  params: ReportParams;
  format: ExportFormat;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------- saved and scheduled reports

export const reportScheduleSchema = z.enum(['NONE', 'WEEKLY', 'MONTHLY']);
export type ReportSchedule = z.infer<typeof reportScheduleSchema>;

/**
 * A report saved with its filters. WEEKLY runs on Mondays for the week before, MONTHLY on the 1st
 * for the month before (dates and months are filled in at run time); the owner is notified.
 */
export const saveReportSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(80),
  report: z.enum(REPORT_KEYS),
  params: reportParamsSchema.default({}),
  format: exportFormatSchema,
  schedule: reportScheduleSchema.default('NONE'),
});
export const updateSavedReportSchema = saveReportSchema.pick({ name: true, format: true, schedule: true }).partial();

export interface SavedReportItem {
  id: string;
  name: string;
  report: ReportKey;
  title: string;
  params: ReportParams;
  format: ExportFormat;
  schedule: ReportSchedule;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- school audit log

export const auditQuerySchema = z.object({
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(64).optional(),
  action: z.string().trim().max(80).optional(),
  actorMembershipId: uuidSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
