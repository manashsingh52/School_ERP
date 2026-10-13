'use client';

import type { AiStatus, AiTable, AskResponse, WorksheetResponse } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, Select, Skeleton, Table, TD, TH, THead, TR, Tabs, Textarea, cn, toast } from '@schoolos/ui';
import { ChevronDown, ChevronRight, Copy, NotebookPen, Send, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Gate } from '@/components/gate';
import { HOMEWORK_DRAFT_KEY } from '@/components/homework/homework-form';
import { Markdown } from '@/components/notices/markdown';
import { ApiError, apiPost } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { useData, useTabParam } from '@/lib/hooks';
import { useMe } from '@/lib/me';
import { rupees } from '@/lib/money';

/** The AI assistant (docs/12 Phase 8): answers from the school's own reports; worksheet drafts. */
export default function AssistantPage() {
  return (
    <Gate any={['ai.use']}>
      <Assistant />
    </Gate>
  );
}

function Assistant() {
  const status = useData<AiStatus>(['ai', 'status'], '/ai/status', { staleTime: 0 });
  const [tab, setTab] = useTabParam<'ask' | 'worksheet'>(['ask', 'worksheet']);
  const s = status.data;
  useEffect(() => {
    if (s && !s.canAsk && s.canDraftWorksheets && tab !== 'worksheet') setTab('worksheet');
  }, [s, tab, setTab]);
  if (!s) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><Sparkles className="size-5 text-accent" /> Assistant</span>}
        description="Ask about attendance, results and fees. Answers come only from your school's reports — the same ones you can open yourself."
        actions={s.remainingThisMonth !== null && <Badge tone={s.remainingThisMonth > 10 ? 'neutral' : 'warning'}>{formatNumber(s.remainingThisMonth)} questions left this month</Badge>}
      />
      {!s.enabled ? (
        <Card><EmptyState icon={<Sparkles />} title="The assistant isn't available" description={s.reason ?? undefined} /></Card>
      ) : (
        <>
          {s.provider === 'mock' && <p className="rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-small text-warning">Test mode: answers come from simple built-in rules until an AI model is connected. The numbers are real.</p>}
          {s.canAsk && s.canDraftWorksheets && <Tabs value={tab} onChange={setTab} items={[{ value: 'ask', label: 'Ask' }, { value: 'worksheet', label: 'Worksheet draft' }]} />}
          {tab === 'ask' && s.canAsk && <Ask suggestions={s.suggestions} onUsed={() => void status.refetch()} />}
          {tab === 'worksheet' && s.canDraftWorksheets && <Worksheet onUsed={() => void status.refetch()} />}
        </>
      )}
    </div>
  );
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  result?: AskResponse;
}

