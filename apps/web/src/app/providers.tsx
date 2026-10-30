'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, TooltipProvider } from '@schoolos/ui';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { I18nProvider } from '@/lib/i18n';
import type { Lang } from '@/lib/i18n-shared';

export function Providers({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Don't retry what won't change on retry (permission, not found, validation).
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <I18nProvider lang={lang}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
