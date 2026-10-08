'use client';

import type { ConcessionTypeItem, FeeHeadItem, StudentConcessionItem } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Select, Skeleton, Textarea, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiPatch, apiPost } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';
import { rupees, toPaise, toRupeeInput } from '@/lib/money';
import { StudentPicker, type PickedStudent } from './student-picker';

const describe = (t: { calc: string; valuePaise: number | null; valueBasisPoints: number | null }) => (t.calc === 'PERCENT' ? `${(t.valueBasisPoints ?? 0) / 100}% off` : `${rupees(t.valuePaise ?? 0)} off each bill`);
const STATUS = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'neutral', REVOKED: 'neutral' } as const;

export function ConcessionsTab() {
  const { can } = useMe();
  const qc = useQueryClient();
  const types = useData<ConcessionTypeItem[]>(['fees', 'concession-types'], '/concession-types');
  const requests = useData<StudentConcessionItem[]>(['fees', 'concessions'], can('concession.request') ? '/concessions' : null);
  const [editing, setEditing] = useState<ConcessionTypeItem | 'new' | null>(null);
  const [requesting, setRequesting] = useState(false);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED' | 'REVOKED') {
    try {
      await apiPost(`/concessions/${id}/decision`, { decision });
      await qc.invalidateQueries({ queryKey: ['fees', 'concessions'] });
      toast.success({ APPROVED: 'Approved — it applies to invoices made from now on', REJECTED: 'Rejected', REVOKED: 'Revoked' }[decision]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader title="Students with concessions" description="Approved concessions apply to invoices made after approval." action={can('concession.request') && <Button size="sm" onClick={() => setRequesting(true)}><Plus /> Give concession</Button>} />
        {!requests.data ? (
          <div className="p-5"><Skeleton className="h-32" /></div>
        ) : !requests.data.length ? (
          <EmptyState icon={<BadgePercent />} title="No concessions yet" />
        ) : (
          <ul className="mt-3 border-t border-border">
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.student.name} <span className="font-normal text-fg-tertiary">· {r.student.classLabel ?? '—'}</span></div>
                  <div className="text-small text-fg-secondary">{r.type.name} · {describe({ ...r.type, ...(r.overrideValue ? (r.type.calc === 'PERCENT' ? { valueBasisPoints: r.overrideValue } : { valuePaise: r.overrideValue }) : {}) })}{r.reason ? ` · ${r.reason}` : ''}</div>
                  <div className="text-caption text-fg-tertiary">Requested by {r.requestedBy} · {formatDate(r.createdAt)}</div>
                </div>
                <Badge tone={STATUS[r.status]} dot>{r.status === 'PENDING' ? 'Waiting' : r.status[0] + r.status.slice(1).toLowerCase()}</Badge>
                {r.status === 'PENDING' && can('concession.approve') && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => void decide(r.id, 'APPROVED')}><Check /> Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => void decide(r.id, 'REJECTED')}><X /> Reject</Button>
                  </div>
                )}
                {r.status === 'APPROVED' && can('concession.approve') && <Button size="sm" variant="ghost" onClick={() => void decide(r.id, 'REVOKED')}>Revoke</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Concession types" action={can('fee.manage') && <Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus /> Add</Button>} />
        {!types.data ? (
          <div className="p-5"><Skeleton className="h-24" /></div>
        ) : (
          <ul className="mt-3 border-t border-border">
            {types.data.map((t) => (
              <li key={t.id}>
                <button className="w-full border-b border-border px-5 py-2.5 text-left last:border-b-0 hover:bg-hover disabled:hover:bg-transparent" disabled={!can('fee.manage')} onClick={() => setEditing(t)}>
                  <div className="font-medium">{t.name} {!t.isActive && <Badge className="ml-1">Off</Badge>}</div>
                  <div className="text-small text-fg-secondary">{describe(t)}{t.requiresApproval ? ' · needs approval' : ''}</div>
                </button>
              </li>
            ))}
            {!types.data.length && <li className="px-5 py-4 text-small text-fg-tertiary">Add types like “Sibling 10%” or “Staff ward 50%”.</li>}
          </ul>
        )}
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <DialogContent title={editing === 'new' ? 'Add concession type' : `Edit ${editing.name}`}><TypeForm existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /></DialogContent>}
      </Dialog>
      <Dialog open={requesting} onOpenChange={setRequesting}>
        {requesting && <DialogContent title="Give a concession"><RequestForm types={types.data?.filter((t) => t.isActive) ?? []} onDone={() => setRequesting(false)} /></DialogContent>}
      </Dialog>
    </div>
  );
}

