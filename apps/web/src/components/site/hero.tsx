'use client';

import { Button, cn } from '@schoolos/ui';
import { ArrowRight, BellRing, CheckCircle2, ClipboardList, FileText, IndianRupee, Laptop, Smartphone, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useBookDemo } from './book-demo';
import { SPRING } from './motion-bits';
import { PhoneFrame } from './phone-frame';
import { ROLE_JUMPS, type SiteMode } from './site-header';

const PARENT = { src: '/site/parent-home.webp', alt: "The parent app: today's attendance, fees due and every subject's marks" };
const TEACHER = { src: '/site/teacher-register.webp', alt: 'The teacher app: marking the attendance register' };

type View = 'parentApp' | 'teacherApp' | 'office';
const VIEWS: { id: View; label: string; icon: typeof Smartphone }[] = [
  { id: 'parentApp', label: 'Parent app', icon: Smartphone },
  { id: 'teacherApp', label: 'Teacher app', icon: ClipboardList },
  { id: 'office', label: 'Office web', icon: Laptop },
];

function Callout({ icon, children, className, delay = 0 }: { icon: ReactNode; children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ ...SPRING, delay }}
      className={cn('absolute z-30 flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap text-fg shadow-e2 backdrop-blur', className)}
    >
      {icon}
      {children}
    </motion.div>
  );
}

/** The office's view in miniature: fee collection and a report card run (sample figures). */
function OfficeCard({ className }: { className?: string }) {
  const [made, setMade] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <div className={cn('w-full rounded-3xl border border-border bg-surface p-5 shadow-e3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-small font-semibold text-fg">Fee collection · October</p>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-fg-tertiary">Sample school</span>
      </div>
      <p className="figures mt-3 text-[28px] font-semibold text-fg">₹18,42,600</p>
      <p className="text-small text-fg-secondary">of <span className="figures">₹23,60,000</span> due this term</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-subtle">
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: '78%' }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-small">
        <div className="rounded-xl bg-app p-3"><p className="text-fg-tertiary">Attendance today</p><p className="figures mt-0.5 text-[17px] font-semibold text-fg">94.2%</p></div>
        <div className="rounded-xl bg-app p-3"><p className="text-fg-tertiary">Paid online</p><p className="figures mt-0.5 text-[17px] font-semibold text-fg">61%</p></div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border p-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-warm-soft text-warm"><FileText className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold text-fg">Report cards · Class 8-A</p>
          <p className="text-[12px] text-fg-tertiary">{made === 'done' ? '38 report cards ready to print' : 'CBSE grading, school logo and signature'}</p>
        </div>
        <Button size="sm" variant={made === 'done' ? 'secondary' : 'primary'} disabled={made === 'busy'} onClick={() => { if (made === 'idle') { setMade('busy'); setTimeout(() => setMade('done'), 1200); } else if (made === 'done') setMade('idle'); }}>
          {made === 'busy' ? 'Making…' : made === 'done' ? <><CheckCircle2 /> Ready</> : 'Generate'}
        </Button>
      </div>
    </div>
  );
}

