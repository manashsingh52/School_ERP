'use client';

import { ErrorState } from '@schoolos/ui';

export function ShellError({ message, supportRef }: { message: string; supportRef?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <ErrorState
        title="We couldn't open your school"
        message={message}
        supportRef={supportRef}
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
