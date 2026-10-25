'use client';

import { Button, cn } from '@schoolos/ui';
import { ArrowRight, Building2, Heart, Mail, MessageCircle, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BastaaLogo } from '@/components/brand/logo';
import { ThemeToggle } from '@/lib/theme';
import { CONTACT_EMAIL, WHATSAPP_NUMBER } from '@/lib/site';
import { useBookDemo } from './book-demo';
import { SPRING } from './motion-bits';

/** demo: the whole product to click through · site: website only · app: the real product (sign-in). */
export type SiteMode = 'demo' | 'site' | 'app';

const LINKS = [
  { href: '/#features', id: 'features', label: 'Features' },
  { href: '/#india', id: 'india', label: 'Built for India' },
  { href: '/#how', id: 'how', label: 'How it works' },
];

export const ROLE_JUMPS = [
  { as: 'admin', label: 'Principal’s office', note: 'Fees, exams, reports', icon: Building2 },
  { as: 'teacher', label: 'Teacher', note: 'Register, marks, homework', icon: Users },
  { as: 'parent', label: 'Parent', note: 'Attendance, fees, results', icon: Heart },
] as const;

function LiveDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-current" />
    </span>
  );
}

export function SiteHeader({ mode }: { mode: SiteMode }) {
  const bookDemo = useBookDemo();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  // Frosted pill once the page moves; the link of the section in the middle of the screen lights up.
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      const mid = window.innerHeight * 0.45;
      const current = LINKS.find((l) => {
        const r = document.getElementById(l.id)?.getBoundingClientRect();
        return r && r.top <= mid && r.bottom > mid;
      });
      setActive(current?.id ?? null);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pill = hover ?? active;
  return (
    <>
      <header className="sticky top-0 z-50 px-3 pt-3 sm:px-4 lg:top-4 lg:pt-0">
        <div
          className={cn(
            'mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-full px-3 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-[var(--ease)] sm:h-16 sm:px-4 lg:h-[60px]',
            scrolled || open ? 'border border-border bg-surface/80 shadow-e2 backdrop-blur-xl' : 'border border-transparent',
          )}
        >
          <Link href="/" aria-label="Bastaa home" className="flex shrink-0 items-center gap-2.5">
            <BastaaLogo markClassName="size-8" />
            <span className="hidden rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] font-medium text-fg-secondary xl:inline">Made in India</span>
          </Link>

          <nav aria-label="Site" className="isolate mx-auto hidden items-center lg:flex" onMouseLeave={() => setHover(null)}>
            {[...LINKS, ...(mode === 'demo' ? [{ href: '/login', id: 'demo', label: 'Live demo' }] : [])].map((l) => (
              <Link
                key={l.id}
                href={l.href}
                onMouseEnter={() => setHover(l.id)}
                className={cn('relative rounded-full px-4 py-2 text-[14px] font-medium transition-colors', pill === l.id ? 'text-fg' : 'text-fg-secondary hover:text-fg')}
              >
                {pill === l.id && <motion.span layoutId="nav-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-subtle" />}
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <ThemeToggle />
            {mode === 'demo' && (
              <Button asChild size="sm" variant="secondary" className="hidden rounded-full lg:inline-flex">
                <Link href="/login"><span className="text-accent"><LiveDot /></span> Explore live demo</Link>
              </Button>
            )}
            {mode === 'app' && (
              <Button asChild size="sm" variant="ghost" className="hidden rounded-full lg:inline-flex"><Link href="/login">Sign in</Link></Button>
            )}
            <Button size="sm" className="hidden rounded-full lg:inline-flex" onClick={() => bookDemo()}>Book a demo</Button>
            {mode === 'demo' ? (
              <Button asChild size="sm" className="rounded-full lg:hidden"><Link href="/login">Try demo</Link></Button>
            ) : (
              <Button size="sm" className="rounded-full lg:hidden" onClick={() => bookDemo()}>Book demo</Button>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="site-menu"
              className="relative flex size-11 items-center justify-center rounded-full text-fg hover:bg-subtle lg:hidden"
            >
              <motion.span className="absolute h-[2px] w-5 rounded-full bg-current" animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -4 }} transition={SPRING} />
              <motion.span className="absolute h-[2px] w-5 rounded-full bg-current" animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 4 }} transition={SPRING} />
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={open} onClose={() => setOpen(false)} mode={mode} onBook={() => { setOpen(false); bookDemo(); }} />
    </>
  );
}

function MobileMenu({ open, onClose, mode, onBook }: { open: boolean; onClose: () => void; mode: SiteMode; onBook: () => void }) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-t border-border bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] shadow-e3"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-strong" aria-hidden />
            <nav aria-label="Site" className="flex flex-col">
              {LINKS.map((l, i) => (
                <Link key={l.id} ref={i === 0 ? first : undefined} href={l.href} onClick={onClose} className="flex min-h-12 items-center justify-between rounded-xl px-3 font-display text-[22px] font-semibold tracking-[-0.02em] text-fg hover:bg-subtle">
                  {l.label} <ArrowRight className="size-5 text-fg-tertiary" />
                </Link>
              ))}
            </nav>
            {mode === 'demo' && (
              <div className="mt-4">
                <p className="px-3 text-[12px] font-semibold tracking-[0.14em] text-fg-tertiary uppercase">Jump into the demo</p>
                <div className="mt-2 grid gap-2">
                  {ROLE_JUMPS.map((r) => (
                    <Link key={r.as} href={`/login?as=${r.as}`} onClick={onClose} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-app px-4 hover:border-accent">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-accent-tint text-accent-strong"><r.icon className="size-[18px]" /></span>
                      <span className="flex-1">
                        <span className="block text-[15px] font-semibold text-fg">{r.label}</span>
                        <span className="block text-small text-fg-secondary">{r.note}</span>
                      </span>
                      <ArrowRight className="size-4 text-fg-tertiary" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button className="col-span-2 min-h-12 rounded-full text-[15px]" onClick={onBook}>Book a free demo</Button>
              <Button asChild variant="secondary" className={cn('min-h-12 rounded-full', !WHATSAPP_NUMBER && 'col-span-2')}>
                <a href={`mailto:${CONTACT_EMAIL}`}><Mail /> Email us</a>
              </Button>
              {WHATSAPP_NUMBER && (
                <Button asChild variant="secondary" className="min-h-12 rounded-full">
                  <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener"><MessageCircle /> WhatsApp</a>
                </Button>
              )}
              {mode === 'app' && <Button asChild variant="ghost" className="col-span-2 min-h-12 rounded-full"><Link href="/login" onClick={onClose}>Sign in to your school</Link></Button>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
