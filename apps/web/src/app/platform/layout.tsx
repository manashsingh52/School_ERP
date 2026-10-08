import type { MeResponse } from '@schoolos/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/platform/console-shell';
import { serverApi } from '@/lib/server-api';
import { AuthFrame } from '../login/find-school';
import { ShellError } from '../(app)/shell-error';

export const metadata: Metadata = { title: { default: 'SchoolOS Admin', template: '%s · SchoolOS Admin' } };

/** The super-admin console (admin.<domain>): platform staff only; the API checks every call again. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const me = await serverApi<MeResponse>('/v1/me');
  if (!me.ok) {
    if (me.status === 401) redirect('/api/session/expired?next=/platform');
    return <ShellError message={me.error.message} supportRef={me.error.supportRef} />;
  }
  if (!me.data.platformRole) {
    return (
      <AuthFrame schoolName="SchoolOS Admin" subtitle="Staff only">
        <p className="text-body text-fg-secondary">This account isn&apos;t part of the SchoolOS team.</p>
      </AuthFrame>
    );
  }
  return <ConsoleShell user={me.data.user} role={me.data.platformRole}>{children}</ConsoleShell>;
}
