import Link from 'next/link';
import type { ReactNode } from 'react';
import { BastaaLogo } from '@/components/brand/logo';
import { serverEnv } from '@/lib/server-env';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/site';
import { ThemeToggle } from '@/lib/theme';
import { BookDemoProvider } from './book-demo';
import { SiteMotion } from './motion-bits';
import { SiteHeader, type SiteMode } from './site-header';

export const siteMode = (): SiteMode => (serverEnv.demo ? 'demo' : serverEnv.siteOnly ? 'site' : 'app');

function SiteFooter({ mode }: { mode: SiteMode }) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 min-[375px]:px-5 sm:grid-cols-[1.4fr_1fr] lg:px-8">
        <div className="flex flex-col gap-3">
          <BastaaLogo />
          <p className="max-w-sm text-[14px] leading-relaxed text-fg-secondary">School management for Indian schools: the office on the web, parents and teachers on their phones.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[14px] font-medium text-accent-strong hover:underline">{CONTACT_EMAIL}</a>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-1 text-[14px] text-fg-secondary">
          <Link href="/#features" className="py-1.5 hover:text-fg">Features</Link>
          <Link href="/#india" className="py-1.5 hover:text-fg">Built for India</Link>
          <Link href="/#how" className="py-1.5 hover:text-fg">How it works</Link>
          {mode === 'site' ? <Link href="/#contact" className="py-1.5 hover:text-fg">Contact</Link> : <Link href="/login" className="py-1.5 hover:text-fg">{mode === 'demo' ? 'Live demo' : 'Sign in'}</Link>}
          <Link href="/privacy" className="py-1.5 hover:text-fg">Privacy</Link>
          <Link href="/terms" className="py-1.5 hover:text-fg">Terms</Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 min-[375px]:px-5 lg:px-8">
          <p className="text-caption text-fg-tertiary">© {new Date().getFullYear()} Bastaa · Made in India</p>
          <ThemeToggle className="size-8" />
        </div>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const mode = siteMode();
  return (
    <SiteMotion>
      <BookDemoProvider>
        <div className="flex min-h-dvh flex-col overflow-x-clip bg-app">
          <SiteHeader mode={mode} />
          <main className="flex-1">{children}</main>
          <SiteFooter mode={mode} />
        </div>
      </BookDemoProvider>
    </SiteMotion>
  );
}

/** Privacy and terms: one readable column. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <SiteShell>
      <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 [&_a]:text-accent-strong [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-fg [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 text-[15px] leading-[1.7] text-fg-secondary">
        <h1 className="site-h2 text-fg">{title}</h1>
        <p className="!mt-2 text-small text-fg-tertiary">Last updated {LEGAL_UPDATED}</p>
        <p className="!mt-6 text-[17px] text-fg">{intro}</p>
        {children}
      </article>
    </SiteShell>
  );
}
