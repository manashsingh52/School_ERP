'use client';

import { BarChart3, CalendarCheck, CreditCard, IndianRupee, LayoutDashboard, RotateCcw, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BastaaMark } from '@/components/brand/logo';
import { useT } from '@/lib/i18n';
import { Avatar, Bar, Check, Collapse, Field, LockScreen, Notification, Phone, Segmented, Stage, States, Text, WALLPAPER, Window, type Act } from '@/vendor/stageshow';
import { Eyebrow, Reveal } from './motion-bits';
import './fee-demo.css';

// "From the counter to the parent's phone", built with the Stageshow kit (vendor/stageshow).
//
// A device pair (gold: device-pair). The office's Collect screen in Bastaa's browser window is
// pinned top-left and runs off the bottom; the parent's phone straddles its right edge over the
// recent-receipts filler, never over the amount. Beats: the cursor picks UPI, types the UPI
// reference, presses Collect; the button confirms on itself and the line under it says the
// receipt went out; "Fee received" drops onto the parent's lock screen. Plays once when seen and
// holds the payoff; the poster is that payoff. Narrow, the sidebar and receipts go, the card
// keeps its full width and the phone sits below it.
//
// Real strings: Payments, Collect, the student, the bill and its amount, the ways to pay, the
// reference, the button, the receipt line and the notification. The rest is bars.

type S = { method: number; ref: string; focus: boolean; sending: boolean; done: boolean; notified: boolean };

const REF = '6283 9910 2231';
const initial: S = { method: 0, ref: '', focus: false, sending: false, done: false, notified: false };
const poster: S = { method: 1, ref: REF, focus: false, sending: true, done: true, notified: true };
/** Empty surface to rest on: under the card wide, beside the phone narrow; never on a word. */
const REST = { wide: { x: 430, y: 512 }, compact: { x: 64, y: 560 } };

async function script(a: Act<S>) {
  await a.wait(800);
  await a.move({ at: 'upi', x: 0.82, y: 0.62 });
  await a.wait(150);
  await a.click();
  a.put({ method: 1 });
  await a.wait(500);
  await a.click({ at: 'ref', x: 0.86, y: 0.6 });
  a.put({ focus: true });
  await a.wait(250);
  await a.type('ref', REF, { interval: 45 });
  await a.wait(500);
  await a.move({ at: 'collect', x: 0.86, y: 0.62 });
  await a.wait(150);
  await a.click();
  a.put({ focus: false, sending: true });
  await a.wait(1000);
  a.put({ done: true });
  await a.wait(600);
  a.put({ notified: true });
  await a.move(REST[a.layout]);
  await a.wait(2400);
}

const NAV = [
  { icon: LayoutDashboard, w: 58 },
  { icon: Users, w: 46 },
  { icon: CalendarCheck, w: 52 },
  { icon: IndianRupee, w: 30 },
  { icon: CreditCard, label: 'Payments' },
  { icon: BarChart3, w: 44 },
];
const RECENT = [64, 52, 70, 48, 58, 66];

/** The lock screen shows today, in India; filled in after mount so server and browser agree. */
function useToday() {
  const [today, setToday] = useState({ date: 'Monday, 10 November', time: '10:42' });
  useEffect(() => {
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(now);
    setToday((t) => ({ ...t, date }));
  }, []);
  return today;
}

/** Follows the site's light/dark switch (a data-theme attribute, or the device when it says "system"). */
function usePageTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setTheme(t === 'dark' || (t !== 'light' && media.matches) ? 'dark' : 'light');
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', read);
    return () => {
      watch.disconnect();
      media.removeEventListener('change', read);
    };
  }, []);
  return theme;
}

