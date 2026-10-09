/**
 * AI assistant (docs/12 Phase 8): feature gate, permission-filtered tools, teacher scopes, name
 * masking towards the provider, monthly allowance, no-text logs, the evaluation set (offline), and
 * the Gemini request format.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../src/modules/ai/mock-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { EVAL_CASES } from '../src/modules/ai/eval-cases.js';
import { GeminiProvider, type GenerateRequest } from '../src/modules/ai/providers.js';
import { TOOLS } from '../src/modules/ai/tools.js';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ask = (who: string, question: string) => as(who).post('/v1/ai/ask', { question });

beforeAll(async () => {
  t = await createTestApp({ AI_PROVIDER: 'mock' });
  A = await createTenant(t, 'ai');
  for (const who of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
  const db = t.platform;
  await db.featureFlag.upsert({ where: { key: 'ai_assistant' }, create: { key: 'ai_assistant', description: 'AI assistant', defaultEnabled: false }, update: {} });
  await db.schoolFeature.create({ data: { schoolId: A.schoolId, flagKey: 'ai_assistant', enabled: true } });
  await db.student.update({ where: { id: A.students.s2 }, data: { firstName: 'Isha', lastName: 'Verma' } });
  // October: s1 present 3 of 4 days, s2 absent 3 of 4 (8-A).
  for (const [i, day] of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].entries()) {
    const session = await db.attendanceSession.create({ data: { schoolId: A.schoolId, sectionId: A.sectionA, date: d(day), status: 'SUBMITTED', takenByMemberId: A.adminMembershipId, submittedAt: new Date() } });
    await db.attendanceRecord.createMany({
      data: [
        { schoolId: A.schoolId, sessionId: session.id, studentId: A.students.s1, date: d(day), status: i === 0 ? 'ABSENT' : 'PRESENT' },
        { schoolId: A.schoolId, sessionId: session.id, studentId: A.students.s2, date: d(day), status: i === 0 ? 'PRESENT' : 'ABSENT' },
      ],
    });
  }
  for (const [studentId, marks, section] of [[A.students.s1, 45, A.sectionA], [A.students.s2, 10, A.sectionA], [A.students.s3, 30, A.sectionB]] as const) {
    await db.examResult.create({ data: { schoolId: A.schoolId, examId: A.examId, studentId, sectionId: section, totalObtained: marks, totalMax: 50, percentage: marks * 2, resultStatus: marks >= 17 ? 'PASS' : 'FAIL', computedAt: new Date() } });
  }
});

afterAll(async () => {
  await t?.close();
});

describe('status and gates', () => {
  it('tells each person what they can do', async () => {
    const admin = (await as('admin').get('/v1/ai/status')).body.data;
    expect(admin).toMatchObject({ enabled: true, canAsk: true, provider: 'mock' });
    expect(admin.suggestions.length).toBeGreaterThan(3);
    const teacher = (await as('teacher').get('/v1/ai/status')).body.data;
    expect(teacher).toMatchObject({ enabled: true, canAsk: true, canDraftWorksheets: true });
    const parent = (await as('parent').get('/v1/ai/status')).body.data;
    expect(parent).toMatchObject({ enabled: false, canAsk: false, reason: 'The assistant is for school staff for now.' });
    expect((await ask('parent', 'How is attendance?')).status).toBe(403);
  });

  it('is off unless the school has the feature', async () => {
    await t.platform.schoolFeature.update({ where: { schoolId_flagKey: { schoolId: A.schoolId, flagKey: 'ai_assistant' } }, data: { enabled: false } });
    const res = await ask('admin', 'How is attendance?');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
    expect((await as('admin').get('/v1/ai/status')).body.data.reason).toBe("The AI assistant isn't part of your school's plan.");
    await t.platform.schoolFeature.update({ where: { schoolId_flagKey: { schoolId: A.schoolId, flagKey: 'ai_assistant' } }, data: { enabled: true } });
  });
});

describe('answers come from the school\'s own reports', () => {
  it('principal Q&A: sections below 75% in October', async () => {
    const res = await ask('admin', 'Which classes are below 75% attendance in October?');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.answer).toContain('8-A (50%)');
    expect(res.body.data.sources).toEqual([{ tool: 'attendance_by_class', label: 'Monthly attendance · October 2026' }]);
    expect(res.body.data.tables[0].rows.find((r: { section: string }) => r.section === '8-A')).toMatchObject({ average: 50 });
  });

  it('names reach the person who asked, but never the AI provider', async () => {
    const ai = t.app.get(AiService);
    const provider = ai.provider!;
    const seen: GenerateRequest[] = [];
    const original = provider.generate.bind(provider);
    provider.generate = async (req) => {
      seen.push(JSON.parse(JSON.stringify(req)) as GenerateRequest);
      return original(req);
    };
    try {
      const res = await ask('admin', 'Which students have attendance below 75% in October?');
      expect(res.body.data.answer).toContain('Isha Verma');
      const sent = JSON.stringify(seen);
      expect(sent).not.toContain('Isha');
      expect(sent).not.toContain('Verma');
      expect(sent).toMatch(/\[P1\]/);
    } finally {
      provider.generate = original;
    }
  });

  it('teachers only see their own sections', async () => {
    const admin = (await ask('admin', 'How did sections do in the latest exam?')).body.data;
    expect(admin.tables[0].rows.map((r: { section: string }) => r.section).sort()).toEqual(['8-A', '8-B']);
    const teacher = (await ask('teacher', 'How did sections do in the latest exam?')).body.data;
    expect(teacher.tables[0].rows.map((r: { section: string }) => r.section)).toEqual(['8-A']);
    expect(teacher.answer).toContain('Unit Test 1');
  });

  it('only tools the person may use are offered', async () => {
    const acct = (await ask('accountant', 'Which classes are below 75% attendance?')).body.data;
    expect(acct.tables).toEqual([]);
    expect(acct.answer).toMatch(/^I can answer questions/);
    const fees = (await ask('accountant', 'Who has overdue fees?')).body.data;
    expect(fees.sources[0].tool).toBe('fee_defaulters');
    expect((await ask('teacher', 'Who has overdue fees?')).body.data.tables).toEqual([]);
  });

  it('a class that does not exist is explained, not invented', async () => {
    const res = (await ask('admin', 'Attendance for class 11 this month')).body.data;
    expect(res.answer).toContain('There is no class called "11"');
  });
});

describe('worksheets', () => {
  it('teachers get a draft; others cannot', async () => {
    const res = await as('teacher').post('/v1/ai/worksheet', { subject: 'Mathematics', classLabel: 'Class 6', topic: 'Fractions', questions: 5 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.title).toBe('Mathematics · Class 6 · Fractions');
    expect(res.body.data.body).toContain('5. Practice question 5 on Fractions');
    expect(res.body.data.body).toContain('**Answer key**');
    expect((await as('accountant').post('/v1/ai/worksheet', { subject: 'Maths', classLabel: '6', topic: 'Fractions' })).status).toBe(403);
  });
});

describe('metering and logs', () => {
  it('logs what was used, never the question or answer', async () => {
    const logs = await t.platform.aiLog.findMany({ where: { schoolId: A.schoolId }, orderBy: { createdAt: 'asc' } });
    expect(logs.length).toBeGreaterThan(5);
    const text = JSON.stringify(logs);
    expect(text).not.toContain('below 75%');
    expect(text).not.toContain('Isha');
    expect(logs[0]).toMatchObject({ feature: 'ask', provider: 'mock', status: 'OK', tools: [{ name: 'attendance_by_class', args: { month: '2026-10' } }] });
  });

  it('stops at the plan’s monthly allowance', async () => {
    const plan = await t.platform.plan.create({ data: { code: `ai-${A.slug}`, name: 'AI tiny', limits: { students: null, storageGb: null, smsPerMonth: null, aiCallsPerMonth: 1 } } });
    await t.platform.subscription.create({ data: { schoolId: A.schoolId, planId: plan.id, status: 'ACTIVE' } });
    t.app.get(AiService)['entitlements'].invalidate(A.schoolId);
    const res = await ask('admin', 'How many students do we have?');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLAN_LIMIT_AI');
    expect((await as('admin').get('/v1/ai/status')).body.data).toMatchObject({ enabled: false, remainingThisMonth: 0 });
  });
});

describe('evaluation set (offline rules provider)', () => {
  const mock = new MockProvider(() => '2026-10-09');
  const all = new Set(TOOLS.map((x) => x.name));
  it.each(EVAL_CASES)('$question → $tool', (c) => {
    const call = mock.route(c.question, all);
    expect(call?.name).toBe(c.tool);
    if (c.args) expect(call?.args).toMatchObject(c.args);
  });
  it('every tool in the evaluation set exists', () => {
    for (const c of EVAL_CASES) expect(all.has(c.tool)).toBe(true);
  });
});

describe('Gemini provider', () => {
  it('sends tools as function declarations and reads function calls back', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'class_strength', args: {} } }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const g = new GeminiProvider('test-key', 'gemini-2.5-flash', fakeFetch);
    const out = await g.generate({ system: 'sys', turns: [{ role: 'user', text: 'How many students?' }], tools: [{ name: 'class_strength', description: 'd', parameters: { type: 'object', properties: { m: { type: 'string', pattern: '^x$', format: 'date' } }, additionalProperties: false } }] });
    expect(out.calls).toEqual([{ name: 'class_strength', args: {} }]);
    expect(sent!.url).toContain('/models/gemini-2.5-flash:generateContent');
    expect((sent!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(sent!.init.body));
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.tools[0].functionDeclarations[0].parameters).toEqual({ type: 'object', properties: { m: { type: 'string' } } });
  });

  it('turns provider failures into friendly errors', async () => {
    const g = new GeminiProvider('k', 'm', (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch);
    await expect(g.generate({ system: '', turns: [], tools: [] })).rejects.toMatchObject({ code: 'AI_BUSY' });
  });
});
