import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { currentSlug, schoolBranding } from '@/lib/server-api';
import { THEME_COOKIE, parseTheme } from '@/lib/theme-shared';
import { Providers } from './providers';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const school = await schoolBranding(await currentSlug());
  return {
    title: { default: school?.name ?? 'Bastaa', template: `%s · ${school?.name ?? 'Bastaa'}` },
    description: 'School management for schools that want to move fast.',
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [school, cookieStore] = await Promise.all([schoolBranding(await currentSlug()), cookies()]);
  // Theme comes from a cookie so the first paint is already right (no light flash in dark mode).
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // The school's accent is set once on <html>; every shade is derived from it in CSS.
  const style = school ? ({ '--accent': school.accentColor } as CSSProperties) : undefined;
  return (
    <html lang="en-IN" data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`} style={style}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
