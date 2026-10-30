'use client';

import { cn } from '@schoolos/ui';
import { ArrowRight, ArrowUp, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { BETU, BETU_AREA, BETU_FALLBACK, matchBetu, type BetuAnswer, type BetuAudience, type Bi } from './knowledge';

const SPRING = { type: 'spring', stiffness: 320, damping: 30 } as const;
const HINT_KEY = 'bastaa.betu.hinted';

/** Betu: a round, friendly face in a school cap. */
export function BetuFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="6" y="11" width="28" height="24" rx="11" fill="#fff" />
      <path d="M20 4 35 10 20 16 5 10Z" fill="#1d2b24" />
      <path d="M31 11.5v7" stroke="#1d2b24" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="31" cy="19.5" r="1.8" fill="var(--warm, #d95d39)" />
      <motion.g
        style={{ originX: '20px', originY: '23px' }}
        animate={{ scaleY: [1, 1, 0.12, 1, 1] }}
        transition={{ duration: 4.5, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity }}
      >
        <ellipse cx="15" cy="23" rx="2.1" ry="2.6" fill="#1d2b24" />
        <ellipse cx="25" cy="23" rx="2.1" ry="2.6" fill="#1d2b24" />
      </motion.g>
      <circle cx="11.5" cy="27.5" r="2" fill="#f4a58a" opacity=".7" />
      <circle cx="28.5" cy="27.5" r="2" fill="#f4a58a" opacity=".7" />
      <path d="M17 28.5q3 2.6 6 0" fill="none" stroke="#1d2b24" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type Msg = { id: number; from: 'bot' | 'me'; answer?: string; text?: string; kind?: 'greet' | 'fallback' };

const COPY = {
  name: { en: 'Betu', hi: 'बेटू' },
  role: { en: 'Your Bastaa helper', hi: 'आपका Bastaa सहायक' },
  open: { en: 'Ask Betu', hi: 'बेटू से पूछें' },
  close: { en: 'Close Betu', hi: 'बेटू बंद करें' },
  hint: { en: 'Need help? Ask Betu', hi: 'मदद चाहिए? बेटू से पूछें' },
  greet: { en: 'Namaste! I’m Betu. Ask me about {area}, or pick a question below.', hi: 'नमस्ते! मैं बेटू हूँ। मुझसे {area} के बारे में पूछें, या नीचे से कोई सवाल चुनें।' },
  suggest: { en: 'You can ask', hi: 'आप पूछ सकते हैं' },
  more: { en: 'More questions', hi: 'और सवाल' },
  placeholder: { en: 'Type a question…', hi: 'अपना सवाल लिखें…' },
  send: { en: 'Send', hi: 'भेजें' },
  typing: { en: 'Betu is typing', hi: 'बेटू लिख रहा है' },
  demo: { en: 'Demo · Betu answers common questions about this page', hi: 'डेमो · बेटू इस पेज के आम सवालों के जवाब देता है' },
} satisfies Record<string, Bi>;

/** Floating help on every screen: preset questions for the viewer's role and canned answers. */
export function Betu({ audience }: { audience: BetuAudience }) {
  const { lang } = useI18n();
  const say = (b: Bi) => b[lang];
  const answers = BETU[audience];
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'bot', kind: 'greet' }]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // A one-time nudge per browser session, so people notice Betu without being nagged.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(HINT_KEY) === '1';
      sessionStorage.setItem(HINT_KEY, '1');
    } catch {
      /* storage blocked */
    }
    if (seen) return;
    const show = setTimeout(() => setHint(true), 2500);
    const hide = setTimeout(() => setHint(false), 9000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setHint(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    if (window.matchMedia('(min-width: 640px)').matches) input.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing, showAll]);

  function ask(me: Omit<Msg, 'id' | 'from'>, reply: BetuAnswer | null) {
    if (typing) return;
    setShowAll(false);
    setMsgs((m) => [...m, { id: nextId.current++, from: 'me', ...me }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, reply ? { id: nextId.current++, from: 'bot', answer: reply.id } : { id: nextId.current++, from: 'bot', kind: 'fallback' }]);
    }, 650 + Math.random() * 450);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    ask({ text }, matchBetu(audience, text));
  }

  const asked = new Set(msgs.filter((m) => m.from === 'me' && m.answer).map((m) => m.answer));
  const fresh = answers.filter((a) => !asked.has(a.id));
  const chips = showAll || fresh.length === 0 ? answers : fresh.slice(0, msgs.length > 1 ? 3 : 6);
  const byId = (id?: string) => answers.find((a) => a.id === id);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[60] bg-black/30 sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
        {open && (
          <motion.section
            key="panel"
            id={panelId}
            role="dialog"
            aria-label={say(COPY.name)}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={SPRING}
            className="fixed inset-x-0 top-[6dvh] bottom-0 z-[61] flex origin-bottom-right flex-col overflow-hidden rounded-t-[24px] border border-border bg-surface shadow-e3 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-24 sm:h-[min(620px,calc(100dvh-128px))] sm:w-[392px] sm:rounded-[24px]"
          >
            <header className="relative flex shrink-0 items-center gap-3 overflow-hidden bg-accent px-4 py-3.5 text-accent-fg">
              <div aria-hidden className="absolute -top-10 -right-8 size-32 rounded-full bg-white/10" />
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <BetuFace className="size-9" />
              </span>
              <div className="relative min-w-0 flex-1 leading-tight">
                <p className="font-display text-[19px] font-semibold tracking-[-0.01em]">{say(COPY.name)}</p>
                <p className="flex items-center gap-1.5 truncate text-[12.5px] opacity-85">
                  <span className="size-1.5 shrink-0 rounded-full bg-[#7ee2a8]" /> {say(COPY.role)}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={say(COPY.close)} className="relative flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
                <X className="size-5" />
              </button>
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
              <ul className="flex flex-col gap-3">
                {msgs.map((m) => {
                  if (m.from === 'me') {
                    return (
                      <motion.li key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[14px] leading-snug text-accent-fg">
                        {m.text ?? say(byId(m.answer)!.q)}
                      </motion.li>
                    );
                  }
                  const a = byId(m.answer);
                  return (
                    <motion.li key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[92%] items-end gap-2">
                      <BotAvatar />
                      <div className="min-w-0 rounded-2xl rounded-bl-md bg-subtle px-3.5 py-2.5 text-[14px] leading-[1.55] text-fg">
                        <p>{m.kind === 'greet' ? say(COPY.greet).replace('{area}', say(BETU_AREA[audience])) : a ? say(a.a) : say(BETU_FALLBACK)}</p>
                        {a?.steps && (
                          <ol className="mt-2.5 flex flex-col gap-1.5">
                            {a.steps.map((s, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="figures mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{i + 1}</span>
                                <span className="min-w-0">{say(s)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {a?.link && (
                          <Link
                            href={a.link.href}
                            onClick={() => window.matchMedia('(max-width: 639px)').matches && setOpen(false)}
                            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-accent-strong ring-1 ring-border hover:ring-accent"
                          >
                            {say(a.link.label)} <ArrowRight className="size-3.5" />
                          </Link>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
                {typing && (
                  <li className="flex items-end gap-2" aria-label={say(COPY.typing)}>
                    <BotAvatar />
                    <span className="flex h-10 items-center gap-1 rounded-2xl rounded-bl-md bg-subtle px-4">
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} className="size-1.5 rounded-full bg-fg-tertiary" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }} />
                      ))}
                    </span>
                  </li>
                )}
              </ul>

              {!typing && (
                <div className="mt-4">
                  <p className="mb-2 text-[11.5px] font-semibold tracking-[0.12em] text-fg-tertiary uppercase">{say(COPY.suggest)}</p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => ask({ answer: a.id }, a)}
                        className="min-h-9 rounded-2xl border border-border bg-surface px-3 py-1.5 text-left text-[13px] leading-snug font-medium text-fg transition-colors hover:border-accent hover:bg-accent-tint"
                      >
                        {say(a.q)}
                      </button>
                    ))}
                    {!showAll && chips.length < answers.length && (
                      <button type="button" onClick={() => setShowAll(true)} className="min-h-9 rounded-2xl px-3 text-[13px] font-semibold text-accent-strong hover:bg-accent-tint">
                        {say(COPY.more)}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={submit} className="shrink-0 border-t border-border bg-surface px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2 rounded-full border border-border bg-app py-1 pr-1 pl-4 focus-within:border-accent">
                <input
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={say(COPY.placeholder)}
                  aria-label={say(COPY.placeholder)}
                  className="h-9 min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-tertiary sm:text-[14px]"
                />
                <button type="submit" disabled={!draft.trim() || typing} aria-label={say(COPY.send)} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-40">
                  <ArrowUp className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[11.5px] text-fg-tertiary">{say(COPY.demo)}</p>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <div className={cn('fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[55] flex items-center gap-3 sm:right-6 sm:bottom-6', open && 'max-sm:hidden')}>
        <AnimatePresence>
          {hint && !open && (
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="hidden rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-fg shadow-e2 sm:block"
            >
              {say(COPY.hint)}
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? say(COPY.close) : say(COPY.open)}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-e3 ring-4 ring-surface/70"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                <X className="size-6" />
              </motion.span>
            ) : (
              <motion.span key="face" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                <BetuFace className="size-10" />
              </motion.span>
            )}
          </AnimatePresence>
          {!open && <span aria-hidden className="absolute top-0.5 right-0.5 size-3 rounded-full bg-warm ring-2 ring-surface" />}
        </motion.button>
      </div>
    </MotionConfig>
  );
}

function BotAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent">
      <BetuFace className="size-6" />
    </span>
  );
}
