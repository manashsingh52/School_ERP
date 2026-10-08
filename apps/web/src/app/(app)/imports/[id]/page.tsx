'use client';

import { Gate } from '@/components/gate';
import { IMPORT_FIELDS, type ImportJobItem, type ImportRowItem, type PageResponse } from '@schoolos/contracts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Spinner,
  Stepper,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  cn,
} from '@schoolos/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { apiFetch, apiPut, idempotencyKey } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { useAction } from '@/lib/hooks';

type RowStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'IMPORTED';

function ImportPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useQuery({
    queryKey: ['import', id],
    queryFn: () => apiFetch<{ data: ImportJobItem }>(`/imports/${id}`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.status === 'IMPORTING' ? 1500 : false),
  });
  const [remap, setRemap] = useState(false);

  if (job.isError) return <Card><ErrorState onRetry={() => void job.refetch()} /></Card>;
  const j = job.data;
  const what = j?.entity === 'TEACHERS' ? 'teachers' : 'students';
  const showMapping = j && (j.status === 'MAPPING' || remap);
  const step = !j ? 1 : showMapping ? 1 : j.status === 'VALIDATED' ? 2 : 3;

  return (
    <div className="flex flex-col gap-6">
      <Link href={j?.entity === 'TEACHERS' ? '/teachers' : '/students'} className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg">
        <ArrowLeft className="size-4" /> {j?.entity === 'TEACHERS' ? 'Teachers' : 'Students'}
      </Link>
      <PageHeader title={`Import ${what}`} description={j ? <span className="font-mono text-small">{j.fileName}</span> : undefined} />
      <Stepper steps={['Upload', 'Match columns', 'Review', 'Import']} current={step} />
      {!j ? (
        <Skeleton className="h-64" />
      ) : showMapping ? (
        <MappingStep job={j} onDone={() => setRemap(false)} />
      ) : j.status === 'VALIDATED' ? (
        <ReviewStep job={j} onRemap={() => setRemap(true)} />
      ) : (
        <ResultStep job={j} />
      )}
    </div>
  );
}

