'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { OtpSendResponse } from '@schoolos/contracts';
import { Button, Field, Input, cn, toast } from '@schoolos/ui';
import { Eye, EyeOff, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, apiPost } from '@/lib/api-client';

type Mode = 'password' | 'otp' | 'reset';

const passwordSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your phone number or email'),
  password: z.string().min(1, 'Enter your password'),
});

export function LoginForm({ next, passwordOnly = false }: { next: string; passwordOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>('password');
  if (passwordOnly) return <PasswordForm next={next} />;
  return (
    <div className="flex flex-col gap-5">
      {mode !== 'reset' && (
        <div className="grid grid-cols-2 rounded-md bg-subtle p-0.5" role="tablist" aria-label="Sign-in method">
          {(['password', 'otp'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-8 rounded-[6px] text-small font-medium transition-colors',
                mode === m ? 'bg-surface text-fg shadow-e1' : 'text-fg-secondary hover:text-fg',
              )}
            >
              {m === 'password' ? 'Password' : 'One-time code'}
            </button>
          ))}
        </div>
      )}
      {mode === 'password' && <PasswordForm next={next} onForgot={() => setMode('reset')} />}
      {mode === 'otp' && <OtpFlow purpose="LOGIN" next={next} />}
      {mode === 'reset' && <OtpFlow purpose="RESET_PASSWORD" next={next} onDone={() => setMode('password')} />}
    </div>
  );
}

function useSignedIn(next: string) {
  const router = useRouter();
  return () => {
    router.replace(next);
    router.refresh();
  };
}

function PasswordForm({ next, onForgot }: { next: string; onForgot?: () => void }) {
  const done = useSignedIn(next);
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await apiPost('/api/session/login', values);
      done();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Please try again.');
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Phone or email" htmlFor="identifier" error={errors.identifier?.message}>
        <Input id="identifier" autoComplete="username" autoFocus invalid={!!errors.identifier} {...form.register('identifier')} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
        action={
          onForgot && (
            <button type="button" onClick={onForgot} className="text-small text-accent-strong hover:underline">
              Forgot password?
            </button>
          )
        }
      >
        <div className="relative">
          <Input
            id="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            invalid={!!errors.password}
            className="pr-10"
            {...form.register('password')}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-tertiary hover:text-fg"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {formError && (
        <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-small text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" loading={isSubmitting} className="mt-1 w-full">
        Sign in
      </Button>
    </form>
  );
}

/** Phone → code (→ new password for resets). */
function OtpFlow({ purpose, next, onDone }: { purpose: 'LOGIN' | 'RESET_PASSWORD'; next: string; onDone?: () => void }) {
  const done = useSignedIn(next);
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<OtpSendResponse | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      setChallenge(await apiPost<OtpSendResponse>('/auth/otp/send', { phone, purpose }));
      setCode('');
    });

  const verify = () =>
    run(async () => {
      if (!challenge) return;
      if (purpose === 'LOGIN') {
        await apiPost('/api/session/otp', { challengeId: challenge.challengeId, code });
        done();
      } else {
        await apiPost('/auth/password/reset', { challengeId: challenge.challengeId, code, newPassword });
        toast.success('Password updated. Sign in with your new password.');
        onDone?.();
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void (challenge ? verify() : send());
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {purpose === 'RESET_PASSWORD' && (
        <div>
          <h2 className="text-h3 font-semibold">Reset your password</h2>
          <p className="text-small text-fg-secondary">We'll send a code to your registered mobile number.</p>
        </div>
      )}
      <Field label="Mobile number" htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!!challenge}
          leading={<Phone />}
          autoFocus
        />
      </Field>
      {challenge && (
        <>
          <Field
            label="6-digit code"
            htmlFor="code"
            action={
              <button type="button" onClick={() => setChallenge(null)} className="text-small text-accent-strong hover:underline">
                Change number
              </button>
            }
          >
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="tabular text-center text-[18px] tracking-[0.4em]"
              autoFocus
            />
          </Field>
          {purpose === 'RESET_PASSWORD' && (
            <Field label="New password" htmlFor="newPassword" hint="At least 8 characters">
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} className="w-full" disabled={challenge ? code.length !== 6 : phone.length < 10}>
        {!challenge ? 'Send code' : purpose === 'LOGIN' ? 'Verify and sign in' : 'Set new password'}
      </Button>
      {purpose === 'RESET_PASSWORD' && (
        <Button type="button" variant="ghost" onClick={onDone}>
          Back to sign in
        </Button>
      )}
    </form>
  );
}
