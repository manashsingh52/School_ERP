import { NextResponse, type NextRequest } from 'next/server';
import { csrfRejection } from '@/lib/bff';
import { ACCESS_COOKIE, clearSessionCookies } from '@/lib/session-cookies';
import { SCHOOL_SLUG_HEADER } from '@/lib/tenant';
import { upstream } from '@/lib/upstream';

export async function POST(req: NextRequest) {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    // Best effort: cookies are cleared even if the API is unreachable.
    await upstream({ method: 'POST', path: '/v1/auth/logout', accessToken, slug: req.headers.get(SCHOOL_SLUG_HEADER) }).catch(
      () => null,
    );
  }
  const res = NextResponse.json({ data: { ok: true } });
  clearSessionCookies(res);
  return res;
}
