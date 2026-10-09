import { AppError } from '../../core/errors/app-error.js';

export type JsonSchema = Record<string, unknown>;
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}
export type Turn =
  | { role: 'user'; text: string }
  | { role: 'model'; text?: string; calls?: ToolCall[] }
  | { role: 'tool'; results: { name: string; result: unknown }[] };

export interface GenerateRequest {
  system: string;
  turns: Turn[];
  tools: ToolSpec[];
  maxOutputTokens?: number;
}
export interface GenerateResult {
  text: string | null;
  calls: ToolCall[];
}

/** One model behind one interface (docs/12 Phase 8): swap Gemini for another provider here only. */
export interface AiProvider {
  readonly name: 'gemini' | 'mock';
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

/** Gemini accepts an OpenAPI subset: drop what it rejects (formats, patterns, additionalProperties…). */
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (['$schema', 'additionalProperties', 'format', 'pattern', 'default', 'minLength', 'maxLength'].includes(k)) continue;
    out[k] = geminiSchema(v);
  }
  return out;
}

type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } };

/** Google Gemini over its REST API (generativelanguage.googleapis.com). */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const contents = req.turns.map((t) => {
      if (t.role === 'user') return { role: 'user', parts: [{ text: t.text }] };
      if (t.role === 'model') return { role: 'model', parts: [...(t.text ? [{ text: t.text }] : []), ...(t.calls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.args } }))] };
      return { role: 'user', parts: t.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.result } } })) };
    });
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      ...(req.tools.length ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }] } : {}),
      generationConfig: { temperature: 0.2, maxOutputTokens: req.maxOutputTokens ?? 1024 },
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new AppError('AI_UNAVAILABLE', 503, 'The assistant is not reachable right now. Please try again in a minute.');
    }
    if (res.status === 429) throw new AppError('AI_BUSY', 503, 'The assistant is busy right now. Please try again in a minute.');
    if (!res.ok) throw new AppError('AI_UNAVAILABLE', 503, 'The assistant is not available right now. Please try again later.');
    const json = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[] };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('').trim();
    const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
    if (!text && !calls.length && json.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new AppError('AI_REFUSED', 422, "The assistant can't help with that question.");
    }
    return { text: text || null, calls };
  }
}
