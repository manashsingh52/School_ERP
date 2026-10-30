'use client';

import { cn } from '@schoolos/ui';
import {
  BarChart3,
  BellRing,
  CalendarCheck,
  CalendarClock,
  Check,
  ClipboardList,
  CloudOff,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  IndianRupee,
  Loader2,
  MessagesSquare,
  NotebookPen,
  Smartphone,
  Video,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { Eyebrow, Reveal, SPRING } from './motion-bits';

function Card({ icon, title, text, children, className, delay = 0 }: { icon: ReactNode; title: string; text: string; children?: ReactNode; className?: string; delay?: number }) {
  const t = useT();
  return (
    <Reveal delay={delay} className={cn('group flex flex-col overflow-hidden rounded-[22px] border border-border bg-surface p-5 shadow-e1 transition-shadow duration-300 hover:shadow-e2 sm:p-6', className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-tint text-accent-strong transition-transform duration-300 group-hover:-rotate-6">{icon}</span>
        <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-fg sm:text-[19px]">{t(title)}</h3>
      </div>
      <p className="mt-2.5 max-w-[56ch] text-[14.5px] leading-[1.6] text-fg-secondary [text-wrap:pretty]">{t(text)}</p>
      {children && <div className="mt-5 flex-1">{children}</div>}
    </Reveal>
  );
}

const STUDENTS = ['Aarav Sharma', 'Diya Patel', 'Rohan Verma', 'Ananya Nair'];

function AttendanceDemo() {
  const t = useT();
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mark = (name: string, isAbsent: boolean) => {
    setAbsent((a) => ({ ...a, [name]: isAbsent }));
    if (isAbsent) {
      setToast(t("{name}'s parent was told: marked absent at 8:15 AM", { name: name.split(' ')[0]! }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 3200);
    }
  };
  const absentCount = Object.values(absent).filter(Boolean).length;
  return (
    <div className="relative rounded-2xl border border-border bg-app p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-small font-semibold text-fg">{t('Class 8-B · Today')}</p>
        <div className="flex items-center gap-2">
          <span className="figures text-[12px] text-fg-secondary">{t('{p} present · {a} absent', { p: STUDENTS.length - absentCount, a: absentCount })}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warm-soft px-2 py-0.5 text-[11px] font-semibold text-warm"><CloudOff className="size-3" /> {t('Saved offline')}</span>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {STUDENTS.map((s, i) => (
          <li key={s} className="flex items-center gap-3 px-1 py-2">
            <span className="figures w-5 text-[12px] text-fg-tertiary">{i + 1}</span>
            <span className="flex-1 truncate text-[14px] font-medium text-fg">{s}</span>
            <div role="radiogroup" aria-label={`${s} attendance`} className="flex gap-1">
              {(['P', 'A'] as const).map((k) => {
                const on = k === 'A' ? !!absent[s] : !absent[s];
                return (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={on}
                    aria-label={k === 'P' ? t('Present') : t('Absent')}
                    onClick={() => mark(s, k === 'A')}
                    className={cn(
                      'figures flex size-9 items-center justify-center rounded-lg text-[13px] font-semibold transition-colors sm:size-8',
                      on ? (k === 'P' ? 'bg-success-bg text-success ring-1 ring-success-border' : 'bg-danger-bg text-danger ring-1 ring-danger-border') : 'text-fg-tertiary hover:bg-subtle',
                    )}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={SPRING}
            className="absolute inset-x-3 -bottom-3 flex items-center gap-2 rounded-xl bg-charcoal px-3 py-2.5 text-[12.5px] font-medium text-white shadow-e3"
          >
            <BellRing className="size-4 shrink-0 text-warm" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
      {!toast && <p className="mt-1 px-1 text-[12px] text-fg-tertiary">{t('Tap A to see what the parent gets.')}</p>}
    </div>
  );
}

const FEE_ROWS = [
  { label: 'Tuition · Q3', amount: '₹11,500' },
  { label: 'Transport · Route 4', amount: '₹4,200' },
  { label: 'Sibling concession', amount: '−₹1,500', soft: true },
];

function FeesDemo() {
  const t = useT();
  const [state, setState] = useState<'due' | 'paying' | 'paid'>('due');
  return (
    <div className="rounded-2xl border border-border bg-app p-4">
      <ul className="space-y-2">
        {FEE_ROWS.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-[13.5px]">
            <span className="text-fg-secondary">{t(r.label)}</span>
            <span className={cn('figures font-medium', r.soft ? 'text-success' : 'text-fg')}>{r.amount}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-border-strong pt-3">
        <span className="text-small font-semibold text-fg">{t('To pay')}</span>
        <span className="figures text-[22px] font-semibold text-fg">₹14,200</span>
      </div>
      <div className="mt-3 min-h-11">
        <AnimatePresence mode="wait" initial={false}>
          {state === 'paid' ? (
            <motion.button
              key="paid"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
              onClick={() => setState('due')}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-success-border bg-success-bg px-3 text-left text-[12.5px] font-semibold text-success"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-success text-white"><Check className="size-3.5" /></span>
              <span className="flex-1"><span className="figures">{t('Receipt')} BST-2026-8841</span> · {t('Paid by UPI')}</span>
              <span className="text-[11px] font-medium opacity-80">{t('Reset')}</span>
            </motion.button>
          ) : (
            <motion.button
              key="pay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              disabled={state === 'paying'}
              onClick={() => { setState('paying'); setTimeout(() => setState('paid'), 1100); }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-80"
            >
              {state === 'paying' ? <><Loader2 className="size-4 animate-spin" /> {t('Paying by UPI…')}</> : <><IndianRupee className="size-4" /> {t('Try a payment')}</>}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const CBSE = [
  [91, 'A1'], [81, 'A2'], [71, 'B1'], [61, 'B2'], [51, 'C1'], [41, 'C2'], [33, 'D'], [0, 'E'],
] as const;

function ExamsDemo() {
  const t = useT();
  const [marks, setMarks] = useState(94);
  const [board, setBoard] = useState<'CBSE' | 'ICSE'>('CBSE');
  const grade = CBSE.find(([min]) => marks >= min)![1];
  return (
    <div className="rounded-2xl border border-border bg-app p-4">
      <div className="flex items-center justify-between">
        <span className="text-small font-semibold text-fg">{t('Mathematics')}</span>
        <div className="flex rounded-full border border-border bg-surface p-0.5 text-[11px] font-semibold">
          {(['CBSE', 'ICSE'] as const).map((b) => (
            <button key={b} onClick={() => setBoard(b)} className={cn('min-h-7 rounded-full px-2.5', board === b ? 'bg-accent text-accent-fg' : 'text-fg-secondary')}>{b}</button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="figures text-[26px] font-semibold text-fg">{marks}<span className="text-[15px] text-fg-tertiary">/100</span></p>
        <motion.span key={board + grade} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="figures rounded-lg bg-accent-tint px-2.5 py-1 text-[15px] font-semibold text-accent-strong">
          {board === 'CBSE' ? t('Grade {g}', { g: grade }) : `${marks}%`}
        </motion.span>
      </div>
      <input type="range" min={0} max={100} value={marks} onChange={(e) => setMarks(Number(e.target.value))} aria-label={t('Marks in Mathematics')} className="mt-3 w-full accent-[var(--accent-500)]" />
    </div>
  );
}

function HomeworkDemo() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-app p-3">
      <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden rounded-xl bg-[#1d3b2f] shadow-inner">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.08),transparent_60%)]" />
        <p className="font-display text-[22px] text-white/90 italic [font-variation-settings:'SOFT'_100]">x² + 5x + 6 = 0</p>
        <p className="absolute bottom-2 left-3 text-[10px] text-white/50">Ch. 4 · Q1–Q8</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface text-fg-secondary ring-1 ring-border"><ImageIcon className="size-4" /></span>
        <div className="min-w-0 text-[12.5px] leading-tight">
          <p className="truncate font-semibold text-fg">board_algebra_ch4.jpg</p>
          <p className="text-fg-tertiary">{t('Sent to Class 8-B')} · <span className="figures">42</span> {t('parents')}</p>
        </div>
      </div>
    </div>
  );
}

const PERIODS = [
  ['08:00', 'English', 'Ms. Rao'],
  ['08:40', 'Mathematics', 'Mr. Iyer'],
  ['09:40', 'Science', 'Ms. Kapoor'],
  ['10:20', 'Hindi', 'Mr. Mishra'],
] as const;

function TimetableDemo() {
  const t = useT();
  return (
    <ul className="space-y-1.5">
      {PERIODS.map(([tm, s, who], i) => (
        <li key={tm} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-[13px]', i === 2 ? 'bg-accent-tint ring-1 ring-accent/20' : 'bg-app')}>
          <span className="figures w-11 text-fg-tertiary">{tm}</span>
          <span className="flex-1 font-medium text-fg">{t(s)}</span>
          <span className="text-fg-tertiary">{i === 2 ? <span className="font-semibold text-accent-strong">{t('Now')}</span> : who}</span>
        </li>
      ))}
    </ul>
  );
}

function MessagesDemo() {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-lg bg-warm-soft px-2 py-1 text-[11px] font-semibold text-warm">{t('Notice')}</span>
        <p className="rounded-2xl rounded-tl-sm bg-app px-3 py-2 text-[13px] text-fg">{t('School closes at 12:30 on Friday for Diwali.')}</p>
      </div>
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-3 py-2 text-[13px] text-accent-fg">{t('Can Rahul submit the project on Monday?')}</p>
      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[12.5px]">
        <Video className="size-4 text-accent-strong" />
        <span className="flex-1 font-medium text-fg">{t('Parent–teacher meeting')}</span>
        <span className="figures text-fg-tertiary">{t('Sat')} 10:30</span>
      </div>
    </div>
  );
}

const BARS = [72, 88, 64, 93, 81, 77];

function ReportsDemo() {
  const t = useT();
  const [format, setFormat] = useState<'Excel' | 'PDF'>('Excel');
  return (
    <div className="rounded-2xl border border-border bg-app p-4">
      <div className="flex h-24 items-end gap-2">
        {BARS.map((h, i) => (
          <motion.span key={i} className="flex-1 rounded-t-md bg-accent/80" initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ ...SPRING, delay: i * 0.05 }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(['Excel', 'PDF'] as const).map((f) => (
          <button key={f} onClick={() => setFormat(f)} className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors', format === f ? 'border-accent bg-accent-tint text-accent-strong' : 'border-border text-fg-secondary hover:text-fg')}>
            {f === 'Excel' ? <FileSpreadsheet className="size-3.5" /> : <FileText className="size-3.5" />} {f}
          </button>
        ))}
        <span className="text-[12px] text-fg-tertiary">{t('Attendance by class · sent every Monday')}</span>
      </div>
    </div>
  );
}

export function FeatureBento() {
  const t = useT();
  return (
    <section id="features" className="scroll-mt-24 border-y border-border bg-subtle/60">
      <div className="mx-auto max-w-7xl px-4 py-20 min-[375px]:px-5 lg:px-8 lg:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>{t('The whole school')}</Eyebrow>
          <h2 className="site-h2 mt-3 text-fg">{t('Everything a school runs on')}</h2>
          <p className="site-lead mt-4 text-fg-secondary">{t('One place instead of registers, fee books, WhatsApp groups and spreadsheets. Try the pieces below; they work.')}</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <Card className="md:col-span-2 lg:col-span-7" icon={<CalendarCheck className="size-5" />} title="Attendance" text="Teachers mark the register on their phone in seconds, even offline. Parents hear at once if their child is absent.">
            <AttendanceDemo />
          </Card>
          <Card className="md:col-span-2 lg:col-span-5" delay={0.05} icon={<IndianRupee className="size-5" />} title="Fees and instant receipts" text="Fee structures, installments, concessions and late fees. Parents pay online and get a receipt on the spot.">
            <FeesDemo />
          </Card>
          <Card className="lg:col-span-4" icon={<ClipboardList className="size-5" />} title="Exams and report cards" text="Marks entry by subject, grades worked out for you, and report cards ready to print or share.">
            <ExamsDemo />
          </Card>
          <Card className="lg:col-span-4" delay={0.05} icon={<NotebookPen className="size-5" />} title="Homework" text="Post homework with a photo of the board. Every parent sees it the same evening.">
            <HomeworkDemo />
          </Card>
          <Card className="md:col-span-2 lg:col-span-4" delay={0.1} icon={<CalendarClock className="size-5" />} title="Timetable" text="Build the week once. Teachers and parents always see today’s classes.">
            <TimetableDemo />
          </Card>
          <Card className="lg:col-span-6" icon={<MessagesSquare className="size-5" />} title="Notices, messages and meetings" text="Notices to a class or the whole school, parent–teacher chat, and video meetings.">
            <MessagesDemo />
          </Card>
          <Card className="lg:col-span-6" delay={0.05} icon={<BarChart3 className="size-5" />} title="Reports" text="Attendance, fees and results in one click, as Excel or PDF, or sent to you every week.">
            <ReportsDemo />
          </Card>
          <Reveal className="relative overflow-hidden rounded-[22px] bg-charcoal p-6 text-white md:col-span-2 lg:col-span-12 lg:p-8">
            <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-[radial-gradient(circle,var(--accent-500),transparent_65%)] opacity-40" />
            <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto]">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Smartphone className="size-6" /></span>
                <div>
                  <h3 className="text-[20px] font-semibold tracking-[-0.01em]">{t('One app for parents and teachers')}</h3>
                  <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.6] text-white/70">{t('A simple Android app. Each person sees only what is theirs.')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[12.5px]">
                {['Parents: attendance, homework, fees, results', 'Teachers: register, marks, homework, messages'].map((x) => (
                  <span key={x} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-white/85">{t(x)}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
