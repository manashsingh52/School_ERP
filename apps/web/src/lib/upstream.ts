import 'server-only';
import { serverEnv } from './server-env';
import { SCHOOL_SLUG_HEADER } from './tenant';

export interface UpstreamOptions {
  method?: string;
  path: string; // "/v1/students?page=2"
  accessToken?: string;
  slug?: string | null;
  body?: BodyInit;
  contentType?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** Passed through so retries of money-moving requests are safe (docs/05 §4). */
  idempotencyKey?: string | null;
}

/** One place that talks to the API from the web server (BFF, proxy refresh, server components). */
export function upstream(opts: UpstreamOptions): Promise<Response> {
  const headers = new Headers({ accept: 'application/json' });
  if (opts.accessToken) headers.set('authorization', `Bearer ${opts.accessToken}`);
  if (opts.slug) headers.set(SCHOOL_SLUG_HEADER, opts.slug);
  if (opts.contentType) headers.set('content-type', opts.contentType);
  if (opts.userAgent) headers.set('user-agent', opts.userAgent);
  if (opts.requestId) headers.set('x-request-id', opts.requestId);
  if (opts.idempotencyKey) headers.set('idempotency-key', opts.idempotencyKey);
  if (serverEnv.edgeSecret) headers.set('x-edge-secret', serverEnv.edgeSecret); // the API refuses calls without it
  if (serverEnv.bffSecret && opts.clientIp) {
    headers.set('x-bff-key', serverEnv.bffSecret);
    headers.set('x-client-ip', opts.clientIp);
  }
  return fetch(`${serverEnv.apiUrl}${opts.path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body,
    cache: 'no-store',
    redirect: 'manual',
  });
}

/**
 * The browser's IP. In production set CLIENT_IP_HEADER=cf-connecting-ip (Cloudflare). Otherwise
 * use the LAST X-Forwarded-For entry — the one added by the nearest proxy, which a client can't forge.
 */
export function clientIpFrom(headers: Headers): string | null {
  if (serverEnv.clientIpHeader) return headers.get(serverEnv.clientIpHeader);
  const chain = headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return chain.at(-1) ?? headers.get('x-real-ip') ?? null;
}
