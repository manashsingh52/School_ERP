'use client';

import type { FeeHeadItem } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Select, Skeleton, TD, TH, THead, TR, Table, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiPatch, apiPost } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const TYPES: Record<FeeHeadItem['type'], string> = { TUITION: 'Tuition', ADMISSION: 'Admission', EXAM: 'Exam', TRANSPORT: 'Transport', ACTIVITY: 'Activity', OTHER: 'Other' };

export function HeadsTab() {
  const { can } = useMe();
  const heads = useData<FeeHeadItem[]>(['fees', 'heads'], '/fee-heads');
  const [editing, setEditing] = useState<FeeHeadItem | 'new' | null>(null);
  if (!heads.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      {can('fee.manage') && <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus /> Add fee</Button></div>}
      <Card className="overflow-hidden">
        {!heads.data.length ? (
          <EmptyState icon={<Tags />} title="No fees yet" description="Add the kinds of fees you charge — Tuition, Transport, Exam…" />
        ) : (
          <Table>
            <THead><tr><TH>Fee</TH><TH>Code</TH><TH>Type</TH><TH>Charged</TH><TH /></tr></THead>
            <tbody>
              {heads.data.map((h) => (
                <TR key={h.id} interactive={can('fee.manage')} onClick={() => can('fee.manage') && setEditing(h)}>
                  <TD className="font-medium">{h.name} {h.isOptional && <Badge className="ml-1">Optional</Badge>}</TD>
                  <TD className="tabular text-fg-secondary">{h.code}</TD>
                  <TD>{TYPES[h.type]}</TD>
                  <TD className="text-fg-secondary">{h.frequency === 'ONE_TIME' ? 'Once' : 'Every year'}</TD>
                  <TD>{!h.isActive && <Badge>Not in use</Badge>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === 'new' ? 'Add fee' : `Edit ${editing.name}`}>
            <HeadForm existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function HeadForm({ existing, onDone }: { existing?: FeeHeadItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: existing?.name ?? '', code: existing?.code ?? '', type: existing?.type ?? 'TUITION', frequency: existing?.frequency ?? 'RECURRING', isOptional: existing?.isOptional ?? false, isActive: existing?.isActive ?? true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErrors({});
    try {
      if (existing) await apiPatch(`/fee-heads/${existing.id}`, v);
      else await apiPost('/fee-heads', v);
      await qc.invalidateQueries({ queryKey: ['fees'] });
      toast.success('Saved');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field!, d.message])));
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Name" htmlFor="fh-name" error={errors.name}><Input id="fh-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Tuition Fee" maxLength={60} /></Field>
          <Field label="Code" htmlFor="fh-code" error={errors.code}><Input id="fh-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} placeholder="TUI" maxLength={16} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor="fh-type"><Select id="fh-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as FeeHeadItem['type'] })}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Charged" htmlFor="fh-freq"><Select id="fh-freq" value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value as 'ONE_TIME' | 'RECURRING' })}><option value="RECURRING">Every year</option><option value="ONE_TIME">Once (e.g. admission)</option></Select></Field>
        </div>
        <Checkbox checked={v.isOptional} onChange={(e) => setV({ ...v, isOptional: e.target.checked })} label="Optional" description="Only students who opt in pay it (e.g. transport)." />
        {existing && <Checkbox checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} label="In use" />}
      </DialogBody>
      <DialogFooter><Button variant="ghost" onClick={onDone}>Cancel</Button><Button onClick={() => void save()} loading={busy} disabled={!v.name || !v.code}>Save</Button></DialogFooter>
    </>
  );
}
