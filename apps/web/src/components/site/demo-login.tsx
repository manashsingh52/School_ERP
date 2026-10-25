'use client';

import { toast } from '@schoolos/ui';
import { ArrowRight, Building2, GraduationCap, Heart, Users } from 'lucide-react';
import { useState } from 'react';
import { BastaaMark } from '@/components/brand/logo';
import { ApiError, apiPost } from '@/lib/api-client';

const ICONS = { admin: Building2, teacher: Users, parent: Heart, owner: GraduationCap } as const;

export interface DemoPersonaCard {
  key: keyof typeof ICONS;
  title: string;
  person: string;
  text: string;
}

/** Demo mode sign-in: pick whose day to look at. */
export function DemoLogin({ personas }: { personas: readonly DemoPersonaCard[] }) {
  const [busy, setBusy] = useState<string | null>(null);
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
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-[720px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BastaaMark className="mb-4 size-12 rounded-xl shadow-e1" />
          <h1 className="text-h1 font-semibold tracking-[-0.01em]">Explore Bastaa</h1>
          <p className="mt-1 max-w-md text-body text-fg-secondary">A sample school with 750 students. Choose whose day you want to see. It&apos;s a demo, so changes aren&apos;t saved.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {personas.map((p) => {
            const Icon = ICONS[p.key];
            return (
              <button
                key={p.key}
                type="button"
                disabled={!!busy}
                onClick={() => void enter(p.key)}
                className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 text-left shadow-e1 transition-colors hover:border-accent disabled:opacity-60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent-strong"><Icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-h3 font-semibold">
                    {p.title}
                    <ArrowRight className="size-4 text-fg-tertiary transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-0.5 block text-small text-accent-strong">{busy === p.key ? 'Opening…' : p.person}</span>
                  <span className="mt-1.5 block text-small text-fg-secondary">{p.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-8 text-center text-caption text-fg-tertiary">
          Bastaa demo · <a href="/" className="hover:text-fg-secondary hover:underline">Home</a> · <a href="/privacy" className="hover:text-fg-secondary hover:underline">Privacy</a>
        </p>
      </div>
    </main>
  );
}
