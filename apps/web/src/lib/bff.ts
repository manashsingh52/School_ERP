import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * CSRF guard for state-changing BFF calls: the request must come from this same host and carry
 * our custom header (a cross-site form or fetch can't add it without a CORS preflight we never allow).
 */
export function csrfRejection(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  let sameOrigin = false;
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

/** Passes an API response through unchanged (status + JSON body). */
export async function relay(res: Response): Promise<NextResponse> {
  const body = await res.text();
  return new NextResponse(body || null, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'x-request-id': res.headers.get('x-request-id') ?? '',
      'cache-control': 'no-store',
    },
  });
}

export const serviceUnavailable = () =>
  NextResponse.json(
    { error: { code: 'SERVICE_UNAVAILABLE', message: "We can't reach SchoolOS right now. Please try again in a moment." } },
    { status: 503 },
  );
