import type { ReportTable } from '@schoolos/contracts';

/** Columns that hold people's names or contact details (report engine column keys). */
const PERSONAL = new Set(['name', 'student', 'parent', 'phone', 'topper', 'teacher', 'collector', 'guardian']);

/**
 * Names never leave the school (docs/09, docs/12 Phase 8): before a table goes to the AI provider,
 * each personal value becomes a placeholder like [P3]; the answer is turned back for the person
 * who asked, who may already see these names.
 */
export class Masker {
  private readonly toToken = new Map<string, string>();
  private readonly fromToken = new Map<string, string>();

  private token(value: string): string {
    let t = this.toToken.get(value);
    if (!t) {
      t = `[P${this.toToken.size + 1}]`;
      this.toToken.set(value, t);
      this.fromToken.set(t, value);
    }
    return t;
  }

  /** The table as the model sees it: placeholders for people, money in rupees, at most 30 rows. */
  forModel(t: ReportTable, maxRows = 30): Record<string, unknown> {
    const value = (key: string, type: string, v: string | number | null | undefined) => {
      if (v === null || v === undefined) return null;
      if (PERSONAL.has(key) && typeof v === 'string') {
        // "Rahul Kumar (96%)" keeps the number, hides the name.
        const m = v.match(/^(.*?)(\s*\([^)]*\))$/);
        return m ? `${this.token(m[1]!)}${m[2]}` : this.token(v);
      }
      return type === 'money' && typeof v === 'number' ? Math.round(v) / 100 : v;
    };
    return {
      title: t.title,
      subtitle: t.subtitle,
      columns: t.columns.map((c) => ({ key: c.key, label: c.type === 'money' ? `${c.label} (₹)` : c.label, type: c.type })),
      rows: t.rows.slice(0, maxRows).map((r) => Object.fromEntries(t.columns.map((c) => [c.key, value(c.key, c.type, r[c.key])]))),
      totalRows: t.rows.length,
      ...(t.rows.length > maxRows ? { note: `Only the first ${maxRows} of ${t.rows.length} rows are shown.` } : {}),
      totals: t.totals ? Object.fromEntries(Object.entries(t.totals).map(([k, v]) => [k, value(k, t.columns.find((c) => c.key === k)?.type ?? 'number', v)])) : null,
    };
  }

  /** Put the real names back into the model's answer. */
  restore(text: string): string {
    return text.replace(/\[P\d+\]/g, (t) => this.fromToken.get(t) ?? t);
  }

  get count(): number {
    return this.toToken.size;
  }
}
