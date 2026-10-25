'use client';

import { MenuItem, MenuLabel, cn } from '@schoolos/ui';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { THEME_COOKIE, type Theme } from './theme-shared';

function currentTheme(): Theme {
  const t = typeof document === 'undefined' ? null : document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

/** Applies at once (no reload) and remembers it for a year on this device. */
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Match device', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** "Appearance" items for an account menu. */
export function ThemeMenuItems() {
  const [theme, set] = useState<Theme>(currentTheme);
  return (
    <>
      <MenuLabel>Appearance</MenuLabel>
      {OPTIONS.map((o) => (
        <MenuItem
          key={o.value}
          onSelect={() => {
            setTheme(o.value);
            set(o.value);
          }}
        >
          <o.icon /> <span className="flex-1">{o.label}</span>
          {theme === o.value && <Check className="text-accent" />}
        </MenuItem>
      ))}
    </>
  );
}

const darkNow = () => {
  const t = currentTheme();
  return t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
};

/**
 * One-tap light/dark switch (sun ↔ moon). Follows the device until it's pressed. The icon is drawn
 * after mounting: the server can't know a "match device" visitor's theme.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    setDark(darkNow());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(darkNow());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !darkNow();
        setTheme(next ? 'dark' : 'light');
        setDark(next);
      }}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-fg-secondary transition-colors hover:border-border-strong hover:text-fg active:scale-95',
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {dark !== null && (
          <motion.span
            key={dark ? 'moon' : 'sun'}
            initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="flex"
          >
            {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
