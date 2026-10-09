import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requestHost } from './edge';

/**
 * CSRF guard for state-changing BFF calls: the request must come from this same host and carry
 * our custom header (a cross-site form or fetch can't add it without a CORS preflight we never allow).
 */
export function csrfRejection(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const host = requestHost(req.headers);
  let sameOrigin: boolean;
  try {
    sameOrigin = !!origin && !!host && new URL(origin).host === host;
  } catch {
    sameOrigin = false;
  }
  if (sameOrigin && req.headers.get('x-schoolos-csrf') === '1') return null;
  return NextResponse.json(
    { error: { code: 'CSRF_REJECTED', message: 'This request was blocked for your security. Please reload the page.' } },
    { status: 403 },
  );
}

/** "Chrome on macOS" — shown in the user's device list. */
export function deviceNameFrom(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown device';
  return `${browser} on ${os}`;
}

const RELAYED_HEADERS = ['content-type', 'content-disposition', 'x-content-type-options', 'x-request-id', 'retry-after'];

/** Passes an API response through unchanged: status, raw bytes (JSON or file downloads) and safe headers. */
export async function relay(res: Response): Promise<NextResponse> {
  const body = await res.arrayBuffer();
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const name of RELAYED_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(body.byteLength ? body : null, { status: res.status, headers });
}

export const serviceUnavailable = () =>
  NextResponse.json(
    { error: { code: 'SERVICE_UNAVAILABLE', message: "We can't reach SchoolOS right now. Please try again in a moment." } },
    { status: 503 },
  );
