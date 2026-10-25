import 'server-only';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * RECORD_DEMO_DIR=<dir>: every GET the web server makes to the API is appended to
 * <dir>/<user id>.jsonl, for `tool/demo/record.mjs` to turn into demo/fixtures.json. Local only.
 */
export async function recordDemo(dir: string, opts: { method?: string; path: string; accessToken?: string }, res: Response): Promise<void> {
  if ((opts.method ?? 'GET').toUpperCase() !== 'GET' || !opts.accessToken) return;
  let sub: string | undefined;
  try {
    sub = (JSON.parse(Buffer.from(opts.accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: string }).sub;
  } catch {
    return;
  }
  if (!sub || !/^[\w-]+$/.test(sub)) return;
  const type = res.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await res.clone().arrayBuffer());
  if (bytes.length > 1_500_000) return;
  const entry = {
    path: opts.path,
    s: res.status,
    t: type || undefined,
    d: res.headers.get('content-disposition') ?? undefined,
    ...(type.includes('json') || !bytes.length ? { j: bytes.toString('utf8') } : { b64: bytes.toString('base64') }),
  };
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, `${sub}.jsonl`), `${JSON.stringify(entry)}\n`);
}