function MappingStep({ job, onDone }: { job: ImportJobItem; onDone: () => void }) {
  const fields = IMPORT_FIELDS[job.entity];
  const [mapping, setMapping] = useState<Record<string, string>>(job.mapping);
  const [invite, setInvite] = useState(true);
  const used = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const validate = useAction(() => apiPut(`/imports/${job.id}/mapping`, { mapping, inviteLogins: invite }), {
    invalidate: [['import', job.id]],
    onSuccess: onDone,
  });

  const missing = useMemo(() => {
    const has = (k: string) => used.has(k);
    const m: string[] = [];
    if (job.entity === 'STUDENTS') {
      if (!has('admissionNo')) m.push('Admission number');
      if (!has('fullName') && !has('firstName')) m.push('Student name');
      if (!has('classSection') && !has('class')) m.push('Class');
    } else {
      if (!has('employeeId')) m.push('Employee ID');
      if (!has('fullName') && !has('firstName')) m.push('Name');
      if (!has('phone')) m.push('Mobile');
    }
    return m;
  }, [used, job.entity]);

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Match your columns" description="We guessed from your headings. Fix anything that's wrong; unneeded columns can be ignored." />
      <div className="mt-3">
        <Table>
          <THead><tr><TH className="w-1/3">Your column</TH><TH className="w-1/3">Goes into</TH><TH>Example values</TH></tr></THead>
          <tbody>
            {job.detectedColumns.map((col) => (
              <TR key={col}>
                <TD className="font-medium">{col}</TD>
                <TD>
                  <Select
                    aria-label={`Field for column ${col}`}
                    value={mapping[col] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                    className={cn(!mapping[col] && 'text-fg-tertiary')}
                  >
                    <option value="">Ignore this column</option>
                    {fields.map((f) => (
                      <option key={f.key} value={f.key} disabled={used.has(f.key) && mapping[col] !== f.key}>
                        {f.label}{f.required ? ' *' : ''}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD className="max-w-xs truncate text-small text-fg-secondary">
                  {job.sample.map((r) => r[col]).filter(Boolean).slice(0, 3).join(' · ') || '—'}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4">
        <div className="flex flex-col gap-2">
          {missing.length > 0 ? (
            <p className="flex items-center gap-2 text-small text-warning"><AlertTriangle className="size-4" /> Still needed: {missing.join(', ')}</p>
          ) : (
            <p className="flex items-center gap-2 text-small text-success"><CheckCircle2 className="size-4" /> All required fields are matched</p>
          )}
          <Checkbox
            checked={invite}
            onChange={(e) => setInvite(e.target.checked)}
            label={job.entity === 'STUDENTS' ? 'Invite parents to the parent app' : 'Invite teachers to sign in'}
            description="They activate their login with a one-time code."
          />
        </div>
        <Button disabled={missing.length > 0} loading={validate.isPending} onClick={() => validate.mutate(undefined)}>Check all rows</Button>
      </div>
    </Card>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  const color = { success: 'text-success', danger: 'text-danger', warning: 'text-warning', neutral: 'text-fg' }[tone];
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-small text-fg-secondary">{label}</div>
      <div className={cn('tabular mt-1 text-kpi font-semibold', color)}>{formatNumber(value)}</div>
    </div>
  );
}

function ReviewStep({ job, onRemap }: { job: ImportJobItem; onRemap: () => void }) {
  const stats = job.stats!;
  const [tab, setTab] = useState<RowStatus>(stats.invalid ? 'INVALID' : stats.duplicate ? 'DUPLICATE' : 'VALID');
  const [key] = useState(idempotencyKey);
  const commit = useAction(
    () => apiFetch(`/imports/${job.id}/commit`, { method: 'POST', headers: { 'idempotency-key': key } }),
    { invalidate: [['import', job.id]] },
  );
  const what = job.entity === 'TEACHERS' ? 'teachers' : 'students';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Rows in file" value={stats.total} tone="neutral" />
        <StatTile label="Ready to import" value={stats.valid} tone="success" />
        <StatTile label="Need fixing" value={stats.invalid} tone="danger" />
        <StatTile label="Duplicates" value={stats.duplicate} tone="warning" />
      </div>
      <Card className="overflow-hidden">
        <Tabs<RowStatus>
          className="px-3"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'INVALID', label: 'Need fixing', count: stats.invalid },
            { value: 'DUPLICATE', label: 'Duplicates', count: stats.duplicate },
            { value: 'VALID', label: 'Ready', count: stats.valid },
          ]}
        />
        <RowsTable jobId={job.id} status={tab} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onRemap}>Change column matching</Button>
            {(stats.invalid > 0 || stats.duplicate > 0) && (
              <Button variant="secondary" asChild><a href={`/api/v1/imports/${job.id}/problems`} download><Download /> Rows to fix (CSV)</a></Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(stats.invalid > 0 || stats.duplicate > 0) && <span className="text-small text-fg-secondary">Rows with problems are skipped — never imported.</span>}
            <Button disabled={!stats.valid} loading={commit.isPending} onClick={() => commit.mutate(undefined)}>
              Import {formatNumber(stats.valid)} {what}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function RowsTable({ jobId, status }: { jobId: string; status: RowStatus }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const rows = useQuery({
    queryKey: ['import-rows', jobId, status, page],
    queryFn: () => apiFetch<PageResponse<ImportRowItem>>(`/imports/${jobId}/rows?status=${status}&page=${page}&pageSize=50`),
  });
  if (rows.isPending) return <Skeleton className="m-5 h-32" />;
  if (!rows.data?.data.length) {
    return <EmptyState icon={<CheckCircle2 />} title={status === 'VALID' ? 'No rows are ready' : 'Nothing here'} description={status === 'VALID' ? 'Fix the problems in your file and upload it again.' : 'Every row passed this check.'} />;
  }
  return (
    <>
      <Table>
        <THead><tr><TH className="w-20">Row</TH><TH>Record</TH>{status !== 'VALID' && <TH>Problem</TH>}</tr></THead>
        <tbody>
          {rows.data.data.map((r) => (
            <TR key={r.rowNumber}>
              <TD className="tabular text-fg-secondary">{r.rowNumber}</TD>
              <TD>{r.summary || '—'}</TD>
              {status !== 'VALID' && (
                <TD className={status === 'INVALID' ? 'text-danger' : 'text-warning'}>
                  {r.errors.map((e) => e.message).join('; ')}
                </TD>
              )}
            </TR>
          ))}
        </tbody>
      </Table>
      {rows.data.page.total > 50 && <div className="border-t border-border"><Pagination page={page} pageSize={50} total={rows.data.page.total} onPageChange={setPage} /></div>}
    </>
  );
}

function ResultStep({ job }: { job: ImportJobItem }) {
  const what = job.entity === 'TEACHERS' ? 'teachers' : 'students';
  if (job.status === 'IMPORTING') {
    return (
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <Spinner className="size-6 text-accent" />
        <p className="font-medium">Importing {formatNumber(job.stats?.valid ?? 0)} {what}…</p>
        <p className="text-small text-fg-secondary">You can leave this page — the import keeps running.</p>
      </Card>
    );
  }
  const stats = job.stats;
  const skipped = (stats?.invalid ?? 0) + (stats?.duplicate ?? 0);
  return (
    <Card className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-6" /></span>
      <div>
        <h2 className="text-h2 font-semibold">{formatNumber(stats?.imported ?? 0)} {what} imported</h2>
        <p className="text-body text-fg-secondary">
          {skipped ? `${formatNumber(skipped)} rows were skipped because they need fixing or already exist.` : 'Every row was imported.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild><Link href={job.entity === 'TEACHERS' ? '/teachers' : '/students'}>View {what}</Link></Button>
        {skipped > 0 && <Button variant="secondary" asChild><a href={`/api/v1/imports/${job.id}/problems`} download><Download /> Rows to fix (CSV)</a></Button>}
        <Button variant="ghost" asChild><Link href={`/imports/new?entity=${job.entity}`}>Import another file</Link></Button>
      </div>
      {stats?.failed ? <Badge tone="danger">{stats.failed} rows failed during import — see the CSV</Badge> : null}
    </Card>
  );
}

export default function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Gate any={['import.run']}>
      <ImportPageContent params={params} />
    </Gate>
  );
}