function TypeForm({ existing, onDone }: { existing?: ConcessionTypeItem; onDone: () => void }) {
  const qc = useQueryClient();
  const heads = useData<FeeHeadItem[]>(['fees', 'heads'], '/fee-heads');
  const [v, setV] = useState({
    name: existing?.name ?? '',
    kind: existing?.kind ?? 'SIBLING',
    calc: existing?.calc ?? 'PERCENT',
    value: existing ? (existing.calc === 'PERCENT' ? String((existing.valueBasisPoints ?? 0) / 100) : toRupeeInput(existing.valuePaise ?? 0)) : '',
    feeHeadIds: existing?.feeHeadIds ?? [],
    requiresApproval: existing?.requiresApproval ?? true,
    isActive: existing?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = {
        name: v.name,
        kind: v.kind,
        calc: v.calc,
        valuePaise: v.calc === 'FLAT' ? toPaise(v.value) : null,
        valueBasisPoints: v.calc === 'PERCENT' ? Math.round(Number(v.value) * 100) : null,
        feeHeadIds: v.feeHeadIds,
        requiresApproval: v.requiresApproval,
        isActive: v.isActive,
      };
      if (existing) await apiPatch(`/concession-types/${existing.id}`, body);
      else await apiPost('/concession-types', body);
      await qc.invalidateQueries({ queryKey: ['fees'] });
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Name" htmlFor="ct-name"><Input id="ct-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Sibling 10%" maxLength={60} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kind" htmlFor="ct-kind">
            <Select id="ct-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as ConcessionTypeItem['kind'] })}>
              {['SIBLING', 'SCHOLARSHIP', 'STAFF_WARD', 'MERIT', 'NEED_BASED', 'OTHER'].map((k) => <option key={k} value={k}>{k.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>)}
            </Select>
          </Field>
          <Field label="As" htmlFor="ct-calc"><Select id="ct-calc" value={v.calc} onChange={(e) => setV({ ...v, calc: e.target.value as 'FLAT' | 'PERCENT' })}><option value="PERCENT">Percent</option><option value="FLAT">Amount (₹)</option></Select></Field>
          <Field label={v.calc === 'PERCENT' ? 'Percent off' : '₹ off each bill'} htmlFor="ct-val"><Input id="ct-val" inputMode="decimal" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-body font-medium">Applies to</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {heads.data?.map((h) => (
              <Checkbox key={h.id} label={h.name} checked={v.feeHeadIds.includes(h.id)} onChange={(e) => setV({ ...v, feeHeadIds: e.target.checked ? [...v.feeHeadIds, h.id] : v.feeHeadIds.filter((x) => x !== h.id) })} />
            ))}
          </div>
          <p className="mt-1 text-caption text-fg-tertiary">Tick none to apply to every fee.</p>
        </div>
        <Checkbox checked={v.requiresApproval} onChange={(e) => setV({ ...v, requiresApproval: e.target.checked })} label="Needs approval" description="Requests wait for someone who can approve concessions." />
        {existing && <Checkbox checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} label="In use" />}
      </DialogBody>
      <DialogFooter><Button variant="ghost" onClick={onDone}>Cancel</Button><Button onClick={() => void save()} loading={busy} disabled={!v.name || !v.value}>Save</Button></DialogFooter>
    </>
  );
}

function RequestForm({ types, onDone }: { types: ConcessionTypeItem[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!student) return;
    setBusy(true);
    try {
      const res = await apiPost<{ data: StudentConcessionItem }>('/concessions', { studentId: student.id, concessionTypeId: typeId, reason: reason.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ['fees', 'concessions'] });
      toast.success(res.data.status === 'APPROVED' ? 'Concession given' : 'Sent for approval');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {student ? (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-small"><span><b>{student.name}</b> · Adm. {student.admissionNo}</span><Button size="sm" variant="ghost" onClick={() => setStudent(null)}>Change</Button></div>
        ) : (
          <StudentPicker onPick={setStudent} autoFocus />
        )}
        <Field label="Concession" htmlFor="rq-type"><Select id="rq-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>{types.map((t) => <option key={t.id} value={t.id}>{t.name} — {describe(t)}</option>)}</Select></Field>
        <Field label="Reason" htmlFor="rq-why" hint="Optional"><Textarea id="rq-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      </DialogBody>
      <DialogFooter><Button variant="ghost" onClick={onDone}>Cancel</Button><Button onClick={() => void save()} loading={busy} disabled={!student || !typeId}>Save</Button></DialogFooter>
    </>
  );
}
