/**
 * Live evaluation against the real model (docs/12 Phase 8) — run before enabling the assistant for
 * schools: `GEMINI_API_KEY=… pnpm --filter @schoolos/api ai:eval`. Skipped without a key.
 * Checks that each question makes the model pick the right lookup with the needed arguments.
 */
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { EVAL_CASES } from '../src/modules/ai/eval-cases.js';
import { GeminiProvider } from '../src/modules/ai/providers.js';
import { TOOLS } from '../src/modules/ai/tools.js';

const key = process.env.GEMINI_API_KEY;
const specs = TOOLS.map((t) => {
  const { $schema: _s, ...parameters } = z.toJSONSchema(t.args, { io: 'input' }) as Record<string, unknown>;
  return { name: t.name, description: t.description, parameters };
});

describe.skipIf(!key)('AI evaluation (live model)', () => {
  const provider = new GeminiProvider(key!, process.env.AI_MODEL ?? 'gemini-2.5-flash');
  const system = 'You are the Bastaa assistant for an Indian school. Today is 2026-10-09. Answer only from tool results.';
  it.each(EVAL_CASES)('$question → $tool', async (c) => {
    const out = await provider.generate({ system, turns: [{ role: 'user', text: c.question }], tools: specs });
    expect(out.calls[0]?.name).toBe(c.tool);
    if (c.args) expect(out.calls[0]?.args).toMatchObject(c.args);
  }, 30_000);
});
