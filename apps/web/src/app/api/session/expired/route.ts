import { NextResponse, type NextRequest } from 'next/server';
import { requestOrigin } from '@/lib/edge';
import { clearSessionCookies } from '@/lib/session-cookies';

/** Server components land here when the API rejects the session; clears cookies, then sign-in. */
export function GET(req: NextRequest) {
  const login = new URL('/login', requestOrigin(req.headers, req.url));
  const next = req.nextUrl.searchParams.get('next');
  if (next?.startsWith('/') && !next.startsWith('//')) login.searchParams.set('next', next);
  const res = NextResponse.redirect(login);
  clearSessionCookies(res);
  return res;
}
