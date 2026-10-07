'use client';

import { AlertCircle, Check, Copy } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

/** Every module has a useful empty state — never a blank screen (docs/07 §4). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-subtle text-fg-tertiary [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-h3 font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-body text-fg-secondary">{description}</p>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
    </div>
  );
}

/** Friendly failure with a retry and a support reference the school can read out. */
export function ErrorState({
  title = "Something didn't load",
  message,
  supportRef,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  supportRef?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)} role="alert">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-danger-bg text-danger">
        <AlertCircle className="size-5" />
      </div>
      <h3 className="text-h3 font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-body text-fg-secondary">
        {message ?? 'Please check your connection and try again.'}
      </p>
      <div className="mt-5 flex items-center gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {supportRef && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(supportRef);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            <span className="font-mono">{supportRef}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        {description && <p className="mt-1 text-body text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
