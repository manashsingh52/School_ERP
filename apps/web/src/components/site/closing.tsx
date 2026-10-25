'use client';

import { Button } from '@schoolos/ui';
import { ArrowRight, Mail, PhoneCall } from 'lucide-react';
import { motion, useScroll, useSpring } from 'motion/react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { CONTACT_EMAIL } from '@/lib/site';
import { useBookDemo } from './book-demo';
import { Eyebrow, Reveal } from './motion-bits';
import type { SiteMode } from './site-header';

const STEPS = [
  { day: 'Day 1–2', title: 'We set up your school', text: 'Classes, sections, subjects, fees and your existing records, done together on a call.' },
  { day: 'Day 3–4', title: 'Teachers and parents join', text: 'Everyone gets a sign-in. Parents install the app, teachers start marking attendance.' },
  { day: 'Day 5–7', title: 'Go live', text: 'The office runs fees and exams on the web; parents stay up to date on their phones.' },
];

/** Three steps joined by a line that fills as the section scrolls past. */
export function Timeline() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  return (
    <section id="how" className="scroll-mt-24 border-y border-border bg-subtle/60">
      <div className="mx-auto max-w-7xl px-4 py-20 min-[375px]:px-5 lg:px-8 lg:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="site-h2 mt-3 text-fg">Up and running in a week</h2>
        </Reveal>
        <ol ref={ref} className="relative mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {/* The beam: down the left on phones, across the top on desktops */}
          <span aria-hidden className="absolute top-2 bottom-2 left-[19px] w-[2px] rounded-full bg-border lg:top-[19px] lg:right-[16%] lg:bottom-auto lg:left-[16%] lg:h-[2px] lg:w-auto" />
          <motion.span aria-hidden style={{ scaleY: progress }} className="absolute top-2 bottom-2 left-[19px] w-[2px] origin-top rounded-full bg-accent lg:hidden" />
          <motion.span aria-hidden style={{ scaleX: progress }} className="absolute top-[19px] right-[16%] left-[16%] hidden h-[2px] origin-left rounded-full bg-accent lg:block" />
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 0.08} className="relative flex gap-5 lg:flex-col lg:items-center lg:text-center">
              <span className="figures relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-fg ring-4 ring-app">{i + 1}</span>
              <div>
                <span className="figures inline-block rounded-full bg-warm-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-warm">{s.day}</span>
                <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-fg">{s.title}</h3>
                <p className="mt-1.5 max-w-[40ch] text-[14.5px] leading-[1.6] text-fg-secondary lg:mx-auto">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n);

/** The last word: how many students, then the demo or a call. */
export function FinalCta({ mode }: { mode: SiteMode }) {
  const bookDemo = useBookDemo();
  const [students, setStudents] = useState(650);
  const label = students >= 2500 ? '2,500+' : fmt(students);
  return (
    <section id="contact" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 py-20 min-[375px]:px-5 lg:px-8 lg:py-28">
        <Reveal className="relative overflow-hidden rounded-[28px] bg-charcoal px-5 py-10 text-white sm:px-10 lg:px-14 lg:py-14">
          <div aria-hidden className="absolute -right-24 -bottom-32 size-[420px] rounded-full bg-[radial-gradient(circle,var(--accent-500),transparent_62%)] opacity-50" />
          <div aria-hidden className="absolute -top-28 -left-20 size-72 rounded-full bg-[radial-gradient(circle,var(--warm),transparent_65%)] opacity-25" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <h2 className="site-h2 text-white">See Bastaa with your own school</h2>
              <p className="site-lead mt-4 text-white/70">A 30-minute call: we show you around with your classes and fees, and answer your questions. Pricing depends on the number of students.</p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-[14px] text-white/80 hover:text-white"><Mail className="size-4" /> {CONTACT_EMAIL}</a>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur sm:p-6">
              <label htmlFor="cta-students" className="flex items-baseline justify-between text-[14px] text-white/75">
                How many students?
                <span className="figures text-[28px] font-semibold text-white">{label}</span>
              </label>
              <input id="cta-students" type="range" min={100} max={2500} step={50} value={students} onChange={(e) => setStudents(Number(e.target.value))} className="mt-3 w-full accent-[var(--accent-500)]" />
              <div className="figures flex justify-between text-[11px] text-white/45"><span>100</span><span>2,500+</span></div>
              <p className="mt-4 rounded-2xl bg-black/20 p-3 text-[13px] leading-relaxed text-white/80">
                “Hello, we are a school with about <span className="figures font-semibold text-white">{label}</span> students and would like a 30-minute walkthrough of Bastaa.”
              </p>
              <div className="mt-4 flex flex-col gap-2 min-[480px]:flex-row">
                <Button size="lg" className="min-h-12 flex-1 rounded-full" onClick={() => bookDemo(label)}><PhoneCall /> Book a 30-min call</Button>
                {mode === 'demo' && (
                  <Button asChild size="lg" variant="secondary" className="min-h-12 flex-1 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/15">
                    <Link href="/login">Explore the demo <ArrowRight /></Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
