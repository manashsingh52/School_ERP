/**
 * The Flutter app (apps/mobile) calls the API by path. This keeps it honest: every call it makes
 * must be a registered route with the same method — rename a route and this fails.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINTS } from '@schoolos/contracts';
import { describe, expect, it } from 'vitest';

const LIB = join(import.meta.dirname, '../../mobile/lib');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.dart') ? [join(dir, f)] : []));

/** `api.get<Json>('/students/${id}/fees')` → GET /v1/students/:x/fees */
function calls(): { method: string; path: string; file: string }[] {
  const out: { method: string; path: string; file: string }[] = [];
  for (const file of files(LIB)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.(get|post|put|delete)<[^>]*>\(\s*'((?:\$\{[^}]*\}|[^'])+)'/g)) {
      const raw = m[2]!.replace(/\$\{[^}]*\}|\$\w+/g, ':x');
      const path = raw.startsWith('/v1') ? raw : `/v1${raw}`;
      out.push({ method: m[1]!.toUpperCase(), path, file: file.slice(LIB.length + 1) });
    }
  }
  // The queue builds its path in a helper; check it explicitly.
  out.push({ method: 'PUT', path: '/v1/sections/:x/attendance', file: 'core/attendance_queue.dart' });
  return out;
}

const normal = (k: string) => k.replace(/:\w+/g, ':x');
const routes = new Set(Object.keys(ENDPOINTS).map(normal));

describe('mobile app → API routes', () => {
  it('finds the calls', () => {
    expect(calls().length).toBeGreaterThan(30);
  });

  it('every call is a registered route', () => {
    const missing = calls().filter((c) => !routes.has(`${c.method} ${c.path}`));
    expect(missing, 'routes the app calls that the API does not have').toEqual([]);
  });
});
