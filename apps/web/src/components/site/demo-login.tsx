'use client';

import { cn, toast } from '@schoolos/ui';
import { ArrowLeft, ArrowRight, Building2, Check, GraduationCap, Heart, Loader2, Users } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BastaaLogo } from '@/components/brand/logo';
import { ApiError, apiPost } from '@/lib/api-client';
import { ThemeToggle } from '@/lib/theme';
import { SPRING, SiteMotion } from './motion-bits';

const ICONS = { admin: Building2, teacher: Users, parent: Heart, owner: GraduationCap } as const;

export interface DemoPersonaCard {
  key: keyof typeof ICONS;
  title: string;
  person: string;
  text: string;
  caps: readonly string[];
}

/** Demo mode sign-in: pick whose day to look at; `autoEnter` opens one straight away. */
export function DemoLogin({ personas, autoEnter }: { personas: readonly DemoPersonaCard[]; autoEnter?: DemoPersonaCard['key'] }) {
  const [busy, setBusy] = useState<string | null>(autoEnter ?? null);
  const started = useRef(false);

  async function enter(key: string) {
    setBusy(key);
    try {
      const res = await apiPost<{ data: { home: string } }>('/api/session/demo', { persona: key });
      window.location.assign(res.data.home);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Please try again.');
      setBusy(null);
    }
  }

  useEffect(() => {
    if (autoEnter && !started.current) {
      started.current = true;
      void enter(autoEnter);
    }
  }, [autoEnter]);

  return (
    <SiteMotion>
      <main className="relative min-h-dvh overflow-x-clip bg-app">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_40%_at_0%_0%,var(--accent-50),transparent),radial-gradient(35%_35%_at_100%_100%,var(--warm-soft),transparent)]" />
        <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-4 min-[375px]:px-5 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-small font-medium text-fg-secondary hover:text-fg">
              <ArrowLeft className="size-4" /> <span className="hidden min-[400px]:inline">Back to</span> <BastaaLogo className="text-[18px]" markClassName="size-6" />
            </Link>
            <ThemeToggle />
          </div>

          <div className="grid flex-1 grid-cols-1 items-center gap-10 py-8 lg:grid-cols-[0.9fr_1.4fr] lg:gap-14 lg:py-12">
            <motion.div className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-medium text-fg-secondary">
                <span className="size-2 rounded-full bg-accent" /> Live demo · no sign-in needed
              </p>
              <h1 className="site-h2 mt-4 text-fg">
                Whose day do you want to <em className="text-accent-strong italic [font-variation-settings:'SOFT'_100]">see</em>?
              </h1>
              <p className="site-lead mt-3 text-fg-secondary">A sample school with 750 students, 30 sections and a full term of attendance, fees and marks. Click a role to walk in. Changes aren&apos;t saved.</p>
              <ul className="mt-6 hidden gap-2 text-small text-fg-secondary lg:grid">
                {['Switch roles any time from the bar at the bottom', 'Works on a phone too: open this page there', 'Every screen is the real product'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="size-4 text-accent" /> {t}</li>
                ))}
              </ul>
            </motion.div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {personas.map((p, i) => {
                const Icon = ICONS[p.key];
                const opening = busy === p.key;
                return (
                  <motion.button
                    key={p.key}
                    type="button"
                    disabled={!!busy}
                    onClick={() => void enter(p.key)}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.06 * i }}
                    whileHover={busy ? undefined : { y: -3 }}
                    whileTap={busy ? undefined : { scale: 0.985 }}
                    className={cn(
                      'group flex min-h-[176px] min-w-0 flex-col rounded-[22px] border bg-surface p-5 text-left shadow-e1 transition-[border-color,box-shadow] hover:shadow-e2 disabled:cursor-default',
                      opening ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent',
                      busy && !opening && 'opacity-50',
                    )}
                  >
                    <span className="flex w-full items-center gap-3">
                      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', p.key === 'owner' ? 'bg-warm-soft text-warm' : 'bg-accent-tint text-accent-strong')}>
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold tracking-[-0.01em] text-fg">{p.title}</span>
                        <span className="block truncate text-small text-fg-secondary">{p.person}</span>
                      </span>
                      {opening ? <Loader2 className="size-5 animate-spin text-accent" /> : <ArrowRight className="size-5 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />}
                    </span>
                    <ul className="mt-4 grid gap-1.5 border-t border-border pt-3 text-[13px] text-fg-secondary">
                      {p.caps.map((c) => (
                        <li key={c} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent/70" /> {c}</li>
                      ))}
                    </ul>
                    <span className="mt-auto pt-3 text-[12.5px] font-semibold text-accent-strong">{opening ? 'Opening…' : 'Walk in'}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <p className="pb-2 text-center text-caption text-fg-tertiary">
            Bastaa demo · <Link href="/" className="hover:text-fg-secondary hover:underline">Home</Link> · <Link href="/privacy" className="hover:text-fg-secondary hover:underline">Privacy</Link>
          </p>
        </div>
      </main>
    </SiteMotion>
  );
}
