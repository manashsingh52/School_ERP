'use client';

import { Avatar, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@schoolos/ui';
import { Check, ChevronDown } from 'lucide-react';
import { useChild } from '@/lib/child';

/** "Rahul · 8-A ▾" — which child the parent view shows (docs/06 §4). */
export function ChildSwitcher() {
  const { children, child, select } = useChild();
  if (!child) return null;
  const chip = (
    <span className="flex h-8 items-center gap-2 rounded-full border border-border bg-surface pr-2.5 pl-1 text-small font-medium">
      <Avatar name={child.name} size={24} />
      <span className="max-w-32 truncate">{child.firstName}</span>
      {child.classLabel && <span className="text-fg-tertiary">· {child.classLabel}</span>}
      {children.length > 1 && <ChevronDown className="size-3.5 text-fg-tertiary" />}
    </span>
  );
  if (children.length < 2) return chip;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button aria-label={`Showing ${child.firstName}. Switch child`} className="rounded-full focus-visible:outline-2">{chip}</button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Show</MenuLabel>
        {children.map((c) => (
          <MenuItem key={c.id} onSelect={() => select(c.id)}>
            <Avatar name={c.name} size={20} />
            <span className="flex-1 truncate">{c.name}</span>
            <span className="text-caption text-fg-tertiary">{c.classLabel}</span>
            {c.id === child.id && <Check />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
