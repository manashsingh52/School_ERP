import { cn } from '@schoolos/ui';

/** The Bastaa mark: a round "b" with a saffron dot. Drawn by apps/mobile/tool/make_icons.py (keep in step). */
export function BastaaMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('size-8 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="512" height="512" rx="112.6" fill="#2F6FEB" />
      <rect x="135.7" y="87" width="71.7" height="253.4" rx="35.8" fill="#fff" />
      <path d="M135.7 304.6a120.3 120.3 0 1 0 240.6 0a120.3 120.3 0 1 0 -240.6 0zM207.4 304.6a48.6 48.6 0 1 1 97.3 0a48.6 48.6 0 1 1 -97.3 0z" fill="#fff" fillRule="evenodd" />
      <circle cx="256" cy="304.6" r="31.7" fill="#F7A400" />
    </svg>
  );
}

/** Mark + name, for the website and the staff console. */
export function BastaaLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[19px] font-bold tracking-[-0.02em] text-fg', className)}>
      <BastaaMark className={markClassName} />
      bastaa
    </span>
  );
}
