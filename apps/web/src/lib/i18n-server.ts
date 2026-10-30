import 'server-only';
import { cookies } from 'next/headers';
import { LANG_COOKIE, parseLang, type Lang } from './i18n-shared';
import { translate } from './i18n-translate';

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

/** t() for server components. */
export async function getT() {
  const lang = await getLang();
  return (s: string, v?: Record<string, string | number>) => translate(lang, s, v);
}
