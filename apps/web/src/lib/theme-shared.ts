export const THEME_COOKIE = 'schoolos-theme';
export type Theme = 'system' | 'light' | 'dark';
export const parseTheme = (v: string | undefined): Theme => (v === 'light' || v === 'dark' ? v : 'system');
