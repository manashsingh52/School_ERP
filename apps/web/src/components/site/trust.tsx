'use client';

import { cn } from '@schoolos/ui';
import { ArrowRight, Check, Cloud, CloudOff, FileSpreadsheet, Lock, MapPin, RotateCcw, ShieldCheck, Signal, Wifi } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Eyebrow, Reveal, SPRING } from './motion-bits';

function Pillar({ title, text, children, className, delay = 0 }: { title: string; text: string; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={cn('flex flex-col rounded-[22px] border border-border bg-surface p-5 shadow-e1 sm:p-6', className)}>
      <div className="flex-1">{children}</div>
      <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.01em] text-fg sm:text-[19px]">{title}</h3>
      <p className="mt-1.5 text-[14.5px] leading-[1.6] text-fg-secondary [text-wrap:pretty]">{text}</p>
    </Reveal>
  );
}

const COLUMNS = [
  ['Student_Name', 'Student name'],
  ['Father_Mobile', 'Parent’s phone'],
  ['Class_Sec', 'Class & section'],
  ['Adm_No', 'Admission no.'],
] as const;

/** Columns of a school's own sheet snapping onto Bastaa's fields. */
function ExcelMapping() {
  const [run, setRun] = useState(0);
  return (
    <div className="rounded-2xl border border-border bg-app p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wide text-fg-tertiary uppercase">
        <span className="flex items-center gap-1.5"><FileSpreadsheet className="size-3.5 text-success" /> students_2026.xlsx</span>
        <button onClick={() => setRun((r) => r + 1)} className="flex min-h-8 items-center gap-1 rounded-full px-2 normal-case hover:bg-subtle" aria-label="Play again"><RotateCcw className="size-3" /> Again</button>
      </div>
      <ul key={run} className="space-y-1.5">
        {COLUMNS.map(([from, to], i) => (
          <li key={from} className="grid grid-cols-[minmax(0,0.85fr)_auto_minmax(0,1.15fr)] items-center gap-1.5 sm:gap-2">
            <span className="figures truncate rounded-lg border border-border bg-surface px-2 py-1.5 text-[11.5px] text-fg-secondary">{from}</span>
            <motion.span initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 + i * 0.22 }}>
              <ArrowRight className="size-3.5 text-fg-tertiary" />
            </motion.span>
            <motion.span
              initial={{ opacity: 0, x: 14, scale: 0.96 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ ...SPRING, delay: 0.35 + i * 0.22 }}
              className="flex items-center gap-1.5 truncate rounded-lg bg-accent-tint px-2 py-1.5 text-[11.5px] font-semibold text-accent-strong"
            >
              <Check className="size-3 shrink-0" /> {to}
            </motion.span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "No signal": attendance waits on the phone, then goes up by itself. */
function OfflineToggle() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [synced, setSynced] = useState(false);
  const toggle = () => {
    const next = !online;
    setOnline(next);
    if (next && queued) {
      setSynced(true);
      setTimeout(() => { setQueued(0); setSynced(false); }, 1600);
    }
  };
  return (
    <div className="rounded-2xl border border-border bg-app p-4">
      <button role="switch" aria-checked={!online} onClick={toggle} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-surface px-3 ring-1 ring-border">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {online ? <Signal className="size-4 text-success" /> : <CloudOff className="size-4 text-warm" />} {online ? 'Signal: 4G' : 'No signal'}
        </span>
        <span className={cn('relative h-6 w-11 rounded-full transition-colors', online ? 'bg-border-strong' : 'bg-warm')}>
          <motion.span layout transition={SPRING} className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow', online ? 'left-0.5' : 'right-0.5')} />
        </span>
      </button>
      <button onClick={() => (online ? setSynced(false) : setQueued((q) => q + 1))} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-accent-fg hover:bg-accent-hover">
        Mark a register
      </button>
      <div className="mt-2 flex min-h-6 items-center justify-center text-[12px] font-medium">
        <AnimatePresence mode="wait">
          {synced ? (
            <motion.span key="synced" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-success"><Cloud className="size-3.5" /> Back online · {queued} sent</motion.span>
          ) : !online ? (
            <motion.span key="q" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="figures text-warm">{queued ? `${queued} saved on the phone, waiting` : 'Switch it off, then mark a register'}</motion.span>
          ) : (
            <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-fg-tertiary"><Wifi className="size-3.5" /> Saved straight to school</motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Vault() {
  return (
    <div className="relative flex min-h-[176px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-app p-4">
      <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgb(15_83_56/0.035)_10px_11px)]" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-e2"><ShieldCheck className="size-7" /></span>
        <div className="flex flex-wrap justify-center gap-1.5">
          {[
            [MapPin, 'Stored in India'],
            [Lock, 'Each school walled off'],
            [ShieldCheck, 'No ads, nothing sold'],
          ].map(([Icon, t]) => {
            const I = Icon as typeof MapPin;
            return (
              <span key={t as string} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-fg-secondary">
                <I className="size-3 text-accent-strong" /> {t as string}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  { name: 'Riverside Convent School', label: 'Navy', color: '#1E3A8A' },
  { name: 'Greenfield Public School', label: 'Emerald', color: '#0F5338' },
  { name: 'Sanskriti Vidya Mandir', label: 'Terracotta', color: '#B4472A' },
  { name: 'Heritage International', label: 'Royal gold', color: '#8A6A12' },
];

/** Pick a school colour and watch the app header and a receipt change. */
function WhiteLabel() {
  const [i, setI] = useState(1);
  const p = PRESETS[i]!;
  return (
    <div className="rounded-2xl border border-border bg-app p-3 sm:p-4" style={{ '--demo': p.color } as CSSProperties}>
      <div role="radiogroup" aria-label="School colour" className="flex flex-wrap gap-2">
        {PRESETS.map((x, j) => (
          <button
            key={x.label}
            role="radio"
            aria-checked={i === j}
            onClick={() => setI(j)}
            className={cn('flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors', i === j ? 'border-fg/30 bg-surface text-fg' : 'border-transparent text-fg-secondary hover:bg-surface')}
          >
            <span className="size-3.5 rounded-full ring-2 ring-surface" style={{ background: x.color }} /> {x.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2">
        <motion.div layout className="overflow-hidden rounded-xl bg-surface shadow-e1 ring-1 ring-border">
          <div className="flex items-center gap-2 px-3 py-2.5 text-white transition-colors duration-300" style={{ background: 'var(--demo)' }}>
            <span className="flex size-6 items-center justify-center rounded-md bg-white/20 text-[11px] font-bold">{p.name[0]}</span>
            <span className="truncate text-[12px] font-semibold">{p.name}</span>
          </div>
          <div className="space-y-1.5 p-3">
            <div className="h-2 w-3/4 rounded-full bg-subtle" />
            <div className="h-2 w-1/2 rounded-full bg-subtle" />
            <span className="mt-1 inline-block rounded-md px-2 py-1 text-[11px] font-semibold text-white transition-colors duration-300" style={{ background: 'var(--demo)' }}>Pay fees</span>
          </div>
        </motion.div>
        <div className="rounded-xl bg-surface p-3 shadow-e1 ring-1 ring-border">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase transition-colors duration-300" style={{ color: 'var(--demo)' }}>Fee receipt</p>
          <p className="mt-1 truncate text-[12px] font-semibold text-fg">{p.name}</p>
          <div className="mt-2 flex items-end justify-between border-t border-dashed border-border pt-2">
            <span className="text-[11px] text-fg-tertiary">Paid by UPI</span>
            <span className="figures text-[15px] font-semibold text-fg">₹14,200</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrustShowcase() {
  return (
    <section id="india" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 py-20 min-[375px]:px-5 lg:px-8 lg:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>Built for India</Eyebrow>
          <h2 className="site-h2 mt-3 text-fg">Made for how Indian schools work</h2>
          <p className="site-lead mt-4 text-fg-secondary">Patchy networks, Excel sheets from the office, and a school that wants its own name on everything.</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <Pillar className="lg:col-span-5" title="Start in a day" text="Send us your Excel sheets of students and teachers; we bring them in and match the columns.">
            <ExcelMapping />
          </Pillar>
          <Pillar className="lg:col-span-7" delay={0.05} title="Your school’s name" text="Your logo and colour on the app, the website and every receipt and report card. Pick a colour and see.">
            <WhiteLabel />
          </Pillar>
          <Pillar className="lg:col-span-6" title="Works on everyday phones" text="Light on data and fine on patchy networks. Attendance works with no signal at all.">
            <OfflineToggle />
          </Pillar>
          <Pillar className="lg:col-span-6" delay={0.05} title="Your data stays yours" text="Each school’s data is kept apart and stored in India. No ads, and nothing sold, ever.">
            <Vault />
          </Pillar>
        </div>
      </div>
    </section>
  );
}
