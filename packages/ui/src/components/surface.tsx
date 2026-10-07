import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/** Card: border OR shadow, never both heavy (docs/07 §1.5). */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-h3 font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-small text-fg-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-subtle text-fg-secondary',
        accent: 'border-transparent bg-accent-soft text-accent-strong',
        success: 'border-success-border bg-success-bg text-success',
        warning: 'border-warning-border bg-warning-bg text-warning',
        danger: 'border-danger-border bg-danger-bg text-danger',
        info: 'border-info-border bg-info-bg text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1',
        'font-sans text-[11px] font-medium text-fg-tertiary',
        className,
      )}
      {...props}
    />
  );
}

/** Skeleton shaped like the final content (docs/07 §4 Loading). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-subtle', className)} aria-hidden="true" {...props} />;
}

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-subtle font-medium text-fg-secondary',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials}
    </span>
  );
}
