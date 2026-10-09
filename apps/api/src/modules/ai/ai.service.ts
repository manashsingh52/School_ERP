import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import type { AiStatus, AiTable, AskResponse, WorksheetResponse, askSchema, worksheetSchema } from '@schoolos/contracts';
import { ENV, type Env } from '../../config/env.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { EntitlementsService } from '../../core/entitlements/entitlements.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { MockProvider } from './mock-provider.js';
import { Masker } from './privacy.js';
import { GeminiProvider, type AiProvider, type ToolCall, type Turn } from './providers.js';
import { AiTools } from './tools.js';

type In<T extends z.ZodType> = z.output<T>;
const FLAG = 'ai_assistant';
const MAX_ROUNDS = 4;

const TOOL_LABEL: Record<string, string> = {
  attendance_by_class: 'Monthly attendance',
  low_attendance_students: 'Low attendance',
  exam_results_summary: 'Exam results',
  subject_performance: 'Subject-wise results',
  class_strength: 'Class strength',
  fee_collection: 'Fee collection',
  fee_outstanding: 'Fees outstanding',
  fee_defaulters: 'Fee defaulters',
};

/**
 * The AI assistant (docs/12 Phase 8): a model that can only *ask the school's own reports*.
 * Every tool runs as the signed-in member (their permissions and scopes); names are masked before
 * anything reaches the provider; usage is metered against the plan; logs keep no text.
 */
