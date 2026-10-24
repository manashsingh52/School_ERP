import type { MeResponse } from '@schoolos/contracts';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentSlug, schoolBranding, serverApi } from '@/lib/server-api';
import { ACCESS_COOKIE } from '@/lib/session-cookies';
import { CONSOLE_HEADER } from '@/lib/tenant';
import { AuthFrame, FindSchool, UnknownSchool } from './find-school';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

/** Only same-site relative paths are allowed as a post-login destination. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/api/') ? next : '/dashboard';
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, slug, headerStore] = await Promise.all([searchParams, currentSlug(), headers()]);
  if (headerStore.get(CONSOLE_HEADER) === '1') {
    if ((await cookies()).has(ACCESS_COOKIE)) {
      const me = await serverApi<MeResponse>('/v1/me');
      if (me.ok && me.data.platformRole) redirect('/platform');
    }
    return (
      <AuthFrame schoolName="Bastaa Admin" subtitle="Platform console — staff only" brand>
        <LoginForm next={next?.startsWith('/platform') ? safeNext(next) : '/platform'} passwordOnly />
      </AuthFrame>
    );
  }
  if (!slug) return <FindSchool />;

  const school = await schoolBranding(slug);
  if (!school) return <UnknownSchool slug={slug} />;

  if ((await cookies()).has(ACCESS_COOKIE)) {
    const me = await serverApi<MeResponse>('/v1/me');
    if (me.ok && me.data.membership) redirect(safeNext(next));
  }

  return (
    <AuthFrame schoolName={school.name} subtitle="Sign in to continue">
      <LoginForm next={safeNext(next)} otpLogin={school.otpLogin} />
    </AuthFrame>
  );
}
