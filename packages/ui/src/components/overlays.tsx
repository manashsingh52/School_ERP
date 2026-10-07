'use client';

import { Command as Cmdk } from 'cmdk';
import { Search, X } from 'lucide-react';
import { Dialog as D, DropdownMenu as DM, Tooltip as T } from 'radix-ui';
import * as React from 'react';
import { Toaster as Sonner } from 'sonner';
import { cn } from '../lib/cn';

// ---------------------------------------------------------------- Tooltip (500ms delay)

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <T.Provider delayDuration={500}>{children}</T.Provider>;
}

export function Tooltip({
  content,
  side = 'top',
  children,
  disabled,
}: {
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactElement;
  disabled?: boolean;
}) {
  if (disabled) return children;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-charcoal px-2 py-1 text-caption font-medium text-white shadow-e2"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

// ---------------------------------------------------------------- Dialog

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  hideTitle,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  hideTitle?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-[fade-in_180ms_var(--ease)]" />
      <D.Content
        className={cn(
          'fixed inset-x-0 top-[12vh] z-50 mx-auto w-[calc(100vw-32px)] max-w-[560px]',
          'rounded-lg border border-border bg-surface shadow-e3 focus:outline-none',
          'data-[state=open]:animate-[dialog-in_200ms_var(--ease)]',
          className,
        )}
      >
        <D.Title className={hideTitle ? 'sr-only' : 'px-5 pt-5 text-h2 font-semibold'}>{title}</D.Title>
        {description ? (
          <D.Description className={hideTitle ? 'sr-only' : 'px-5 pt-1 text-body text-fg-secondary'}>
            {description}
          </D.Description>
        ) : (
          <D.Description className="sr-only">{title}</D.Description>
        )}
        {children}
        {!hideTitle && (
          <D.Close
            className="absolute top-4 right-4 rounded-md p-1 text-fg-tertiary hover:bg-hover hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

// ---------------------------------------------------------------- Dropdown menu

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-52 rounded-lg border border-border bg-surface p-1 shadow-e2', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  destructive,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-body outline-none select-none',
        'data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-tertiary',
        destructive && 'text-danger [&_svg]:text-danger',
      )}
    >
      {children}
    </DM.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2 pt-1.5 pb-1 text-caption font-medium text-fg-tertiary">{children}</DM.Label>;
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

// ---------------------------------------------------------------- Command palette (⌘K)

export function CommandDialog({
  open,
  onOpenChange,
  children,
  search,
  onSearchChange,
  placeholder = 'Search students, pages and actions…',
  loading,
  selected,
  onSelectedChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  /** Highlighted item (controlled), so async results can keep the first one selected. */
  selected?: string;
  onSelectedChange?: (value: string) => void;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/25" />
        <D.Content
          className={cn(
            'fixed inset-x-0 top-[14vh] z-50 mx-auto w-[calc(100vw-32px)] max-w-[620px] overflow-hidden',
            'rounded-xl border border-border bg-surface shadow-e3 focus:outline-none',
            'data-[state=open]:animate-[dialog-in_180ms_var(--ease)]',
          )}
        >
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search and run commands</D.Description>
          <Cmdk shouldFilter={false} loop value={selected} onValueChange={onSelectedChange} className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-fg-tertiary" />
              <Cmdk.Input
                value={search}
                onValueChange={onSearchChange}
                placeholder={placeholder}
                className="h-13 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
              />
              {loading && <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-label="Searching" />}
            </div>
            <Cmdk.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">{children}</Cmdk.List>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-caption text-fg-tertiary">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </Cmdk>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function CommandEmpty({ children }: { children: React.ReactNode }) {
  return <Cmdk.Empty className="px-3 py-10 text-center text-body text-fg-secondary">{children}</Cmdk.Empty>;
}

export function CommandGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Cmdk.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-tertiary"
    >
      {children}
    </Cmdk.Group>
  );
}

export function CommandItem({
  value,
  onSelect,
  icon,
  children,
  hint,
}: {
  value: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Cmdk.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex h-10 cursor-default items-center gap-3 rounded-md px-2 text-body text-fg select-none',
        'data-[selected=true]:bg-hover [&_svg]:size-4 [&_svg]:text-fg-tertiary',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-small text-fg-tertiary">{hint}</span>}
    </Cmdk.Item>
  );
}

// ---------------------------------------------------------------- Toasts

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        className: 'rounded-lg! border! border-border! bg-surface! text-fg! shadow-e2! text-body!',
      }}
    />
  );
}

export { toast } from 'sonner';
