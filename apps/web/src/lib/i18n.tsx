'use client';

import { MenuItem, MenuLabel, cn } from '@schoolos/ui';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANG_COOKIE, fill, type Lang } from './i18n-shared';
import { translate } from './i18n-translate';

type T = (text: string, vars?: Record<string, string | number>) => string;
const I18nContext = createContext<{ lang: Lang; t: T; setLang: (l: Lang) => void }>({ lang: 'en', t: (s, v) => fill(s, v), setLang: () => {} });

/**
 * English or Hindi. Strings are keyed by their English text, so anything not yet translated
 * simply shows in English. The choice is a cookie, so the server renders it on the first paint.
 */
export function I18nProvider({ lang: initial, children }: { lang: Lang; children: ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback(
    (l: Lang) => {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l === 'hi' ? 'hi-IN' : 'en-IN';
      setLangState(l);
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ lang, setLang, t: ((s, v) => translate(lang, s, v)) as T }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;

/** EN | हिं switch. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div role="radiogroup" aria-label="Language / भाषा" className={cn('inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-surface p-0.5 text-[12px] font-semibold', className)}>
      {(['en', 'hi'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => lang !== l && setLang(l)}
          className={cn('h-full min-w-9 rounded-full px-2 transition-colors', lang === l ? 'bg-accent text-accent-fg' : 'text-fg-secondary hover:text-fg')}
          lang={l === 'hi' ? 'hi' : 'en'}
        >
          {l === 'en' ? 'EN' : 'हिं'}
        </button>
      ))}
    </div>
  );
}

/** "Language" items for an account menu. */
export function LanguageMenuItems() {
  const { lang, setLang, t } = useI18n();
  return (
    <>
      <MenuLabel>{t('Language')}</MenuLabel>
      {(['en', 'hi'] as const).map((l) => (
        <MenuItem key={l} onSelect={() => lang !== l && setLang(l)}>
          <span className="flex size-4 items-center justify-center text-[11px] font-semibold text-fg-tertiary" aria-hidden>{l === 'en' ? 'A' : 'अ'}</span>
          <span className="flex-1" lang={l}>{l === 'en' ? 'English' : 'हिन्दी'}</span>
          {lang === l && <Check className="text-accent" />}
        </MenuItem>
      ))}
    </>
  );
}
