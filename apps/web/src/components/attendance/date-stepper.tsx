'use client';

import { Button } from '@schoolos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, formatDay, todayISO } from '@/lib/format';

/** ‹ Thu, 8 Oct › [Today] — with a native date picker for jumps. */
export function DateStepper({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = todayISO();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => onChange(addDays(value, -1))}>
        <ChevronLeft />
      </Button>
      <label className="relative flex h-9 cursor-pointer items-center rounded-md border border-border bg-surface px-3 text-body font-medium hover:border-border-strong">
        <span className="tabular">{value === today ? `Today, ${formatDay(value).split(', ')[1]}` : formatDay(value)}</span>
        <input
          type="date"
          value={value}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick a date"
        />
      </label>
      <Button variant="ghost" size="icon-sm" aria-label="Next day" disabled={value >= today} onClick={() => onChange(addDays(value, 1))}>
        <ChevronRight />
      </Button>
      {value !== today && (
        <Button variant="secondary" size="sm" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
