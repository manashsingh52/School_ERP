/** Unexpected errors go to Sentry (SENTRY_DSN), with no request data. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ErrorReporter } from '../src/core/errors/error-reporter.js';
import { createTestApp, type TestApp } from './helpers.js';

let server: Server;
let t: TestApp;
const received: { url: string; auth: string; body: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ url: req.url!, auth: String(req.headers['x-sentry-auth']), body });
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  t = await createTestApp({ SENTRY_DSN: `http://public-key@127.0.0.1:${(server.address() as AddressInfo).port}/42`, RELEASE: 'abc123' });
});

afterAll(async () => {
  await t?.close();
  server?.close();
});

it('sends the error, its stack and the tags, nothing else', async () => {
  t.app.get(ErrorReporter).report(new TypeError('boom'), { supportRef: 'ERR-ABC123', route: '/v1/students/:id', empty: undefined });
  await expect.poll(() => received.length).toBe(1);
  const { url, auth, body } = received[0]!;
  expect(url).toBe('/api/42/envelope/');
  expect(auth).toContain('sentry_key=public-key');
  const [header, item, event] = body.trim().split('\n').map((l) => JSON.parse(l));
  expect(item).toEqual({ type: 'event' });
  expect(header.event_id).toBe(event.event_id);
  expect(event).toMatchObject({ level: 'error', environment: 'test', release: 'abc123', tags: { supportRef: 'ERR-ABC123', route: '/v1/students/:id' } });
  expect(event.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'boom' });
  expect(event.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
  expect(Object.keys(event).sort()).toEqual(['environment', 'event_id', 'exception', 'level', 'platform', 'release', 'tags', 'timestamp']);
});