/** Phones under 768px: one phone at a time, picked with a segmented switch. */
function AppSwitcher() {
  const [view, setView] = useState<View>('parentApp');
  return (
    <div className="md:hidden">
      <div role="tablist" aria-label="See the product" className="mx-auto grid max-w-[360px] grid-cols-3 gap-1 rounded-full border border-border bg-surface p-1 shadow-e1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={cn('relative flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors', view === v.id ? 'text-accent-fg' : 'text-fg-secondary')}
          >
            {view === v.id && <motion.span layoutId="hero-view" transition={SPRING} className="absolute inset-0 -z-0 rounded-full bg-accent" />}
            <v.icon className="relative size-4" />
            <span className="relative">{v.label.split(' ')[0]}<span className="hidden min-[400px]:inline"> {v.label.split(' ')[1]}</span></span>
          </button>
        ))}
      </div>
      <div className="relative mx-auto mt-6 w-full max-w-[280px] [perspective:1200px] min-[375px]:max-w-[296px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, rotateY: -35, scale: 0.94 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 35, scale: 0.94, transition: { duration: 0.16, ease: 'easeIn' } }}
            transition={SPRING}
            className="relative"
          >
            {view === 'office' ? (
              <OfficeCard />
            ) : (
              <>
                <PhoneFrame {...(view === 'parentApp' ? PARENT : TEACHER)} priority sizes="296px" />
                {view === 'parentApp' ? (
                  <>
                    <Callout icon={<BellRing className="size-4 text-warm" />} className="top-[18%] -left-2" delay={0.15}>Absence alert in seconds</Callout>
                    <Callout icon={<IndianRupee className="size-4 text-accent" />} className="top-[76%] -right-2" delay={0.3}>Pay fees by UPI</Callout>
                  </>
                ) : (
                  <>
                    <Callout icon={<WifiOff className="size-4 text-warm" />} className="top-[16%] -right-2" delay={0.15}>Register works offline</Callout>
                    <Callout icon={<CheckCircle2 className="size-4 text-accent" />} className="top-[62%] -left-2" delay={0.3}>Whole class in a few taps</Callout>
                  </>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Tablets and desktops: both phones, layered; hover the one behind to bring it forward. */
function PhoneStage() {
  const [front, setFront] = useState<'home' | 'register'>('home');
  return (
    <div className="relative mx-auto hidden h-[600px] w-full max-w-[520px] md:block lg:h-[640px]">
      <div aria-hidden className="absolute inset-x-6 top-16 bottom-6 rounded-[48px] bg-[radial-gradient(120%_80%_at_30%_20%,var(--accent-100),transparent_70%)] opacity-90" />
      <motion.div
        className="absolute top-14 right-2 w-[248px] lg:right-0 lg:w-[262px]"
        animate={front === 'register' ? { zIndex: 20, rotate: 0, scale: 1.02, x: -10 } : { zIndex: 10, rotate: 6, scale: 0.94, x: 0 }}
        transition={SPRING}
        onMouseEnter={() => setFront('register')}
        onMouseLeave={() => setFront('home')}
      >
        <PhoneFrame {...TEACHER} sizes="262px" />
      </motion.div>
      <motion.div
        className="absolute top-0 left-4 w-[262px] lg:left-6 lg:w-[276px]"
        animate={front === 'home' ? { zIndex: 20, rotate: -3, scale: 1 } : { zIndex: 10, rotate: -6, scale: 0.94 }}
        transition={SPRING}
      >
        <PhoneFrame {...PARENT} priority sizes="276px" />
      </motion.div>
      <motion.div
        className="absolute top-[30%] -left-6 z-30 flex items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 pr-4 shadow-e3 backdrop-blur lg:-left-14"
        initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0, y: [0, -6, 0] }} transition={{ opacity: { delay: 0.5 }, x: { ...SPRING, delay: 0.5 }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }}
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-warm-soft text-warm"><BellRing className="size-[18px]" /></span>
        <span className="text-[12.5px] leading-tight"><span className="block font-semibold text-fg">Rohan marked absent</span><span className="text-fg-tertiary">Parent told · <span className="figures">8:15 AM</span></span></span>
      </motion.div>
      <motion.div
        className="absolute right-0 bottom-10 z-30 flex items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 pr-4 shadow-e3 backdrop-blur lg:-right-6"
        initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0, y: [0, 6, 0] }} transition={{ opacity: { delay: 0.7 }, x: { ...SPRING, delay: 0.7 }, y: { duration: 7, repeat: Infinity, ease: 'easeInOut' } }}
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent-tint text-accent-strong"><IndianRupee className="size-[18px]" /></span>
        <span className="text-[12.5px] leading-tight"><span className="block font-semibold text-fg"><span className="figures">₹14,200</span> received</span><span className="text-fg-tertiary">UPI · receipt sent</span></span>
      </motion.div>
    </div>
  );
}

export function Hero({ mode }: { mode: SiteMode }) {
  const bookDemo = useBookDemo();
  return (
    <section className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_0%,var(--accent-50),transparent),radial-gradient(40%_40%_at_0%_30%,var(--warm-soft),transparent)] opacity-80" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 min-[375px]:px-5 sm:pt-14 md:grid-cols-[1.05fr_1fr] lg:grid-cols-12 lg:gap-6 lg:px-8 lg:pt-20 lg:pb-24">
        <div className="lg:col-span-7">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-fg-secondary shadow-e1">
            <span className="text-warm"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-current" /></span></span>
            Built for CBSE, ICSE &amp; State Board schools
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }} className="site-h1 mt-5 text-fg">
            Your whole school, in one <em className="font-display text-accent-strong italic [font-variation-settings:'SOFT'_100,'WONK'_1]">simple</em> app.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 }} className="site-lead mt-5 text-fg-secondary">
            Attendance, fees, exams, homework and messages to parents. The office works on the web; parents and teachers use the app on their phones.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.15 }} className="mt-8 flex flex-col gap-3 min-[480px]:flex-row min-[480px]:flex-wrap">
            {mode === 'demo' ? (
              <Button asChild size="lg" className="group relative min-h-12 overflow-hidden rounded-full px-6 text-[15px]">
                <Link href="/login">
                  <span aria-hidden className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgb(255_255_255/0.25),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
                  Explore the live demo <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            ) : (
              <Button size="lg" className="min-h-12 rounded-full px-6 text-[15px]" onClick={() => bookDemo()}>Book a free demo <ArrowRight /></Button>
            )}
            {mode === 'demo' ? (
              <Button size="lg" variant="secondary" className="min-h-12 rounded-full px-6 text-[15px]" onClick={() => bookDemo()}>Book a free demo</Button>
            ) : mode === 'app' ? (
              <Button asChild size="lg" variant="secondary" className="min-h-12 rounded-full px-6 text-[15px]"><Link href="/login">Sign in to your school</Link></Button>
            ) : (
              <Button asChild size="lg" variant="secondary" className="min-h-12 rounded-full px-6 text-[15px]"><Link href="/#features">See what it does</Link></Button>
            )}
          </motion.div>
          {mode === 'demo' && (
            <>
              <p className="mt-3 text-small text-fg-tertiary">No sign-in needed · a sample school with 750 students</p>
              <div className="mt-6 hidden flex-wrap items-center gap-2 sm:flex">
                <span className="text-small text-fg-tertiary">Open straight as</span>
                {ROLE_JUMPS.map((r) => (
                  <Link key={r.as} href={`/login?as=${r.as}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-small font-medium text-fg-secondary transition-colors hover:border-accent hover:text-fg">
                    <r.icon className="size-3.5" /> {r.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="lg:col-span-5">
          <AppSwitcher />
          <PhoneStage />
        </div>
      </div>
    </section>
  );
}
