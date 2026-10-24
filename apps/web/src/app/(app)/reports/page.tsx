'use client';

import type { DownloadLink, ExamItem, ExportFormat, ReportDef, ReportRunItem, ReportSchedule, ReportTable, SavedReportItem } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, PageHeader, Select, Skeleton, Table, TD, TH, THead, TR, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, Bookmark, Download, FileSpreadsheet, FileText, Play, Sheet, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Gate } from '@/components/gate';
import { useClasses } from '@/lib/academics';
import { ApiError, apiDelete, apiFetch, apiPatch, apiPost } from '@/lib/api-client';
import { formatDate, formatNumber, timeAgo, todayISO } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';
import { rupees } from '@/lib/money';

type Params = { from: string; to: string; month: string; classId: string; examId: string; threshold: string };
const show = (type: string, v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return rupees(Number(v));
  if (type === 'number') return formatNumber(Number(v));
  if (type === 'percent') return `${Number(v) % 1 ? Number(v).toFixed(1) : v}%`;
  if (type === 'date') return formatDate(String(v));
  return String(v);
};
const FORMATS: { value: ExportFormat; label: string; icon: typeof FileText }[] = [
  { value: 'PDF', label: 'PDF', icon: FileText },
  { value: 'XLSX', label: 'Excel', icon: FileSpreadsheet },
  { value: 'CSV', label: 'CSV', icon: Sheet },
];

/** Reports centre (docs/12 Phase 6): pick a report → filters → see it → export in the background. */
export default function ReportsPage() {
  return (
    <Gate any={['report.academic', 'report.finance']}>
      <Reports />
    </Gate>
  );
}

