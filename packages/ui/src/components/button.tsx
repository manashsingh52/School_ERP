import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none ' +
    'transition-colors duration-[120ms] ease-[var(--ease)] disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg shadow-e1 hover:bg-accent-hover active:brightness-95',
        secondary: 'border border-border-strong bg-surface text-fg shadow-e1 hover:bg-hover active:bg-subtle',
        ghost: 'text-fg-secondary hover:bg-hover hover:text-fg active:bg-subtle',
        destructive: 'bg-danger text-fg-inverse shadow-e1 hover:opacity-90',
        link: 'h-auto px-0 text-accent-strong underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-small',
        md: 'h-9 px-3.5 text-body',
        lg: 'h-11 px-5 text-body',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Spinner className="size-4" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
