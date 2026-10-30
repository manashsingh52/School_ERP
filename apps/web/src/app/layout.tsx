import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono, Noto_Sans_Devanagari } from 'next/font/google';
import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { currentSlug, schoolBranding } from '@/lib/server-api';
import { THEME_COOKIE, parseTheme } from '@/lib/theme-shared';
import { demoPersonaFrom } from '@/lib/demo';
import { translate } from '@/lib/i18n-translate';
import { LANG_COOKIE, parseLang } from '@/lib/i18n-shared';
import { serverEnv } from '@/lib/server-env';
import { ACCESS_COOKIE } from '@/lib/session-cookies';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', style: ['normal', 'italic'], axes: ['opsz', 'SOFT'], display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
const devanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-devanagari', weight: ['400', '500', '600', '700'], display: 'swap' });

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
  const lang = parseLang(cookieStore.get(LANG_COOKIE)?.value);
  const t = (x: string) => translate(lang, x);
  // The school's accent is set once on <html>; every shade is derived from it in CSS.
  const style = school ? ({ '--accent': school.accentColor } as CSSProperties) : undefined;
  return (
    <html lang={lang === 'hi' ? 'hi-IN' : 'en-IN'} data-theme={theme} className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable} ${devanagari.variable}`} style={style}>
      <body>
        <Providers lang={lang}>{children}</Providers>
        {serverEnv.demo && demoPersonaFrom(cookieStore.get(ACCESS_COOKIE)?.value) && (
          <a href="/login" className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-4 z-40 rounded-full bg-charcoal px-4 py-2 text-small text-white shadow-e3 hover:opacity-90 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2">
            <span className="hidden sm:inline">{t("Demo with a sample school · changes aren't saved")} · </span>
            <span className="sm:hidden">{t('Demo')} · </span>
            <span className="font-semibold underline">{t('Switch role')}</span>
          </a>
        )}
      </body>
    </html>
  );
}
