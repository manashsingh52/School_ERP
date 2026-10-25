import { NextResponse, type NextRequest } from 'next/server';
import { csrfRejection } from '@/lib/bff';
import { DEMO_PERSONAS, demoToken } from '@/lib/demo';
import { serverEnv } from '@/lib/server-env';
import { setAccessCookie } from '@/lib/session-cookies';

/** Demo mode only: "sign in" as one of the sample school's people. */
export async function POST(req: NextRequest) {
  if (!serverEnv.demo) return NextResponse.json({ error: { code: 'NOT_FOUND', message: "We couldn't find that page." } }, { status: 404 });
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const { persona } = (await req.json().catch(() => ({}))) as { persona?: string };
  const found = DEMO_PERSONAS.find((p) => p.key === persona);
  if (!found) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Choose a role.' } }, { status: 422 });
  const res = NextResponse.json({ data: { home: found.home } });
  setAccessCookie(res, demoToken(found.key), new Date(Date.now() + 7 * 86_400_000).toISOString());
  return res;
}
