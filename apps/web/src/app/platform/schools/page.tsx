'use client';

import { provisionSchoolSchema, type PlanItem, type PlatformSchoolDetail, type PlatformSchoolItem } from '@schoolos/contracts';
import { Badge, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, PageHeader, Select, Table, TableSkeleton, TD, TH, THead, TR, toast } from '@schoolos/ui';
import { Building2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { SCHOOL_STATUS, SUB_STATUS } from '@/components/platform/labels';
import { useIsSuperAdmin } from '@/components/platform/console-shell';
import { ApiError, apiPost } from '@/lib/api-client';
import { contractResolver } from '@/lib/forms';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import { applyServerErrors, useData } from '@/lib/hooks';

export default function SchoolsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const query = useDeferredValue(q.trim());
  const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}) }).toString();
  const list = useData<PlatformSchoolItem[]>(['platform', 'schools', params], `/platform/schools${params ? `?${params}` : ''}`);
  const [open, setOpen] = useState(false);
  const superAdmin = useIsSuperAdmin();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Schools" description="Onboard, configure and support schools." actions={superAdmin && <Button onClick={() => setOpen(true)}><Plus /> Onboard a school</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-fg-tertiary" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, web address or city…" className="pl-9" aria-label="Search schools" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="w-40">
            <option value="">All statuses</option>
            {Object.entries(SCHOOL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        {!list.data ? (
          <Table><tbody><TableSkeleton columns={6} /></tbody></Table>
        ) : !list.data.length ? (
          <EmptyState icon={<Building2 />} title={query || status ? 'No schools match' : 'No schools yet'} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR><TH>School</TH><TH>Status</TH><TH>Plan</TH><TH className="text-right">Students</TH><TH className="text-right">Users</TH><TH>Last active</TH></TR>
              </THead>
              <tbody>
                {list.data.map((s) => (
                  <TR key={s.id} interactive>
                    <TD>
                      <Link href={`/platform/schools/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                      <div className="text-small text-fg-tertiary">{s.slug}</div>
                    </TD>
                    <TD><Badge tone={SCHOOL_STATUS[s.status]!.tone}>{SCHOOL_STATUS[s.status]!.label}</Badge></TD>
                    <TD>
                      {s.plan ? <span>{s.plan.name}</span> : <span className="text-fg-tertiary">No plan</span>}
                      {s.subscriptionStatus && <div className="text-small text-fg-tertiary">{SUB_STATUS[s.subscriptionStatus]!.label}{s.subscriptionStatus === 'TRIALING' && s.trialEndsAt ? ` until ${formatDate(s.trialEndsAt)}` : ''}</div>}
                    </TD>
                    <TD className="tabular text-right">{formatNumber(s.students)}</TD>
                    <TD className="tabular text-right">{formatNumber(s.members)}</TD>
                    <TD className="text-fg-secondary">{s.lastActiveAt ? timeAgo(s.lastActiveAt) : 'Never'}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>{open && <OnboardDialog onDone={() => setOpen(false)} />}</Dialog>
    </div>
  );
}

type Values = z.input<typeof provisionSchoolSchema>;
const FIELDS = ['name', 'slug', 'board', 'phone', 'adminName', 'adminPhone', 'adminEmail', 'planId', 'trialDays'];

function OnboardDialog({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const plans = useData<PlanItem[]>(['platform', 'plans'], '/platform/plans');
  const form = useForm<Values, unknown, z.output<typeof provisionSchoolSchema>>({ resolver: contractResolver(provisionSchoolSchema) as never, defaultValues: { trialDays: 30 } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      const res = await apiPost<{ data: PlatformSchoolDetail }>('/platform/schools', { ...values, planId: values.planId || undefined, adminEmail: values.adminEmail || undefined, phone: values.phone || undefined });
      onDone();
      router.push(`/platform/schools/${res.data.id}`);
    } catch (err) {
      if (!applyServerErrors(err, form.setError, FIELDS)) toast.error(err instanceof ApiError ? err.message : 'We couldn’t create the school.');
    }
  });
  const slug = form.watch('slug');
  return (
    <DialogContent title="Onboard a school" description="Creates the school, invites its first admin (they sign in with a one-time code) and starts the trial.">
      <form onSubmit={submit} noValidate>
        <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="School name" htmlFor="pv-name" error={e.name?.message} className="sm:col-span-2"><Input id="pv-name" autoFocus {...form.register('name')} /></Field>
          <Field label="Web address" htmlFor="pv-slug" error={e.slug?.message} hint={slug ? `${slug}.bastaa.in` : 'e.g. stmarys'}><Input id="pv-slug" {...form.register('slug')} autoCapitalize="none" /></Field>
          <Field label="Board" htmlFor="pv-board" error={e.board?.message}><Input id="pv-board" placeholder="CBSE" {...form.register('board')} /></Field>
          <Field label="Admin's name" htmlFor="pv-an" error={e.adminName?.message}><Input id="pv-an" {...form.register('adminName')} /></Field>
          <Field label="Admin's mobile" htmlFor="pv-ap" error={e.adminPhone?.message}><Input id="pv-ap" type="tel" {...form.register('adminPhone')} /></Field>
          <Field label="Admin's email" htmlFor="pv-ae" error={e.adminEmail?.message} hint="Optional"><Input id="pv-ae" type="email" {...form.register('adminEmail')} /></Field>
          <Field label="School phone" htmlFor="pv-ph" error={e.phone?.message} hint="Optional"><Input id="pv-ph" type="tel" {...form.register('phone')} /></Field>
          <Field label="Plan" htmlFor="pv-plan" error={e.planId?.message}>
            <Select id="pv-plan" {...form.register('planId')}>
              <option value="">Cheapest active plan</option>
              {plans.data?.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Trial days" htmlFor="pv-trial" error={e.trialDays?.message} hint="0 = paid from day one"><Input id="pv-trial" type="number" min={0} max={90} {...form.register('trialDays', { valueAsNumber: true })} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Create school</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
