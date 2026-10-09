import type { AiProvider, GenerateRequest, GenerateResult, ToolCall } from './providers.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
type Row = Record<string, string | number | null>;
interface ModelTable {
  title: string;
  subtitle: string | null;
  rows: Row[];
  totalRows: number;
  totals: Row | null;
}

/**
 * Offline stand-in for a real model (development, tests, the evaluation set). It routes a question
 * to a tool by keywords and writes a short answer from the tool's (masked) result — the same
 * contract a real model follows, so the whole pipeline is exercised without an API key.
 */
export class MockProvider implements AiProvider {
  readonly name = 'mock' as const;
  readonly model = 'offline-rules-v1';

  constructor(private readonly today: () => string) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const last = req.turns.at(-1);
    const question = [...req.turns].reverse().find((t) => t.role === 'user') as { text: string } | undefined;
    if (last?.role === 'tool') return { text: this.answer(question?.text ?? '', last.results[0]!.name, last.results[0]!.result as ModelTable | { error: string }), calls: [] };
    if (req.tools.length === 0) return { text: this.worksheet(question?.text ?? ''), calls: [] };
    const call = this.route(question?.text ?? '', new Set(req.tools.map((t) => t.name)));
    if (!call) return { text: 'I can answer questions about attendance, exam results, class strength and fees. Try "Which classes are below 75% attendance this month?"', calls: [] };
    return { text: null, calls: [call] };
  }

  /** Keyword routing, with simple argument extraction. */
  route(q: string, allowed: Set<string>): ToolCall | null {
    const s = q.toLowerCase();
    const args: Record<string, unknown> = {};
    const cls = s.match(/\b(?:class|grade|std\.?)\s*([0-9]{1,2}|[ivx]+|lkg|ukg|nursery)\b/) ?? s.match(/\b([0-9]{1,2})(?:st|nd|rd|th)\s*(?:class|grade|std)\b/);
    if (cls) args.className = cls[1];
    const pct = s.match(/(\d{1,3})\s*%/) ?? s.match(/(\d{1,3})\s*per\s*cent/);
    const [ty, tm] = this.today().split('-').map(Number) as [number, number];
    const named = MONTHS.findIndex((m) => s.includes(m) || s.includes(m.slice(0, 3) + ' '));
    const month = s.includes('last month') ? (tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, '0')}`) : named >= 0 ? `${named + 1 > tm ? ty - 1 : ty}-${String(named + 1).padStart(2, '0')}` : undefined;
    const pick = (name: string, a: Record<string, unknown> = args): ToolCall | null => (allowed.has(name) ? { name, args: a } : null);
    const range = (m: string) => {
      const [y, mo] = m.split('-').map(Number) as [number, number];
      return { from: `${m}-01`, to: `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}` };
    };

    if (/fee|paid|payment|collect|dues?\b|defaulter|outstanding|overdue|money|₹/.test(s)) {
      if (/defaulter|overdue|not paid|haven'?t paid|late/.test(s)) return pick('fee_defaulters', cls ? { className: args.className } : {});
      if (/outstanding|due|balance|pending/.test(s)) return pick('fee_outstanding', cls ? { className: args.className } : {});
      if (s.includes('today')) return pick('fee_collection', { from: this.today(), to: this.today() });
      if (month) return pick('fee_collection', range(month));
      return pick('fee_collection', {});
    }
    if (/attendan|absent|present/.test(s)) {
      if (/student|child|who|which (?:boys|girls|kids)/.test(s) && /below|under|less than|low|poor/.test(s)) return pick('low_attendance_students', { ...(month ? range(month) : {}), ...(cls ? { className: args.className } : {}), ...(pct ? { belowPercent: Number(pct[1]) } : {}) });
      return pick('attendance_by_class', { ...(month ? { month } : {}), ...(cls ? { className: args.className } : {}) });
    }
    if (/exam|result|marks|topper|pass|fail|subject|test/.test(s)) {
      const exam = q.match(/["“](.+?)["”]/)?.[1] ?? s.match(/\b((?:unit test|half[- ]yearly|annual|final|mid[- ]term|term)\s*\w*)/)?.[1];
      if (/subject|weak|strong/.test(s)) return pick('subject_performance', { ...(exam ? { examName: exam } : {}), ...(cls ? { className: args.className } : {}) });
      return pick('exam_results_summary', exam ? { examName: exam } : {});
    }
    if (/how many students|strength|boys|girls|enrol/.test(s)) return pick('class_strength', {});
    return null;
  }

  private answer(q: string, tool: string, r: ModelTable | { error: string }): string {
    if ('error' in r) return `I couldn't look that up: ${r.error}`;
    const rows = r.rows;
    const head = [r.title, r.subtitle].filter(Boolean).join(' · ');
    if (!rows.length) return `${head}: nothing to show.`;
    const pct = (v: unknown) => (typeof v === 'number' ? `${v}%` : '—');
    const rupees = (v: unknown) => (typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : '—');
    const list = (items: string[], n = 5) => items.slice(0, n).join(', ') + (items.length > n ? ` and ${items.length - n} more` : '');
    switch (tool) {
      case 'attendance_by_class': {
        const limit = Number(q.match(/(\d{1,3})\s*%/)?.[1] ?? NaN);
        const withAvg = rows.filter((x) => typeof x.average === 'number');
        if (!Number.isNaN(limit)) {
          const below = withAvg.filter((x) => (x.average as number) < limit).sort((a, b) => (a.average as number) - (b.average as number));
          return below.length ? `${below.length} section${below.length === 1 ? ' was' : 's were'} below ${limit}% (${head}): ${list(below.map((x) => `${x.section} (${pct(x.average)})`))}.` : `No section was below ${limit}% (${head}).`;
        }
        const sorted = [...withAvg].sort((a, b) => (b.average as number) - (a.average as number));
        return sorted.length ? `${head}: highest ${sorted[0]!.section} (${pct(sorted[0]!.average)}), lowest ${sorted.at(-1)!.section} (${pct(sorted.at(-1)!.average)}).` : `${head}: no registers were submitted.`;
      }
      case 'low_attendance_students':
        return `${r.totalRows} student${r.totalRows === 1 ? '' : 's'} (${head}): ${list(rows.map((x) => `${x.name} ${x.class} (${pct(x.percent)})`))}.`;
      case 'exam_results_summary': {
        const t = r.totals ?? {};
        const sorted = [...rows].sort((a, b) => Number(b.passPercent ?? 0) - Number(a.passPercent ?? 0));
        return `${head}: ${t.passed ?? '?'} of ${t.appeared ?? '?'} passed (${pct(t.passPercent)}). Best section ${sorted[0]!.section} (${pct(sorted[0]!.passPercent)} pass), lowest ${sorted.at(-1)!.section} (${pct(sorted.at(-1)!.passPercent)}).`;
      }
      case 'subject_performance': {
        const sorted = [...rows].sort((a, b) => Number(a.average ?? 0) - Number(b.average ?? 0));
        return `${head}: weakest ${list(sorted.map((x) => `${x.subject} in ${x.class} (average ${pct(x.average)}, pass ${pct(x.passPercent)})`), 3)}.`;
      }
      case 'class_strength': {
        const t = r.totals ?? {};
        return `${t.total ?? '?'} students (${head}): ${t.boys ?? 0} boys, ${t.girls ?? 0} girls, across ${rows.length} sections.`;
      }
      case 'fee_collection': {
        const total = rows.reduce((a, x) => a + Object.entries(x).filter(([k, v]) => k !== 'date' && typeof v === 'number').reduce((b, [, v]) => b + (v as number), 0), 0);
        return `${head}: ${rupees(r.totals?.total ?? total)} received over ${rows.length} day${rows.length === 1 ? '' : 's'}.`;
      }
      case 'fee_outstanding': {
        const due = (x: Row) => Number(x.due ?? x.balance ?? 0);
        const sorted = [...rows].sort((a, b) => due(b) - due(a));
        return `${head}: ${rupees(r.totals?.due ?? r.totals?.balance)} still due. Most due: ${list(sorted.map((x) => `${x.section ?? x.class} (${rupees(due(x))})`), 3)}.`;
      }
      case 'fee_defaulters':
        return `${r.totalRows} student${r.totalRows === 1 ? ' has' : 's have'} overdue fees (${head}). Oldest: ${list(rows.map((x) => `${x.name ?? x.student} (${rupees(x.overdue ?? x.balance ?? x.amount)})`))}.`;
      default:
        return `${head}: ${r.totalRows} rows.`;
    }
  }

  private worksheet(prompt: string): string {
    const topic = prompt.match(/Topic: (.+)/)?.[1] ?? 'the topic';
    const n = Number(prompt.match(/Questions: (\d+)/)?.[1] ?? 5);
    const answers = prompt.includes('Answer key: yes');
    const qs = Array.from({ length: n }, (_, i) => `${i + 1}. Practice question ${i + 1} on ${topic}.`);
    return [`(Sample worksheet from the offline test assistant — connect Gemini for real questions.)`, '', ...qs, ...(answers ? ['', '**Answer key**', ...qs.map((_, i) => `${i + 1}. —`)] : [])].join('\n');
  }
}
