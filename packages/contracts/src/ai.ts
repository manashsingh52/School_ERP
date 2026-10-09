import { z } from 'zod';

// ---------------------------------------------------------------- AI assistant (docs/12 Phase 8)

export const askSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(1000),
  /** Earlier turns of this conversation (the browser keeps them; the server stores no text). */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(10)
    .default([]),
});
export type AskRequest = z.input<typeof askSchema>;

/** A table the assistant looked at, shown to the person exactly as the report engine made it. */
export interface AiTable {
  title: string;
  subtitle: string | null;
  columns: { key: string; label: string; type: 'text' | 'money' | 'number' | 'date' | 'percent' }[];
  rows: Record<string, string | number | null>[];
  totalRows: number;
}

export interface AskResponse {
  answer: string;
  /** What the assistant looked up, in plain words ("Monthly attendance · October 2026"). */
  sources: { tool: string; label: string }[];
  tables: AiTable[];
}

export const worksheetSchema = z.object({
  subject: z.string().trim().min(2).max(60),
  classLabel: z.string().trim().min(1).max(30),
  topic: z.string().trim().min(3).max(200),
  questions: z.number().int().min(3).max(30).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  includeAnswers: z.boolean().default(true),
});
export type WorksheetRequest = z.input<typeof worksheetSchema>;

export interface WorksheetResponse {
  title: string;
  /** Markdown: numbered questions, then an answer key when asked for. */
  body: string;
}

export interface AiStatus {
  /** Feature on for this school, a provider configured, and the person allowed. */
  enabled: boolean;
  reason: string | null;
  canAsk: boolean;
  canDraftWorksheets: boolean;
  /** null = unlimited. */
  remainingThisMonth: number | null;
  /** "mock" means answers come from the offline test assistant, not a real AI model. */
  provider: 'gemini' | 'mock' | 'none';
  suggestions: string[];
}
