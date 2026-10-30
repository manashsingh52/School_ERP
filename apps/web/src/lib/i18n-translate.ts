import { HI } from './i18n-hi';
import { fill, type Lang } from './i18n-shared';

const NUMBER = /\d[\d,.]*/g;

/**
 * English text in the chosen language. Text from the server with numbers in it ("6 registers
 * not submitted today") is looked up with each number as {#}, then the numbers go back in.
 */
export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  if (lang === 'en') return fill(text, vars);
  const exact = HI[text];
  if (exact !== undefined) return fill(exact, vars);
  const numbers = text.match(NUMBER);
  const shaped = numbers && HI[text.replace(NUMBER, '{#}')];
  if (shaped) {
    let i = 0;
    return fill(shaped.replace(/\{#\}/g, () => numbers[i++] ?? ''), vars);
  }
  return fill(text, vars);
}

const HI_DAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

/** "शुक्रवार, 30 अक्टूबर" in school time. Spelled here, not by Intl: browsers and Node disagree. */
export function hindiToday(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${HI_DAYS[ist.getUTCDay()]}, ${ist.getUTCDate()} ${HI_MONTHS[ist.getUTCMonth()]}`;
}
