import type { MeResponse } from '@schoolos/contracts';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { MeProvider } from '@/lib/me';
import { serverApi } from '@/lib/server-api';
import { AuthFrame } from '../login/find-school';
import { ShellError } from './shell-error';

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const me = await serverApi<MeResponse>('/v1/me');

  if (!me.ok) {
    if (me.status === 401) redirect('/api/session/expired');
    return <ShellError message={me.error.message} supportRef={me.error.supportRef} />;
  }
  if (!me.data.membership) {
    return (
      <AuthFrame schoolName="No access" subtitle="Your account isn't part of this school.">
        <p className="text-body text-fg-secondary">Ask the school office to invite you, or sign in to your own school.</p>
      </AuthFrame>
    );
  }

  return (
    <MeProvider me={me.data}>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
