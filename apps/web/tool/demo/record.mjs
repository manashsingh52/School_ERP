/**
 * Records the website demo (demo/fixtures.json) from the seeded demo school.
 *
 *   1. API (apps/api) with the demo seed, started with FAKE_NOW and RUN_WORKERS=false:
 *        FAKE_NOW=2026-10-21T04:00:00Z node --import ../web/tool/demo/fake-now.mjs dist/main.js
 *   2. Web (apps/web, normal build) started with the same clock and the recorder on:
 *        FAKE_NOW=… RECORD_DEMO_DIR=/tmp/demo-rec NODE_OPTIONS="--import ./tool/demo/fake-now.mjs" pnpm start
 *   3. From apps/e2e (for Playwright):  node ../web/tool/demo/record.mjs /tmp/demo-rec
 *
 * It signs in as each persona, walks every page it can reach (tabs and detail pages included),
 * then turns the recorder's files into apps/web/demo/fixtures.json.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const DIR = process.argv[2] ?? '/tmp/demo-rec';
const FAKE_NOW = process.env.FAKE_NOW ?? '2026-10-21T04:00:00Z';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo@12345';
const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB_PORT = process.env.WEB_PORT ?? '3000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo/fixtures.json');

const PERSONAS = [
  { key: 'admin', email: 'admin@demo.school', host: `demo.localhost:${WEB_PORT}` },
  { key: 'teacher', email: 'teacher@demo.school', host: `demo.localhost:${WEB_PORT}` },
  { key: 'parent', email: 'parent@demo.school', host: `demo.localhost:${WEB_PORT}` },
  { key: 'owner', email: 'superadmin@schoolos.local', host: `admin.localhost:${WEB_PORT}` },
];
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 160);
const PER_PATTERN = 2;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });

async function crawl(persona) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(FAKE_NOW));
  const base = `http://${persona.host}`;
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  const pwTab = page.getByRole('tab', { name: /password/i });
  if (await pwTab.count()) await pwTab.first().click();
  await page.fill('#identifier', persona.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });

  // Detail pages open from table rows (not links), so list them from the API too.
  const details = await page.evaluate(async () => {
    const get = async (u) => {
      const r = await fetch(`/api/v1${u}`, { credentials: 'same-origin' });
      return r.ok ? (await r.json()).data ?? [] : [];
    };
    const out = [];
    const first = (rows, n) => (Array.isArray(rows) ? rows.slice(0, n) : []);
    const students = [...(await get('/students?q=Mishra')), ...first(await get('/students?pageSize=5'), 2)];
    for (const s of students) out.push(`/students/${s.id}`);
    for (const t of first(await get('/teachers?pageSize=5'), 2)) out.push(`/teachers/${t.id}`);
    for (const g of [...(await get('/guardians?q=Rajesh')), ...first(await get('/guardians?pageSize=5'), 1)]) out.push(`/guardians/${g.id}`);
    for (const e of first(await get('/exams'), 6)) out.push(`/exams/${e.id}`, `/exams/${e.id}/marks`);
    for (const n of first(await get('/notices?status=PUBLISHED'), 3)) out.push(`/notices/${n.id}`);
    for (const c of first(await get('/conversations?view=mine'), 3)) out.push(`/messages/${c.id}`);
    for (const f of first(await get('/fee-structures'), 3)) out.push(`/fees/structures/${f.id}`);
    const classes = await get('/classes');
    const sections = (Array.isArray(classes) ? classes : []).flatMap((c) => c.sections.map((s) => ({ ...s, cls: c.name })));
    for (const s of sections.filter((s) => (s.cls === 'Class 5' && s.name === 'B') || (s.cls === 'Class 8' && s.name === 'A'))) out.push(`/attendance/${s.id}`);
    return [...new Set(out)];
  });
  const queue = [new URL(page.url()).pathname, ...details];
  const seen = new Set(queue);
  const patterns = new Map();
  let visited = 0;
  while (queue.length && visited < MAX_PAGES) {
    const target = queue.shift();
    visited++;
    try {
      await page.goto(base + target, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(500);
      const tabs = page.getByRole('tab');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        const tab = tabs.nth(i);
        if (!(await tab.isVisible()) || (await tab.isDisabled())) continue;
        await tab.click({ timeout: 3000 }).catch(() => null);
        await page.waitForLoadState('networkidle').catch(() => null);
        await page.waitForTimeout(300);
      }
      // Forms that load their own options when opened (New notice, Add to calendar, …): open and close each.
      const openers = page.getByRole('button', { name: /^(New|Add|Make|Schedule|Raise|Collect|Book)\b/ });
      const m = await openers.count();
      for (let i = 0; i < m; i++) {
        const opener = openers.nth(i);
        if (!(await opener.isVisible().catch(() => false))) continue;
        await opener.click({ timeout: 3000 }).catch(() => null);
        await page.waitForLoadState('networkidle').catch(() => null);
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
        if (new URL(page.url()).pathname !== target.split('?')[0]) await page.goto(base + target, { waitUntil: 'networkidle' }).catch(() => null);
      }
      if (target === '/reports') {
        // Every report in the catalogue, so its preview is recorded.
        const items = page.locator('aside button, nav button').filter({ hasNotText: /^$/ });
        const count = await items.count();
        for (let i = 0; i < count; i++) {
          await items.nth(i).click({ timeout: 3000 }).catch(() => null);
          await page.waitForLoadState('networkidle').catch(() => null);
        }
      }
      const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')));
      for (const href of hrefs) {
        if (!href || /^\/(api|login|_next)/.test(href) || href.includes('#')) continue;
        const url = new URL(href, base);
        const key = url.pathname + url.search;
        if (seen.has(key)) continue;
        const pattern = key.replace(UUID, ':id');
        const count = patterns.get(pattern) ?? 0;
        if (count >= PER_PATTERN) continue;
        patterns.set(pattern, count + 1);
        seen.add(key);
        queue.push(key);
      }
    } catch (err) {
      console.warn(persona.key, target, String(err).split('\n')[0]);
    }
  }
  console.log(`${persona.key}: ${visited} pages`);
  return { ctx, page, base };
}

for (const persona of PERSONAS) {
  const { ctx, page, base } = await crawl(persona);
  if (persona.key === 'admin') {
    // Printable ID cards: Class 5-B's sheet and one student's card (fetched in the page, which resolves *.localhost).
    await page.goto(`${base}/students`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const get = (u) => fetch(u, { credentials: 'same-origin' });
      const classes = await (await get('/api/v1/classes')).json();
      const fiveB = classes.data.find((c) => c.name === 'Class 5')?.sections.find((s) => s.name === 'B');
      if (fiveB) await (await get(`/api/v1/students/id-cards?sectionId=${fiveB.id}`)).arrayBuffer();
      const ananya = (await (await get('/api/v1/students?q=Ananya%20Mishra')).json()).data[0];
      if (ananya) await (await get(`/api/v1/students/id-cards?studentId=${ananya.id}`)).arrayBuffer();
    });
  }
  await ctx.close();
}
await browser.close();

// Recorder files (one per user id) → fixtures keyed by persona.
const responses = {};
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.jsonl'))) {
  const entries = readFileSync(path.join(DIR, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const me = entries.find((e) => e.path === '/v1/me' && e.s === 200);
  const email = me && JSON.parse(me.j).data?.user?.email;
  const persona = PERSONAS.find((p) => p.email === email)?.key;
  if (!persona) continue;
  const table = (responses[persona] ??= {});
  for (const { path: p, ...rest } of entries) {
    if (rest.s >= 500) continue;
    table[p] = rest;
  }
}
const branding = (await (await fetch(`${API}/v1/public/schools/demo`)).json()).data;
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ recordedOn: FAKE_NOW.slice(0, 10), branding, responses }));
for (const [k, t] of Object.entries(responses)) console.log(`${k}: ${Object.keys(t).length} answers`);
console.log('wrote', OUT);
