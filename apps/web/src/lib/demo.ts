import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PublicSchoolBranding } from '@schoolos/contracts';

/**
 * Demo mode (DEMO_MODE=true): the website runs with no API, answering from responses recorded
 * from the seeded demo school (`demo/fixtures.json`, made by `tool/demo/record.mjs`). Visitors
 * pick a role; changes are refused politely. Dates move with the calendar, so "today" stays today.
 */
export const DEMO_PERSONAS = [
  { key: 'admin', title: 'School admin', person: 'Anita Desai, principal’s office', text: 'Students, fees, exams, ID cards, reports and settings for the whole school.', caps: ['Fees collected and due', 'Report cards and ID cards', 'Attendance in every class'], home: '/dashboard' },
  { key: 'teacher', title: 'Teacher', person: 'Priya Sharma, class teacher of 8-A', text: 'Registers, homework, marks and messages for her classes.', caps: ['Today’s register', 'Marks, homework, certificates', 'Messages from parents'], home: '/dashboard' },
  { key: 'parent', title: 'Parent', person: 'Rajesh Mishra, father of Rahul and Ananya', text: 'Attendance, homework, results and fees for his children.', caps: ['Attendance and homework', 'Fees and receipts', 'Results and achievements'], home: '/dashboard' },
  { key: 'owner', title: 'Bastaa owner', person: 'Platform console', text: 'Every school on Bastaa: onboarding, plans, support and system health.', caps: ['Every school and its plan', 'Support access requests', 'System health and jobs'], home: '/platform' },
] as const;
export type DemoPersona = (typeof DEMO_PERSONAS)[number]['key'];

const TOKEN_PREFIX = 'demo:';
export const demoToken = (persona: DemoPersona) => `${TOKEN_PREFIX}${persona}`;
export function demoPersonaFrom(token: string | null | undefined): DemoPersona | null {
  const key = token?.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : null;
  return DEMO_PERSONAS.find((p) => p.key === key)?.key ?? null;
}

interface Recorded {
  /** status, content type, content-disposition, JSON text or base64 bytes */
  s: number;
  t?: string;
  d?: string;
  j?: string;
  b64?: string;
}
interface Fixtures {
  recordedOn: string; // YYYY-MM-DD, school time
  branding: PublicSchoolBranding;
  responses: Record<string, Record<string, Recorded>>;
}

let cache: { fixtures: Fixtures; byPath: Map<string, Map<string, string>> } | null = null;
function load() {
  if (!cache) {
    const fixtures = JSON.parse(readFileSync(path.join(process.cwd(), 'demo', 'fixtures.json'), 'utf8')) as Fixtures;
    // Fallback index: the first recorded query string for each persona + path.
    const byPath = new Map<string, Map<string, string>>();
    for (const [persona, table] of Object.entries(fixtures.responses)) {
      const index = new Map<string, string>();
      for (const key of Object.keys(table)) {
        const base = key.split('?')[0]!;
        if (!index.has(base)) index.set(base, key);
      }
      byPath.set(persona, index);
    }
    cache = { fixtures, byPath };
  }
  return cache;
}

const DAY = 86_400_000;
const todayInSchool = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const DATE = /\b(\d{4})-(\d{2})-(\d{2})(?=[T"&,\s/)]|$)/g;
const MONTH = /(["=])(\d{4})-(0[1-9]|1[0-2])(?=["&]|$)/g;

/** Moves every ISO date (and "YYYY-MM" month value) in [text] by [days]. */
export function shiftDates(text: string, days: number): string {
  if (!days) return text;
  return text
    .replace(DATE, (_m, y: string, mo: string, d: string) => new Date(Date.UTC(+y, +mo - 1, +d) + days * DAY).toISOString().slice(0, 10))
    .replace(MONTH, (_m, lead: string, y: string, mo: string) => lead + new Date(Date.UTC(+y, +mo - 1, 15) + days * DAY).toISOString().slice(0, 7));
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** The API's answer for this request, from the recording. */
export function demoResponse(opts: { method?: string; path: string; accessToken?: string }): Response {
  const method = (opts.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return json(409, { error: { code: 'DEMO', message: "This is a demo with a sample school, so changes aren't saved." } });
  }
  const persona = demoPersonaFrom(opts.accessToken);
  if (!persona) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Choose a role to explore the demo.' } });
  const { fixtures, byPath } = load();
  const days = Math.round((Date.parse(todayInSchool()) - Date.parse(fixtures.recordedOn)) / DAY);
  const table = fixtures.responses[persona] ?? {};
  const key = shiftDates(opts.path, -days);
  const found = table[key] ?? table[byPath.get(persona)?.get(key.split('?')[0]!) ?? ''];
  if (!found) return json(404, { error: { code: 'NOT_IN_DEMO', message: "This part isn't included in the demo." } });
  const headers = new Headers({ 'content-type': found.t ?? 'application/json; charset=utf-8' });
  if (found.d) headers.set('content-disposition', found.d);
  const body = found.b64 ? Buffer.from(found.b64, 'base64') : shiftDates(found.j ?? '', days);
  return new Response(found.s === 204 ? null : body, { status: found.s, headers });
}

export const demoBranding = (): PublicSchoolBranding => load().fixtures.branding;
