import * as React from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Text or icon shown inside the field on the left, e.g. "+91" or a search icon. */
  leading?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, leading, ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-fg shadow-e1',
          'placeholder:text-fg-tertiary transition-[border-color,box-shadow] duration-[120ms]',
          'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-soft',
          'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-tertiary',
          invalid && 'border-danger focus-visible:border-danger focus-visible:ring-danger-bg',
          leading ? 'pl-9' : undefined,
          className,
        )}
        {...props}
      />
    );
    if (!leading) return field;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-tertiary [&_svg]:size-4">
          {leading}
        </span>
        {field}
      </div>
    );
  },
);
Input.displayName = 'Input';

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

/** Label above, helper or error below (docs/07 §4 Forms). */
export function Field({ label, htmlFor, error, hint, children, className, action }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-small font-medium text-fg">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-small text-fg-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}
