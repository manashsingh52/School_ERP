import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { csrfRejection, relay, serviceUnavailable } from '@/lib/bff';
import { ACCESS_COOKIE } from '@/lib/session-cookies';
import { SCHOOL_SLUG_HEADER } from '@/lib/tenant';
import { clientIpFrom, upstream } from '@/lib/upstream';

/**
 * Backend-for-frontend: the browser calls /api/v1/* on its own school subdomain; we attach the
 * access token from the httpOnly cookie and the school slug, then forward to the API.
 * The browser never sees a token.
 */

// Auth endpoints that return tokens go through /api/session/* instead (which sets cookies).
const BLOCKED_AUTH = new Set(['login', 'refresh', 'otp/verify', 'select-school', 'logout']);

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path[0] === 'auth' && BLOCKED_AUTH.has(path.slice(1).join('/'))) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: "We couldn't find that page." } }, { status: 404 });
  }

  const method = req.method.toUpperCase();
  const mutating = method !== 'GET' && method !== 'HEAD';
  if (mutating) {
    const rejected = csrfRejection(req);
    if (rejected) return rejected;
  }

  try {
    const res = await upstream({
      method,
      path: `/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`,
      accessToken: req.cookies.get(ACCESS_COOKIE)?.value,
      slug: req.headers.get(SCHOOL_SLUG_HEADER),
      body: mutating ? await req.text() : undefined,
      contentType: req.headers.get('content-type'),
      clientIp: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent'),
      requestId: req.headers.get('x-request-id'),
    });
    return relay(res);
  } catch {
    return serviceUnavailable();
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
