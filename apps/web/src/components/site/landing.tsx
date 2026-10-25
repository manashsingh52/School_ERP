import { Button } from '@schoolos/ui';
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  IndianRupee,
  Lock,
  MessagesSquare,
  NotebookPen,
  Palette,
  Smartphone,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { SiteShell } from './site-shell';
import { serverEnv } from '@/lib/server-env';
import { CONTACT_EMAIL, DEMO_MAILTO } from '@/lib/site';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarCheck, title: 'Attendance', text: 'Teachers mark the register on their phone in seconds, even offline. Parents hear at once if their child is absent.' },
  { icon: IndianRupee, title: 'Fees', text: 'Fee structures, installments, concessions and late fees. Parents pay online and get a receipt on the spot.' },
  { icon: ClipboardList, title: 'Exams and report cards', text: 'Marks entry by subject, grades worked out for you, and report cards ready to print or share.' },
  { icon: NotebookPen, title: 'Homework', text: 'Post homework with a photo of the board. Every parent sees it the same evening.' },
  { icon: CalendarClock, title: 'Timetable', text: 'Build the week once. Teachers and parents always see today’s classes.' },
  { icon: MessagesSquare, title: 'Notices, messages and meetings', text: 'Notices to a class or the whole school, parent–teacher chat, and video meetings.' },
  { icon: BarChart3, title: 'Reports', text: 'Attendance, fees and results in one click, as Excel or PDF, or sent to you every week.' },
  { icon: Smartphone, title: 'One app for parents and teachers', text: 'A simple Android app. Each person sees only what is theirs.' },
];

const REASONS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FileSpreadsheet, title: 'Start in a day', text: 'Send us your Excel sheets of students and teachers; we bring them in and match the columns.' },
  { icon: WifiOff, title: 'Works on everyday phones', text: 'Light on data and fine on patchy networks. Attendance works with no signal at all.' },
  { icon: Lock, title: 'Your data stays yours', text: 'Each school’s data is kept apart and stored in India. No ads, and nothing sold, ever.' },
  { icon: Palette, title: 'Your school’s name', text: 'Your logo and colour on the app, the website and every receipt and report card.' },
];

const STEPS = [
  { title: 'We set up your school', text: 'Classes, sections, subjects, fees and your existing records, done together on a call.' },
  { title: 'Teachers and parents join', text: 'Everyone gets a sign-in. Parents install the app, teachers start marking attendance.' },
  { title: 'Go live', text: 'The office runs fees and exams on the web; parents stay up to date on their phones.' },
];

function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[28px] border-[6px] border-charcoal bg-charcoal shadow-e3 ${className ?? ''}`}>
      <Image src={src} alt={alt} width={270} height={584} className="block h-auto w-full rounded-[22px]" priority />
    </div>
  );
}

export function Landing() {
  return (
    <SiteShell>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-small text-fg-secondary">
            <span className="size-2 rounded-full bg-[#F7A400]" /> For CBSE, ICSE and state board schools
          </p>
          <h1 className="mt-5 text-[40px] leading-[46px] font-bold tracking-[-0.03em] text-fg sm:text-[52px] sm:leading-[58px]">
            Your whole school,
            <br />
            in one simple app.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-[27px] text-fg-secondary">
            Attendance, fees, exams, homework and messages to parents. The office works on the web; parents and teachers use the app on their phones.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><a href={DEMO_MAILTO}>Book a free demo</a></Button>
            {serverEnv.demo ? (
              <Button asChild size="lg" variant="secondary"><Link href="/login">Explore the live demo</Link></Button>
            ) : serverEnv.siteOnly ? (
              <Button asChild size="lg" variant="secondary"><Link href="/#features">See what it does</Link></Button>
            ) : (
              <Button asChild size="lg" variant="secondary"><Link href="/login">Sign in to your school</Link></Button>
            )}
          </div>
        </div>
        <div className="relative mx-auto flex w-full max-w-[420px] justify-center">
          <div aria-hidden className="absolute inset-x-6 top-10 bottom-0 rounded-[40px] bg-accent-tint" />
          <Phone src="/site/parent-home.webp" alt="The parent app: today's attendance, homework and fees due" className="relative z-10 w-[210px] -rotate-3 sm:w-[230px]" />
          <Phone src="/site/teacher-register.webp" alt="The teacher app: marking the attendance register" className="relative -ml-12 mt-16 w-[190px] rotate-3 sm:w-[210px]" />
        </div>
      </section>

      <section id="features" className="scroll-mt-16 border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[30px] leading-[38px] font-bold tracking-[-0.02em] text-fg">Everything a school runs on</h2>
          <p className="mt-2 max-w-2xl text-body text-fg-secondary">One place instead of registers, fee books, WhatsApp groups and spreadsheets.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-app p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent-tint text-accent-strong"><f.icon className="size-5" /></span>
                <h3 className="mt-4 text-h3 font-semibold text-fg">{f.title}</h3>
                <p className="mt-1.5 text-small text-fg-secondary">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-[30px] leading-[38px] font-bold tracking-[-0.02em] text-fg">Made for how Indian schools work</h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map((r) => (
            <div key={r.title}>
              <r.icon className="size-6 text-[#F7A400]" />
              <h3 className="mt-3 text-h3 font-semibold text-fg">{r.title}</h3>
              <p className="mt-1.5 text-small text-fg-secondary">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-16 border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[30px] leading-[38px] font-bold tracking-[-0.02em] text-fg">Up and running in a week</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-body font-semibold text-accent-fg">{i + 1}</span>
                <div>
                  <h3 className="text-h3 font-semibold text-fg">{s.title}</h3>
                  <p className="mt-1 text-small text-fg-secondary">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="contact" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-start gap-6 rounded-2xl bg-accent px-6 py-10 text-accent-fg sm:px-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[28px] leading-[36px] font-bold tracking-[-0.02em]">See Bastaa with your own school</h2>
            <p className="mt-2 max-w-xl text-body opacity-90">A 30-minute call: we show you around and answer your questions. Pricing depends on the number of students; ask us for a quote.</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Button asChild size="lg" variant="secondary"><a href={DEMO_MAILTO}>Book a free demo</a></Button>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-small opacity-90 hover:underline">{CONTACT_EMAIL}</a>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