function Reports() {
  const { can } = useMe();
  const catalog = useData<ReportDef[]>(['reports', 'catalog'], '/reports/catalog', { staleTime: Infinity });
  const [key, setKey] = useState<string | null>(null);
  const today = todayISO();
  const [p, setP] = useState<Params>({ from: `${today.slice(0, 8)}01`, to: today, month: today.slice(0, 7), classId: '', examId: '', threshold: '75' });
  const def = catalog.data?.find((r) => r.key === key) ?? catalog.data?.[0];
  const groups = useMemo(() => [...new Set(catalog.data?.map((r) => r.group))], [catalog.data]);
  if (!catalog.data) return <Skeleton className="h-96" />;
  if (!def) return <Card><EmptyState icon={<BarChart3 />} title="No reports for your role" /></Card>;

  const params: Record<string, string> = {};
  if (def.params.includes('range')) Object.assign(params, { from: p.from, to: p.to });
  if (def.params.includes('month')) params.month = p.month;
  if (def.params.includes('class') && p.classId) params.classId = p.classId;
  if (def.params.includes('exam') && p.examId) params.examId = p.examId;
  if (def.params.includes('threshold')) params.threshold = p.threshold;
  const ready = !def.params.includes('exam') || !!p.examId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Every report shows here first; export it to PDF, Excel or CSV when it looks right." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Reports" className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 px-3 text-caption font-medium tracking-wide text-fg-tertiary uppercase">{g}</div>
              {catalog.data.filter((r) => r.group === g).map((r) => (
                <button key={r.key} type="button" onClick={() => setKey(r.key)} aria-current={r.key === def.key ? 'page' : undefined} className={cn('block w-full rounded-md px-3 py-1.5 text-left text-body transition-colors', r.key === def.key ? 'bg-accent-tint font-medium text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg')}>
                  {r.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          <Filters def={def} p={p} set={(x) => setP((v) => ({ ...v, ...x }))} />
          {ready ? <Preview reportKey={def.key} title={def.title} params={params} canExport={can('report.export')} /> : <Card><EmptyState icon={<BarChart3 />} title="Choose an exam" /></Card>}
          {can('report.export') && <SavedReports />}
          {can('report.export') && <History />}
        </div>
      </div>
    </div>
  );
}

function Filters({ def, p, set }: { def: ReportDef; p: Params; set: (x: Partial<Params>) => void }) {
  const classes = useClasses();
  const exams = useData<ExamItem[]>(['exams', 'for-reports'], def.params.includes('exam') ? '/exams' : null);
  if (!def.params.length) return null;
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      {def.params.includes('range') && (
        <>
          <label className="flex flex-col gap-1 text-small text-fg-secondary">From<Input type="date" value={p.from} onChange={(e) => set({ from: e.target.value })} className="w-40" /></label>
          <label className="flex flex-col gap-1 text-small text-fg-secondary">To<Input type="date" value={p.to} onChange={(e) => set({ to: e.target.value })} className="w-40" /></label>
        </>
      )}
      {def.params.includes('month') && <label className="flex flex-col gap-1 text-small text-fg-secondary">Month<Input type="month" value={p.month} onChange={(e) => set({ month: e.target.value })} className="w-44" /></label>}
      {def.params.includes('exam') && (
        <label className="flex flex-col gap-1 text-small text-fg-secondary">Exam
          <Select value={p.examId} onChange={(e) => set({ examId: e.target.value })} className="w-56">
            <option value="">Choose…</option>
            {exams.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </label>
      )}
      {def.params.includes('class') && (
        <label className="flex flex-col gap-1 text-small text-fg-secondary">Class
          <Select value={p.classId} onChange={(e) => set({ classId: e.target.value })} className="w-40">
            <option value="">All classes</option>
            {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      )}
      {def.params.includes('threshold') && <label className="flex flex-col gap-1 text-small text-fg-secondary">Below (%)<Input type="number" min={1} max={100} value={p.threshold} onChange={(e) => set({ threshold: e.target.value })} className="w-24" /></label>}
    </Card>
  );
}

function Preview({ reportKey, title, params, canExport }: { reportKey: string; title: string; params: Record<string, string>; canExport: boolean }) {
  const qc = useQueryClient();
  const qs = new URLSearchParams({ report: reportKey, ...params }).toString();
  const report = useData<ReportTable & { totalRows: number }>(['reports', 'preview', qs], `/reports/preview?${qs}`);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [saving, setSaving] = useState(false);
  async function exportAs(format: ExportFormat) {
    setBusy(format);
    try {
      await apiPost('/reports/runs', { report: reportKey, format, params });
      toast.success('Making your file — it appears under Exports in a moment.');
      void qc.invalidateQueries({ queryKey: ['reports', 'runs'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(null);
    }
  }
  if (report.error) return <Card><EmptyState icon={<BarChart3 />} title="This report couldn’t run" description={report.error instanceof ApiError ? report.error.message : undefined} /></Card>;
  if (!report.data) return <Skeleton className="h-80" />;
  const r = report.data;
  return (
    <Card>
      <CardHeader
        title={r.title}
        description={[r.subtitle, `${formatNumber(r.totalRows)} row${r.totalRows === 1 ? '' : 's'}`, r.totalRows > r.rows.length ? `showing the first ${r.rows.length}` : null].filter(Boolean).join(' · ')}
        action={canExport && (
          <div className="flex gap-1">
            {FORMATS.map((f) => <Button key={f.value} size="sm" variant="secondary" onClick={() => void exportAs(f.value)} loading={busy === f.value} disabled={!r.totalRows}><f.icon /> {f.label}</Button>)}
            <Button size="sm" variant="ghost" onClick={() => setSaving(true)}><Bookmark /> Save</Button>
          </div>
        )}
      />
      {saving && <SaveDialog reportKey={reportKey} title={title} params={params} onClose={() => setSaving(false)} />}
      <p className="px-5 pt-1 text-small text-fg-tertiary">{r.description}</p>
      {!r.rows.length ? (
        <EmptyState icon={<BarChart3 />} title="Nothing to show for these filters" />
      ) : (
        <div className="mt-3 max-h-[560px] overflow-auto border-t border-border">
          <Table>
            <THead className="sticky top-0 z-10">
              <TR>{r.columns.map((c) => <TH key={c.key} className={c.type !== 'text' && c.type !== 'date' ? 'text-right' : undefined}>{c.label}</TH>)}</TR>
            </THead>
            <tbody>
              {r.rows.map((row, i) => (
                <TR key={i}>{r.columns.map((c) => <TD key={c.key} className={c.type !== 'text' && c.type !== 'date' ? 'tabular text-right' : undefined}>{show(c.type, row[c.key])}</TD>)}</TR>
              ))}
              {r.totals && (
                <TR className="bg-subtle font-semibold">{r.columns.map((c, i) => <TD key={c.key} className={c.type !== 'text' && c.type !== 'date' ? 'tabular text-right' : undefined}>{i === 0 ? 'Total' : r.totals![c.key] === undefined ? '' : show(c.type, r.totals![c.key])}</TD>)}</TR>
              )}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

const SCHEDULES: { value: ReportSchedule; label: string }[] = [
  { value: 'NONE', label: 'Only when I run it' },
  { value: 'WEEKLY', label: 'Every Monday, for the week before' },
  { value: 'MONTHLY', label: 'On the 1st, for the month before' },
];

/** Save the report with these filters; weekly or monthly ones are made on their own. */
function SaveDialog({ reportKey, title, params, onClose }: { reportKey: string; title: string; params: Record<string, string>; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(title);
  const [format, setFormat] = useState<ExportFormat>('PDF');
  const [schedule, setSchedule] = useState<ReportSchedule>('NONE');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await apiPost('/reports/saved', { name, report: reportKey, params, format, schedule });
      toast.success(schedule === 'NONE' ? 'Saved' : 'Saved — you’ll get a notification each time it’s made');
      void qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Save this report" description="Keeps the report and its filters. Scheduled reports use the period before each run (dates you picked are replaced).">
        <DialogBody className="flex flex-col gap-4">
          <Field label="Name" htmlFor="saved-name"><Input id="saved-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="File" htmlFor="saved-format">
            <Select id="saved-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Make it" htmlFor="saved-schedule">
            <Select id="saved-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as ReportSchedule)}>
              {SCHEDULES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim()} loading={busy} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SavedReports() {
  const saved = useData<SavedReportItem[]>(['reports', 'saved'], '/reports/saved');
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['reports'] });
  async function act(run: () => Promise<unknown>, done: string) {
    try {
      await run();
      toast.success(done);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }
  if (!saved.data?.length) return null;
  return (
    <Card>
      <CardHeader title="Saved reports" description="Run them again in one click. Scheduled ones arrive under Exports, with a notification." />
      <ul className="mt-3 border-t border-border">
        {saved.data.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.name} <span className="font-normal text-fg-tertiary">· {s.title} · {s.format === 'XLSX' ? 'Excel' : s.format}</span></div>
              <div className="text-small text-fg-tertiary">{s.nextRunAt ? `Next: ${formatDate(s.nextRunAt)}` : 'Not scheduled'}</div>
            </div>
            <Select aria-label={`Schedule for ${s.name}`} value={s.schedule} onChange={(e) => void act(() => apiPatch(`/reports/saved/${s.id}`, { schedule: e.target.value }), 'Schedule changed')} className="h-8 w-56">
              {SCHEDULES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </Select>
            <Button size="sm" variant="ghost" onClick={() => void act(() => apiPost(`/reports/saved/${s.id}/run`), 'Making your file — it appears under Exports in a moment.')}><Play /> Run now</Button>
            <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => window.confirm(`Delete “${s.name}”?`) && void act(() => apiDelete(`/reports/saved/${s.id}`), 'Deleted')}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const RUN_STATUS = { QUEUED: { label: 'Waiting', tone: 'neutral' }, RUNNING: { label: 'Making…', tone: 'info' }, DONE: { label: 'Ready', tone: 'success' }, FAILED: { label: 'Failed', tone: 'danger' } } as const;

function History() {
  const runs = useData<ReportRunItem[]>(['reports', 'runs'], '/reports/runs', { staleTime: 0 });
  const qc = useQueryClient();
  const pending = runs.data?.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void qc.invalidateQueries({ queryKey: ['reports', 'runs'] }), 1500);
    return () => clearInterval(t);
  }, [pending, qc]);
  async function download(id: string) {
    try {
      const link = (await apiFetch<{ data: DownloadLink }>(`/reports/runs/${id}/download`)).data;
      window.location.assign(link.url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }
  return (
    <Card>
      <CardHeader title="Exports" description="Your files from the last while. Links are made fresh each time you download." />
      {!runs.data?.length ? (
        <p className="px-5 py-4 text-small text-fg-tertiary">Nothing exported yet.</p>
      ) : (
        <ul className="mt-3 border-t border-border">
          {runs.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.title} <span className="font-normal text-fg-tertiary">· {r.format === 'XLSX' ? 'Excel' : r.format}</span></div>
                <div className={cn('text-small', r.status === 'FAILED' ? 'text-danger' : 'text-fg-tertiary')}>{r.status === 'FAILED' ? r.error : timeAgo(r.createdAt)}</div>
              </div>
              <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>
              <Button size="sm" variant="ghost" disabled={r.status !== 'DONE'} onClick={() => void download(r.id)}><Download /> Download</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
