import { Button } from '@schoolos/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BastaaLogo } from '@/components/brand/logo';
import { serverEnv } from '@/lib/server-env';
import { CONTACT_EMAIL, DEMO_MAILTO, LEGAL_UPDATED } from '@/lib/site';

function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-app/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Bastaa home"><BastaaLogo /></Link>
        <nav aria-label="Site" className="hidden flex-1 items-center gap-5 text-body text-fg-secondary md:flex">
          <Link href="/#features" className="hover:text-fg">Features</Link>
          <Link href="/#how" className="hover:text-fg">How it works</Link>
          <Link href="/#contact" className="hover:text-fg">Contact</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {!serverEnv.siteOnly && <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>}
          <Button asChild size="sm"><a href={DEMO_MAILTO}>Book a demo</a></Button>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <BastaaLogo />
          <p className="max-w-xs text-small text-fg-secondary">School management for Indian schools: the office on the web, parents and teachers on their phones.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-small text-fg-secondary">
          <Link href="/#features" className="hover:text-fg">Features</Link>
          {serverEnv.siteOnly ? <Link href="/#how" className="hover:text-fg">How it works</Link> : <Link href="/login" className="hover:text-fg">Sign in</Link>}
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="col-span-2 hover:text-fg">{CONTACT_EMAIL}</a>
        </nav>
      </div>
      <p className="border-t border-border py-4 text-center text-caption text-fg-tertiary">© {new Date().getFullYear()} Bastaa · Made in India</p>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Privacy and terms: one readable column. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <SiteShell>
      <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 [&_a]:text-accent-strong [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-h2 [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 text-body text-fg-secondary">
        <h1 className="text-display font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        <p className="!mt-2 text-small text-fg-tertiary">Last updated {LEGAL_UPDATED}</p>
        <p className="!mt-6 text-h3 text-fg">{intro}</p>
        {children}
      </article>
    </SiteShell>
  );
}
