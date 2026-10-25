import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { currentSlug, schoolBranding } from '@/lib/server-api';
import { THEME_COOKIE, parseTheme } from '@/lib/theme-shared';
import { demoPersonaFrom } from '@/lib/demo';
import { serverEnv } from '@/lib/server-env';
import { ACCESS_COOKIE } from '@/lib/session-cookies';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', style: ['normal', 'italic'], axes: ['opsz', 'SOFT'], display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e0c' },
  ],
};

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
    <html lang="en-IN" data-theme={theme} className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`} style={style}>
      <body>
        <Providers>{children}</Providers>
        {serverEnv.demo && demoPersonaFrom(cookieStore.get(ACCESS_COOKIE)?.value) && (
          <a href="/login" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-charcoal px-4 py-2 text-small text-white shadow-e3 hover:opacity-90">
            Demo with a sample school · changes aren&apos;t saved · <span className="font-semibold underline">Switch role</span>
          </a>
        )}
      </body>
    </html>
  );
}
