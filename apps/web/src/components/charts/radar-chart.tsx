'use client';

import { cn } from '@schoolos/ui';

export interface RadarAxis {
  label: string;
  /** 0–100, or null when there is nothing to plot yet. */
  value: number | null;
  /** A second shape drawn dashed underneath (e.g. the section average). */
  compare?: number | null;
}

const short = (s: string, n = 12) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Performance radar (one spoke per subject). Tapping a point or label picks that subject.
 * Plain SVG so it themes with the design tokens and needs no chart library.
 */
export function RadarChart({
  axes,
  selected,
  onSelect,
  size = 320,
  className,
}: {
  axes: RadarAxis[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  size?: number;
  className?: string;
}) {
  const pad = 92;
  const c = size / 2 + pad;
  const R = size / 2;
  const n = axes.length;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const point = (i: number, v: number) => [c + Math.cos(angle(i)) * R * (v / 100), c + Math.sin(angle(i)) * R * (v / 100)] as const;
  const shape = (pick: (a: RadarAxis) => number | null | undefined) => axes.map((a, i) => point(i, Math.max(0, Math.min(100, pick(a) ?? 0))).join(',')).join(' ');
  const hasCompare = axes.some((a) => a.compare !== null && a.compare !== undefined);

  return (
    <svg viewBox={`0 0 ${size + pad * 2} ${size + pad * 2}`} className={cn('w-full max-w-[460px]', className)} role="img" aria-label={`Marks by subject: ${axes.map((a) => `${a.label} ${a.value ?? '—'}%`).join(', ')}`}>
      {[25, 50, 75, 100].map((ring) => (
        <circle key={ring} cx={c} cy={c} r={(R * ring) / 100} fill="none" className={ring === 100 ? 'stroke-success/40' : 'stroke-border'} strokeWidth={ring === 100 ? 1.5 : 1} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} className="stroke-border" strokeWidth={1} />;
      })}
      {hasCompare && <polygon points={shape((a) => a.compare)} className="fill-fg-tertiary/10 stroke-fg-tertiary" strokeWidth={1.5} strokeDasharray="5 4" />}
      <polygon points={shape((a) => a.value)} className="fill-success/20 stroke-success" strokeWidth={2.5} strokeLinejoin="round" />
      {axes.map((a, i) => {
        if (a.value === null) return null;
        const [x, y] = point(i, a.value);
        const active = selected === i;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={active ? 7 : 5}
            className={cn('fill-success stroke-surface', onSelect && 'cursor-pointer')}
            strokeWidth={2}
            onClick={() => onSelect?.(i)}
          >
            <title>{`${a.label}: ${a.value}%`}</title>
          </circle>
        );
      })}
      {axes.map((a, i) => {
        const [x, y] = point(i, 100);
        const cos = Math.cos(angle(i));
        const sin = Math.sin(angle(i));
        const lx = x + cos * 18;
        const ly = y + sin * 18 + (sin > 0.3 ? 10 : sin < -0.3 ? -14 : 0);
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        return (
          <g key={a.label} onClick={() => onSelect?.(i)} className={onSelect ? 'cursor-pointer' : undefined}>
            <text x={lx} y={ly} textAnchor={anchor} className={cn('fill-fg-secondary text-[13px]', selected === i && 'fill-fg font-semibold')}>
              {short(a.label)}
            </text>
            <text x={lx} y={ly + 17} textAnchor={anchor} className="fill-fg text-[13px] font-semibold tabular-nums">
              {a.value === null ? '—' : `${Math.round(a.value)}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
