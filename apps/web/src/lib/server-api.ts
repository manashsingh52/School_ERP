import 'server-only';
import type { ErrorBody, PublicSchoolBranding } from '@schoolos/contracts';
import { cookies, headers } from 'next/headers';
import { serverEnv } from './server-env';
import { ACCESS_COOKIE } from './session-cookies';
import { SCHOOL_SLUG_HEADER } from './tenant';
import { clientIpFrom, upstream } from './upstream';

export type ServerResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ErrorBody['error'] };

/** Call the API from a server component with the signed-in user's token. */
export async function serverApi<T>(path: string): Promise<ServerResult<T>> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  try {
    const res = await upstream({
      path,
      accessToken: cookieStore.get(ACCESS_COOKIE)?.value,
      slug: headerStore.get(SCHOOL_SLUG_HEADER),
      clientIp: clientIpFrom(headerStore),
      userAgent: headerStore.get('user-agent'),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: T } & Partial<ErrorBody>;
    if (res.ok) return { ok: true, data: body.data as T };
    return {
      ok: false,
      status: res.status,
      error: body.error ?? { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' },
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: "We can't reach Bastaa right now. Please try again in a moment." },
    };
  }
}

export async function currentSlug(): Promise<string | null> {
  return (await headers()).get(SCHOOL_SLUG_HEADER);
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Public branding for the current subdomain (cached 5 min). Accent is validated before use in CSS. */
export async function schoolBranding(slug: string | null): Promise<PublicSchoolBranding | null> {
  if (!slug) return null;
  try {
    const res = await fetch(`${serverEnv.apiUrl}/v1/public/schools/${encodeURIComponent(slug)}`, {
      headers: serverEnv.edgeSecret ? { 'x-edge-secret': serverEnv.edgeSecret } : undefined,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: PublicSchoolBranding };
    return { ...data, accentColor: HEX.test(data.accentColor) ? data.accentColor : '#2F6FEB' };
  } catch {
    return null;
  }
}
