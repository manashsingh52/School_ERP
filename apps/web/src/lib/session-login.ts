import 'server-only';
import type { AuthResponse } from '@schoolos/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { csrfRejection, deviceNameFrom, relay, serviceUnavailable } from './bff';
import { setSessionCookies } from './session-cookies';
import { CONSOLE_HEADER, SCHOOL_SLUG_HEADER } from './tenant';
import { clientIpFrom, upstream } from './upstream';

/**
 * Shared by password, OTP and school-code sign-in: forward to the API for this school, then move the tokens
 * into httpOnly cookies. The browser only receives the user and school.
 */
export async function signIn(req: NextRequest, apiPath: '/v1/auth/login' | '/v1/auth/otp/verify' | '/v1/auth/code/redeem') {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const slug = req.headers.get(SCHOOL_SLUG_HEADER);
  const console = req.headers.get(CONSOLE_HEADER) === '1';
  if (console && apiPath !== '/v1/auth/login') {
    return NextResponse.json({ error: { code: 'PASSWORD_REQUIRED', message: 'Sign in to the admin console with your password.' } }, { status: 400 });
  }
  if (!slug && !console) {
    return NextResponse.json(
      { error: { code: 'SCHOOL_REQUIRED', message: "Open your school's web address to sign in." } },
      { status: 400 },
    );
  }

  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const userAgent = req.headers.get('user-agent');
  let res: Response;
  try {
    res = await upstream({
      method: 'POST',
      path: apiPath,
      contentType: 'application/json',
      body: JSON.stringify({ ...input, schoolSlug: slug ?? undefined, platform: 'WEB', deviceName: deviceNameFrom(userAgent) }),
      clientIp: clientIpFrom(req.headers),
      userAgent,
    });
  } catch {
    return serviceUnavailable();
  }
  if (!res.ok) return relay(res);

  const auth = (await res.json()) as AuthResponse;
  if (console && !auth.isPlatformAdmin) {
    // A school account on the console: end the session it just started and refuse.
    await upstream({ method: 'POST', path: '/v1/auth/logout', accessToken: auth.tokens.accessToken, contentType: 'application/json', body: '{}' }).catch(() => null);
    return NextResponse.json({ error: { code: 'NOT_PLATFORM_ADMIN', message: "This account can't use the SchoolOS admin console." } }, { status: 403 });
  }
  const response = NextResponse.json({ data: { user: auth.user, activeMembershipId: auth.activeMembershipId } });
  setSessionCookies(response, auth.tokens);
  return response;
}
