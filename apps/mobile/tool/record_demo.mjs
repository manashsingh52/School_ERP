// Records the demo data the app shows in demo mode (DEMO_MODE=true): signs in as the demo parent
// and the demo teacher against a local API with the seeded demo school, calls every route the
// app reads, and writes the answers to assets/demo/*.json.
//
//   pnpm db:start && pnpm --filter @schoolos/api db:deploy && pnpm db:seed   (API on :4000)
//   node apps/mobile/tool/record_demo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo@12345';
const out = join(dirname(fileURLToPath(import.meta.url)), '../assets/demo');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const recordedOn = iso(new Date());

/** "GET /me?a=1&b=2" with the query sorted: the same key DemoApi builds (lib/core/demo_api.dart). */
const keyOf = (method, path, query = {}) => {
  const q = Object.entries(query).filter(([, v]) => v != null).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${method} ${path}${q.length ? `?${q.map(([k, v]) => `${k}=${v}`).join('&')}` : ''}`;
};

async function record(identifier) {
  const responses = {};
  let token;
  const call = async (method, path, { query, body } = {}) => {
    const url = new URL(`/v1${path}`, API);
    for (const [k, v] of Object.entries(query ?? {})) if (v != null) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = res.status === 204 ? null : await res.json();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json;
  };
  const get = async (path, query) => {
    const json = await call('GET', path, { query });
    responses[keyOf('GET', path, query)] = json;
    return json?.data ?? json;
  };

  const auth = await call('POST', '/auth/login', { body: { identifier, password: PASSWORD, platform: 'ANDROID', deviceName: 'SchoolOS app' } });
  token = auth.tokens.accessToken;
  if (!auth.activeMembershipId) token = (await call('POST', '/auth/select-school', { body: { membershipId: auth.memberships[0].id } })).accessToken;
  responses.login = { ...auth, tokens: { accessToken: 'demo', refreshToken: 'demo' } };

  await get('/app/config');
  const me = await get('/me');
  const can = (key) => key in (me.membership?.permissions ?? {});
  const children = me.membership?.children ?? [];
  await get('/notifications', { limit: 50 });
  await get('/notifications/unread-count');
  // Only this device: earlier recording runs leave other sessions behind.
  const sessions = await get('/me/sessions');
  responses['GET /me/sessions'] = { data: sessions.filter((x) => x.current) };
  const session = { from: `${recordedOn.slice(0, 4) - (recordedOn.slice(5, 7) < '04' ? 1 : 0)}-04-01` };
  session.to = addDays(`${Number(session.from.slice(0, 4)) + 1}-04-01`, -1);
  await get('/calendar', { from: session.from, to: session.to });
  // Day-by-day answers for one week: the demo picks the same weekday as the phone's today.
  const week = Array.from({ length: 7 }, (_, i) => addDays(recordedOn, -i));

  if (can('message.use')) {
    const all = await get('/conversations', { pageSize: 50 });
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED']) await get('/conversations', { pageSize: 50, status });
    for (const c of all) await get(`/conversations/${c.id}`);
    await get('/conversations/unread');
  }
  for (const when of ['upcoming', 'past']) await get('/meetings', { when });
  for (const status of ['active', 'done']) await get('/reminders', { status });

  for (const child of children) {
    const id = child.id;
    // The whole session; the demo cuts out the days and months a screen asks for.
    await get(`/students/${id}/attendance`);
    await get(`/students/${id}/performance`);
    for (const date of week) await get('/timetables/today', { date, studentId: id });
    await get('/homework', { studentId: id, pageSize: 30 });
    await get(`/students/${id}/fees`);
    await get(`/students/${id}/results`);
    await get(`/students/${id}/term-results`);
    await get('/documents', { ownerType: 'STUDENT', ownerId: id });
    if (child.sectionId) await get('/timetables', { sectionId: child.sectionId });
    if (can('message.use')) await get('/conversations/contacts', { studentId: id });
  }
  if (children.length) await get('/documents', { ownerType: 'SCHOOL' });

  if (me.membership?.teacherId) {
    await get('/dashboard');
    for (const date of week) await get('/timetables/today', { date });
    const students = new Map();
    for (const date of week) {
      const overview = await get('/attendance/overview', { date });
      for (const s of overview.sections.filter((x) => x.canMark)) {
        for (const d of [date, addDays(date, -7)]) {
          const register = await get(`/sections/${s.sectionId}/attendance`, { date: d });
          for (const st of register.students) students.set(st.studentId, st);
        }
      }
    }
    if (can('message.use')) for (const id of students.keys()) await get('/conversations/contacts', { studentId: id });
    const exams = await get('/exams/marks/mine');
    for (const s of exams.flatMap((e) => e.sheets)) await get('/exams/marks', { examSubjectId: s.examSubjectId, sectionId: s.section.id });
    await get('/homework/targets');
    await get('/homework', { mine: 'true', pageSize: 30 });
  }
  return responses;
}

mkdirSync(out, { recursive: true });
for (const [name, identifier] of [['parent', 'parent@demo.school'], ['teacher', 'teacher@demo.school']]) {
  const responses = await record(identifier);
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ recordedOn, responses }));
  console.log(`${name}: ${Object.keys(responses).length} responses`);
}
