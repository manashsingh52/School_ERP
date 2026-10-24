'use client';

import type { PlanItem, PlanLimits, PlatformSchoolDetail } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Dialog, DialogBody, DialogContent, DialogFooter, Field, Input, PageHeader, Select, Skeleton, Textarea, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, LifeBuoy } from 'lucide-react';
import { use, useState } from 'react';
import { AuditList } from '@/components/platform/audit-list';
import { useIsSuperAdmin } from '@/components/platform/console-shell';
import { SCHOOL_STATUS, SUB_STATUS, limitText } from '@/components/platform/labels';
import { ApiError, apiPost, apiPut } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { rupees } from '@/lib/money';

const GB = 1024 ** 3;

function schoolUrl(slug: string) {
  if (typeof window === 'undefined') return '#';
  const { protocol, host } = window.location;
  return `${protocol}//${slug}.${host.split('.').slice(1).join('.')}`;
}

function Usage({ label, used, limit, format = formatNumber }: { label: string; used: number; limit: number | null; format?: (n: number) => string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-small"><span className="text-fg-secondary">{label}</span><span className="tabular">{format(used)} / {limit === null ? 'Unlimited' : format(limit)}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-accent')} style={{ width: `${limit === null ? 0 : pct}%` }} />
      </div>
    </div>
  );
}

