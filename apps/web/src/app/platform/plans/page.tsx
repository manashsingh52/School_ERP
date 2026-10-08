'use client';

import type { FeatureFlagItem, PlanItem, PlanLimits } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, Field, Input, PageHeader, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useIsSuperAdmin } from '@/components/platform/console-shell';
import { limitText } from '@/components/platform/labels';
import { ApiError, apiPost, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { rupees, toPaise, toRupeeInput } from '@/lib/money';

const LIMITS: { key: keyof PlanLimits; label: string; unit?: string }[] = [
  { key: 'students', label: 'Students' },
  { key: 'storageGb', label: 'Storage', unit: ' GB' },
  { key: 'smsPerMonth', label: 'SMS / month' },
  { key: 'aiCallsPerMonth', label: 'AI calls / month' },
];

export default function PlansPage() {
  const plans = useData<PlanItem[]>(['platform', 'plans'], '/platform/plans');
  const superAdmin = useIsSuperAdmin();
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plans" description="What each plan allows. Changes apply to every school on the plan within a minute." actions={superAdmin && <Button onClick={() => setEditing('new')}><Plus /> New plan</Button>} />
      {!plans.data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.data.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2 px-5 pt-4">
                <div>
                  <div className="flex items-center gap-2"><h2 className="text-h3 font-semibold">{p.name}</h2>{!p.isActive && <Badge>Retired</Badge>}</div>
                  <div className="text-small text-fg-tertiary">{p.code} · {p.schools} school{p.schools === 1 ? '' : 's'}</div>
                </div>
                {superAdmin && <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil /></Button>}
              </div>
              <div className="px-5 pt-2 text-h2 font-semibold">{p.priceMonthlyPaise === null ? 'Custom price' : <>{rupees(p.priceMonthlyPaise)}<span className="text-small font-normal text-fg-tertiary"> / month</span></>}</div>
              <dl className="grid grid-cols-2 gap-2 p-5 text-small">
                {LIMITS.map((l) => (
                  <div key={l.key}><dt className="text-fg-tertiary">{l.label}</dt><dd className="tabular font-medium">{limitText(p.limits[l.key], l.unit)}</dd></div>
                ))}
              </dl>
              {p.features.length > 0 && <div className="flex flex-wrap gap-1 border-t border-border px-5 py-3">{p.features.map((f) => <Badge key={f} tone="accent">{f}</Badge>)}</div>}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>{editing && <PlanDialog plan={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}</Dialog>
    </div>
  );
}

function PlanDialog({ plan, onDone }: { plan: PlanItem | null; onDone: () => void }) {
  const qc = useQueryClient();
  const flags = useData<FeatureFlagItem[]>(['platform', 'flags'], '/platform/flags');
  const [v, setV] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    price: plan?.priceMonthlyPaise === null || plan?.priceMonthlyPaise === undefined ? '' : toRupeeInput(plan.priceMonthlyPaise),
    isActive: plan?.isActive ?? true,
    limits: Object.fromEntries(LIMITS.map((l) => [l.key, plan ? (plan.limits[l.key] === null ? '' : String(plan.limits[l.key])) : ''])) as Record<keyof PlanLimits, string>,
    features: new Set(plan?.features ?? []),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = {
        code: v.code.trim(),
        name: v.name.trim(),
        priceMonthlyPaise: v.price.trim() ? toPaise(v.price) : null,
        isActive: v.isActive,
        limits: Object.fromEntries(LIMITS.map((l) => [l.key, v.limits[l.key].trim() ? Number(v.limits[l.key]) : null])),
        features: [...v.features],
      };
      if (plan) await apiPut(`/platform/plans/${plan.id}`, body);
      else await apiPost('/platform/plans', body);
      await qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success('Plan saved');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0] ? `${err.details[0].field}: ${err.details[0].message}` : err.message) : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title={plan ? `Edit ${plan.name}` : 'New plan'}>
      <DialogBody className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="pl-name"><Input id="pl-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Code" htmlFor="pl-code" hint="Lower-case, no spaces"><Input id="pl-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
        <Field label="Price per month (₹)" htmlFor="pl-price" hint="Blank = custom price"><Input id="pl-price" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
        <div className="flex items-end pb-2"><Checkbox checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} label="Offered to new schools" /></div>
        <fieldset className="col-span-2 grid grid-cols-2 gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-small text-fg-secondary">Limits (blank = unlimited)</legend>
          {LIMITS.map((l) => (
            <Field key={l.key} label={`${l.label}${l.unit ? ` (${l.unit.trim()})` : ''}`} htmlFor={`pl-${l.key}`}>
              <Input id={`pl-${l.key}`} inputMode="decimal" value={v.limits[l.key]} onChange={(e) => setV({ ...v, limits: { ...v.limits, [l.key]: e.target.value } })} />
            </Field>
          ))}
        </fieldset>
        <fieldset className="col-span-2 flex flex-col gap-2">
          <legend className="mb-1 text-small text-fg-secondary">Features included</legend>
          {flags.data?.map((f) => (
            <Checkbox key={f.key} checked={v.features.has(f.key)} label={f.key} description={f.description} onChange={(e) => setV((x) => { const n = new Set(x.features); if (e.target.checked) n.add(f.key); else n.delete(f.key); return { ...x, features: n }; })} />
          ))}
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={!v.name.trim() || !v.code.trim()}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}