function Ask({ suggestions, onUsed }: { suggestions: string[]; onUsed: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and React would call it as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setDraft('');
    setBusy(true);
    try {
      const res = await apiPost<{ data: AskResponse }>('/ai/ask', { question: q, history });
      setMessages((m) => [...m, { role: 'assistant', text: res.data.answer, result: res.data }]);
      onUsed();
    } catch (err) {
      setMessages((m) => m.slice(0, -1));
      setDraft(q);
      toast.error(err instanceof ApiError ? err.message : 'The assistant could not answer right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex min-h-[520px] flex-col">
      <div className="flex flex-1 flex-col gap-4 p-5" aria-live="polite">
        {!messages.length && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Sparkles className="size-8 text-accent" />
            <p className="text-body text-fg-secondary">Try one of these:</p>
            <div className="flex max-w-2xl flex-wrap justify-center gap-2">
              {suggestions.map((q) => <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-border px-3 py-1.5 text-small hover:border-accent hover:bg-accent-tint">{q}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-xl px-4 py-2.5', m.role === 'user' ? 'bg-accent text-accent-fg' : 'border border-border bg-subtle')}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.result && m.result.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.result.sources.map((s, j) => <Badge key={j} tone="accent">{s.label}</Badge>)}
                </div>
              )}
              {m.result?.tables.map((t, j) => <DataTable key={j} table={t} />)}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-xl border border-border bg-subtle px-4 py-2.5 text-small text-fg-secondary">Looking it up…</div></div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about attendance, results or fees…" maxLength={1000} aria-label="Your question" disabled={busy} />
        <Button type="submit" disabled={!draft.trim() || busy} aria-label="Ask"><Send /></Button>
      </form>
      <p className="px-4 pb-3 text-caption text-fg-tertiary">The assistant can be wrong — check the data it used. Names are never sent to the AI service.</p>
    </Card>
  );
}

const cell = (type: string, v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return rupees(Number(v));
  if (type === 'percent') return `${v}%`;
  if (type === 'number') return formatNumber(Number(v));
  if (type === 'date') return formatDate(String(v));
  return String(v);
};

function DataTable({ table }: { table: AiTable }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-small text-accent-strong hover:underline" aria-expanded={open}>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Data used: {table.title}{table.subtitle ? ` · ${table.subtitle}` : ''} ({formatNumber(table.totalRows)} rows)
      </button>
      {open && (
        <div className="mt-2 max-h-80 overflow-auto rounded-md border border-border bg-surface">
          <Table>
            <THead className="sticky top-0"><TR>{table.columns.map((c) => <TH key={c.key}>{c.label}</TH>)}</TR></THead>
            <tbody>{table.rows.map((r, i) => <TR key={i}>{table.columns.map((c) => <TD key={c.key} className={c.type === 'text' || c.type === 'date' ? undefined : 'tabular text-right'}>{cell(c.type, r[c.key])}</TD>)}</TR>)}</tbody>
          </Table>
          {table.totalRows > table.rows.length && <p className="p-2 text-caption text-fg-tertiary">Showing {table.rows.length} of {table.totalRows}. Open Reports for everything.</p>}
        </div>
      )}
    </div>
  );
}

function Worksheet({ onUsed }: { onUsed: () => void }) {
  const { can } = useMe();
  const router = useRouter();
  /** Hand the draft to the homework page, which opens "New homework" with it filled in. */
  function sendToHomework(w: WorksheetResponse) {
    const body = w.body.length > 5000 ? `${w.body.slice(0, 4950)}\n\n(Trimmed — the full draft was longer.)` : w.body;
    try {
      sessionStorage.setItem(HOMEWORK_DRAFT_KEY, JSON.stringify({ title: w.title.slice(0, 200), description: body }));
    } catch {
      toast.error('Your browser blocked this — copy the text instead.');
      return;
    }
    router.push('/homework');
  }
  const [v, setV] = useState({ subject: '', classLabel: '', topic: '', questions: 10, difficulty: 'medium', includeAnswers: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WorksheetResponse | null>(null);
  async function draft() {
    setBusy(true);
    try {
      setResult((await apiPost<{ data: WorksheetResponse }>('/ai/worksheet', v)).data);
      onUsed();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The assistant could not answer right now.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader title="Draft a worksheet" description="Only the topic is sent to the AI — no student data." />
        <div className="flex flex-col gap-4 p-5">
          <Field label="Subject" htmlFor="ws-subject"><Input id="ws-subject" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="Mathematics" /></Field>
          <Field label="Class" htmlFor="ws-class"><Input id="ws-class" value={v.classLabel} onChange={(e) => setV({ ...v, classLabel: e.target.value })} placeholder="Class 6" /></Field>
          <Field label="Topic" htmlFor="ws-topic"><Textarea id="ws-topic" rows={2} value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} placeholder="Adding fractions with unlike denominators" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Questions" htmlFor="ws-n"><Input id="ws-n" type="number" min={3} max={30} value={v.questions} onChange={(e) => setV({ ...v, questions: Number(e.target.value) })} /></Field>
            <Field label="Difficulty" htmlFor="ws-d">
              <Select id="ws-d" value={v.difficulty} onChange={(e) => setV({ ...v, difficulty: e.target.value })}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </Select>
            </Field>
          </div>
          <Checkbox checked={v.includeAnswers} onChange={(e) => setV({ ...v, includeAnswers: e.target.checked })} label="Include an answer key" />
          <Button onClick={() => void draft()} loading={busy} disabled={v.subject.trim().length < 2 || !v.classLabel.trim() || v.topic.trim().length < 3}><Sparkles /> Draft</Button>
        </div>
      </Card>
      <Card className="min-h-80">
        {result ? (
          <>
            <CardHeader
              title={result.title}
              description="A draft — read it through before you use it."
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(result.body); toast.success('Copied'); }}><Copy /> Copy</Button>
                  {can('homework.manage') && <Button size="sm" onClick={() => sendToHomework(result)}><NotebookPen /> Use as homework</Button>}
                </div>
              }
            />
            <div className="p-5"><Markdown text={result.body} /></div>
          </>
        ) : (
          <EmptyState icon={<Sparkles />} title="Your draft appears here" description="Copy it into homework or print it." />
        )}
      </Card>
    </div>
  );
}