export default function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const superAdmin = useIsSuperAdmin();
  const school = useData<PlatformSchoolDetail>(['platform', 'school', id], `/platform/schools/${id}`);
  const [dialog, setDialog] = useState<'status' | 'subscription' | 'support' | null>(null);
  const refresh = (data?: PlatformSchoolDetail) => {
    if (data) qc.setQueryData(['platform', 'school', id], data);
    void qc.invalidateQueries({ queryKey: ['platform', 'schools'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
  };

  async function setFeature(key: string, enabled: boolean | null) {
    try {
      refresh((await apiPut<{ data: PlatformSchoolDetail }>(`/platform/schools/${id}/features/${encodeURIComponent(key)}`, { enabled })).data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  if (!school.data) return <Skeleton className="h-[480px]" />;
  const s = school.data;
  const e = s.entitlements;
  const st = SCHOOL_STATUS[s.status]!;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<span className="flex items-center gap-3">{s.name} <Badge tone={st.tone}>{st.label}</Badge></span>}
        description={[s.slug, s.board, s.city, `on Bastaa since ${formatDate(s.createdAt)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="ghost" asChild><a href={schoolUrl(s.slug)} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
            <Button variant="secondary" onClick={() => setDialog('support')}><LifeBuoy /> Ask for access</Button>
            {superAdmin && <Button variant="secondary" onClick={() => setDialog('status')}>Change status</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([['Students', formatNumber(s.students)], ['Users', formatNumber(s.members)], ['Teachers', formatNumber(s.counts.teachers)], ['Parents', formatNumber(s.counts.guardians)], ['Fees collected', rupees(s.counts.paymentsPaise)]] as const).map(([l, v]) => (
          <Card key={l} className="p-4"><div className="text-small text-fg-secondary">{l}</div><div className="tabular mt-1 text-h2 font-semibold">{v}</div></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscription" description="Recorded by hand — invoices are sent outside Bastaa for now." action={superAdmin && <Button size="sm" variant="secondary" onClick={() => setDialog('subscription')}>Edit</Button>} />
          {s.subscription ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-body">
              <div><dt className="text-small text-fg-secondary">Plan</dt><dd className="font-medium">{s.subscription.plan.name}</dd></div>
              <div><dt className="text-small text-fg-secondary">Status</dt><dd><Badge tone={SUB_STATUS[s.subscription.status]!.tone}>{SUB_STATUS[s.subscription.status]!.label}</Badge></dd></div>
              {s.subscription.trialEndsAt && <div><dt className="text-small text-fg-secondary">Trial ends</dt><dd>{formatDate(s.subscription.trialEndsAt)}</dd></div>}
              {s.subscription.currentPeriodEnd && <div><dt className="text-small text-fg-secondary">Paid until</dt><dd>{formatDate(s.subscription.currentPeriodEnd)}</dd></div>}
              {s.subscription.limitOverrides && Object.keys(s.subscription.limitOverrides).length > 0 && (
                <div className="col-span-2"><dt className="text-small text-fg-secondary">Exceptions to the plan</dt><dd>{Object.entries(s.subscription.limitOverrides).map(([k, v]) => `${k}: ${limitText(v as number | null)}`).join(' · ')}</dd></div>
              )}
              {s.subscription.notes && <div className="col-span-2"><dt className="text-small text-fg-secondary">Notes</dt><dd className="whitespace-pre-line">{s.subscription.notes}</dd></div>}
            </dl>
          ) : (
            <p className="p-5 text-body text-fg-secondary">No subscription — this school has no limits.</p>
          )}
          <div className="flex flex-col gap-3 border-t border-border p-5">
            <Usage label="Students" used={e.usage.students} limit={e.limits.students} />
            <Usage label="Storage" used={e.usage.storageBytes} limit={e.limits.storageGb === null ? null : e.limits.storageGb * GB} format={(n) => `${(n / GB).toFixed(n < GB ? 2 : 1)} GB`} />
            <Usage label="SMS this month" used={e.usage.smsThisMonth} limit={e.limits.smsPerMonth} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Features" description="Default comes from the plan; switch a feature on or off just for this school." />
          <ul className="mt-3 border-t border-border">
            {s.features.map((f) => (
              <li key={f.key} className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><code className="text-small">{f.key}</code>{f.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</div>
                  <div className="text-small text-fg-tertiary">{f.description} · {f.source === 'kill_switch' ? 'switched off for everyone' : f.source === 'override' ? 'set for this school' : f.source === 'plan' ? 'from the plan' : 'default'}</div>
                </div>
                {superAdmin && (
                  <Select aria-label={`${f.key} for this school`} className="w-36" value={f.source === 'override' ? (f.enabled ? 'on' : 'off') : ''} onChange={(ev) => void setFeature(f.key, ev.target.value === '' ? null : ev.target.value === 'on')} disabled={f.source === 'kill_switch'}>
                    <option value="">Plan default</option>
                    <option value="on">Always on</option>
                    <option value="off">Always off</option>
                  </Select>
                )}
              </li>
            ))}
            {!s.features.length && <li className="px-5 py-4 text-small text-fg-tertiary">No feature flags yet.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="School admins" />
        <ul className="mt-3 border-t border-border">
          {s.admins.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
              <span className="font-medium">{a.name}</span>
              <span className="text-small text-fg-secondary">{[a.phone, a.email].filter(Boolean).join(' · ')}</span>
              <Badge tone={a.status === 'ACTIVE' ? 'success' : a.status === 'INVITED' ? 'info' : 'neutral'}>{a.status === 'INVITED' ? 'Invited — hasn’t signed in' : a.status.toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {superAdmin && (
        <Card>
          <CardHeader title="Activity" description="Everything Bastaa staff and the school's own people changed." />
          <div className="mt-3 border-t border-border"><AuditList path={`/platform/audit?schoolId=${id}`} /></div>
        </Card>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'status' && <StatusDialog school={s} onDone={(d) => { refresh(d); setDialog(null); }} />}
        {dialog === 'subscription' && <SubscriptionDialog school={s} onDone={(d) => { refresh(d); setDialog(null); }} />}
        {dialog === 'support' && <SupportDialog school={s} onDone={() => setDialog(null)} />}
      </Dialog>
    </div>
  );
}

function StatusDialog({ school, onDone }: { school: PlatformSchoolDetail; onDone: (d: PlatformSchoolDetail) => void }) {
  const [status, setStatus] = useState(school.status);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const res = await apiPut<{ data: PlatformSchoolDetail }>(`/platform/schools/${school.id}/status`, { status, reason });
      toast.success(`${school.name} is now ${SCHOOL_STATUS[status]!.label.toLowerCase()}`);
      onDone(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title="Change status" description="Suspended and archived schools can't sign in. Their data is kept.">
      <DialogBody className="flex flex-col gap-4">
        <Field label="Status" htmlFor="st-status">
          <Select id="st-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {Object.entries(SCHOOL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="st-reason" hint="Kept in the audit log">
          <Textarea id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} />
        </Field>
        {status === 'SUSPENDED' && school.status !== 'SUSPENDED' && <p className="rounded-md bg-danger-bg p-3 text-small text-danger">Everyone at {school.name} — staff and parents — will be signed out within a minute.</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone(school)}>Cancel</Button>
        <Button variant={status === 'SUSPENDED' || status === 'ARCHIVED' ? 'destructive' : 'primary'} onClick={() => void save()} loading={busy} disabled={status === school.status || reason.trim().length < 3}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

const LIMITS: { key: keyof PlanLimits; label: string }[] = [
  { key: 'students', label: 'Students' },
  { key: 'storageGb', label: 'Storage (GB)' },
  { key: 'smsPerMonth', label: 'SMS per month' },
  { key: 'aiCallsPerMonth', label: 'AI calls per month' },
];

function SubscriptionDialog({ school, onDone }: { school: PlatformSchoolDetail; onDone: (d: PlatformSchoolDetail) => void }) {
  const plans = useData<PlanItem[]>(['platform', 'plans'], '/platform/plans');
  const sub = school.subscription;
  const [v, setV] = useState({
    planId: sub?.plan.id ?? '',
    status: sub?.status ?? 'TRIALING',
    trialEndsAt: sub?.trialEndsAt ?? '',
    currentPeriodStart: sub?.currentPeriodStart ?? '',
    currentPeriodEnd: sub?.currentPeriodEnd ?? '',
    notes: sub?.notes ?? '',
    overrides: Object.fromEntries(LIMITS.map((l) => [l.key, sub?.limitOverrides && l.key in sub.limitOverrides ? (sub.limitOverrides[l.key] === null ? 'unlimited' : String(sub.limitOverrides[l.key])) : ''])) as Record<keyof PlanLimits, string>,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, value: string) => setV((x) => ({ ...x, [k]: value }));
  async function save() {
    setBusy(true);
    try {
      const overrides = Object.fromEntries(Object.entries(v.overrides).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim().toLowerCase() === 'unlimited' ? null : Number(x)]));
      const res = await apiPut<{ data: PlatformSchoolDetail }>(`/platform/schools/${school.id}/subscription`, {
        planId: v.planId,
        status: v.status,
        trialEndsAt: v.trialEndsAt || null,
        currentPeriodStart: v.currentPeriodStart || null,
        currentPeriodEnd: v.currentPeriodEnd || null,
        limitOverrides: Object.keys(overrides).length ? overrides : null,
        notes: v.notes.trim() || null,
      });
      toast.success('Subscription saved');
      onDone(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0] ? `${err.details[0].field}: ${err.details[0].message}` : err.message) : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title="Subscription" description={`${school.name} — record what was agreed and paid.`}>
      <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Plan" htmlFor="sb-plan">
          <Select id="sb-plan" value={v.planId} onChange={(e) => set('planId', e.target.value)}>
            <option value="" disabled>Choose…</option>
            {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isActive ? '' : ' (retired)'}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="sb-status">
          <Select id="sb-status" value={v.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(SUB_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </Select>
        </Field>
        {v.status === 'TRIALING' && <Field label="Trial ends" htmlFor="sb-trial"><Input id="sb-trial" type="date" value={v.trialEndsAt} onChange={(e) => set('trialEndsAt', e.target.value)} /></Field>}
        <Field label="Paid from" htmlFor="sb-from"><Input id="sb-from" type="date" value={v.currentPeriodStart} onChange={(e) => set('currentPeriodStart', e.target.value)} /></Field>
        <Field label="Paid until" htmlFor="sb-to"><Input id="sb-to" type="date" value={v.currentPeriodEnd} onChange={(e) => set('currentPeriodEnd', e.target.value)} /></Field>
        <fieldset className="col-span-full grid grid-cols-2 gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-small text-fg-secondary">Exceptions to the plan (blank = plan’s limit, “unlimited” = none)</legend>
          {LIMITS.map((l) => (
            <Field key={l.key} label={l.label} htmlFor={`sb-${l.key}`}>
              <Input id={`sb-${l.key}`} value={v.overrides[l.key]} placeholder={(() => { const p = plans.data?.find((x) => x.id === v.planId); return p ? limitText(p.limits[l.key]) : ''; })()} onChange={(e) => setV((x) => ({ ...x, overrides: { ...x.overrides, [l.key]: e.target.value } }))} />
            </Field>
          ))}
        </fieldset>
        <Field label="Notes" htmlFor="sb-notes" className="col-span-full" hint="e.g. invoice number, how they paid"><Textarea id="sb-notes" rows={2} value={v.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} /></Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone(school)}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={!v.planId}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SupportDialog({ school, onDone }: { school: PlatformSchoolDetail; onDone: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(4);
  const [busy, setBusy] = useState(false);
  async function ask() {
    setBusy(true);
    try {
      await apiPost('/platform/support-access', { schoolId: school.id, reason, hours });
      toast.success(`Asked ${school.name}. Their admin will see the request in Settings.`);
      void qc.invalidateQueries({ queryKey: ['platform', 'support'] });
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title="Ask for read-only access" description={`${school.name}'s admin must approve. You'll be able to look, not change anything, until the time runs out.`}>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Why do you need to look?" htmlFor="sp-reason" hint="The school sees this"><Textarea id="sp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Fee receipts aren't printing for Class 8 — ticket #142" /></Field>
        <Field label="For how long" htmlFor="sp-hours">
          <Select id="sp-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {[1, 2, 4, 8, 24, 48, 72].map((h) => <option key={h} value={h}>{h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : `${h / 24} day${h === 24 ? '' : 's'}`}</option>)}
          </Select>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void ask()} loading={busy} disabled={reason.trim().length < 10}>Send request</Button>
      </DialogFooter>
    </DialogContent>
  );
}
