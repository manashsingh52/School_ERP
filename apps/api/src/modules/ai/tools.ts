import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Permission } from '@schoolos/permissions';
import type { ReportKey, ReportParams, ReportTable } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { todayIn } from '../../core/util/dates.js';
import { classKey } from '../imports/parsing.js';
import { ReportsService } from '../reports/reports.service.js';
import type { ToolSpec } from './providers.js';

const month = z.string().regex(/^\d{4}-\d{2}$/).describe('Month as YYYY-MM. Omit for the current month.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const className = z.string().max(40).describe('A class like "8", "Class 8", "VIII" or "LKG". Omit for all classes.');
const examName = z.string().max(80).describe('The exam\'s name or part of it, e.g. "Unit Test 1" or "half yearly". Omit for the latest exam with results.');

interface ToolDef<A extends z.ZodObject> {
  name: string;
  description: string;
  permission: Permission;
  args: A;
  run: (args: z.output<A>, t: AiTools) => Promise<ReportTable>;
}

const tool = <A extends z.ZodObject>(d: ToolDef<A>) => d as unknown as ToolDef<z.ZodObject>;

/**
 * What the assistant may look up (docs/12 Phase 8). Each tool is a report the person could run
 * themselves: it goes through ReportsService, so permissions and teacher scopes apply, and the
 * assistant never touches the database directly.
 */
export const TOOLS = [
  tool({
    name: 'attendance_by_class',
    description: 'Attendance for one month per class section: working days, average attendance %, absences, and how many students are below 75%.',
    permission: 'report.academic',
    args: z.object({ month: month.optional(), className: className.optional() }),
    run: async (a, t) => t.report('attendance_monthly', { month: a.month, classId: await t.classId(a.className) }),
  }),
  tool({
    name: 'low_attendance_students',
    description: 'Students whose attendance is below a percentage in a date range (defaults: this month so far, below 75%).',
    permission: 'report.academic',
    args: z.object({ from: date.optional(), to: date.optional(), className: className.optional(), belowPercent: z.number().int().min(1).max(100).optional() }),
    run: async (a, t) => t.report('attendance_low', { from: a.from, to: a.to, threshold: a.belowPercent, classId: await t.classId(a.className) }),
  }),
  tool({
    name: 'exam_results_summary',
    description: 'Exam results per section: appeared, passed, pass %, average % and topper.',
    permission: 'report.academic',
    args: z.object({ examName: examName.optional() }),
    run: async (a, t) => t.report('exam_summary', { examId: await t.examId(a.examName) }),
  }),
  tool({
    name: 'subject_performance',
    description: 'Per subject in an exam: average %, highest marks, pass % — to find weak subjects.',
    permission: 'report.academic',
    args: z.object({ examName: examName.optional(), className: className.optional() }),
    run: async (a, t) => t.report('exam_subjects', { examId: await t.examId(a.examName), classId: await t.classId(a.className) }),
  }),
  tool({
    name: 'class_strength',
    description: 'Number of students per class section, with boys and girls.',
    permission: 'report.academic',
    args: z.object({}),
    run: async (_a, t) => t.report('student_strength', {}),
  }),
  tool({
    name: 'fee_collection',
    description: 'Fees received per day and by payment method in a date range (default: this month so far).',
    permission: 'report.finance',
    args: z.object({ from: date.optional(), to: date.optional() }),
    run: async (a, t) => t.report('collection', { from: a.from, to: a.to }),
  }),
  tool({
    name: 'fee_outstanding',
    description: 'Fees billed, collected and still due per class section.',
    permission: 'report.finance',
    args: z.object({ className: className.optional() }),
    run: async (a, t) => t.report('outstanding', { classId: await t.classId(a.className) }),
  }),
  tool({
    name: 'fee_defaulters',
    description: 'Students with overdue fees, oldest first, with the amount overdue.',
    permission: 'report.finance',
    args: z.object({ className: className.optional() }),
    run: async (a, t) => t.report('defaulters', { classId: await t.classId(a.className) }),
  }),
];
export type ToolName = (typeof TOOLS)[number]['name'];

@Injectable()
export class AiTools {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** Tools this person may use (the model is only told about these). */
  available(): ToolDef<z.ZodObject>[] {
    const perms = RequestContextStore.tenant().permissions;
    return TOOLS.filter((t) => perms[t.permission]);
  }

  specs(): ToolSpec[] {
    return this.available().map((t) => {
      const { $schema: _s, ...parameters } = z.toJSONSchema(t.args, { io: 'input' }) as Record<string, unknown>;
      return { name: t.name, description: t.description, parameters };
    });
  }

  /** Validate the model's arguments, check permission again, and run the report. */
  async call(name: string, rawArgs: unknown): Promise<{ table: ReportTable; args: Record<string, unknown> }> {
    const t = this.available().find((x) => x.name === name);
    if (!t) throw new AppError('AI_TOOL_NOT_ALLOWED', 403, `The assistant can't use ${name} for you.`);
    const parsed = t.args.safeParse(rawArgs ?? {});
    if (!parsed.success) throw new AppError('AI_BAD_TOOL_ARGS', 422, `The assistant asked ${name} for something it doesn't understand.`);
    return { table: await t.run(parsed.data, this), args: parsed.data };
  }

  report(key: ReportKey, params: ReportParams): Promise<ReportTable> {
    return this.reports.run(key, Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as ReportParams);
  }

  /** "8", "Class 8", "VIII" → the class id; unknown names are an error the model can relay. */
  async classId(name?: string): Promise<string | undefined> {
    if (!name?.trim()) return undefined;
    const key = classKey(name);
    const found = (await this.prisma.db.schoolClass.findMany({ select: { id: true, name: true } })).find((c) => classKey(c.name) === key);
    if (!found) throw new AppError('AI_UNKNOWN_CLASS', 422, `There is no class called "${name}".`);
    return found.id;
  }

  /** Best match by words in the name; otherwise the latest exam with results. */
  async examId(name?: string): Promise<string> {
    const yearId = await this.scope.currentAcademicYearId();
    const exams = await this.prisma.db.exam.findMany({
      where: { academicYearId: yearId ?? undefined },
      select: { id: true, name: true, startDate: true, _count: { select: { results: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (!exams.length) throw new AppError('AI_NO_EXAMS', 422, 'There are no exams this year yet.');
    const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 || /\d/.test(w)));
    if (name?.trim()) {
      const want = words(name);
      const scored = exams.map((e) => ({ e, score: [...words(e.name)].filter((w) => want.has(w) || want.has(w.replace(/s$/, ''))).length })).sort((a, b) => b.score - a.score);
      if (scored[0]!.score > 0) return scored[0]!.e.id;
    }
    return (exams.find((e) => e._count.results > 0) ?? exams[0]!).id;
  }

  /** Today for the school (prompts and defaults). */
  today(): string {
    return todayIn();
  }
}
