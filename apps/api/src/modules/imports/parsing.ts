import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/node';
import type { ImportField } from '@schoolos/contracts';

/** "Father's Mobile No." → "fathersmobileno" */
export const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Best-guess column → field mapping; each field is used at most once. */
export function suggestMapping(headers: string[], fields: ImportField[]): Record<string, string> {
  const mapping: Record<string, string> = Object.fromEntries(headers.map((h) => [h, '']));
  const used = new Set<string>();
  const candidates = (field: ImportField) => [field.key, field.label, ...field.aliases].map(normalizeHeader);
  // Pass 1: exact matches. Pass 2: header contains an alias (longest alias wins).
  for (const exact of [true, false]) {
    for (const header of headers) {
      if (mapping[header]) continue;
      const h = normalizeHeader(header);
      let best: { key: string; len: number } | null = null;
      for (const field of fields) {
        if (used.has(field.key)) continue;
        for (const alias of candidates(field)) {
          const hit = exact ? h === alias : alias.length >= 4 && h.includes(alias);
          if (hit && (!best || alias.length > best.len)) best = { key: field.key, len: alias.length };
        }
      }
      if (best) {
        mapping[header] = best.key;
        used.add(best.key);
      }
    }
  }
  return mapping;
}

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

const cellToString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
};

/** First non-empty row = headers. Blank rows are dropped. Duplicate headers get " (2)". */
function toSheet(matrix: unknown[][]): ParsedSheet {
  const nonEmpty = matrix.filter((row) => row.some((c) => cellToString(c) !== ''));
  const [head, ...body] = nonEmpty;
  if (!head) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = head.map((h, i) => {
    const base = cellToString(h) || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  return {
    headers,
    rows: body.map((row) => Object.fromEntries(headers.map((h, i) => [h, cellToString(row[i])]))),
  };
}

export async function parseSpreadsheet(buffer: Buffer, mimeType: string): Promise<ParsedSheet> {
  if (mimeType === 'text/csv') {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    return toSheet(parsed.data);
  }
  const data = (await readSheet(buffer)) as unknown[][];
  return toSheet(data);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Indian convention: day first. Accepts 2026-04-01, 01/04/2026, 1-4-2026, 01.04.26, 1 Apr 2026,
 * and Excel serial numbers (e.g. 46113). Returns YYYY-MM-DD or null.
 */
export function parseDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let y: number;
  let m: number;
  let d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += y > 50 ? 1900 : 2000;
  } else if ((match = s.match(/^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i))) {
    d = Number(match[1]);
    m = MONTHS.indexOf(match[2]!.toLowerCase()) + 1;
    y = Number(match[3]);
  } else if (/^\d{5}$/.test(s)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); // Excel 1900 date system
    return date.toISOString().slice(0, 10);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!m || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1940 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

export function parseGender(input: string): 'MALE' | 'FEMALE' | 'OTHER' | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (['m', 'male', 'boy', 'b'].includes(s)) return 'MALE';
  if (['f', 'female', 'girl', 'g'].includes(s)) return 'FEMALE';
  if (['o', 'other', 'others', 'transgender', 't'].includes(s)) return 'OTHER';
  return null;
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** "Class 8", "8", "VIII", "8th", "Std. 8", "Grade 8" → "8"; "LKG", "L.K.G." → "lkg" */
export function classKey(input: string): string {
  let s = input.trim().toLowerCase().replace(/\./g, '');
  s = s.replace(/^(class|grade|std|standard)\s*/, '').trim();
  s = s.replace(/^(\d{1,2})(st|nd|rd|th)$/, '$1');
  if (ROMAN[s] !== undefined) return String(ROMAN[s]);
  if (/^\d{1,2}$/.test(s)) return String(Number(s));
  if (['prenursery', 'pre nursery', 'playgroup', 'pg'].includes(s)) return 'prenursery';
  if (['nur', 'nursery'].includes(s)) return 'nursery';
  return s.replace(/\s+/g, ' ');
}

/** "8-A", "8 A", "VIII-B", "Class 8 A", "8A", "UKG-B" → { cls, section } */
export function splitClassSection(input: string): { cls: string; section: string } | null {
  const s = input.trim();
  const match = s.match(/^(.*?)[\s\-/]*([A-Za-z])$/);
  if (!match || !match[1]) return null;
  const cls = match[1].trim().replace(/[\s\-/]+$/, '');
  return cls ? { cls, section: match[2]!.toUpperCase() } : null;
}

export function splitName(full: string): { firstName: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}
