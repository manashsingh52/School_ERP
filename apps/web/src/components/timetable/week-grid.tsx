'use client';

import type { PeriodItem } from '@schoolos/contracts';
import { cn } from '@schoolos/ui';
import { Coffee } from 'lucide-react';
import { DAY_SHORT, clock, shortName } from '@/lib/timetable';

export interface GridCell {
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  room: string | null;
}

export const cellKey = (day: number, periodId: string) => `${day}|${periodId}`;

/**
 * Periods down, days across. Breaks span the row. Cells are buttons when `onCell` is given.
 * `errors` maps cellKey → message (e.g. teacher clash) and outlines those cells.
 */
export function WeekGrid({
  days,
  periods,
  cells,
  onCell,
  errors = {},
  today,
}: {
  days: number[];
  periods: PeriodItem[];
  cells: Map<string, GridCell>;
  onCell?: (day: number, period: PeriodItem) => void;
  errors?: Record<string, string>;
  today?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-small">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-24 border-b border-border bg-surface px-3 py-2 text-left text-caption font-medium text-fg-tertiary">Period</th>
            {days.map((d) => (
              <th key={d} className={cn('border-b border-border px-2 py-2 text-left text-caption font-medium', d === today ? 'text-accent-strong' : 'text-fg-tertiary')}>
                {DAY_SHORT[d]}
                {d === today && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-px text-[10px]">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) =>
            p.isBreak ? (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-1.5">
                  <div className="font-medium text-fg-secondary">{p.name}</div>
                  <div className="tabular text-caption text-fg-tertiary">{clock(p.startTime)}–{clock(p.endTime)}</div>
                </td>
                <td colSpan={days.length} className="border-b border-border bg-subtle/60 px-3 py-1.5 text-caption text-fg-tertiary">
                  <span className="inline-flex items-center gap-1.5"><Coffee className="size-3.5" /> {p.name}</span>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2 align-top">
                  <div className="font-medium">{p.name}</div>
                  <div className="tabular text-caption text-fg-tertiary">{clock(p.startTime)}–{clock(p.endTime)}</div>
                </td>
                {days.map((d) => {
                  const key = cellKey(d, p.id);
                  const cell = cells.get(key);
                  const error = errors[key];
                  const content = cell?.subject || cell?.teacher ? (
                    <>
                      <div className="truncate font-medium text-fg">{cell.subject?.name ?? '—'}</div>
                      <div className="truncate text-caption text-fg-secondary">
                        {cell.teacher ? shortName(cell.teacher.name) : 'No teacher'}
                        {cell.room ? ` · ${cell.room}` : ''}
                      </div>
                    </>
                  ) : (
                    <span className="text-fg-tertiary">{onCell ? '+' : ''}</span>
                  );
                  const cls = cn(
                    'block h-full min-h-12 w-full rounded-md border px-2 py-1.5 text-left',
                    cell?.subject ? 'border-border bg-surface' : 'border-dashed border-border bg-transparent',
                    error && 'border-danger bg-danger-bg',
                    onCell && 'transition-colors hover:border-accent hover:bg-accent-tint',
                    d === today && !error && 'ring-1 ring-accent/20',
                  );
                  return (
                    <td key={d} className="border-b border-border p-1 align-top">
                      {onCell ? (
                        <button type="button" className={cls} onClick={() => onCell(d, p)} title={error} aria-label={`${DAY_SHORT[d]} ${p.name}${cell?.subject ? `: ${cell.subject.name}` : ', empty'}`}>
                          {content}
                        </button>
                      ) : (
                        <div className={cls} title={error}>{content}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