@Injectable()
export class AiService {
  readonly provider: AiProvider | null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly tools: AiTools,
    private readonly entitlements: EntitlementsService,
    private readonly prisma: PrismaService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.provider =
      env.AI_PROVIDER === 'gemini' ? new GeminiProvider(env.GEMINI_API_KEY!, env.AI_MODEL) : env.AI_PROVIDER === 'mock' ? new MockProvider(() => this.tools.today()) : null;
  }

  private canAsk(): boolean {
    const p = RequestContextStore.tenant().permissions;
    return !!p['ai.use'] && !!(p['report.academic'] || p['report.finance']);
  }

  private canDraft(): boolean {
    const p = RequestContextStore.tenant().permissions;
    return !!p['ai.use'] && !!p['homework.manage'];
  }

  async status(): Promise<AiStatus> {
    const { schoolId } = RequestContextStore.school();
    const [on, limits] = await Promise.all([this.entitlements.enabled(FLAG, schoolId), this.entitlements.limits(schoolId)]);
    const used = await this.entitlements.used('ai_calls', schoolId);
    const cap = limits.aiCallsPerMonth;
    const reason = !this.provider ? 'The assistant is not set up on this server yet.' : !on ? "The AI assistant isn't part of your school's plan." : cap !== null && used >= cap ? "This month's AI allowance is used up." : null;
    const canAsk = this.canAsk();
    const canDraft = this.canDraft();
    const perms = RequestContextStore.tenant().permissions;
    return {
      enabled: reason === null && (canAsk || canDraft),
      reason: reason ?? (canAsk || canDraft ? null : 'The assistant is for school staff for now.'),
      canAsk,
      canDraftWorksheets: canDraft,
      remainingThisMonth: cap === null ? null : Math.max(0, cap - used),
      provider: this.provider?.name ?? 'none',
      suggestions: [
        ...(perms['report.academic'] ? ['Which classes are below 75% attendance this month?', 'Which students are below 75% attendance?', 'How did sections do in the latest exam?', 'Which subjects are weakest in the latest exam?'] : []),
        ...(perms['report.finance'] ? ['How much fee was collected this month?', 'Who has overdue fees?', 'How much is still due by class?'] : []),
      ].slice(0, 6),
    };
  }

  /** Feature on, provider configured, allowance left — otherwise a clear refusal. */
  private async gate(): Promise<{ schoolId: string; provider: AiProvider }> {
    const { schoolId } = RequestContextStore.school();
    if (!this.provider) throw new AppError('AI_NOT_CONFIGURED', 503, 'The assistant is not set up on this server yet.');
    if (!(await this.entitlements.enabled(FLAG, schoolId))) throw new AppError('FEATURE_DISABLED', 403, "The AI assistant isn't part of your school's plan.");
    if (!(await this.entitlements.withinMonthly('ai_calls', schoolId))) throw new AppError('PLAN_LIMIT_AI', 422, "This month's AI allowance is used up. Ask SchoolOS to raise it.");
    return { schoolId, provider: this.provider };
  }

  private async system(): Promise<string> {
    const school = await this.prisma.db.school.findFirstOrThrow({ select: { name: true } });
    return [
      `You are the SchoolOS assistant for ${school.name}, an Indian school. Today is ${this.tools.today()}. The academic year runs April to March.`,
      'Answer ONLY from the results of the tools you call. Never guess or invent numbers, names or dates. If no tool can answer, say what you can help with instead.',
      'People appear as placeholders like [P3]. Use them exactly as written — they are turned back into names for the reader. Never ask for or guess real names.',
      'Be brief: one to four sentences, or a short list. Use ₹ with Indian digit grouping and percentages with one decimal. Mention the period or exam you used.',
      'Reply in the language of the question. Do not give medical, legal or disciplinary advice about individual students.',
    ].join('\n');
  }

  async ask(input: In<typeof askSchema>): Promise<AskResponse> {
    if (!this.canAsk()) throw new AppError('FORBIDDEN', 403, 'The assistant is for school staff with access to reports.');
    const { schoolId, provider } = await this.gate();
    const started = Date.now();
    const masker = new Masker();
    const used: ToolCall[] = [];
    const tables: AiTable[] = [];
    const sources: AskResponse['sources'] = [];
    const turns: Turn[] = [
      ...input.history.map((h): Turn => (h.role === 'user' ? { role: 'user', text: h.text } : { role: 'model', text: h.text })),
      { role: 'user', text: input.question },
    ];
    const specs = this.tools.specs();
    const system = await this.system();
    let answer: string | null = null;
    try {
      for (let round = 0; round < MAX_ROUNDS && answer === null; round++) {
        const out = await provider.generate({ system, turns, tools: round < MAX_ROUNDS - 1 ? specs : [] });
        if (!out.calls.length) {
          answer = out.text ?? "I couldn't find an answer to that.";
          break;
        }
        turns.push({ role: 'model', text: out.text ?? undefined, calls: out.calls });
        const results: { name: string; result: unknown }[] = [];
        for (const call of out.calls.slice(0, 3)) {
          try {
            const { table, args } = await this.tools.call(call.name, call.args);
            used.push({ name: call.name, args });
            sources.push({ tool: call.name, label: [TOOL_LABEL[call.name] ?? table.title, table.subtitle].filter(Boolean).join(' · ') });
            tables.push({ title: table.title, subtitle: table.subtitle, columns: table.columns, rows: table.rows.slice(0, 50), totalRows: table.rows.length });
            results.push({ name: call.name, result: masker.forModel(table) });
          } catch (err) {
            // Tell the model what went wrong (no data), so it can explain or try another tool.
            results.push({ name: call.name, result: { error: err instanceof AppError ? err.message : 'That lookup failed.' } });
            used.push({ name: call.name, args: { error: err instanceof AppError ? err.code : 'ERROR' } });
          }
        }
        turns.push({ role: 'tool', results });
      }
      answer = masker.restore(answer ?? "I couldn't work that out — try asking more simply.");
      await this.log(schoolId, 'ask', provider, used, input.question.length, answer.length, started, 'OK');
      await this.entitlements.record('ai_calls', schoolId);
      return { answer, sources, tables };
    } catch (err) {
      await this.log(schoolId, 'ask', provider, used, input.question.length, 0, started, err instanceof AppError && err.code === 'AI_REFUSED' ? 'REFUSED' : 'ERROR', err instanceof AppError ? err.code : 'UNEXPECTED');
      if (!(err instanceof AppError)) this.logger.error({ err }, 'ai ask failed');
      throw err instanceof AppError ? err : new AppError('AI_UNAVAILABLE', 503, 'The assistant could not answer right now. Please try again.');
    }
  }

  /** A worksheet draft for teachers — no school data is sent, only the topic. */
  async worksheet(input: In<typeof worksheetSchema>): Promise<WorksheetResponse> {
    if (!this.canDraft()) throw new AppError('FORBIDDEN', 403, 'Worksheet drafts are for teachers.');
    const { schoolId, provider } = await this.gate();
    const started = Date.now();
    const prompt = [
      `Write a ${input.difficulty} worksheet for ${input.subject}, ${input.classLabel} (Indian school, CBSE-style).`,
      `Topic: ${input.topic}`,
      `Questions: ${input.questions}`,
      `Answer key: ${input.includeAnswers ? 'yes' : 'no'}`,
      'Mix question types (short answer, fill in the blanks, one or two word problems). Number the questions. Plain Markdown, no title line, no preamble.',
    ].join('\n');
    try {
      const out = await provider.generate({ system: 'You write clear, age-appropriate school worksheets. Use simple English and Indian context (₹, Indian names, metric units).', turns: [{ role: 'user', text: prompt }], tools: [], maxOutputTokens: 2048 });
      const body = (out.text ?? '').trim();
      if (!body) throw new AppError('AI_EMPTY', 503, 'The assistant returned nothing. Please try again.');
      await this.log(schoolId, 'worksheet', provider, [], prompt.length, body.length, started, 'OK');
      await this.entitlements.record('ai_calls', schoolId);
      return { title: `${input.subject} · ${input.classLabel} · ${input.topic}`, body };
    } catch (err) {
      await this.log(schoolId, 'worksheet', provider, [], prompt.length, 0, started, 'ERROR', err instanceof AppError ? err.code : 'UNEXPECTED');
      throw err instanceof AppError ? err : new AppError('AI_UNAVAILABLE', 503, 'The assistant could not answer right now. Please try again.');
    }
  }

  /** What was used and how long it took — never the question or the answer. */
  private async log(schoolId: string, feature: string, provider: AiProvider, tools: ToolCall[], inputChars: number, outputChars: number, started: number, status: string, errorCode?: string) {
    try {
      await this.prisma.tenantTx((tx) =>
        tx.aiLog.create({
          data: { schoolId, memberId: RequestContextStore.tenant().membershipId, feature, provider: provider.name, model: provider.model, tools: tools as unknown as Prisma.InputJsonValue, inputChars, outputChars, latencyMs: Date.now() - started, status, errorCode } as Prisma.AiLogUncheckedCreateInput,
        }),
      );
    } catch (err) {
      this.logger.warn({ err }, 'ai log write failed');
    }
  }
}
