import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-md border border-border-strong bg-surface text-body text-fg shadow-e1 transition-[border-color,box-shadow] duration-[120ms] ' +
  'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-soft ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-tertiary';

/** Native select (accessible, mobile-friendly) styled like Input. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, 'h-9 appearance-none pr-9 pl-3', invalid && 'border-danger', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-tertiary" />
    </div>
  ),
);
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, 'min-h-20 px-3 py-2 placeholder:text-fg-tertiary', invalid && 'border-danger', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: React.ReactNode; description?: React.ReactNode }
>(({ className, label, description, id, ...props }, ref) => {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-2.5 select-none', props.disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="relative mt-0.5 flex size-4 shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer size-4 appearance-none rounded-[4px] border border-border-strong bg-surface checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          {...props}
        />
        <Check className="pointer-events-none absolute inset-0 m-auto size-3 text-accent-fg opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-body text-fg">{label}</span>}
          {description && <span className="block text-small text-fg-secondary">{description}</span>}
        </span>
      )}
    </label>
  );
});
Checkbox.displayName = 'Checkbox';

/** Underline tabs (controlled). For URL tabs, pass hrefs and render links yourself with `TabsList`. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: React.ReactNode; count?: number; disabled?: boolean }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
          className={cn(
            '-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-body transition-colors',
            value === item.value ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-secondary hover:text-fg',
            item.disabled && 'cursor-not-allowed text-fg-tertiary hover:text-fg-tertiary',
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="tabular rounded-full bg-subtle px-1.5 text-caption text-fg-secondary">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Wizard progress (docs/08 W9, W10). */
export function Stepper({ steps, current, onSelect, className }: { steps: string[]; current: number; onSelect?: (index: number) => void; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-x-1 gap-y-2', className)}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        const clickable = onSelect && i <= current;
        return (
          <li key={label} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(i)}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-small transition-colors',
                state === 'current' ? 'bg-accent-tint font-medium text-fg' : state === 'done' ? 'text-fg-secondary hover:bg-hover' : 'text-fg-tertiary',
                !clickable && 'cursor-default hover:bg-transparent',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-caption font-semibold',
                  state === 'done' ? 'bg-accent text-accent-fg' : state === 'current' ? 'border-2 border-accent text-accent-strong' : 'border border-border-strong',
                )}
              >
                {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
            {i < steps.length - 1 && <span className="h-px w-3 bg-border-strong" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('max-h-[65vh] overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-border px-5 py-3', className)} {...props} />;
}
