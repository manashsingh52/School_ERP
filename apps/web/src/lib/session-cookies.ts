import 'server-only';
import type { TokenPair } from '@schoolos/contracts';
import type { NextResponse } from 'next/server';
import { serverEnv } from './server-env';

/**
 * Tokens live only in httpOnly, host-only cookies (no Domain attribute), so a session on
 * stmarys.bastaa.in is never sent to dps.bastaa.in (docs/03 §1, docs/09 §1).
 */
export const ACCESS_COOKIE = 'sos_at';
export const REFRESH_COOKIE = 'sos_rt';

const base = () => ({ httpOnly: true, secure: serverEnv.secureCookies, sameSite: 'lax' as const, path: '/' });
const secondsUntil = (iso: string) => Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));

export function setSessionCookies(res: NextResponse, tokens: TokenPair): void {
  // The access cookie expires slightly before the token, so the proxy refreshes in time.
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base(), maxAge: Math.max(0, secondsUntil(tokens.accessTokenExpiresAt) - 30) });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...base(), maxAge: secondsUntil(tokens.refreshTokenExpiresAt) });
}

export function setAccessCookie(res: NextResponse, accessToken: string, expiresAt: string): void {
  res.cookies.set(ACCESS_COOKIE, accessToken, { ...base(), maxAge: Math.max(0, secondsUntil(expiresAt) - 30) });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, '', { ...base(), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { ...base(), maxAge: 0 });
}
