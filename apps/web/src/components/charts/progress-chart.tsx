'use client';

import { cn } from '@schoolos/ui';

export interface ProgressPoint {
  label: string;
  value: number;
  compare?: number | null;
}

/** Percentage across exams (oldest → newest), with the section average dashed behind it. */
export function ProgressChart({ points, className }: { points: ProgressPoint[]; className?: string }) {
  const W = 440;
  const H = 230;
  const left = 34;
  const right = 24;
  const top = 26;
  const bottom = 40;
  const x = (i: number) => left + (points.length === 1 ? (W - left - right) / 2 : ((W - left - right) * i) / (points.length - 1));
  const y = (v: number) => top + (H - top - bottom) * (1 - Math.max(0, Math.min(100, v)) / 100);
  const line = (pick: (p: ProgressPoint) => number | null | undefined) =>
    points
      .map((p, i) => [i, pick(p)] as const)
      .filter((e): e is readonly [number, number] => e[1] !== null && e[1] !== undefined)
      .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i)},${y(v)}`)
      .join(' ');
  const short = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);
  // The first and last labels hug the edges so they're never cut off.
  const anchor = (i: number) => (points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full', className)} role="img" aria-label={`Progress: ${points.map((p) => `${p.label} ${p.value}%`).join(', ')}`}>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={left} x2={W - right} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth={1} />
          <text x={left - 8} y={y(g) + 4} textAnchor="end" className="fill-fg-tertiary text-[12px] tabular-nums">{g}</text>
        </g>
      ))}
      <path d={line((p) => p.compare)} fill="none" className="stroke-fg-tertiary" strokeWidth={1.5} strokeDasharray="5 4" />
      <path d={line((p) => p.value)} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle cx={x(i)} cy={y(p.value)} r={5} className="fill-accent stroke-surface" strokeWidth={2}>
            <title>{`${p.label}: ${p.value}%${p.compare !== null && p.compare !== undefined ? ` (section ${p.compare}%)` : ''}`}</title>
          </circle>
          <text x={x(i)} y={y(p.value) - 11} textAnchor={anchor(i)} className="fill-fg text-[14px] font-semibold tabular-nums">{Math.round(p.value)}%</text>
          <text x={x(i)} y={H - bottom + 24} textAnchor={anchor(i)} className="fill-fg-secondary text-[13px]">{short(p.label)}</text>
        </g>
      ))}
    </svg>
  );
}
