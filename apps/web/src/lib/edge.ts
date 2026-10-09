import { serverEnv } from './server-env';

/**
 * Behind the Cloudflare Worker (docs/10 §3, option B) Cloud Run sees its own *.run.app host; the
 * real one ("stmarys.schoolos.in") arrives in X-Forwarded-Host. We trust that header only when the
 * request carries the edge secret — so the public run.app URL can't be used to pick a school.
 * Without EDGE_SHARED_SECRET (local development) the Host header is used as before.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function fromEdge(headers: Headers): boolean {
  const secret = serverEnv.edgeSecret;
  if (!secret) return true;
  const sent = headers.get('x-edge-secret');
  return !!sent && sameSecret(sent, secret);
}

/** The host the browser used. */
export function requestHost(headers: Headers): string | null {
  if (serverEnv.edgeSecret) return fromEdge(headers) ? (headers.get('x-forwarded-host') ?? headers.get('host')) : null;
  return headers.get('host');
}

/** "https://stmarys.schoolos.in" — for redirects and absolute links. */
export function requestOrigin(headers: Headers, fallback: string): string {
  const host = requestHost(headers);
  if (!host) return new URL(fallback).origin;
  const proto = serverEnv.edgeSecret ? (headers.get('x-forwarded-proto') ?? 'https') : new URL(fallback).protocol.replace(':', '');
  return `${proto}://${host}`;
}