function FeeStage() {
  const today = useToday();
  const theme = usePageTheme();
  return (
    <Stage
      width={1000}
      height={540}
      compact={{ below: 640, width: 358, height: 700 }}
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      theme={theme}
      fidelity="standard"
      cursor={{ at: REST }}
      className="fee-demo"
    >
      {(s) => (
        <>
          <Window url="demo.bastaa.in/payments" urlShape="pill" className="fd-window">
            <aside className="fd-side">
              <div className="fd-school">
                <span className="fd-school__mark">D</span>
                <Text className="fd-school__name">Demo Public School</Text>
              </div>
              {NAV.map(({ icon: Icon, w, label }, i) => (
                <div key={i} className="fd-nav" data-active={label ? true : undefined}>
                  <Icon className="fd-nav__icon" />
                  {label ? <Text className="fd-nav__label">{label}</Text> : <Bar w={w ?? 40} h={5} tone={2} />}
                </div>
              ))}
            </aside>

            <div className="fd-main">
              <div className="fd-head">
                <Text className="fd-title">Payments</Text>
                <div className="fd-tabs">
                  <span className="fd-tab" data-active>Collect</span>
                  <span className="fd-tab"><Bar w={52} h={5} tone={2} /></span>
                  <span className="fd-tab"><Bar w={40} h={5} tone={2} /></span>
                </div>
              </div>

              <div className="fd-cols">
                <section className="fd-card">
                  <div className="fd-student">
                    <Avatar name="Ananya Mishra" size={36} />
                    <div className="fd-student__text">
                      <Text className="fd-student__name">Ananya Mishra</Text>
                      <Text filler className="fd-student__sub">Class 5-B · Adm. 1376</Text>
                    </div>
                  </div>
                  <div className="fd-bill">
                    <Check on size={16} />
                    <Text className="fd-bill__name">Term 2 fee</Text>
                    <Bar w={74} h={5} tone={2} />
                    <Text className="fd-bill__amount">₹6,000</Text>
                  </div>
                  <div className="fd-pay">
                    <Text className="fd-label">Paid by</Text>
                    <Segmented items={['Cash', 'UPI', 'Bank']} value={s.method} targets={['cash', 'upi', 'bank']} cursor="pointer" className="fd-seg" />
                    <Field label="UPI reference" value={s.ref} placeholder="UTR number" focused={s.focus} box={{ 'data-target': 'ref', 'data-cursor': 'ibeam' }} className="fd-field" />
                    <span className="fd-button" data-target="collect" data-cursor="pointer" data-done={s.done || undefined}>
                      <span className="fd-layer" data-on={!s.sending || undefined}>Collect ₹6,000</span>
                      <span className="fd-layer" data-on={s.sending || undefined}>
                        <Check on={s.done} pending={s.sending && !s.done} size={14} />
                        <span className="fd-labels">
                          <span className="fd-labels__one" data-on={!s.done || undefined}>Recording…</span>
                          <span className="fd-labels__one" data-on={s.done || undefined}>Received</span>
                        </span>
                      </span>
                    </span>
                    <div className="fd-lane">
                      <States
                        value={s.done ? 'done' : 'hint'}
                        align="start"
                        states={{
                          hint: <Bar w={150} h={5} tone={2} />,
                          done: <Text className="fd-lane__text">Receipt RCPT/2026-27/0418 sent to the parent</Text>,
                        }}
                      />
                    </div>
                  </div>
                </section>

                <section className="fd-recent" aria-hidden>
                  <Bar w={70} h={6} tone={3} />
                  {RECENT.map((w, i) => (
                    <div key={i} className="fd-recent__row">
                      <Avatar plain size={20} />
                      <Bar w={w} h={5} tone={2} />
                      <Bar w={30} h={5} tone={2} style={{ marginLeft: 'auto' }} />
                    </div>
                  ))}
                </section>
              </div>
            </div>
          </Window>

          <Phone width={268} frame="pro" dark wallpaper={WALLPAPER} time={today.time} className="fd-phone">
            <LockScreen size="satellite" stack="top" date={today.date} time={today.time}>
              <Collapse open={s.notified} reveal="drop">
                <Notification icon={<BastaaMark className="fd-app-icon" />} title="Fee received" body="₹6,000 for Ananya (5-B). Receipt RCPT/2026-27/0418 is in the Bastaa app." />
              </Collapse>
            </LockScreen>
          </Phone>
        </>
      )}
    </Stage>
  );
}

/** Homepage section: the office collects a fee and the parent's phone gets the receipt. */
export function FeeDemo() {
  const t = useT();
  const [run, setRun] = useState(0);
  return (
    <section className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 pt-4 pb-16 min-[375px]:px-5 lg:px-8 lg:pb-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>{t('From the counter to the phone')}</Eyebrow>
          <h2 className="site-h2 mt-3 text-fg">{t('Fee collected. Parent told. Receipt sent.')}</h2>
          <p className="site-lead mx-auto mt-4 text-fg-secondary">{t('The office takes the fee at the counter, and the parent gets the receipt on their phone the same moment. No calls, no lost slips.')}</p>
        </Reveal>
        <div className="mt-10 flex justify-center">
          <div className="w-full max-w-[1000px]">
            <FeeStage key={run} />
          </div>
        </div>
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setRun((n) => n + 1)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-small font-medium text-fg-secondary transition-colors hover:bg-subtle hover:text-fg">
            <RotateCcw className="size-3.5" /> {t('Play again')}
          </button>
        </div>
      </div>
    </section>
  );
}
