/** Subdomains that are never schools (keep in sync with apps/api RESERVED_SLUGS). */
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'status', 'docs', 'help', 'support', 'mail', 'static', 'cdn']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/**
 * "stmarys.schoolos.in" → "stmarys", "demo.localhost:3000" → "demo".
 * Returns null for the bare domain and reserved names.
 */
export function slugFromHost(host: string | null, baseDomain: string): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0]!.toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  if (!SLUG.test(sub) || RESERVED.has(sub)) return null;
  return sub;
}

export const SCHOOL_SLUG_HEADER = 'x-school-slug';

/** The super-admin console lives on admin.<domain> (docs/12 Phase 6). */
export function isConsoleHost(host: string | null, baseDomain: string): boolean {
  const hostname = host?.split(':')[0]?.toLowerCase();
  return hostname === `admin.${baseDomain.toLowerCase()}`;
}

/** Set by the proxy (never trusted from the browser) on console requests. */
export const CONSOLE_HEADER = 'x-schoolos-console';
