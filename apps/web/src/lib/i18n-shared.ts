export const LANG_COOKIE = 'bastaa-lang';
export type Lang = 'en' | 'hi';
export const parseLang = (v: string | undefined): Lang => (v === 'hi' ? 'hi' : 'en');

/** "{name}" placeholders filled from vars. */
export function fill(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}
