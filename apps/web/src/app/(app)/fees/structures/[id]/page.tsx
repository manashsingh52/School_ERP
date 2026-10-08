'use client';

import type { FeeHeadItem, FeeStructureItem, FeeStructureRequest } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Send, Split, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Gate } from '@/components/gate';
import { useClasses } from '@/lib/academics';
import { ApiError, apiDelete, apiPost, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { rupees, toPaise, toRupeeInput } from '@/lib/money';

type Item = { feeHeadId: string; amount: string; isOptional: boolean };
type Inst = { name: string; dueDate: string; splits: Record<string, string> };
type Late = { calc: 'NONE' | 'FLAT' | 'PER_DAY' | 'PERCENT'; value: string; graceDays: string; max: string };

function Editor({ existing }: { existing?: FeeStructureItem }) {
  const router = useRouter();
  const qc = useQueryClient();
  const classes = useClasses();
  const heads = useData<FeeHeadItem[]>(['fees', 'heads'], '/fee-heads');
  const locked = !!existing?.invoices;
  const [name, setName] = useState(existing?.name ?? '');
  const [classIds, setClassIds] = useState<string[]>(existing?.classes.map((c) => c.id) ?? []);
  const [items, setItems] = useState<Item[]>(existing?.items.map((i) => ({ feeHeadId: i.feeHead.id, amount: toRupeeInput(i.amountPaise), isOptional: i.isOptional })) ?? []);
  const [insts, setInsts] = useState<Inst[]>(
    existing?.installments.map((i) => ({ name: i.name, dueDate: i.dueDate, splits: Object.fromEntries(Object.entries(i.splits).map(([k, v]) => [k, toRupeeInput(v)])) })) ?? [
      { name: 'Term 1', dueDate: '', splits: {} },
      { name: 'Term 2', dueDate: '', splits: {} },
    ],
  );
  const lf = existing?.lateFee;
  const [late, setLate] = useState<Late>({
    calc: lf?.calc ?? 'NONE',
    value: lf ? (lf.calc === 'PERCENT' ? String((lf.valueBasisPoints ?? 0) / 100) : toRupeeInput(lf.valuePaise ?? 0)) : '',
    graceDays: String(lf?.graceDays ?? 7),
    max: lf?.maxPaise ? toRupeeInput(lf.maxPaise) : '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const headName = (id: string) => heads.data?.find((h) => h.id === id)?.name ?? 'Fee';
  const paise = (v: string | undefined) => toPaise(v ?? '') ?? 0;
  const mismatch = useMemo(() => items.filter((it) => paise(it.amount) !== insts.reduce((a, i) => a + paise(i.splits[it.feeHeadId]), 0)).map((it) => it.feeHeadId), [items, insts]);
  const annual = items.filter((i) => !i.isOptional).reduce((a, i) => a + paise(i.amount), 0);

  const splitEvenly = (feeHeadId: string) => {
    const total = paise(items.find((i) => i.feeHeadId === feeHeadId)?.amount);
    const each = Math.floor(total / insts.length / 100) * 100; // whole rupees; remainder on the first
    setInsts((xs) => xs.map((x, k) => ({ ...x, splits: { ...x.splits, [feeHeadId]: toRupeeInput(k === 0 ? total - each * (insts.length - 1) : each) } })));
  };

  async function save(publish: boolean) {
    setSaving(true);
    setErrors([]);
    const body: FeeStructureRequest = {
      name: name.trim(),
      classIds,
      items: items.map((i) => ({ feeHeadId: i.feeHeadId, amountPaise: paise(i.amount), isOptional: i.isOptional })),
      installments: insts.map((i) => ({ name: i.name.trim(), dueDate: i.dueDate, splits: Object.fromEntries(items.map((it) => [it.feeHeadId, paise(i.splits[it.feeHeadId])])) })),
      lateFee:
        late.calc === 'NONE'
          ? null
          : {
              calc: late.calc,
              graceDays: Number(late.graceDays) || 0,
              valuePaise: late.calc === 'PERCENT' ? null : toPaise(late.value),
              valueBasisPoints: late.calc === 'PERCENT' ? Math.round(Number(late.value) * 100) : null,
              maxPaise: late.max ? toPaise(late.max) : null,
            },
    };
    try {
      const res = existing ? await apiPut<{ data: FeeStructureItem }>(`/fee-structures/${existing.id}`, body) : await apiPost<{ data: FeeStructureItem }>('/fee-structures', body);
      if (publish) await apiPost(`/fee-structures/${res.data.id}/publish`);
      await qc.invalidateQueries({ queryKey: ['fees'] });
      toast.success(publish ? 'Published — you can now make invoices' : 'Saved as draft');
      router.push(publish ? '/fees?tab=invoices' : `/fees/structures/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details.map((d) => d.message));
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm('Delete this fee structure?')) return;
    try {
      await apiDelete(`/fee-structures/${existing.id}`);
      await qc.invalidateQueries({ queryKey: ['fees'] });
      router.push('/fees?tab=structures');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  if (!classes.data || !heads.data) return <Skeleton className="h-96" />;
  const unused = heads.data.filter((h) => h.isActive && !items.some((i) => i.feeHeadId === h.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/fees?tab=structures" className="inline-flex items-center gap-1 text-small text-fg-secondary hover:text-fg"><ChevronLeft className="size-3.5" /> Fees</Link>
        <PageHeader
          className="mt-2"
          title={existing ? existing.name : 'New fee structure'}
          description={locked ? `${existing!.invoices} invoices made from it — it can't change any more. Create a new structure for next year's fees.` : 'Which classes pay which fees, and when.'}
          actions={existing && <Badge tone={existing.status === 'PUBLISHED' ? 'success' : 'warning'} dot>{existing.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>}
        />
      </div>
      <fieldset disabled={locked} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-5">
          <Field label="Name" htmlFor="fs-name"><Input id="fs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Classes 6–8 · 2026–27" maxLength={80} /></Field>
          <div>
            <div className="mb-1.5 text-body font-medium">Classes</div>
            <div className="flex flex-wrap gap-1.5">
              {classes.data.map((c) => {
                const on = classIds.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setClassIds((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))} className={cn('h-8 rounded-full border px-3 text-small font-medium', on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border text-fg-secondary hover:border-border-strong')}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Fees per year" description={`Total for a student (without optional fees): ${rupees(annual)}`} />
          <div className="flex flex-col gap-2 p-5">
            {items.map((it, i) => (
              <div key={it.feeHeadId} className="grid grid-cols-[1fr_140px_auto_32px] items-center gap-3">
                <span className="font-medium">{headName(it.feeHeadId)}</span>
                <Input inputMode="decimal" value={it.amount} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} aria-label={`${headName(it.feeHeadId)} per year (₹)`} leading={<span className="text-fg-tertiary">₹</span>} />
                <Checkbox checked={it.isOptional} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, isOptional: e.target.checked } : y)))} label="Optional" />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${headName(it.feeHeadId)}`} onClick={() => setItems((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            {unused.length > 0 && (
              <Select value="" onChange={(e) => e.target.value && setItems((x) => [...x, { feeHeadId: e.target.value, amount: '', isOptional: !!heads.data!.find((h) => h.id === e.target.value)?.isOptional }])} className="max-w-xs" aria-label="Add fee">
                <option value="">+ Add a fee…</option>
                {unused.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            )}
            {!heads.data.length && <p className="text-small text-fg-secondary">Add fees (Tuition, Transport…) in the Fee heads tab first.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Installments"
            description="When each part is due. Each fee's installments must add up to its yearly amount."
            action={<Button size="sm" variant="secondary" onClick={() => setInsts((x) => [...x, { name: `Term ${x.length + 1}`, dueDate: '', splits: {} }])} disabled={insts.length >= 12}><Plus /> Installment</Button>}
          />
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[600px] text-small">
              <thead>
                <tr className="text-left text-caption text-fg-tertiary">
                  <th className="pb-2 font-medium">Fee</th>
                  {insts.map((ins, k) => (
                    <th key={k} className="px-1 pb-2 font-medium">
                      <Input className="h-8" value={ins.name} onChange={(e) => setInsts((x) => x.map((y, j) => (j === k ? { ...y, name: e.target.value } : y)))} aria-label={`Installment ${k + 1} name`} />
                      <Input className="mt-1 h-8" type="date" value={ins.dueDate} onChange={(e) => setInsts((x) => x.map((y, j) => (j === k ? { ...y, dueDate: e.target.value } : y)))} aria-label={`${ins.name} due date`} />
                      {insts.length > 1 && <button type="button" className="mt-1 text-caption text-danger hover:underline" onClick={() => setInsts((x) => x.filter((_, j) => j !== k))}>Remove</button>}
                    </th>
                  ))}
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.feeHeadId} className={cn(mismatch.includes(it.feeHeadId) && 'bg-danger-bg/40')}>
                    <td className="py-1 pr-2 font-medium">
                      {headName(it.feeHeadId)}
                      <div className={cn('text-caption', mismatch.includes(it.feeHeadId) ? 'text-danger' : 'text-fg-tertiary')}>
                        {rupees(insts.reduce((a, i) => a + paise(i.splits[it.feeHeadId]), 0))} of {rupees(paise(it.amount))}
                      </div>
                    </td>
                    {insts.map((ins, k) => (
                      <td key={k} className="px-1 py-1">
                        <Input className="h-8" inputMode="decimal" value={ins.splits[it.feeHeadId] ?? ''} onChange={(e) => setInsts((x) => x.map((y, j) => (j === k ? { ...y, splits: { ...y.splits, [it.feeHeadId]: e.target.value } } : y)))} aria-label={`${headName(it.feeHeadId)} in ${ins.name}`} />
                      </td>
                    ))}
                    <td className="pl-1"><Button size="sm" variant="ghost" onClick={() => splitEvenly(it.feeHeadId)} title="Split evenly"><Split /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div className="text-body font-semibold">Late fee</div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Charge" htmlFor="lf-calc" className="w-48">
              <Select id="lf-calc" value={late.calc} onChange={(e) => setLate({ ...late, calc: e.target.value as Late['calc'] })}>
                <option value="NONE">No late fee</option>
                <option value="FLAT">Fixed amount, once</option>
                <option value="PER_DAY">Amount per day</option>
                <option value="PERCENT">Percent of the bill, once</option>
              </Select>
            </Field>
            {late.calc !== 'NONE' && (
              <>
                <Field label={late.calc === 'PERCENT' ? 'Percent' : late.calc === 'PER_DAY' ? '₹ per day' : 'Amount (₹)'} htmlFor="lf-val" className="w-32"><Input id="lf-val" inputMode="decimal" value={late.value} onChange={(e) => setLate({ ...late, value: e.target.value })} /></Field>
                <Field label="After (days)" htmlFor="lf-grace" className="w-32"><Input id="lf-grace" inputMode="numeric" value={late.graceDays} onChange={(e) => setLate({ ...late, graceDays: e.target.value })} /></Field>
                {late.calc !== 'FLAT' && <Field label="At most (₹)" htmlFor="lf-max" hint="Optional" className="w-32"><Input id="lf-max" inputMode="decimal" value={late.max} onChange={(e) => setLate({ ...late, max: e.target.value })} /></Field>}
              </>
            )}
          </div>
        </Card>
      </fieldset>

      {errors.length > 0 && <ul className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-small text-danger">{[...new Set(errors)].map((e) => <li key={e}>{e}</li>)}</ul>}
      {!locked && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          {existing && <Button variant="ghost" className="mr-auto text-danger" onClick={() => void remove()}>Delete</Button>}
          {mismatch.length > 0 && <span className="text-small text-danger">{mismatch.length} fee{mismatch.length === 1 ? '' : 's'} don't add up across installments</span>}
          <Button variant="secondary" onClick={() => void save(false)} loading={saving} disabled={!name || !classIds.length || !items.length}>Save draft</Button>
          <Button onClick={() => void save(true)} loading={saving} disabled={!name || !classIds.length || !items.length || mismatch.length > 0 || insts.some((i) => !i.dueDate)}><Send /> {existing?.status === 'PUBLISHED' ? 'Save' : 'Save & publish'}</Button>
        </div>
      )}
    </div>
  );
}

function Loader() {
  const { id } = useParams<{ id: string }>();
  const s = useData<FeeStructureItem>(['fees', 'structures', id], id === 'new' ? null : `/fee-structures/${id}`);
  if (id === 'new') return <Editor />;
  if (!s.data) return <Skeleton className="h-96" />;
  return <Editor key={s.data.id + s.data.status} existing={s.data} />;
}

export default function StructurePage() {
  return (
    <Gate any={['fee.view', 'fee.manage']} scopes={['ALL']}>
      <Loader />
    </Gate>
  );
}
