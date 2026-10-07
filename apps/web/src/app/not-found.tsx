import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-small text-fg-tertiary">404</p>
      <h1 className="mt-2 text-h1 font-semibold">We couldn't find that page</h1>
      <p className="mt-1 text-body text-fg-secondary">The link may be old, or you may not have access.</p>
      <Link href="/dashboard" className="mt-6 text-body font-medium text-accent-strong hover:underline">
        Go to dashboard
      </Link>
    </main>
  );
}
