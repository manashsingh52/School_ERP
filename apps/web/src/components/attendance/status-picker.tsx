'use client';

import type { AttendanceStatus } from '@schoolos/contracts';
import { cn } from '@schoolos/ui';
import { ATTENDANCE, ATTENDANCE_ORDER } from '@/lib/labels';

const ACTIVE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success text-fg-inverse border-success',
  ABSENT: 'bg-danger text-fg-inverse border-danger',
  LATE: 'bg-warning text-fg-inverse border-warning',
  HALF_DAY: 'bg-info text-fg-inverse border-info',
  LEAVE: 'bg-fg-secondary text-surface border-fg-secondary',
};

/** P · A · L · H · Lv segmented buttons. Large enough to tap on a phone. */
export function StatusPicker({
  value,
  onChange,
  disabled,
  name,
}: {
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={`Attendance for ${name}`} className="inline-flex gap-1">
      {ATTENDANCE_ORDER.map((status) => {
        const meta = ATTENDANCE[status];
        const selected = value === status;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={meta.label}
            title={`${meta.label} (${meta.key.toUpperCase()})`}
            tabIndex={-1}
            disabled={disabled}
            onClick={() => onChange(status)}
            className={cn(
              'flex h-8 min-w-9 items-center justify-center rounded-md border px-2 text-small font-semibold transition-colors duration-[120ms]',
              selected ? ACTIVE[status] : 'border-border bg-surface text-fg-tertiary hover:border-border-strong hover:text-fg',
              disabled && 'cursor-not-allowed opacity-60 hover:border-border hover:text-fg-tertiary',
            )}
          >
            {meta.short}
          </button>
        );
      })}
    </div>
  );
}

export function StatusCell({ status }: { status: AttendanceStatus | undefined }) {
  if (!status) return <span className="text-fg-tertiary">·</span>;
  const tone = { PRESENT: 'text-success', ABSENT: 'text-danger font-semibold', LATE: 'text-warning', HALF_DAY: 'text-info', LEAVE: 'text-fg-secondary' }[status];
  return <span className={tone}>{ATTENDANCE[status].short}</span>;
}
