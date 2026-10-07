'use client';

import { Button, Field, Input } from '@schoolos/ui';
import { ArrowRight, Building2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';

export function AuthFrame({ schoolName, subtitle, children }: { schoolName: string; subtitle: string; children: ReactNode }) {
  const initial = schoolName.trim()[0]?.toUpperCase() ?? 'S';
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-[20px] font-semibold text-accent-fg shadow-e1">
            {initial}
          </div>
          <h1 className="text-h1 font-semibold tracking-[-0.01em]">{schoolName}</h1>
          <p className="mt-1 text-body text-fg-secondary">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-e1">{children}</div>
        <p className="mt-8 text-center text-caption text-fg-tertiary">Powered by SchoolOS</p>
      </div>
    </main>
  );
}

/** Bare domain: ask for the school's web address, then go to its subdomain. */
export function FindSchool() {
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [host, setHost] = useState('');
  useEffect(() => setHost(window.location.host), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = slug.trim().toLowerCase();
    if (!value) return setError("Enter your school's web address");
    setLoading(true);
    setError(undefined);
    try {
      await apiFetch(`/public/schools/${encodeURIComponent(value)}`);
      window.location.assign(`${window.location.protocol}//${value}.${host}/login`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "We couldn't find a school at that address." : 'Please try again.');
      setLoading(false);
    }
  }

  return (
    <AuthFrame schoolName="SchoolOS" subtitle="Find your school to sign in">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="School web address" htmlFor="slug" error={error} hint="Your school shared this with you, e.g. stmarys">
          <div className="flex items-center gap-2">
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="yourschool"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              invalid={!!error}
              leading={<Building2 />}
            />
            <span className="shrink-0 text-body text-fg-tertiary">.{host.split(':')[0]}</span>
          </div>
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Continue <ArrowRight />
        </Button>
      </form>
    </AuthFrame>
  );
}

export function UnknownSchool({ slug }: { slug: string }) {
  return (
    <AuthFrame schoolName="School not found" subtitle={`There's no school at "${slug}".`}>
      <p className="text-body text-fg-secondary">Check the web address your school shared with you.</p>
    </AuthFrame>
  );
}
