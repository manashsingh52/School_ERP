import 'server-only';
import type { AuthResponse } from '@schoolos/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { csrfRejection, deviceNameFrom, relay, serviceUnavailable } from './bff';
import { setSessionCookies } from './session-cookies';
import { SCHOOL_SLUG_HEADER } from './tenant';
import { clientIpFrom, upstream } from './upstream';

/**
 * Shared by password and OTP sign-in: forward to the API for this school, then move the tokens
 * into httpOnly cookies. The browser only receives the user and school.
 */
export async function signIn(req: NextRequest, apiPath: '/v1/auth/login' | '/v1/auth/otp/verify') {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const slug = req.headers.get(SCHOOL_SLUG_HEADER);
  if (!slug) {
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
      body: JSON.stringify({ ...input, schoolSlug: slug, platform: 'WEB', deviceName: deviceNameFrom(userAgent) }),
      clientIp: clientIpFrom(req.headers),
      userAgent,
    });
  } catch {
    return serviceUnavailable();
  }
  if (!res.ok) return relay(res);

  const auth = (await res.json()) as AuthResponse;
  const response = NextResponse.json({ data: { user: auth.user, activeMembershipId: auth.activeMembershipId } });
  setSessionCookies(response, auth.tokens);
  return response;
}
