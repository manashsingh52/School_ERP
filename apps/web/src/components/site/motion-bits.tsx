'use client';

import { cn } from '@schoolos/ui';
import { MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';

/** One spring for tabs, sheets and swaps, so everything on the site moves alike. */
export const SPRING = { type: 'spring', stiffness: 280, damping: 26 } as const;

/** Animations on the website respect the visitor's "reduce motion" setting. */
export function SiteMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0, as = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li' | 'section' }) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1], delay }}
    >
      {children}
    </Tag>
  );
}

/** Small uppercase label above a section heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[12px] font-semibold tracking-[0.14em] text-accent-strong uppercase', className)}>{children}</p>;
}
