'use client';

import { MenuItem, MenuLabel } from '@schoolos/ui';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
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
