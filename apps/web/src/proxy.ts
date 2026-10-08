import type { TokenPair } from '@schoolos/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/server-env';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies, setSessionCookies } from '@/lib/session-cookies';
import { CONSOLE_HEADER, SCHOOL_SLUG_HEADER, isConsoleHost, slugFromHost } from '@/lib/tenant';
import { clientIpFrom, upstream } from '@/lib/upstream';

const PUBLIC_PAGES = ['/login'];

/**
 * Runs before every page and BFF call:
 *  1. Subdomain → school slug, passed downstream in X-School-Slug (any browser-sent value is dropped);
 *     admin.<domain> is the super-admin console (X-SchoolOS-Console), which only serves /platform
 *  2. If the short-lived access cookie is gone but a refresh cookie exists, refresh here so the
 *     page renders with a valid token (server components can't set cookies themselves)
 *  3. Signed-out visitors go to /login
 */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const slug = slugFromHost(req.headers.get('host'), serverEnv.baseDomain);
  const isApi = path.startsWith('/api/');
  const isPublicPage = PUBLIC_PAGES.includes(path);

  const consoleHost = isConsoleHost(req.headers.get('host'), serverEnv.baseDomain);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(SCHOOL_SLUG_HEADER);
  requestHeaders.delete(CONSOLE_HEADER);
  if (slug) requestHeaders.set(SCHOOL_SLUG_HEADER, slug);
  if (consoleHost) requestHeaders.set(CONSOLE_HEADER, '1');

  // The super-admin console only serves /platform (and sign-in); schools never serve /platform.
  const isPlatformPage = path === '/platform' || path.startsWith('/platform/');
  if (consoleHost && !isApi && !isPublicPage && !isPlatformPage) return NextResponse.redirect(new URL('/platform', req.url));
  if (!consoleHost && isPlatformPage) return NextResponse.redirect(new URL('/login', req.url));

  // The bare domain only serves "Find your school".
  if (!slug && !consoleHost) {
    if (isApi || path === '/login') return NextResponse.next({ request: { headers: requestHeaders } });
    return NextResponse.redirect(new URL('/login', req.url));
  }

  let accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  let refreshed: TokenPair | null = null;
  let sessionEnded = false;

  if (!accessToken && refreshToken && !path.startsWith('/api/session')) {
    const res = await upstream({
      method: 'POST',
      path: '/v1/auth/refresh',
      body: JSON.stringify({ refreshToken }),
      contentType: 'application/json',
      clientIp: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent'),
    }).catch(() => null);

    if (res?.ok) {
      refreshed = ((await res.json()) as { tokens: TokenPair }).tokens;
      accessToken = refreshed.accessToken;
      req.cookies.set(ACCESS_COOKIE, refreshed.accessToken);
      req.cookies.set(REFRESH_COOKIE, refreshed.refreshToken);
      requestHeaders.set('cookie', req.cookies.toString());
    } else if (res?.status === 401) {
      const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
      // TOKEN_ROTATED = another tab refreshed a moment ago; its new cookies are on their way.
      sessionEnded = code !== 'TOKEN_ROTATED';
    }
  }

  if (!accessToken && !isApi && !isPublicPage) {
    const login = new URL('/login', req.url);
    if (path !== '/') login.searchParams.set('next', `${path}${req.nextUrl.search}`);
    const redirect = NextResponse.redirect(login);
    if (sessionEnded) clearSessionCookies(redirect);
    return redirect;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (refreshed) setSessionCookies(response, refreshed);
  if (sessionEnded) clearSessionCookies(response);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)'],
};
